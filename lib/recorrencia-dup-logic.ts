/**
 * Despesas fixas duplicadas: a mesma despesa criada duas vezes na mesma conta.
 * Era a causa de "criei a fixa, marquei como da casa, e não espelhou" — o
 * espelho ia para uma série e você olhava a outra.
 *
 * Aqui ficam só as regras (puras). O banco fica em lib/recorrencia-db.ts.
 */

export interface SerieDuplicavel {
  id: string
  descricao: string
  valor: string
  contaId: string | null
  mesInicio: string
  ativa: boolean
  ocorrencias: number
}

/** Chave de duplicidade: mesma descrição (sem caixa) na mesma conta. */
export function chaveDuplicata(serie: Pick<SerieDuplicavel, 'descricao' | 'contaId'>): string {
  return `${serie.descricao.trim().toLowerCase()}|${serie.contaId ?? 'sem-conta'}`
}

export interface GrupoDuplicado {
  chave: string
  descricao: string
  valor: string
  contaId: string | null
  /** A série que fica (mais antiga; empate = mais ocorrências; empate = id). */
  principal: SerieDuplicavel
  /** As que serão encerradas e absorvidas pela principal. */
  outras: SerieDuplicavel[]
  ocorrenciasTotal: number
}

/**
 * Agrupa séries ativas que representam a mesma despesa.
 * Devolve só os grupos com mais de uma (os que precisam de conserto).
 */
export function agruparDuplicadas(series: SerieDuplicavel[]): GrupoDuplicado[] {
  const mapa = new Map<string, SerieDuplicavel[]>()

  for (const serie of series) {
    if (!serie.ativa) continue
    const chave = chaveDuplicata(serie)
    const lista = mapa.get(chave) ?? []
    lista.push(serie)
    mapa.set(chave, lista)
  }

  const grupos: GrupoDuplicado[] = []

  for (const [chave, lista] of mapa) {
    if (lista.length < 2) continue
    const ordenada = [...lista].sort(compararParaPrincipal)
    const [principal, ...outras] = ordenada
    grupos.push({
      chave,
      descricao: principal.descricao,
      valor: principal.valor,
      contaId: principal.contaId,
      principal,
      outras,
      ocorrenciasTotal: lista.reduce((total, s) => total + s.ocorrencias, 0),
    })
  }

  // Mais problemático primeiro: mais cópias, depois mais ocorrências.
  return grupos.sort((a, b) =>
    b.outras.length - a.outras.length || b.ocorrenciasTotal - a.ocorrenciasTotal)
}

/** Ordem de escolha da série que fica: mais antiga → mais ocorrências → id. */
export function compararParaPrincipal(a: SerieDuplicavel, b: SerieDuplicavel): number {
  if (a.mesInicio !== b.mesInicio) return a.mesInicio < b.mesInicio ? -1 : 1
  if (a.ocorrencias !== b.ocorrencias) return b.ocorrencias - a.ocorrencias
  return a.id < b.id ? -1 : 1
}

export interface ItemDeSerie {
  id: string
  recorrenciaId: string
  mes: string
  /** preenchido nos espelhos da casa */
  espelhoDe: string | null
}

export interface PlanoConsolidacao {
  /** Itens que passam a pertencer à série principal (meses que só a duplicada tinha). */
  mover: string[]
  /** Itens duplicados no mesmo mês: ficam de fora (o da principal prevalece). */
  remover: string[]
  /** Espelhos ligados aos itens removidos — saem junto, senão contariam duas vezes. */
  removerEspelhos: string[]
}

/**
 * Junta as séries sem duplicar mês: para cada mês, sobrevive a ocorrência da
 * série principal. Sem isso a consolidação trocaria um problema por outro
 * (duas linhas iguais no mesmo mês).
 */
export function planejarConsolidacao(
  itens: ItemDeSerie[],
  manterId: string,
  juntarIds: string[],
): PlanoConsolidacao {
  const originais = itens.filter(i => i.espelhoDe === null)
  const mesesDaPrincipal = new Set(
    originais.filter(i => i.recorrenciaId === manterId).map(i => i.mes),
  )

  const mover: string[] = []
  const remover: string[] = []

  for (const item of originais) {
    if (!juntarIds.includes(item.recorrenciaId)) continue
    if (mesesDaPrincipal.has(item.mes)) {
      remover.push(item.id)
      // a partir daqui o mês já está coberto pela principal
      mesesDaPrincipal.add(item.mes)
    } else {
      mover.push(item.id)
      mesesDaPrincipal.add(item.mes)
    }
  }

  const removidos = new Set(remover)
  const removerEspelhos = itens
    .filter(i => i.espelhoDe !== null && removidos.has(i.espelhoDe))
    .map(i => i.id)

  return { mover, remover, removerEspelhos }
}

/** Explica o que a consolidação vai fazer, antes de confirmar. */
export function avisoConsolidar(grupo: GrupoDuplicado, totalItens = 0): string {
  const linhas = [
    `Juntar ${grupo.outras.length + 1} despesas fixas "${grupo.descricao}"?`,
    '',
    `Fica a mais antiga (desde ${grupo.principal.mesInicio}). As outras ${grupo.outras.length} são encerradas e os lançamentos delas passam para essa.`,
  ]
  if (totalItens > 0) {
    linhas.push('', `${totalItens} lançamento(s) serão movidos. Meses que existem nos dois lados ficam com um só — nada é contado duas vezes.`)
  }
  return linhas.join('\n')
}

/** Texto do resumo do grupo na lista. */
export function resumoGrupo(grupo: GrupoDuplicado): string {
  const copias = grupo.outras.length + 1
  return `${copias} cópias · ${grupo.ocorrenciasTotal} lançamento(s)`
}
