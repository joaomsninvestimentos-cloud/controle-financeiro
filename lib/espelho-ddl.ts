/**
 * DDL do espelho de despesa, aplicado em runtime (idempotente).
 * Mesmo padrão de lib/contas-ddl.ts — evita depender de migration no deploy.
 */
export const DDL_ESPELHO: string[] = [
  // itens: aponta para o lançamento original (null = item normal)
  'ALTER TABLE items ADD COLUMN IF NOT EXISTS espelho_de text',
  // séries de despesa fixa: quando preenchido, todo mês gerado é espelhado
  'ALTER TABLE recorrencias ADD COLUMN IF NOT EXISTS espelhar_conta_id text',
  'CREATE INDEX IF NOT EXISTS items_espelho_de_idx ON items (espelho_de)',
]
