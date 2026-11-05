/**
 * Espelho de despesa: um lançamento que está na conta pessoal de quem pagou e
 * também aparece na conta da casa.
 *
 * Regra de ouro: o espelho é CÓPIA de exibição. Ele entra nos totais da casa,
 * mas NÃO entra na soma consolidada ("Somar tudo") — senão o mesmo gasto
 * contaria duas vezes.
 */

export interface ItemEspelhavel {
  id: string
  userId: string
  contaId: string | null
  descricao: string
  valor: string
  tipo: string
  categoria: string
  data: string
  mes: string
  recorrente: boolean
  recorrenciaId?: string | null
  espelhoDe?: string | null
}

/** Campos que a casa e a conta pessoal compartilham (o que sincroniza). */
export const CAMPOS_SINCRONIZADOS = ['descricao', 'valor', 'categoria', 'data', 'tipo'] as const

/** O item é espelho de outro lançamento? */
export function ehEspelho(item: Pick<ItemEspelhavel, 'espelhoDe'>): boolean {
  return !!item.espelhoDe
}

/** Entra na soma consolidada? Espelho não entra (já está contado na origem). */
export function entraNaSoma(item: Pick<ItemEspelhavel, 'espelhoDe'>): boolean {
  return !ehEspelho(item)
}

export interface Somatorio {
  receitas: number
  despesas: number
  saldo: number
  /** Quantos espelhos foram ignorados (para a UI poder explicar). */
  espelhosIgnorados: number
}

/** Soma as receitas/despesas ignorando espelhos. */
export function somarSemEspelhos(itens: ItemEspelhavel[]): Somatorio {
  let receitas = 0
  let despesas = 0
  let espelhosIgnorados = 0

  for (const item of itens) {
    if (ehEspelho(item)) {
      espelhosIgnorados++
      continue
    }
    const valor = Number.parseFloat(item.valor) || 0
    if (item.tipo === 'receita') receitas += valor
    else despesas += valor
  }

  return { receitas, despesas, saldo: receitas - despesas, espelhosIgnorados }
}

/** Motivo pelo qual não dá para espelhar (null = pode). */
export type ImpedimentoEspelho =
  | 'CONTA_ORIGEM_NAO_PESSOAL'
  | 'SEM_CONTA_DA_CASA'
  | 'CONTA_DESTINO_NAO_E_CASA'
  | 'DESTINO_IGUAL_ORIGEM'

export interface RegrasEspelho {
  tipoContaOrigem: 'pessoal' | 'casa' | null
  contaDestinoId: string | null
  contaOrigemId: string | null
  destinoEhCasa: boolean
}

export function impedimentoEspelho(r: RegrasEspelho): ImpedimentoEspelho | null {
  if (!r.contaDestinoId) return 'SEM_CONTA_DA_CASA'
  if (r.contaOrigemId && r.contaDestinoId === r.contaOrigemId) return 'DESTINO_IGUAL_ORIGEM'
  if (r.tipoContaOrigem !== 'pessoal') return 'CONTA_ORIGEM_NAO_PESSOAL'
  if (!r.destinoEhCasa) return 'CONTA_DESTINO_NAO_E_CASA'
  return null
}

export function podeEspelhar(r: RegrasEspelho): boolean {
  return impedimentoEspelho(r) === null
}

/** Texto do selo mostrado no lançamento pessoal. */
export function seloEspelhado(nomeConta: string | null | undefined): string {
  return nomeConta ? `🏠 também na ${nomeConta}` : '🏠 também na casa'
}

/** Texto do selo mostrado no espelho, dentro da conta da casa. */
export function seloOrigem(autorNome: string | null | undefined): string {
  const quem = autorNome?.trim().split(' ')[0]
  return quem ? `🏠 pago por ${quem}` : '🏠 despesa da casa'
}

/** Aviso antes de remover o espelho (não apaga o lançamento de quem pagou). */
export function avisoRemoverEspelho(descricao: string, autorNome?: string | null): string {
  const quem = autorNome?.trim().split(' ')[0] ?? 'quem pagou'
  return `Remover o espelho de "${descricao}" da Casa? O lançamento de ${quem} continua na conta pessoal.`
}

/** Aviso antes de apagar a origem (o espelho vai junto). */
export function avisoRemoverOrigemComEspelho(descricao: string, nomeConta: string): string {
  return `Excluir "${descricao}" também remove a cópia que aparece na ${nomeConta}. Continuar?`
}

/** Monta o registro do espelho a partir do original. */
export function montarEspelho(
  origem: ItemEspelhavel,
  contaDestinoId: string,
  novoId: string,
): ItemEspelhavel {
  return {
    id: novoId,
    userId: origem.userId,
    contaId: contaDestinoId,
    descricao: origem.descricao,
    valor: origem.valor,
    tipo: origem.tipo,
    categoria: origem.categoria,
    data: origem.data,
    mes: origem.mes,
    recorrente: origem.recorrente,
    // O espelho NÃO herda `recorrenciaId`: `items_recorrencia_mes_uidx` é
    // único em (recorrencia_id, mes) e o espelho tem o mesmo mês do original.
    // Herdar a série fazia o insert violar o índice e a cópia nunca nascia —
    // era o "marco como da casa e nada acontece".
    recorrenciaId: null,
    espelhoDe: origem.id,
  }
}

/** Filtra só os campos compartilhados (o que pode ser sincronizado). */
export function apenasCamposSincronizados<T extends object>(campos: T): Partial<T> {
  const origem = campos as Record<string, unknown>
  const saida: Record<string, unknown> = {}
  for (const chave of CAMPOS_SINCRONIZADOS) {
    if (origem[chave] !== undefined) saida[chave] = origem[chave]
  }
  return saida as Partial<T>
}
