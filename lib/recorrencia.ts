/**
 * Regras de recorrência ("despesa fixa") — módulo puro, sem DB.
 *
 * Uma série tem mês de início (`mesInicio`), dia fixo do mês (`dia`) e um fim
 * opcional (`mesFim`). As ocorrências são geradas em lote:
 *   - no cadastro: o mês inicial + os 12 meses seguintes;
 *   - quando o usuário abre um mês além do horizonte, estende até aquele mês;
 *   - nunca passa de `mesFim` (quando definido).
 *
 * A geração é idempotente: quem chama informa até onde já gerou (`jaGeradoAte`)
 * e os meses pulados pelo usuário (`pulados`).
 */

/** Mês inicial + 12 meses seguintes */
export const HORIZONTE_MESES = 13

/** Trava de segurança para nunca gerar uma série infinita num único request. */
export const MAX_MESES_POR_SERIE = 240

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function isMesValido(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
}

export function isDataValida(data: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(data)
}

/** Soma (ou subtrai) meses preservando o formato YYYY-MM. */
export function addMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ano = Math.floor(total / 12)
  const mesZero = ((total % 12) + 12) % 12
  return `${ano}-${pad2(mesZero + 1)}`
}

/** Quantos meses de `de` até `ate` (negativo se `ate` for antes). */
export function diffMeses(de: string, ate: string): number {
  const [y1, m1] = de.split('-').map(Number)
  const [y2, m2] = ate.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

export function ultimoDiaDoMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function diaDoMes(data: string): number {
  const d = Number(data.slice(8, 10))
  return Number.isFinite(d) && d >= 1 ? d : 1
}

/**
 * Data da ocorrência naquele mês, ajustando o dia quando o mês é mais curto
 * (dia 31 em fevereiro cai no último dia do mês).
 */
export function dataDaOcorrencia(mes: string, dia: number): string {
  const limite = ultimoDiaDoMes(mes)
  const d = Math.min(Math.max(1, Math.trunc(dia) || 1), limite)
  return `${mes}-${pad2(d)}`
}

/** Último mês gerado no cadastro: mês inicial + 12 meses. */
export function mesFinalPadrao(mesInicio: string, horizonte = HORIZONTE_MESES): string {
  return addMeses(mesInicio, Math.max(0, horizonte - 1))
}

export interface JanelaGeracao {
  mesInicio: string
  mesFim?: string | null
  /** Mês que o usuário está abrindo — usado para esticar o horizonte. */
  mesSolicitado?: string
  horizonte?: number
}

/** Até qual mês a série deve estar materializada. */
export function mesAlvoGerado({ mesInicio, mesFim, mesSolicitado, horizonte = HORIZONTE_MESES }: JanelaGeracao): string {
  let alvo = mesFinalPadrao(mesInicio, horizonte)

  if (mesFim && mesFim < alvo) alvo = mesFim

  // Estende o horizonte quando o usuário navega para além do que já foi gerado.
  if (mesSolicitado && mesSolicitado > alvo && (!mesFim || mesSolicitado <= mesFim)) {
    alvo = mesSolicitado
  }

  return alvo
}

export interface GeracaoParams extends JanelaGeracao {
  /** Último mês que já tem ocorrência gerada nesta série. */
  jaGeradoAte?: string | null
  /** Meses que o usuário pulou explicitamente — não devem voltar. */
  pulados?: string[]
}

/** Lista de meses que faltam materializar para esta série. */
export function mesesParaGerar(params: GeracaoParams): string[] {
  const { mesInicio, mesFim, jaGeradoAte, pulados } = params
  const alvo = mesAlvoGerado(params)

  if (alvo < mesInicio) return []
  if (mesFim && mesInicio > mesFim) return []

  let inicio = mesInicio
  if (jaGeradoAte && jaGeradoAte >= mesInicio) inicio = addMeses(jaGeradoAte, 1)
  if (inicio > alvo) return []

  const puladosSet = new Set(pulados ?? [])
  const meses: string[] = []
  for (let mes = inicio; mes <= alvo; mes = addMeses(mes, 1)) {
    if (!puladosSet.has(mes)) meses.push(mes)
    if (meses.length >= MAX_MESES_POR_SERIE) break
  }
  return meses
}

export interface SeriePlanejavel {
  id: string
  userId: string
  contaId: string | null
  descricao: string
  valor: string
  tipo: string
  categoria: string
  dia: number | string
  mesInicio: string
  mesFim?: string | null
}

export interface OcorrenciaPlanejada {
  serieId: string
  userId: string
  contaId: string | null
  descricao: string
  valor: string
  tipo: string
  categoria: string
  data: string
  mes: string
  recorrente: true
  recorrenciaId: string
}

export interface EstadoGeracao {
  /** Último mês já materializado por série. */
  ultimoPorSerie?: Record<string, string | null | undefined>
  /** Meses pulados por série. */
  pulosPorSerie?: Record<string, string[] | undefined>
}

/**
 * Decide quais ocorrências faltam, sem tocar no banco. `sincronizarRecorrencias`
 * usa isto e só então insere (com índice único por série+mês como rede extra).
 */
export function planejarOcorrencias(
  series: SeriePlanejavel[],
  estado: EstadoGeracao,
  mesSolicitado: string,
  horizonte = HORIZONTE_MESES,
): OcorrenciaPlanejada[] {
  const planejadas: OcorrenciaPlanejada[] = []

  for (const serie of series) {
    const meses = mesesParaGerar({
      mesInicio: serie.mesInicio,
      mesFim: serie.mesFim ?? null,
      mesSolicitado,
      jaGeradoAte: estado.ultimoPorSerie?.[serie.id] ?? null,
      pulados: estado.pulosPorSerie?.[serie.id],
      horizonte,
    })

    const dia = Number(serie.dia) || 1
    for (const mes of meses) {
      planejadas.push({
        serieId: serie.id,
        userId: serie.userId,
        contaId: serie.contaId,
        descricao: serie.descricao,
        valor: serie.valor,
        tipo: serie.tipo,
        categoria: serie.categoria,
        data: dataDaOcorrencia(mes, dia),
        mes,
        recorrente: true,
        recorrenciaId: serie.id,
      })
    }
  }

  return planejadas
}
