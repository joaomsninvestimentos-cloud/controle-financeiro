/**
 * Diagnóstico dos espelhos de despesa da casa.
 *
 * Existe para responder a pergunta "criei a despesa, marquei como da casa e
 * ela não aparece lá — por quê?". A regra pura devolve a lista de problemas e
 * o plano de correção; o banco só executa.
 */

export interface ContaRef {
  id: string
  nome: string
  tipo: 'pessoal' | 'casa'
}

export interface SerieRef {
  id: string
  descricao: string
  contaId: string | null
  espelharContaId: string | null
  ativa: boolean
}

export interface ItemRef {
  id: string
  descricao: string
  contaId: string | null
  recorrenciaId: string | null
  /** preenchido só nos espelhos */
  espelhoDe: string | null
  mes: string
}

export type TipoProblema =
  | 'SERIE_DESTINO_INVALIDO'
  | 'ESPELHO_FALTANDO'
  | 'ESPELHO_CONTA_ERRADA'
  | 'ESPELHO_ORFAO'
  | 'ESPELHO_DUPLICADO'
  | 'SERIE_PODE_ESPELHAR'

export interface Problema {
  tipo: TipoProblema
  severidade: 'erro' | 'aviso'
  /** Texto curto, para a lista. */
  titulo: string
  /** Explicação em uma linha. */
  detalhe: string
  serieId?: string
  itemId?: string
  espelhoId?: string
  corrigivel: boolean
}

export type AcaoCorrecao =
  | { tipo: 'criar'; origemItemId: string; destinoContaId: string }
  | { tipo: 'mover'; espelhoId: string; destinoContaId: string }
  | { tipo: 'apagar'; espelhoId: string }

export interface Diagnostico {
  problemas: Problema[]
  plano: AcaoCorrecao[]
  resumo: { erros: number; avisos: number; corrigiveis: number }
}

export interface EntradaDiagnostico {
  contas: ContaRef[]
  series: SerieRef[]
  itens: ItemRef[]
}

/**
 * Casa "padrão" para consertar destinos inválidos: só existe quando o usuário
 * acessa exatamente uma conta da casa (com duas, não dá para adivinhar).
 */
export function casaPrincipal(contas: ContaRef[]): ContaRef | null {
  const casas = contas.filter(c => c.tipo === 'casa')
  return casas.length === 1 ? casas[0] : null
}

