/**
 * DDL da recorrência, em um lugar só.
 *
 * É aplicado em runtime por `ensureRecorrenciaSchema` (idempotente) e usado
 * também pelos testes, que rodam essas instruções num Postgres real (PGlite)
 * para garantir que o schema e o índice único funcionam de verdade.
 */
export const DDL_RECORRENCIA: string[] = [
  `CREATE TABLE IF NOT EXISTS recorrencias (
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
    )`,
  'ALTER TABLE items ADD COLUMN IF NOT EXISTS recorrencia_id text',
  `CREATE UNIQUE INDEX IF NOT EXISTS items_recorrencia_mes_uidx
      ON items (recorrencia_id, mes)
      WHERE recorrencia_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS recorrencia_pulos (
      recorrencia_id text NOT NULL,
      mes text NOT NULL,
      PRIMARY KEY (recorrencia_id, mes)
    )`,
]
