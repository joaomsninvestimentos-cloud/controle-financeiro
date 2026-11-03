export type MoveError = 'SAME_ACCOUNT' | 'MISSING_DESTINATION'

export type ItemMove = {
  id: string
  contaId: string | null
  recorrente: boolean
}

export type OrcamentoMove = {
  id: string
  contaId: string | null
  mes: string
  categoria: string
}

export type MoveCounts = {
  fixas: number
  lancamentos: number
  orcamentos: number
  orcamentosIgnorados: number
}

export type MovePlan = {
  itemIds: string[]
  orcamentoIds: string[]
  orcamentoIdsIgnorados: string[]
  counts: MoveCounts
}

export function validateMoveInput(
  deContaId: string,
  paraContaId: string | null | undefined,
): MoveError | null {
  if (!paraContaId) return 'MISSING_DESTINATION'
  if (deContaId === paraContaId) return 'SAME_ACCOUNT'
  return null
}

export function orcamentoChave(mes: string, categoria: string): string {
  return `${mes}::${categoria}`
}

export function planMoveConta(input: {
  deContaId: string
  incluirLancamentos: boolean
  incluirOrcamentos: boolean
  items: ItemMove[]
  orcamentosOrigem: OrcamentoMove[]
  orcamentosDestino: OrcamentoMove[]
}): MovePlan {
  const daOrigem = input.items.filter(i => i.contaId === input.deContaId)
  const fixas = daOrigem.filter(i => i.recorrente)
  const lancamentos = daOrigem.filter(i => !i.recorrente)

  const itemIds = [
    ...fixas.map(i => i.id),
    ...(input.incluirLancamentos ? lancamentos.map(i => i.id) : []),
  ]

  const destChaves = new Set(
    input.orcamentosDestino.map(o => orcamentoChave(o.mes, o.categoria)),
  )

  const orcamentosDaOrigem = input.orcamentosOrigem.filter(
    o => o.contaId === input.deContaId,
  )

  const orcamentoIds: string[] = []
  const orcamentoIdsIgnorados: string[] = []

  if (input.incluirOrcamentos) {
    for (const o of orcamentosDaOrigem) {
      if (destChaves.has(orcamentoChave(o.mes, o.categoria))) {
        orcamentoIdsIgnorados.push(o.id)
      } else {
        orcamentoIds.push(o.id)
      }
    }
  }

  return {
    itemIds,
    orcamentoIds,
    orcamentoIdsIgnorados,
    counts: {
      fixas: fixas.length,
      lancamentos: input.incluirLancamentos ? lancamentos.length : 0,
      orcamentos: orcamentoIds.length,
      orcamentosIgnorados: orcamentoIdsIgnorados.length,
    },
  }
}
