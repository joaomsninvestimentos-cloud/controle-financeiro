'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, RefreshCw, Loader2, CalendarOff, Ban, Repeat, Copy, Merge, Stethoscope, Wrench, Home } from 'lucide-react'
import { fmt, fmtMes, parsearValor, type Conta } from './FinanceApp'

interface Recorrencia {
  id: string
  descricao: string
  valor: string
  tipo: string
  categoria: string
  dia: number
  mesInicio: string
  mesFim: string | null
  contaId: string | null
  espelharContaId: string | null
  proximaData: string
  ocorrencias: number
}

interface Duplicada {
  chave: string
  descricao: string
  valor: string
  contaId: string | null
  principal: { id: string; mesInicio: string }
  outras: Array<{ id: string; mesInicio: string; ocorrencias: number }>
  ocorrenciasTotal: number
}

interface Props {
  mesSelecionado: string
  contas: Conta[]
  onClose: () => void
  onChanged: () => void
  onAviso: (msg: string) => void
}

export default function RecorrenciasModal({ mesSelecionado, contas, onClose, onChanged, onAviso }: Props) {
  const [series, setSeries] = useState<Recorrencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [acaoId, setAcaoId] = useState<string | null>(null)
  const [duplicadas, setDuplicadas] = useState<Duplicada[]>([])
  const [juntando, setJuntando] = useState<string | null>(null)
  const [diag, setDiag] = useState<{
    resumo: { erros: number; avisos: number; corrigiveis: number }
    problemas: Array<{ tipo: string; titulo: string; detalhe: string; corrigivel: boolean }>
  } | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [consertando, setConsertando] = useState(false)

  const carregar = useCallback(() => {
    setCarregando(true)
    fetch(`/api/recorrencias?mes=${mesSelecionado}`)
      .then(r => r.json())
      .then(d => setSeries(d.recorrencias ?? []))
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [mesSelecionado])

  const carregarDuplicadas = useCallback(() => {
    fetch('/api/recorrencias/duplicadas')
      .then(r => r.json())
      .then(d => setDuplicadas(d.duplicadas ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarDuplicadas() }, [carregarDuplicadas])

  const verificarEspelhos = async () => {
    setVerificando(true)
    try {
      const res = await fetch('/api/espelhos/diagnostico')
      const d = await res.json().catch(() => null)
      if (!res.ok || !d) {
        onAviso('Não foi possível verificar os espelhos.')
        return
      }
      setDiag({ resumo: d.resumo, problemas: d.problemas ?? [] })
      if ((d.resumo?.erros ?? 0) === 0) onAviso('Espelhos da casa: tudo certo.')
    } catch {
      onAviso('Sem conexão. Verifique sua internet.')
    } finally {
      setVerificando(false)
    }
  }

  const consertarEspelhos = async () => {
    if (!confirm('Consertar os espelhos da casa?\n\nCópias que faltam são criadas, as que estão na conta errada voltam para a casa e as duplicadas/orfãs são removidas. Nenhum lançamento seu é apagado.')) return
    setConsertando(true)
    try {
      const res = await fetch('/api/espelhos/diagnostico', { method: 'POST' })
      const d = await res.json().catch(() => ({})) as {
        message?: string
        resultado?: { criados: number; movidos: number; apagados: number; falhas: number }
        depois?: { erros: number; avisos: number }
      }
      if (!res.ok) {
        onAviso(d.message ?? 'Não foi possível consertar.')
        return
      }
      const r = d.resultado
      if (r) {
        const partes = [
          r.criados > 0 ? `${r.criados} criada(s)` : '',
          r.movidos > 0 ? `${r.movidos} movida(s)` : '',
          r.apagados > 0 ? `${r.apagados} removida(s)` : '',
        ].filter(Boolean)
        onAviso(partes.length > 0 ? `Espelhos consertados: ${partes.join(', ')}.` : 'Nada para consertar.')
      }
      await verificarEspelhos()
      carregar()
      onChanged()
    } catch {
      onAviso('Sem conexão. Verifique sua internet.')
    } finally {
      setConsertando(false)
    }
  }

  const contaCasa = contas.find(c => c.tipo === 'casa') ?? null

  const alternarEspelho = async (serie: Recorrencia) => {
    if (!contaCasa) {
      onAviso('Você ainda não participa de uma conta da casa.')
      return
    }
    const vaiEspelhar = !serie.espelharContaId
    setAcaoId(serie.id)
    try {
      const res = await fetch(`/api/recorrencias/${serie.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: vaiEspelhar ? 'espelhar' : 'nao-espelhar',
          mes: mesSelecionado,
          ...(vaiEspelhar ? { contaCasaId: contaCasa.id } : {}),
        }),
      })
      const dados = await res.json().catch(() => ({})) as { message?: string; espelhados?: number }
      if (!res.ok) {
        onAviso(dados.message ?? 'Não foi possível espelhar.')
        return
      }
      onAviso(vaiEspelhar
        ? `"${serie.descricao}" agora aparece na ${contaCasa.nome} (${dados.espelhados ?? 0} mês(es)).`
        : `"${serie.descricao}" não é mais espelhada na ${contaCasa.nome}.`)
      carregar()
      onChanged()
    } catch {
      onAviso('Sem conexão. Verifique sua internet.')
    } finally {
      setAcaoId(null)
    }
  }

  const juntar = async (grupo: Duplicada) => {
    const total = grupo.outras.length + 1
    const pergunta = [
      `Juntar ${total} despesas fixas "${grupo.descricao}"?`,
      '',
      `Fica a mais antiga (desde ${fmtMes(grupo.principal.mesInicio)}). As outras ${grupo.outras.length} são encerradas e os lançamentos delas passam para essa.`,
      '',
      'Meses que existem nos dois lados ficam com um só — nada é contado duas vezes.',
    ].join('\n')
    if (!confirm(pergunta)) return

    setJuntando(grupo.chave)
    try {
      const res = await fetch('/api/recorrencias/duplicadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manterId: grupo.principal.id, juntarIds: grupo.outras.map(o => o.id) }),
      })
      const dados = await res.json().catch(() => ({})) as { message?: string; movidos?: number; removidos?: number }
      if (!res.ok) {
        onAviso(dados.message ?? 'Não foi possível juntar as despesas.')
        return
      }
      onAviso(`Despesas juntadas. ${dados.movidos ?? 0} lançamento(s) movidos.`)
      carregar()
      carregarDuplicadas()
      onChanged()
    } catch {
      onAviso('Sem conexão. Verifique sua internet.')
    } finally {
      setJuntando(null)
    }
  }

  const acao = async (id: string, tipo: 'encerrar' | 'pular', descricao: string) => {
    const perguntas = {
      encerrar: `Encerrar "${descricao}"?\n\nEla para de ser criada a partir de ${fmtMes(mesSelecionado)}. O histórico continua no app.`,
      pular: `Pular "${descricao}" em ${fmtMes(mesSelecionado)}?\n\nOs outros meses continuam normais.`,
    }
    if (!confirm(perguntas[tipo])) return

    setAcaoId(id)
    try {
      const res = await fetch(`/api/recorrencias/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: tipo, mes: mesSelecionado }),
      })
      if (!res.ok) {
        onAviso('Não foi possível concluir a ação.')
        return
      }
      onAviso(tipo === 'encerrar' ? 'Despesa fixa encerrada.' : `Mês de ${fmtMes(mesSelecionado)} pulado.`)
      carregar()
      onChanged()
    } catch {
      onAviso('Sem conexão. Verifique sua internet.')
    } finally {
      setAcaoId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#342F2B] rounded-3xl w-full max-w-sm shadow-xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4 max-h-[85dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#2D2A26] dark:text-[#E8E0D5] flex items-center gap-2">
            <Repeat size={16} className="text-[#8FB39A]" /> Despesas fixas
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#FAF6F1] dark:hover:bg-[#3E3935] text-[#8C857C] transition">
            <X size={16} />
          </button>
        </div>

        <p className="text-[11px] text-[#8C857C] dark:text-[#9E9890]">
          Tudo que se repete todo mês. Encerrar mantém o histórico; pular remove só o mês de {fmtMes(mesSelecionado)}.
        </p>

        {carregando && (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin text-[#8FB39A]" />
          </div>
        )}

        {!carregando && series.length === 0 && (
          <div className="text-center py-6 space-y-1">
            <p className="text-sm text-[#8C857C]">Nenhuma despesa fixa ainda.</p>
            <p className="text-[11px] text-[#8C857C]">
              Ao lançar, marque <strong>“Despesa fixa (repete todo mês)”</strong> e ela se repete sozinha.
            </p>
          </div>
        )}

        {!carregando && series.map(s => {
          const conta = contas.find(c => c.id === s.contaId)
          const ocupado = acaoId === s.id
          return (
            <div key={s.id} className="bg-[#FAF6F1] dark:bg-[#3E3935] rounded-2xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#2D2A26] dark:text-[#E8E0D5] truncate">{s.descricao}</p>
                  <p className="text-[11px] text-[#8C857C] dark:text-[#9E9890]">
                    todo dia {s.dia} · {s.categoria}
                    {conta ? ` · ${conta.emoji} ${conta.nome}` : ''}
                  </p>
                  <p className="text-[11px] text-[#8C857C] dark:text-[#9E9890]">
                    desde {fmtMes(s.mesInicio)}
                    {s.mesFim ? ` até ${fmtMes(s.mesFim)}` : ' · sem data para acabar'}
                    {s.ocorrencias > 0 ? ` · ${s.ocorrencias} lançamento(s)` : ''}
                  </p>
                </div>
                <span className={`font-bold text-sm shrink-0 ${s.tipo === 'receita' ? 'text-[#8FB39A]' : 'text-[#D4A0A0]'}`}>
                  {s.tipo === 'receita' ? '+' : '−'} {fmt(parsearValor(s.valor))}
                </span>
              </div>

              {s.espelharContaId && (
                <p className="text-[10px] font-semibold text-[#5f8a6d] dark:text-[#8FB39A] flex items-center gap-1">
                  <Home size={10} /> espelhada na {contas.find(c => c.id === s.espelharContaId)?.nome ?? 'casa'}
                </p>
              )}

              <div className="flex gap-2 flex-wrap pt-1">
                {contaCasa && (
                  <button
                    onClick={() => alternarEspelho(s)}
                    disabled={ocupado}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1.5 border active:scale-95 disabled:opacity-50 ${
                      s.espelharContaId
                        ? 'text-[#8C857C] dark:text-[#9E9890] bg-white dark:bg-[#2B2825] border-[rgba(45,42,38,0.10)] dark:border-[rgba(255,255,255,0.07)]'
                        : 'text-white bg-[#8FB39A] border-transparent'
                    }`}
                  >
                    {ocupado ? <Loader2 size={11} className="animate-spin" /> : <Home size={11} />}
                    {s.espelharContaId ? 'Parar de espelhar' : `Também é da ${contaCasa.nome}`}
                  </button>
                )}
                <button
                  onClick={() => acao(s.id, 'pular', s.descricao)}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8C857C] dark:text-[#9E9890] rounded-full px-2.5 py-1.5 bg-white dark:bg-[#2B2825] border border-[rgba(45,42,38,0.10)] dark:border-[rgba(255,255,255,0.07)] active:scale-95 disabled:opacity-50"
                >
                  <CalendarOff size={11} /> Pular este mês
                </button>
                <button
                  onClick={() => acao(s.id, 'encerrar', s.descricao)}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D4A0A0] rounded-full px-2.5 py-1.5 bg-white dark:bg-[#2B2825] border border-[rgba(45,42,38,0.10)] dark:border-[rgba(255,255,255,0.07)] active:scale-95 disabled:opacity-50"
                >
                  {ocupado ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />} Encerrar
                </button>
              </div>
            </div>
          )
        })}

        {/* Espelhos da casa: verifica e conserta */}
        <div className="rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Stethoscope size={14} className="text-[#8FB39A] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#2D2A26] dark:text-[#E8E0D5]">Espelhos da casa</p>
              <p className="text-[10px] text-[#8C857C] dark:text-[#9E9890] leading-relaxed">
                Confere se toda despesa marcada como “da casa” está mesmo aparecendo lá.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={verificarEspelhos}
              disabled={verificando || consertando}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#2D2A26] dark:text-[#E8E0D5] bg-white dark:bg-[#2B2825] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] rounded-full px-3 py-2 active:scale-95 disabled:opacity-60 transition"
            >
              {verificando ? <Loader2 size={11} className="animate-spin" /> : <Stethoscope size={11} />} Verificar
            </button>
            <button
              onClick={consertarEspelhos}
              disabled={consertando || verificando}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-white bg-[#8FB39A] rounded-full px-3 py-2 active:scale-95 disabled:opacity-60 transition"
            >
              {consertando ? <Loader2 size={11} className="animate-spin" /> : <Wrench size={11} />} Consertar
            </button>
          </div>

          {diag && (
            <div className="space-y-1.5 pt-1">
              {diag.problemas.length === 0 && (
                <p className="text-[11px] text-[#5f8a6d] dark:text-[#8FB39A] font-semibold">
                  ✓ Tudo certo: os espelhos estão no lugar.
                </p>
              )}
              {diag.problemas.map((p, i) => (
                <div key={`${p.tipo}-${i}`} className="rounded-xl bg-white dark:bg-[#2B2825] px-2.5 py-2">
                  <p className={`text-[11px] font-bold ${p.corrigivel ? 'text-[#D4A0A0]' : 'text-[#E8A87C]'}`}>
                    {p.titulo}
                  </p>
                  <p className="text-[10px] text-[#8C857C] dark:text-[#9E9890] leading-relaxed">{p.detalhe}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {duplicadas.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-bold text-[#E8A87C] uppercase tracking-wide flex items-center gap-1.5">
              <Copy size={11} /> Despesas fixas duplicadas
            </p>
            <p className="text-[11px] text-[#8C857C] dark:text-[#9E9890] leading-relaxed">
              A mesma despesa foi criada mais de uma vez. Isso faz o espelho da casa cair na cópia errada.
              Junte para ficar uma só.
            </p>

            {duplicadas.map(g => {
              const conta = contas.find(c => c.id === g.contaId)
              return (
                <div key={g.chave} className="rounded-2xl border border-dashed border-[#E8A87C]/50 bg-[#E8A87C]/5 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#2D2A26] dark:text-[#E8E0D5] truncate">{g.descricao}</p>
                      <p className="text-[11px] text-[#8C857C] dark:text-[#9E9890]">
                        {g.outras.length + 1} cópias · {g.ocorrenciasTotal} lançamento(s)
                        {conta ? ` · ${conta.emoji} ${conta.nome}` : ''}
                      </p>
                      <p className="text-[10px] text-[#8C857C] dark:text-[#9E9890]">
                        fica a de {fmtMes(g.principal.mesInicio)}
                      </p>
                    </div>
                    <span className="font-bold text-sm shrink-0 text-[#D4A0A0]">{fmt(parsearValor(g.valor))}</span>
                  </div>
                  <button
                    onClick={() => juntar(g)}
                    disabled={juntando === g.chave}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-white bg-[#E8A87C] rounded-full px-3 py-2 active:scale-95 disabled:opacity-60 transition"
                  >
                    {juntando === g.chave ? <Loader2 size={11} className="animate-spin" /> : <Merge size={11} />} Juntar em uma só
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={carregar}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#8C857C] dark:text-[#9E9890] py-1"
        >
          <RefreshCw size={11} /> Atualizar
        </button>
      </div>
    </div>
  )
}
