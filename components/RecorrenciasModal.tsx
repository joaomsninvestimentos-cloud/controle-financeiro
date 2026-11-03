'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, RefreshCw, Loader2, CalendarOff, Ban, Repeat } from 'lucide-react'
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
  proximaData: string
  ocorrencias: number
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

  const carregar = useCallback(() => {
    setCarregando(true)
    fetch(`/api/recorrencias?mes=${mesSelecionado}`)
      .then(r => r.json())
      .then(d => setSeries(d.recorrencias ?? []))
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [mesSelecionado])

  useEffect(() => { carregar() }, [carregar])

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

              <div className="flex gap-2 flex-wrap pt-1">
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
