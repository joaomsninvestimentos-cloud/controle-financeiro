/**
 * Integração real (Postgres via PGlite) para o espelho de despesa:
 * valida o DDL em runtime, a idempotência e a regra de não contar duas vezes.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'
import { DDL_ESPELHO } from './espelho-ddl'
import { DDL_RECORRENCIA } from './recorrencia-ddl'
import { montarEspelho, somarSemEspelhos, type ItemEspelhavel } from './espelho-logic'

const BASE = `
  CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL, email text);
  CREATE TABLE contas (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nome text NOT NULL,
    tipo text NOT NULL DEFAULT 'pessoal'
  );
  CREATE TABLE recorrencias (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conta_id text REFERENCES contas(id) ON DELETE SET NULL,
    descricao text NOT NULL,
    valor text NOT NULL,
    tipo text NOT NULL,
    categoria text NOT NULL,
    dia text NOT NULL DEFAULT '1',
    mes_inicio text NOT NULL,
    mes_fim text,
    ativa boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE items (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conta_id text REFERENCES contas(id) ON DELETE SET NULL,
    descricao text NOT NULL,
    valor text NOT NULL,
    tipo text NOT NULL,
    categoria text NOT NULL,
    data text NOT NULL,
    mes text NOT NULL,
    recorrente boolean NOT NULL DEFAULT false,
    recorrencia_id text,
    created_at timestamp NOT NULL DEFAULT now()
  );
  INSERT INTO users (id, name, email) VALUES ('u1','João','joao@email.com');
  INSERT INTO contas (id, user_id, nome, tipo) VALUES
    ('pessoal-joao','u1','João','pessoal'),
    ('casa','u1','Casa','casa');
`

async function novoBanco() {
  const db = new PGlite()
  await db.exec(BASE)
  for (const instrucao of DDL_ESPELHO) await db.exec(instrucao)
  return db
}

/** Banco com o schema REAL de recorrência (inclui o índice único). */
async function novoBancoComSerie() {
  const db = await novoBanco()
  for (const instrucao of DDL_RECORRENCIA) await db.exec(instrucao)
  await db.exec(`CREATE TABLE IF NOT EXISTS orcamentos (
    id text PRIMARY KEY, user_id text, conta_id text, mes text, categoria text, limite text
  )`)
  return db
}

