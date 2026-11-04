/**
 * Regras do "puxar para atualizar" (pull-to-refresh). Puras de propósito:
 * o componente só cuida do toque, aqui fica a matemática — e o teste.
 */

/** Distância (px) em que soltar já dispara a atualização. */
export const LIMITE_ATUALIZAR = 70

/** Distância máxima que o dedo "arrasta" o conteúdo (efeito elástico). */
export const LIMITE_ELASTICO = 110

/** Altura do indicador, em px (a partir daqui ele fica visível). */
export const ALTURA_INDICADOR = 56

/** Abaixo disso não mostramos nada — evita tremer em toques acidentais. */
export const LIMITE_INICIO = 8

export interface EstadoPull {
  /** Quanto o usuário já puxou, em px (já com resistência). */
  distancia: number
  /** Vale a pena mostrar o indicador? */
  visivel: boolean
  /** Soltar agora atualiza? */
  vaiAtualizar: boolean
  /** Texto do indicador. */
  rotulo: string
}

/**
 * Aplica resistência: quanto mais puxa, menos o conteúdo acompanha.
 * Sem isso o gesto parece "solto" e a tela pula.
 */
export function aplicarResistencia(bruto: number): number {
  if (bruto <= 0) return 0
  const comFreio = bruto * 0.5
  if (comFreio <= LIMITE_ATUALIZAR) return comFreio
  // depois do limite o avanço fica bem lento
  return Math.min(LIMITE_ELASTICO, LIMITE_ATUALIZAR + (comFreio - LIMITE_ATUALIZAR) * 0.3)
}

/**
 * Só podemos "puxar" quando a lista está no topo. No iPhone o scroll negativo
 * (elástico) não conta como topo — por isso `scrollTop <= 0`.
 */
export function podePuxar(scrollTop: number, atualizando: boolean): boolean {
  return !atualizando && scrollTop <= 0
}

export function estadoPull(bruto: number, atualizando: boolean): EstadoPull {
  const distancia = aplicarResistencia(bruto)
  const visivel = distancia >= LIMITE_INICIO || atualizando
  const vaiAtualizar = !atualizando && distancia >= LIMITE_ATUALIZAR

  let rotulo = ''
  if (atualizando) rotulo = 'Atualizando…'
  else if (vaiAtualizar) rotulo = 'Solte para atualizar'
  else if (visivel) rotulo = 'Puxe para atualizar'

  return { distancia, visivel, vaiAtualizar, rotulo }
}

/** Ao soltar: dispara se passou do limite e não está atualizando. */
export function deveAtualizarAoSoltar(distancia: number, atualizando: boolean): boolean {
  return !atualizando && distancia >= LIMITE_ATUALIZAR
}

/** Deslocamento do indicador (0 = escondido). */
export function deslocamentoIndicador(distancia: number, atualizando: boolean): number {
  if (atualizando) return ALTURA_INDICADOR
  return Math.min(ALTURA_INDICADOR, distancia)
}

/** Opacidade do indicador: aparece suave conforme o dedo desce. */
export function opacidadeIndicador(distancia: number, atualizando: boolean): number {
  if (atualizando) return 1
  return Math.max(0, Math.min(1, distancia / LIMITE_ATUALIZAR))
}

/**
 * Ao voltar para o app (troca de aba, desbloquear o celular) recarregamos se
 * passou tempo suficiente — evita recarregar a cada alt-tab no PC.
 */
export const INTERVALO_MINIMO_RECARGA_MS = 20_000

export function deveRecarregarAoVoltar(ultimaRecarga: number, agora: number): boolean {
  return agora - ultimaRecarga >= INTERVALO_MINIMO_RECARGA_MS
}
