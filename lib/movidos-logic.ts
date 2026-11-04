export type MarcaMovido = {
  itemId: string
  destinoNome: string
  destinoId: string
  em: number
}

export const DIAS_MARCA_VISIVEL = 7
export const chaveMarcas = 'lancamentos-movidos'

const MS_DIA = 24 * 60 * 60 * 1000

function isMarca(valor: unknown): valor is MarcaMovido {
  if (typeof valor !== 'object' || valor === null) return false
  const m = valor as Record<string, unknown>
  return (
    typeof m.itemId === 'string' &&
    m.itemId.length > 0 &&
    typeof m.destinoNome === 'string' &&
    m.destinoNome.length > 0 &&
    typeof m.destinoId === 'string' &&
    m.destinoId.length > 0 &&
    typeof m.em === 'number' &&
    Number.isFinite(m.em)
  )
}

export function registrarMarca(
  lista: MarcaMovido[],
  marca: MarcaMovido,
  agora: number,
): MarcaMovido[] {
  const semMesmo = lista.filter(m => m.itemId !== marca.itemId)
  return limparAntigas([...semMesmo, { ...marca, em: agora }], agora)
}

export function removerMarca(lista: MarcaMovido[], itemId: string): MarcaMovido[] {
  return lista.filter(m => m.itemId !== itemId)
}

export function limparAntigas(lista: MarcaMovido[], agora: number): MarcaMovido[] {
  const limite = agora - DIAS_MARCA_VISIVEL * MS_DIA
  return lista.filter(m => m.em >= limite)
}

export function marcasVisiveis(
  lista: MarcaMovido[],
  agora: number,
): Map<string, MarcaMovido> {
  const map = new Map<string, MarcaMovido>()
  for (const m of limparAntigas(lista, agora)) {
    map.set(m.itemId, m)
  }
  return map
}

export function resumoMovidos(
  lista: MarcaMovido[],
  agora: number,
): { total: number; destinos: string[] } {
  const visiveis = limparAntigas(lista, agora)
  const destinos: string[] = []
  const vistos = new Set<string>()
  for (const m of visiveis) {
    if (vistos.has(m.destinoNome)) continue
    vistos.add(m.destinoNome)
    destinos.push(m.destinoNome)
  }
  return { total: visiveis.length, destinos }
}

export function normalizarMarca(valorDesconhecido: unknown): MarcaMovido[] {
  if (!Array.isArray(valorDesconhecido)) return []
  const saida: MarcaMovido[] = []
  for (const item of valorDesconhecido) {
    if (isMarca(item)) saida.push(item)
  }
  return saida
}
