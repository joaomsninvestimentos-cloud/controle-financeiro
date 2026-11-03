/**
 * DDL de contas pessoais / casa / convites — idempotente, aplicado em runtime
 * (e testado contra Postgres real em `lib/contas-ddl.test.ts`).
 */
export const DDL_CONTAS: string[] = [
  // tipo da conta: 'pessoal' (privada) ou 'casa' (compartilhada)
  'ALTER TABLE contas ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT \'pessoal\'',
  // convite para quem não tem conta ainda: user_id precisa ser nullable
  // (antes era NOT NULL e o insert do convite quebrava no banco)
  'ALTER TABLE conta_members ALTER COLUMN user_id DROP NOT NULL',
  // convites: papel, validade e uso único
  'ALTER TABLE conta_members ADD COLUMN IF NOT EXISTS invite_role text',
  'ALTER TABLE conta_members ADD COLUMN IF NOT EXISTS invite_expires_at timestamp',
  'ALTER TABLE conta_members ADD COLUMN IF NOT EXISTS invite_used_at timestamp',
  // um mesmo usuário não pode ser membro duas vezes da mesma conta
  `CREATE UNIQUE INDEX IF NOT EXISTS conta_members_conta_user_uidx
     ON conta_members (conta_id, user_id)
     WHERE user_id IS NOT NULL`,
  // busca rápida do convite pelo token
  `CREATE UNIQUE INDEX IF NOT EXISTS conta_members_invite_token_uidx
     ON conta_members (invite_token)
     WHERE invite_token IS NOT NULL`,
]
