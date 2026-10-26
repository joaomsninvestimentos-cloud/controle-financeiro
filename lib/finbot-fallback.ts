import { fmtBrl } from './format'

/**
 * Resposta de emergência do FinBot quando o provedor de IA está indisponível.
 * Usa apenas dados já calculados no servidor (nada inventado) para o chat nunca
 * ficar sem resposta — e deixa o detalhe técnico em uma linha discreta.
 */
export type OfflineMotivo = 'LLM_NOT_CONFIGURED' | 'LLM_AUTH_FAILED' | 'LLM_ERROR' | 'LLM_EMPTY'

export interface OfflineReplyInput {
  mesLabel: string
  receitas: number
  despesas: number
  saldo: number
  nLancamentos: number
  topCategoria?: { nome: string; valor: number }
  orcamentosExcedidos?: Array<{ categoria: string; gasto: number; limite: number }>
  motivo: OfflineMotivo
  faltando?: string[]
}

const DETALHE: Record<OfflineMotivo, string> = {
  LLM_NOT_CONFIGURED: 'o provedor de IA não está configurado neste ambiente',
  LLM_AUTH_FAILED: 'o provedor recusou a chave da IA (401/403)',
  LLM_ERROR: 'o provedor de IA falhou ao responder',
  LLM_EMPTY: 'o provedor de IA respondeu vazio',
}

export function buildOfflineReply(input: OfflineReplyInput): string {
  const linhas: string[] = []

  linhas.push('**Estou em modo offline agora** — a análise por IA está indisponível. '
    + 'Mas os seus números eu consigo mostrar:')
  linhas.push('')
  linhas.push(`**Resumo de ${input.mesLabel}**`)
  linhas.push(`- Receitas: ${fmtBrl(input.receitas)}`)
  linhas.push(`- Despesas: ${fmtBrl(input.despesas)}`)
  linhas.push(`- Saldo: ${fmtBrl(input.saldo)}`)
  linhas.push(`- Lançamentos: ${input.nLancamentos}`)

  if (input.topCategoria) {
    linhas.push('')
    linhas.push(`**Maior gasto:** ${input.topCategoria.nome} — ${fmtBrl(input.topCategoria.valor)}`)
  }

  if (input.orcamentosExcedidos && input.orcamentosExcedidos.length > 0) {
    linhas.push('')
    linhas.push('**Orçamentos estourados**')
    for (const o of input.orcamentosExcedidos) {
      linhas.push(`- ${o.categoria}: ${fmtBrl(o.gasto)} de ${fmtBrl(o.limite)}`)
    }
  }

  if (input.nLancamentos === 0) {
    linhas.push('')
    linhas.push('Não há lançamentos neste mês ainda — registre alguns para eu conseguir analisar.')
  }

  const faltando = input.faltando?.length ? ` (faltando: ${input.faltando.join(', ')})` : ''
  linhas.push('')
  linhas.push(`_Detalhe técnico: ${DETALHE[input.motivo]}${faltando}._`)

  return linhas.join('\n')
}
