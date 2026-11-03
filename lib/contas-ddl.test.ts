/**
 * Integração real (Postgres via PGlite) para contas pessoais/casa e convites:
 * valida o DDL, a regra de "uma conta pessoal por usuário" e o ciclo do convite.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'
import { DDL_CONTAS } from './contas-ddl'

const BASE = `
  CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL, email text);
  CREATE TABLE contas (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nome text NOT NULL,
    cor text NOT NULL DEFAULT '#8FB39A',
    emoji text NOT NULL DEFAULT '🏦',
    saldo_inicial text NOT NULL DEFAULT '0',
    saldo_inicial_mes text NOT NULL DEFAULT '',
    ativa boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE conta_members (
    id text PRIMARY KEY,
    conta_id text NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',
    invite_email text,
    invite_token text,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamp NOT NULL DEFAULT now()
  );
  INSERT INTO users (id, name, email) VALUES ('u1','João','joao@email.com'), ('u2','Maria','maria@email.com');
`

async function novoBanco() {
  const db = new PGlite()
  await db.exec(BASE)
  for (const instrucao of DDL_CONTAS) await db.exec(instrucao)
  return db
}

test('DDL é idempotente, cria tipo/validade e libera user_id nullable', async () => {
  const db = await novoBanco()
  for (const instrucao of DDL_CONTAS) await db.exec(instrucao) // segunda vez

  const colunas = await db.query<{ column_name: string; is_nullable: string }>(
    `SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_name = 'conta_members'
       AND column_name IN ('user_id','invite_expires_at','invite_used_at','invite_role')`,
  )
  const mapa = Object.fromEntries(colunas.rows.map(c => [c.column_name, c.is_nullable]))
  assert.equal(mapa.user_id, 'YES', 'convite para quem não tem conta exige user_id nullable')
  assert.equal(mapa.invite_expires_at, 'YES')
  assert.equal(mapa.invite_used_at, 'YES')
  assert.equal(mapa.invite_role, 'YES')

  const tipo = await db.query<{ column_default: string }>(
    `SELECT column_default FROM information_schema.columns
     WHERE table_name = 'contas' AND column_name = 'tipo'`,
  )
  assert.match(tipo.rows[0].column_default, /pessoal/)
  await db.close()
})

test('dá para criar convite sem usuário (o caso que quebrava antes)', async () => {
  const db = await novoBanco()
  await db.query(`INSERT INTO contas (id, user_id, nome, tipo) VALUES ('casa','u1','Casa','casa')`)

  // Sem DDL, user_id NOT NULL faria isto falhar; agora passa.
  await db.query(
    `INSERT INTO conta_members (id, conta_id, user_id, role, invite_email, invite_token, invite_expires_at, status)
     VALUES ('m1','casa', NULL, 'member', NULL, 'tok123', now() + interval '7 days', 'pending')`,
  )

  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM conta_members WHERE invite_token = 'tok123'`)
  assert.equal(r.rows[0].n, 1)
  await db.close()
})

test('aceite do convite vincula o usuário e permite um único membro por conta', async () => {
  const db = await novoBanco()
  await db.query(`INSERT INTO contas (id, user_id, nome, tipo) VALUES ('casa','u1','Casa','casa')`)
  await db.query(
    `INSERT INTO conta_members (id, conta_id, user_id, invite_token, invite_expires_at, status)
     VALUES ('m1','casa', NULL, 'tok123', now() + interval '7 days', 'pending')`,
  )

  // aceite
  await db.query(
    `UPDATE conta_members SET user_id = 'u2', status = 'active', invite_used_at = now() WHERE invite_token = 'tok123'`,
  )
  const aceito = await db.query<{ user_id: string; status: string }>(
    `SELECT user_id, status FROM conta_members WHERE invite_token = 'tok123'`,
  )
  assert.equal(aceito.rows[0].user_id, 'u2')
  assert.equal(aceito.rows[0].status, 'active')

  // o índice único impede a mesma pessoa duas vezes na mesma conta
  await assert.rejects(
    db.query(
      `INSERT INTO conta_members (id, conta_id, user_id, role, status)
       VALUES ('m2','casa','u2','member','active')`,
    ),
    /duplicate key|unique/i,
  )

  // mas membros pendentes (sem user_id) convivem em paralelo
  await db.query(
    `INSERT INTO conta_members (id, conta_id, user_id, invite_token, status)
     VALUES ('m3','casa',NULL,'tok999','pending')`,
  )
  const pendentes = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM conta_members WHERE conta_id = 'casa'`,
  )
  assert.equal(pendentes.rows[0].n, 2)
  await db.close()
})

test('só uma conta pessoal por usuário (regra da aplicação + consulta)', async () => {
  const db = await novoBanco()

  await db.query(`INSERT INTO contas (id, user_id, nome, tipo) VALUES ('p1','u1','João','pessoal')`)

  const existentes = await db.query<{ id: string }>(
    `SELECT id FROM contas WHERE user_id = 'u1' AND tipo = 'pessoal' LIMIT 1`,
  )
  assert.equal(existentes.rows.length, 1, 'a segunda criação deve reaproveitar esta')

  // contas pessoais de pessoas diferentes não se misturam
  await db.query(`INSERT INTO contas (id, user_id, nome, tipo) VALUES ('p2','u2','Maria','pessoal')`)
  const joao = await db.query<{ id: string }>(`SELECT id FROM contas WHERE user_id = 'u1' AND tipo = 'pessoal'`)
  assert.deepEqual(joao.rows.map(r => r.id), ['p1'])
  await db.close()
})

test('visibilidade: pessoal do outro não aparece na lista do usuário', async () => {
  const db = await novoBanco()
  await db.query(`
    INSERT INTO contas (id, user_id, nome, tipo) VALUES
      ('p1','u1','João','pessoal'),
      ('p2','u2','Maria','pessoal'),
      ('casa','u1','Casa','casa')
  `)
  await db.query(
    `INSERT INTO conta_members (id, conta_id, user_id, role, status) VALUES ('m1','casa','u2','member','active')`,
  )

  const visiveis = await db.query<{ id: string }>(
    `SELECT c.id FROM contas c
     WHERE c.user_id = 'u2'
        OR EXISTS (
          SELECT 1 FROM conta_members m
          WHERE m.conta_id = c.id AND m.user_id = 'u2' AND m.status = 'active'
        )
     ORDER BY c.id`,
  )
  assert.deepEqual(visiveis.rows.map(r => r.id), ['casa', 'p2'])
  assert.ok(!visiveis.rows.some(r => r.id === 'p1'), 'a conta pessoal do João não pode vazar')
  await db.close()
})

test('backfill: usuário antigo sem conta recebe uma pessoal', async () => {
  const db = await novoBanco()
  // u1 e u2 existem, mas ninguém tem conta
  const antes = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM contas`)
  assert.equal(antes.rows[0].n, 0)

  for (const [id, nome] of [['u1', 'João'], ['u2', 'Maria']]) {
    const achou = await db.query(
      `SELECT id FROM contas WHERE user_id = $1 AND tipo = 'pessoal' LIMIT 1`, [id],
    )
    if (achou.rows.length === 0) {
      await db.query(
        `INSERT INTO contas (id, user_id, nome, tipo, emoji) VALUES ($1, $2, $3, 'pessoal', '👤')`,
        [`p-${id}`, id, nome],
      )
    }
  }

  const depois = await db.query<{ id: string; nome: string }>(
    `SELECT id, nome FROM contas WHERE tipo = 'pessoal' ORDER BY id`,
  )
  assert.equal(depois.rows.length, 2)
  assert.deepEqual(depois.rows.map(r => r.nome), ['João', 'Maria'])
  await db.close()
})
