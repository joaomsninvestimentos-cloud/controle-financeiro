/**
 * Marca de "já movi este lançamento para outra conta".
 *
 * É um checklist de conferência, não um dado contábil: fica só no aparelho
 * (localStorage) e desaparece sozinho depois de alguns dias. Nada de coluna
 * nova no banco.
 */

export interface MarcaMovido {
  itemId: string
  destinoId: string
  destinoNome: string
  em: number
}

export const DIAS_MARCA_VISIVEL = 7
export const CHAVE_MARCAS = 'lancamentos-movidos'

const MS_DIA = 24 * 60 * 60 * 1000

function ehMarca(valor: unknown): valor is MarcaMovido {
  if (typeof valor !== 'object' || valor === null) return false
  const m = valor as Record<string, unknown>
  return (
    typeof m.itemId === 'string' && m.itemId.length > 0 &&
    typeof m.destinoId === 'string' && m.destinoId.length > 0 &&
    typeof m.destinoNome === 'string' && m.destinoNome.length > 0 &&
    typeof m.em === 'number' && Number.isFinite(m.em)
  )
}

/** Descarta marcas vencidas (não muta a lista). */
export function limparAntigas(lista: MarcaMovido[], agora: number): MarcaMovido[] {
  const limite = agora - DIAS_MARCA_VISIVEL * MS_DIA
  return lista.filter(m => m.em >= limite)
}

/** Registra a marca, substituindo a anterior do mesmo lançamento. */
export function registrarMarca(lista: MarcaMovido[], marca: MarcaMovido, agora: number): MarcaMovido[] {
  const outras = lista.filter(m => m.itemId !== marca.itemId)
  return limparAntigas([...outras, { ...marca, em: agora }], agora)
}

export function removerMarca(lista: MarcaMovido[], itemId: string): MarcaMovido[] {
  return lista.filter(m => m.itemId !== itemId)
}

/** Mapa por id do lançamento, só com as marcas ainda válidas. */
export function marcasVisiveis(lista: MarcaMovido[], agora: number): Map<string, MarcaMovido> {
  return new Map(limparAntigas(lista, agora).map(m => [m.itemId, m]))
}

export interface ResumoMovidos {
  total: number
  destinos: string[]
}

export function resumoMovidos(lista: MarcaMovido[], agora: number): ResumoMovidos {
  const visiveis = limparAntigas(lista, agora)
  const destinos: string[] = []
  for (const m of visiveis) {
    if (!destinos.includes(m.destinoNome)) destinos.push(m.destinoNome)
  }
  return { total: visiveis.length, destinos }
}

/**
 * Lê o que veio do localStorage. Qualquer coisa estranha (JSON quebrado,
 * versão antiga, item sem os campos) resulta em lista vazia — a tela nunca
 * pode quebrar por causa de um checklist.
 */
export function normalizarMarca(valorDesconhecido: unknown): MarcaMovido[] {
  if (!Array.isArray(valorDesconhecido)) return []

  const vistos = new Set<string>()
  const saida: MarcaMovido[] = []

  for (const item of valorDesconhecido) {
    if (!ehMarca(item)) continue
    if (vistos.has(item.itemId)) continue
    vistos.add(item.itemId)
    saida.push(item)
  }

  return saida
}

/** Texto do selo no lançamento. */
export function rotuloMarca(marca: MarcaMovido): string {
  return `→ ${marca.destinoNome}`
}

/** Resumo curto para o cabeçalho da lista. */
export function textoResumo(resumo: ResumoMovidos): string {
  if (resumo.total === 0) return ''
  const plural = resumo.total === 1 ? 'movido' : 'movidos'
  const destinos = resumo.destinos.length > 0 ? ` para ${resumo.destinos.join(', ')}` : ''
  return `${resumo.total} ${plural}${destinos}`
}