test('DDL do espelho é idempotente e cria as colunas', async () => {
  const db = await novoBanco()
  for (const instrucao of DDL_ESPELHO) await db.exec(instrucao) // segunda vez

  const colunas = await db.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE (table_name = 'items' AND column_name = 'espelho_de')
        OR (table_name = 'recorrencias' AND column_name = 'espelhar_conta_id')`,
  )
  const nomes = colunas.rows.map(c => c.column_name).sort()
  assert.deepEqual(nomes, ['espelhar_conta_id', 'espelho_de'])

  const indices = await db.query<{ indexname: string }>(
    'SELECT indexname FROM pg_indexes WHERE indexname = \'items_espelho_de_idx\'',
  )
  assert.equal(indices.rows.length, 1)
})

test('BUG: espelho herdando recorrencia_id viola o índice único (recorrencia_id, mes)', async () => {
  const db = await novoBancoComSerie()

  await db.exec(`
    INSERT INTO recorrencias (id, user_id, conta_id, descricao, valor, tipo, categoria, dia, mes_inicio)
    VALUES ('serie-1','u1','pessoal-joao','Predialnet','99.90','despesa','Moradia','5','2026-11');
    INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id)
    VALUES ('origem-nov','u1','pessoal-joao','Predialnet','99.90','despesa','Moradia','2026-11-05','2026-11',true,'serie-1');
  `)

  // Como era antes: o espelho copiava a série e caía no mesmo (recorrencia_id, mes)
  const espelhoAntigo = montarEspelho({
    id: 'origem-nov', userId: 'u1', contaId: 'pessoal-joao',
    descricao: 'Predialnet', valor: '99.90', tipo: 'despesa', categoria: 'Moradia',
    data: '2026-11-05', mes: '2026-11', recorrente: true, recorrenciaId: 'serie-1',
  }, 'casa', 'espelho-nov')

  await assert.rejects(
    db.query(
      `INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id, espelho_de)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [espelhoAntigo.id, espelhoAntigo.userId, espelhoAntigo.contaId, espelhoAntigo.descricao,
       espelhoAntigo.valor, espelhoAntigo.tipo, espelhoAntigo.categoria, espelhoAntigo.data,
       espelhoAntigo.mes, espelhoAntigo.recorrente, 'serie-1', 'origem-nov'],
    ),
    'herdar a série precisa falhar no índice único',
  )

  // Como é agora: o espelho não herda a série e entra normalmente
  assert.equal(espelhoAntigo.recorrenciaId, null)

  await db.query(
    `INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id, espelho_de)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [espelhoAntigo.id, espelhoAntigo.userId, espelhoAntigo.contaId, espelhoAntigo.descricao,
     espelhoAntigo.valor, espelhoAntigo.tipo, espelhoAntigo.categoria, espelhoAntigo.data,
     espelhoAntigo.mes, espelhoAntigo.recorrente, espelhoAntigo.recorrenciaId, 'origem-nov'],
  )

  const linhas = await db.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM items WHERE espelho_de = \'origem-nov\'',
  )
  assert.equal(linhas.rows[0].total, 1)
})

test('espelho é uma linha separada que aponta para o original', async () => {
  const db = await novoBanco()

  const origem: ItemEspelhavel = {
    id: 'luz-1',
    userId: 'u1',
    contaId: 'pessoal-joao',
    descricao: 'Luz',
    valor: '180.00',
    tipo: 'despesa',
    categoria: 'Moradia',
    data: '2026-11-05',
    mes: '2026-11',
    recorrente: true,
    recorrenciaId: 'serie-1',
  }

  await db.query(
    `INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [origem.id, origem.userId, origem.contaId, origem.descricao, origem.valor,
     origem.tipo, origem.categoria, origem.data, origem.mes, origem.recorrente, origem.recorrenciaId],
  )

  const espelho = montarEspelho(origem, 'casa', 'luz-espelho')
  await db.query(
    `INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id, espelho_de)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [espelho.id, espelho.userId, espelho.contaId, espelho.descricao, espelho.valor,
     espelho.tipo, espelho.categoria, espelho.data, espelho.mes,
     espelho.recorrente, espelho.recorrenciaId, espelho.espelhoDe],
  )

  const linhas = await db.query<{ id: string; conta_id: string | null; espelho_de: string | null }>(
    'SELECT id, conta_id, espelho_de FROM items ORDER BY conta_id',
  )
  assert.equal(linhas.rows.length, 2)
  assert.equal(linhas.rows[0].conta_id, 'casa')
  assert.equal(linhas.rows[0].espelho_de, 'luz-1')
  assert.equal(linhas.rows[1].espelho_de, null)

  // O valor do mês visto pela casa vem do espelho; o total geral conta uma vez.
  const total = somarSemEspelhos([
    origem,
    { ...espelho, espelhoDe: 'luz-1' },
  ])
  assert.equal(total.despesas, 180)
  assert.equal(total.espelhosIgnorados, 1)
})

test('apagar o original leva o espelho junto (busca por espelho_de)', async () => {
  const db = await novoBanco()
  await db.exec(`
    INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes)
    VALUES ('a','u1','pessoal-joao','Luz','180.00','despesa','Moradia','2026-11-05','2026-11');
    INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes, espelho_de)
    VALUES ('b','u1','casa','Luz','180.00','despesa','Moradia','2026-11-05','2026-11','a');
  `)

  await db.query('DELETE FROM items WHERE espelho_de = $1', ['a'])
  await db.query('DELETE FROM items WHERE id = $1', ['a'])

  const restantes = await db.query<{ total: number }>('SELECT count(*)::int AS total FROM items')
  assert.equal(restantes.rows[0].total, 0)
})

test('série marcada guarda a conta da casa para espelhar os meses futuros', async () => {
  const db = await novoBanco()
  await db.exec(`
    INSERT INTO recorrencias (id, user_id, conta_id, descricao, valor, tipo, categoria, dia, mes_inicio)
    VALUES ('serie-1','u1','pessoal-joao','Aluguel','1500.00','despesa','Moradia','5','2026-11');
  `)

  await db.query('UPDATE recorrencias SET espelhar_conta_id = $1 WHERE id = $2', ['casa', 'serie-1'])

  const [serie] = (await db.query<{ espelhar_conta_id: string | null }>(
    'SELECT espelhar_conta_id FROM recorrencias WHERE id = \'serie-1\'',
  )).rows
  assert.equal(serie.espelhar_conta_id, 'casa')

  // Desligar volta a null (deixa de espelhar os próximos meses).
  await db.query('UPDATE recorrencias SET espelhar_conta_id = NULL WHERE id = \'serie-1\'')
  const [depois] = (await db.query<{ espelhar_conta_id: string | null }>(
    'SELECT espelhar_conta_id FROM recorrencias WHERE id = \'serie-1\'',
  )).rows
  assert.equal(depois.espelhar_conta_id, null)
})

test('lançamento avulso também pode ser espelhado (sem série)', async () => {
  const db = await novoBanco()

  const avulsa: ItemEspelhavel = {
    id: 'mercado-1',
    userId: 'u1',
    contaId: 'pessoal-joao',
    descricao: 'Mercado',
    valor: '240.00',
    tipo: 'despesa',
    categoria: 'Alimentação',
    data: '2026-11-12',
    mes: '2026-11',
    recorrente: false,
    recorrenciaId: null,
  }

  const espelho = montarEspelho(avulsa, 'casa', 'mercado-espelho')

  await db.query(
    `INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id, espelho_de)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [avulsa.id, avulsa.userId, avulsa.contaId, avulsa.descricao, avulsa.valor,
     avulsa.tipo, avulsa.categoria, avulsa.data, avulsa.mes,
     avulsa.recorrente, avulsa.recorrenciaId, null],
  )
  await db.query(
    `INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id, espelho_de)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [espelho.id, espelho.userId, espelho.contaId, espelho.descricao, espelho.valor,
     espelho.tipo, espelho.categoria, espelho.data, espelho.mes,
     espelho.recorrente, espelho.recorrenciaId, espelho.espelhoDe],
  )

  // Uma linha na conta pessoal, uma na casa — e o total geral conta uma vez.
  const porConta = await db.query<{ conta_id: string; total: number }>(
    'SELECT conta_id, count(*)::int AS total FROM items GROUP BY conta_id ORDER BY conta_id',
  )
  assert.deepEqual(porConta.rows, [
    { conta_id: 'casa', total: 1 },
    { conta_id: 'pessoal-joao', total: 1 },
  ])

  const total = somarSemEspelhos([avulsa, { ...espelho, espelhoDe: 'mercado-1' }])
  assert.equal(total.despesas, 240)
  assert.equal(total.espelhosIgnorados, 1)
})
