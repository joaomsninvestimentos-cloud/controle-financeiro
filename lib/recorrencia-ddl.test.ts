/**
 * Teste de integração do schema de recorrência contra um Postgres de verdade
 * (PGlite, Postgres compilado para WASM). Valida o DDL, o índice único por
 * série+mês e a idempotência da geração — o que não dá para cobrir com mock.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'
import { DDL_RECORRENCIA } from './recorrencia-ddl'
import { planejarOcorrencias } from './recorrencia'

const BASE_SCHEMA = `
  CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL);
  CREATE TABLE contas (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE items (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conta_id text,
    descricao text NOT NULL,
    valor text NOT NULL,
    tipo text NOT NULL,
    categoria text NOT NULL,
    data text NOT NULL,
    mes text NOT NULL,
    recorrente boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  );
  INSERT INTO users (id, name) VALUES ('u1', 'João');
  INSERT INTO contas (id, user_id) VALUES ('c1', 'u1');
`

async function novoBanco() {
  const db = new PGlite()
  await db.exec(BASE_SCHEMA)
  return db
}

async function aplicarDdl(db: PGlite) {
  for (const instrucao of DDL_RECORRENCIA) {
    await db.exec(instrucao)
  }
}

interface OcorrenciaRow {
  recorrenciaId: string
  userId: string
  contaId: string | null
  descricao: string
  valor: string
  tipo: string
  categoria: string
  data: string
  mes: string
}

async function inserirPlanejadas(db: PGlite, planejadas: OcorrenciaRow[]): Promise<number> {
  let inseridas = 0
  for (const p of planejadas) {
    const res = await db.query(
      `INSERT INTO items (id, user_id, conta_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        `item-${p.recorrenciaId}-${p.mes}`,
        p.userId,
        p.contaId,
        p.descricao,
        p.valor,
        p.tipo,
        p.categoria,
        p.data,
        p.mes,
        p.recorrenciaId,
      ],
    )
    inseridas += res.rows.length
  }
  return inseridas
}

function serie(over: Partial<Parameters<typeof planejarOcorrencias>[0][number]> = {}) {
  return {
    id: 'serie-1',
    userId: 'u1',
    contaId: null,
    descricao: 'Aluguel',
    valor: '1800.00',
    tipo: 'despesa',
    categoria: 'Moradia',
    dia: 5,
    mesInicio: '2026-11',
    ...over,
  }
}

test('DDL é idempotente e cria tabela, coluna e índice', async () => {
  const db = await novoBanco()
  await aplicarDdl(db)
  await aplicarDdl(db) // segunda vez não pode quebrar

  const coluna = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'items' AND column_name = 'recorrencia_id'`,
  )
  assert.equal(coluna.rows.length, 1)

  const indice = await db.query<{ indexname: string }>(
    'SELECT indexname FROM pg_indexes WHERE indexname = \'items_recorrencia_mes_uidx\'',
  )
  assert.equal(indice.rows.length, 1)

  const tabelas = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('recorrencias', 'recorrencia_pulos')`,
  )
  assert.equal(tabelas.rows.length, 2)

  await db.close()
})

test('gerar duas vezes não duplica (índice único + ON CONFLICT)', async () => {
  const db = await novoBanco()
  await aplicarDdl(db)

  const plano = planejarOcorrencias([serie()], {}, '2026-11')
  assert.equal(await inserirPlanejadas(db, plano), 13)

  // mesma chamada de novo (ex.: usuário reabriu o mês)
  const denovo = planejarOcorrencias([serie()], {}, '2026-11')
  assert.equal(await inserirPlanejadas(db, denovo), 0)

  const total = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM items WHERE recorrencia_id = \'serie-1\'')
  assert.equal(total.rows[0].n, 13)

  // segunda chamada com estado já sincronizado também planeja zero
  assert.deepEqual(planejarOcorrencias([serie()], { ultimoPorSerie: { 'serie-1': '2027-11' } }, '2026-11'), [])

  await db.close()
})

test('índice bloqueia duas ocorrências da mesma série no mesmo mês', async () => {
  const db = await novoBanco()
  await aplicarDdl(db)

  await db.query(
    `INSERT INTO items (id, user_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id)
     VALUES ('a', 'u1', 'Aluguel', '1800.00', 'despesa', 'Moradia', '2026-11-05', '2026-11', true, 'serie-1')`,
  )

  await assert.rejects(
    db.query(
      `INSERT INTO items (id, user_id, descricao, valor, tipo, categoria, data, mes, recorrente, recorrencia_id)
       VALUES ('b', 'u1', 'Aluguel', '1800.00', 'despesa', 'Moradia', '2026-11-05', '2026-11', true, 'serie-1')`,
    ),
    /duplicate key|unique/i,
  )

  // lançamentos avulsos (sem série) continuam podendo repetir o mês
  await db.query(
    `INSERT INTO items (id, user_id, descricao, valor, tipo, categoria, data, mes, recorrente)
     VALUES ('c', 'u1', 'Mercado', '100.00', 'despesa', 'Alimentação', '2026-11-03', '2026-11', false),
            ('d', 'u1', 'Farmácia', '50.00', 'despesa', 'Saúde', '2026-11-04', '2026-11', false)`,
  )
  const avulsos = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM items WHERE recorrencia_id IS NULL')
  assert.equal(avulsos.rows[0].n, 2)

  await db.close()
})

test('pular mês remove a ocorrência e o registro impede recriação', async () => {
  const db = await novoBanco()
  await aplicarDdl(db)

  await inserirPlanejadas(db, planejarOcorrencias([serie()], {}, '2026-11'))

  // pular 2026-12
  await db.query('DELETE FROM items WHERE recorrencia_id = \'serie-1\' AND mes = \'2026-12\'')
  await db.query('INSERT INTO recorrencia_pulos (recorrencia_id, mes) VALUES (\'serie-1\', \'2026-12\') ON CONFLICT DO NOTHING')
  await db.query('INSERT INTO recorrencia_pulos (recorrencia_id, mes) VALUES (\'serie-1\', \'2026-12\') ON CONFLICT DO NOTHING')

  const pulos = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM recorrencia_pulos')
  assert.equal(pulos.rows[0].n, 1)

  // reabrir o mês não traz dezembro de volta
  const plano = planejarOcorrencias(
    [serie()],
    { ultimoPorSerie: { 'serie-1': '2027-11' }, pulosPorSerie: { 'serie-1': ['2026-12'] } },
    '2026-12',
  )
  assert.equal(await inserirPlanejadas(db, plano), 0)

  const dezembro = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM items WHERE mes = \'2026-12\'')
  assert.equal(dezembro.rows[0].n, 0)

  await db.close()
})

test('encerrar mantém o histórico do mês e apaga só os futuros', async () => {
  const db = await novoBanco()
  await aplicarDdl(db)

  await inserirPlanejadas(db, planejarOcorrencias([serie()], {}, '2026-11'))

  await db.query('UPDATE recorrencias SET ativa = false, mes_fim = \'2027-01\' WHERE id = \'serie-1\'')
  const apagadas = await db.query(
    'DELETE FROM items WHERE recorrencia_id = \'serie-1\' AND mes > \'2027-01\' RETURNING id',
  )

  // de 2026-11 a 2027-11 são 13 ocorrências; mantendo até 2027-01 sobram 3
  assert.equal(apagadas.rows.length, 10)
  const restantes = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM items WHERE recorrencia_id = \'serie-1\'')
  assert.equal(restantes.rows[0].n, 3)

  await db.close()
})
