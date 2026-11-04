/**
 * Transferir registros de uma conta para outra: troca só o dono (`conta_id`).
 * Nada é recriado, nada é duplicado — datas, valores e a ligação com a série
 * continuam intactos.
 */

export interface ContaTransferivel {
  id: string
  nome: string
  tipo: 'pessoal' | 'casa'
  isOwner: boolean
}

export interface ItemTransferivel {
  id: string
  contaId: string | null
  recorrente: boolean
  recorrenciaId: string | null
  /** preenchido só nos espelhos da casa */
  espelhoDe: string | null
  userId: string
}

export interface SerieTransferivel {
  id: string
  contaId: string | null
  userId: string
  ativa: boolean
}

export interface OrcamentoTransferivel {
  id: string
  contaId: string | null
  mes: string
  categoria: string
}

export type MotivoNaoTransferir =
  | 'MESMA_CONTA'
  | 'SEM_DESTINO'
  | 'NAO_E_DONO'
  | 'SEM_ACESSO_DESTINO'

export interface RegrasTransferencia {
  origemId: string
  destinoId: string | null
  usuarioEhDonoOrigem: boolean
  temAcessoDestino: boolean
}

export function podeTransferir(r: RegrasTransferencia): MotivoNaoTransferir | null {
  if (!r.destinoId) return 'SEM_DESTINO'
  if (r.destinoId === r.origemId) return 'MESMA_CONTA'
  if (!r.usuarioEhDonoOrigem) return 'NAO_E_DONO'
  if (!r.temAcessoDestino) return 'SEM_ACESSO_DESTINO'
  return null
}

/** Contas que podem receber: todas menos a própria origem. */
export function destinosPossiveis<T extends { id: string }>(contas: T[], origemId: string): T[] {
  return contas.filter(c => c.id !== origemId)
}

export interface OpcoesTransferencia {
  incluirLancamentos: boolean
  incluirFixas: boolean
  incluirOrcamentos: boolean
}

export interface PlanoTransferencia {
  /** Séries (despesas fixas) que mudam de conta. */
  serieIds: string[]
  /** Lançamentos avulsos (e as ocorrências das séries) que mudam de conta. */
  itemIds: string[]
  orcamentoIds: string[]
  /** Orçamentos que já existem no destino (mesmo mês + categoria). */
  orcamentosIgnorados: string[]
  counts: {
    fixas: number
    lancamentos: number
    orcamentos: number
    orcamentosIgnorados: number
  }
}

/**
 * Itens que pertencem à origem e podem ser movidos.
 *
 * Regras:
 * - **espelhos nunca se movem** (ficam na casa, apontando para o original);
 * - numa origem **casa**, só saem os itens do próprio usuário — mover os do
 *   outro membro para uma conta pessoal seria vazar dado dele;
 * - numa origem **pessoal**, tudo é do dono.
 */
export function itensTransferiveis(
  itens: ItemTransferivel[],
  origem: { id: string; tipo: 'pessoal' | 'casa' },
  usuarioId: string,
): ItemTransferivel[] {
  return itens.filter(item => {
    if (item.contaId !== origem.id) return false
    if (item.espelhoDe) return false
    if (origem.tipo === 'casa') return item.userId === usuarioId
    return true
  })
}

export function planejarTransferencia(input: {
  origem: { id: string; tipo: 'pessoal' | 'casa' }
  usuarioId: string
  opcoes: OpcoesTransferencia
  itens: ItemTransferivel[]
  series: SerieTransferivel[]
  orcamentosOrigem: OrcamentoTransferivel[]
  orcamentosDestino: OrcamentoTransferivel[]
}): PlanoTransferencia {
  const { origem, usuarioId, opcoes } = input

  const itensDaOrigem = itensTransferiveis(input.itens, origem, usuarioId)
  const seriesDaOrigem = input.series.filter(s => {
    if (s.contaId !== origem.id) return false
    if (origem.tipo === 'casa') return s.userId === usuarioId
    return true
  })

  const serieIds = opcoes.incluirFixas ? seriesDaOrigem.map(s => s.id) : []

  // Lançamentos: as ocorrências de uma fixa só se movem JUNTO com a série.
  // Sozinhas elas descolariam do histórico (a série geraria os próximos meses
  // na conta antiga e o mês movido ficaria órfão).
  const seriesMovidas = new Set(serieIds)
  const itemIds = itensDaOrigem.filter(item => {
    if (item.recorrenciaId) return seriesMovidas.has(item.recorrenciaId)
    return opcoes.incluirLancamentos
  }).map(item => item.id)

  const chave = (o: OrcamentoTransferivel) => `${o.mes}::${o.categoria}`
  const noDestino = new Set(input.orcamentosDestino.map(chave))

  const orcamentosDaOrigem = input.orcamentosOrigem.filter(o => o.contaId === origem.id)
  const orcamentoIds: string[] = []
  const orcamentosIgnorados: string[] = []

  if (opcoes.incluirOrcamentos) {
    for (const o of orcamentosDaOrigem) {
      if (noDestino.has(chave(o))) orcamentosIgnorados.push(o.id)
      else orcamentoIds.push(o.id)
    }
  }

  return {
    serieIds,
    itemIds,
    orcamentoIds,
    orcamentosIgnorados,
    counts: {
      fixas: serieIds.length,
      lancamentos: itemIds.length,
      orcamentos: orcamentoIds.length,
      orcamentosIgnorados: orcamentosIgnorados.length,
    },
  }
}

/** Resumo para a tela, antes de confirmar. */
export function resumoTransferencia(counts: PlanoTransferencia['counts']): string[] {
  const linhas: string[] = []
  if (counts.fixas > 0) linhas.push(`${counts.fixas} despesa(s) fixa(s)`)
  if (counts.lancamentos > 0) linhas.push(`${counts.lancamentos} lançamento(s)`)
  if (counts.orcamentos > 0) linhas.push(`${counts.orcamentos} orçamento(s)`)
  if (counts.orcamentosIgnorados > 0) {
    linhas.push(`${counts.orcamentosIgnorados} orçamento(s) já existiam no destino`)
  }
  return linhas
}

export function nadaParaTransferir(counts: PlanoTransferencia['counts']): boolean {
  return counts.fixas === 0 && counts.lancamentos === 0 && counts.orcamentos === 0
}

/** Texto de confirmação. */
export function avisoTransferencia(
  deNome: string,
  paraNome: string,
  counts: PlanoTransferencia['counts'],
): string {
  const linhas = [`Mover de "${deNome}" para "${paraNome}"?`]

  const partes = resumoTransferencia(counts)
  if (partes.length > 0) linhas.push('', partes.join(' · '))

  linhas.push('', 'Os registros continuam iguais: nada é recriado e nenhum valor é redigitado.')
  if (counts.fixas > 0) {
    linhas.push('As despesas fixas continuam repetindo todo mês, agora na conta nova.')
  }
  if (counts.orcamentosIgnorados > 0) {
    linhas.push('Os orçamentos que já existiam no destino foram mantidos como estão.')
  }
  return linhas.join('\n')
}