export function diagnosticarEspelhos({ contas, series, itens }: EntradaDiagnostico): Diagnostico {
  const porId = new Map(contas.map(c => [c.id, c]))
  const espelhosPorOrigem = new Map<string, ItemRef[]>()
  for (const item of itens) {
    if (!item.espelhoDe) continue
    const lista = espelhosPorOrigem.get(item.espelhoDe) ?? []
    lista.push(item)
    espelhosPorOrigem.set(item.espelhoDe, lista)
  }
  const idsExistentes = new Set(itens.map(i => i.id))
  const fallback = casaPrincipal(contas)

  const problemas: Problema[] = []
  const plano: AcaoCorrecao[] = []

  const apagarDuplicado = (espelho: ItemRef) => {
    problemas.push({
      tipo: 'ESPELHO_DUPLICADO',
      severidade: 'erro',
      titulo: 'Cópia repetida na conta da casa',
      detalhe: `"${espelho.descricao}" (${espelho.mes}) aparece mais de uma vez como espelho.`,
      espelhoId: espelho.id,
      corrigivel: true,
    })
    plano.push({ tipo: 'apagar', espelhoId: espelho.id })
  }

  for (const serie of series) {
    if (!serie.ativa) continue

    const destinoId = serie.espelharContaId
    const destino = destinoId ? porId.get(destinoId) : null
    const dono = serie.contaId ? porId.get(serie.contaId) : null

    // 1) Série marcada para espelhar, mas o destino não serve.
    if (destinoId && (!destino || destino.tipo !== 'casa')) {
      problemas.push({
        tipo: 'SERIE_DESTINO_INVALIDO',
        severidade: 'erro',
        titulo: 'Espelho apontando para a conta errada',
        detalhe: `"${serie.descricao}" está marcada para espelhar em ${destino ? `"${destino.nome}" (não é conta da casa)` : 'uma conta que não existe mais'}.`,
        serieId: serie.id,
        corrigivel: !!fallback && fallback.id !== serie.contaId,
      })
      if (fallback && fallback.id !== serie.contaId) {
        for (const item of itens) {
          if (item.recorrenciaId !== serie.id || item.espelhoDe) continue
          plano.push({ tipo: 'criar', origemItemId: item.id, destinoContaId: fallback.id })
        }
      }
      continue
    }

    // 2) Série em conta pessoal, sem espelho, com casa disponível: só um aviso.
    if (!destinoId) {
      if (dono?.tipo === 'pessoal' && fallback && fallback.id !== serie.contaId) {
        problemas.push({
          tipo: 'SERIE_PODE_ESPELHAR',
          severidade: 'aviso',
          titulo: 'Despesa fixa sem espelho na casa',
          detalhe: `"${serie.descricao}" está só na conta pessoal. Marque "também é despesa da ${fallback.nome}" se ela for da casa.`,
          serieId: serie.id,
          corrigivel: false,
        })
      }
      continue
    }

    // 3) Série com destino válido: conferir cada mês gerado.
    const origens = itens.filter(i => i.recorrenciaId === serie.id && !i.espelhoDe)
    for (const origem of origens) {
      const espelhos = espelhosPorOrigem.get(origem.id) ?? []

      if (espelhos.length === 0) {
        problemas.push({
          tipo: 'ESPELHO_FALTANDO',
          severidade: 'erro',
          titulo: 'Não apareceu na conta da casa',
          detalhe: `"${origem.descricao}" (${origem.mes}) deveria ter uma cópia em "${destino!.nome}" e não tem.`,
          itemId: origem.id,
          serieId: serie.id,
          corrigivel: true,
        })
        plano.push({ tipo: 'criar', origemItemId: origem.id, destinoContaId: destino!.id })
        continue
      }

      // Fica com o primeiro e remove os extras.
      espelhos.slice(1).forEach(apagarDuplicado)

      const espelho = espelhos[0]
      if (espelho.contaId !== destino!.id) {
        problemas.push({
          tipo: 'ESPELHO_CONTA_ERRADA',
          severidade: 'erro',
          titulo: espelho.contaId
            ? 'Cópia na conta errada'
            : 'Cópia sem conta (não aparece em lugar nenhum)',
          detalhe: `A cópia de "${espelho.descricao}" (${espelho.mes}) está em ${espelho.contaId ? 'outra conta' : 'nenhuma conta'} em vez de "${destino!.nome}".`,
          espelhoId: espelho.id,
          itemId: origem.id,
          corrigivel: true,
        })
        plano.push({ tipo: 'mover', espelhoId: espelho.id, destinoContaId: destino!.id })
      }
    }
  }

  // 4) Espelhos cujo lançamento original não existe mais.
  for (const espelho of itens) {
    if (!espelho.espelhoDe) continue
    if (idsExistentes.has(espelho.espelhoDe)) continue
    problemas.push({
      tipo: 'ESPELHO_ORFAO',
      severidade: 'erro',
      titulo: 'Cópia sem lançamento de origem',
      detalhe: `"${espelho.descricao}" (${espelho.mes}) está na casa, mas o lançamento original foi apagado.`,
      espelhoId: espelho.id,
      corrigivel: true,
    })
    plano.push({ tipo: 'apagar', espelhoId: espelho.id })
  }

  const erros = problemas.filter(p => p.severidade === 'erro').length
  const avisos = problemas.length - erros

  return {
    problemas,
    plano,
    resumo: { erros, avisos, corrigiveis: problemas.filter(p => p.corrigivel).length },
  }
}

/** Uma linha para o topo da tela. */
export function resumoDiagnostico(resumo: Diagnostico['resumo']): string {
  if (resumo.erros === 0 && resumo.avisos === 0) return 'Tudo certo: os espelhos da casa estão no lugar.'
  const partes: string[] = []
  if (resumo.erros > 0) partes.push(`${resumo.erros} problema${resumo.erros === 1 ? '' : 's'}`)
  if (resumo.avisos > 0) partes.push(`${resumo.avisos} aviso${resumo.avisos === 1 ? '' : 's'}`)
  return partes.join(' · ')
}
