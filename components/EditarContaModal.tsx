'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Pencil, X, Trash2, ArrowRightLeft } from 'lucide-react'
import { type Conta, fmt, parsearValor } from './FinanceApp'
import { motivoNaoExcluir, podeEditarConta, podeExcluirConta } from '@/lib/contas-logic'
import { avisoTransferencia, destinosPossiveis, nadaParaTransferir, resumoTransferencia } from '@/lib/mover-logic'
import type { TransferirResultado } from '@/lib/contas-db'

const CORES = ['#8FB39A','#B8A9D4','#D4A0A0','#E8A87C','#A0B8D4','#A0D4C4','#E8C4A0','#2D2A26']
const EMOJIS = ['🏦','🏠','💰','👤','💳','🏧','💵','🪙','💼','🏪']

interface Props {
  conta: Conta
  contas: Conta[]
  onClose: () => void
  onSalvar: (campos: { nome: string; cor: string; emoji: string }) => Promise<void>
  onExcluir: () => Promise<void>
  onTransferir: (
    deContaId: string,
    paraContaId: string,
    opcoes: { incluirLancamentos: boolean; incluirFixas: boolean; incluirOrcamentos: boolean },
  ) => Promise<TransferirResultado | { erro: string }>
}

/**
 * Edição de uma conta direto da barra de contas: renomear, trocar cor/emoji
 * e — quando permitido — excluir. "Somar tudo" não entra aqui (não é conta).
 */
export default function EditarContaModal({ conta, contas, onClose, onSalvar, onExcluir, onTransferir }: Props) {
  const [nome, setNome] = useState(conta.nome)
  const [cor, setCor] = useState(conta.cor ?? CORES[0])
  const [emoji, setEmoji] = useState(conta.emoji ?? '🏦')
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  // Transferência para outra conta
  const destinos = destinosPossiveis(contas, conta.id)
  const [paraContaId, setParaContaId] = useState('')
  const [incluirFixas, setIncluirFixas] = useState(true)
  const [incluirLancamentos, setIncluirLancamentos] = useState(true)
  const [incluirOrcamentos, setIncluirOrcamentos] = useState(false)
  const [previa, setPrevia] = useState<TransferirResultado | null>(null)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [transferindo, setTransferindo] = useState(false)
  const [erroTransferencia, setErroTransferencia] = useState('')

  const tipo = (conta.tipo ?? 'pessoal') as 'pessoal' | 'casa'
  const regras = { tipo, isOwner: conta.isOwner }
  const podeSalvar = podeEditarConta(regras) && nome.trim().length > 0 && !salvando
  const bloqueioExclusao = motivoNaoExcluir(regras)
  const podeExcluir = podeExcluirConta(regras)
  const temOutrasPessoas = conta.membros.some(m => m.status === 'active')

  useEffect(() => {
    if (!paraContaId) {
      setPrevia(null)
      return
    }
    let cancelado = false
    setCarregandoPrevia(true)
    setErroTransferencia('')
    const params = new URLSearchParams({
      paraContaId,
      incluirFixas: incluirFixas ? '1' : '0',
      incluirLancamentos: incluirLancamentos ? '1' : '0',
      incluirOrcamentos: incluirOrcamentos ? '1' : '0',
    })
    fetch(`/api/contas/${conta.id}/mover?${params}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (cancelado) return
        if (!r.ok) {
          setPrevia(null)
          setErroTransferencia(d.message ?? 'Não foi possível calcular o que será movido.')
          return
        }
        setPrevia(d as TransferirResultado)
      })
      .catch(() => { if (!cancelado) setErroTransferencia('Sem conexão.') })
      .finally(() => { if (!cancelado) setCarregandoPrevia(false) })

    return () => { cancelado = true }
  }, [paraContaId, incluirFixas, incluirLancamentos, incluirOrcamentos, conta.id])

  const transferir = async () => {
    if (!paraContaId || !previa || !conta.isOwner) return
    const destino = destinos.find(c => c.id === paraContaId)
    if (!destino) return

    const aviso = avisoTransferencia(conta.nome, destino.nome, previa)
    if (!confirm(aviso)) return

    setTransferindo(true)
    setErroTransferencia('')
    const resultado = await onTransferir(conta.id, paraContaId, {
      incluirLancamentos, incluirFixas, incluirOrcamentos,
    })
    setTransferindo(false)

    if ('erro' in resultado) {
      setErroTransferencia(resultado.erro)
      return
    }
    onClose()
  }

  const salvar = async () => {
    if (!podeSalvar) return
    setSalvando(true)
    await onSalvar({ nome: nome.trim(), cor, emoji })
    setSalvando(false)
    onClose()
  }

  const excluir = async () => {
    setExcluindo(true)
    await onExcluir()
    setExcluindo(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#342F2B] rounded-3xl w-full max-w-sm shadow-xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4 max-h-[85dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#2D2A26] dark:text-[#E8E0D5] flex items-center gap-2">
            <Pencil size={15} className="text-[#8FB39A]" /> Editar conta
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#FAF6F1] dark:hover:bg-[#3E3935] text-[#8C857C] transition" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[#8C857C] dark:text-[#9E9890]">
          <span className="text-lg">{emoji}</span>
          <span className={`rounded-full px-2 py-0.5 font-bold uppercase text-[9px] ${
            tipo === 'casa' ? 'bg-[#8FB39A]/20 text-[#5f8a6d] dark:text-[#8FB39A]' : 'bg-[#8C857C]/15 text-[#8C857C]'
          }`}>
            {tipo === 'casa' ? 'conta da casa' : 'conta pessoal'}
          </span>
          <span>· saldo inicial {fmt(parsearValor(conta.saldoInicial))}</span>
        </div>

        {!conta.isOwner && (
          <p className="text-[11px] text-[#E8A87C] bg-[#E8A87C]/10 rounded-xl px-3 py-2">
            Você participa desta conta, mas só quem a criou pode renomear ou excluir.
          </p>
        )}

        <div>
          <label htmlFor="nome-conta" className="text-[11px] font-bold text-[#8C857C] uppercase tracking-wide block mb-1">
            Nome
          </label>
          <input
            id="nome-conta"
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && salvar()}
            maxLength={50}
            disabled={!podeEditarConta(regras)}
            className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 disabled:opacity-60"
          />
          {tipo === 'pessoal' && (
            <p className="text-[10px] text-[#8C857C] mt-1 ml-1">
              É o seu espaço privado: só você vê estes lançamentos.
            </p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-bold text-[#8C857C] uppercase tracking-wide mb-1">Cor</p>
          <div className="flex gap-1.5 flex-wrap">
            {CORES.map(k => (
              <button
                key={k}
                onClick={() => setCor(k)}
                disabled={!podeEditarConta(regras)}
                style={{ backgroundColor: k }}
                aria-label={`Cor ${k}`}
                className={`w-7 h-7 rounded-full transition ${cor === k ? 'ring-2 ring-offset-2 ring-[#2D2A26] dark:ring-white' : ''}`}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold text-[#8C857C] uppercase tracking-wide mb-1">Ícone</p>
          <div className="flex gap-1 flex-wrap">
            {EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                disabled={!podeEditarConta(regras)}
                className={`w-9 h-9 rounded-xl text-lg transition ${emoji === e ? 'bg-[#8FB39A]/20 ring-1 ring-[#8FB39A]/50' : ''}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={salvar}
          disabled={!podeSalvar}
          className="w-full bg-[#8FB39A] hover:bg-[#7ea389] active:scale-95 disabled:opacity-50 text-white font-bold rounded-full py-3 text-sm transition-all flex items-center justify-center gap-2"
        >
          {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar
        </button>

        {/* Transferir registros para outra conta */}
        {conta.isOwner && destinos.length > 0 && (
          <div className="rounded-2xl border border-dashed border-[rgba(45,42,38,0.18)] dark:border-[rgba(255,255,255,0.14)] p-3 space-y-2.5">
            <div className="flex items-start gap-2">
              <ArrowRightLeft size={14} className="text-[#8FB39A] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#2D2A26] dark:text-[#E8E0D5]">Transferir para outra conta</p>
                <p className="text-[10px] text-[#8C857C] dark:text-[#9E9890] leading-relaxed">
                  Os registros só mudam de conta. Nada é recriado e nenhum valor é redigitado.
                </p>
              </div>
            </div>

            <div className="relative">
              <select
                value={paraContaId}
                onChange={e => setParaContaId(e.target.value)}
                aria-label="Conta de destino"
                className="w-full appearance-none rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-3 py-2 text-xs text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 pr-8"
              >
                <option value="">Escolher conta de destino…</option>
                {destinos.map(c => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>
                ))}
              </select>
            </div>

            {paraContaId && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-[11px] text-[#2D2A26] dark:text-[#E8E0D5]">
                  <input type="checkbox" checked={incluirFixas} onChange={e => setIncluirFixas(e.target.checked)} className="w-4 h-4 accent-[#8FB39A]" />
                  Despesas fixas (com o histórico delas)
                </label>
                <label className="flex items-center gap-2 text-[11px] text-[#2D2A26] dark:text-[#E8E0D5]">
                  <input type="checkbox" checked={incluirLancamentos} onChange={e => setIncluirLancamentos(e.target.checked)} className="w-4 h-4 accent-[#8FB39A]" />
                  Lançamentos avulsos
                </label>
                <label className="flex items-center gap-2 text-[11px] text-[#2D2A26] dark:text-[#E8E0D5]">
                  <input type="checkbox" checked={incluirOrcamentos} onChange={e => setIncluirOrcamentos(e.target.checked)} className="w-4 h-4 accent-[#8FB39A]" />
                  Orçamentos por categoria
                </label>
              </div>
            )}

            {carregandoPrevia && (
              <p className="text-[11px] text-[#8C857C] flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Calculando…
              </p>
            )}

            {previa && !carregandoPrevia && (
              <div className="rounded-xl bg-[#FAF6F1] dark:bg-[#3E3935] px-2.5 py-2 space-y-1">
                {nadaParaTransferir(previa) ? (
                  <p className="text-[11px] text-[#8C857C]">Nada para mover nessa combinação.</p>
                ) : (
                  resumoTransferencia(previa).map(linha => (
                    <p key={linha} className="text-[11px] text-[#2D2A26] dark:text-[#E8E0D5]">• {linha}</p>
                  ))
                )}
                {previa.espelhosPreservados > 0 && (
                  <p className="text-[10px] text-[#8C857C] dark:text-[#9E9890]">
                    {previa.espelhosPreservados} cópia(s) na conta da casa continuam lá.
                  </p>
                )}
              </div>
            )}

            {erroTransferencia && (
              <p className="text-[11px] text-[#D4A0A0]">{erroTransferencia}</p>
            )}

            <button
              onClick={transferir}
              disabled={!previa || carregandoPrevia || transferindo || nadaParaTransferir(previa)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2D2A26] dark:bg-[#E8E0D5] text-white dark:text-[#2D2A26] text-xs font-bold py-2.5 active:scale-95 disabled:opacity-40 transition"
            >
              {transferindo ? <Loader2 size={12} className="animate-spin" /> : <ArrowRightLeft size={12} />} Mover registros
            </button>
          </div>
        )}

        <div className="pt-1 border-t border-[rgba(45,42,38,0.08)] dark:border-[rgba(255,255,255,0.07)]">
          {podeExcluir ? (
            <button
              onClick={() => {
                const aviso = [
                  `Excluir a conta "${conta.nome}"?`,
                  temOutrasPessoas ? 'A outra pessoa perde o acesso a ela.' : '',
                  'Os lançamentos continuam no app, mas ficam sem conta (aparecem em "Somar tudo"). Os orçamentos dessa conta são apagados.',
                ].filter(Boolean).join('\n\n')
                if (confirm(aviso)) excluir()
              }}
              disabled={excluindo}
              className="w-full flex items-center justify-center gap-1.5 text-[#D4A0A0] text-sm font-semibold py-2.5 rounded-full active:scale-95 disabled:opacity-60 transition"
            >
              {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir esta conta
            </button>
          ) : (
            <p className="text-[11px] text-[#8C857C] text-center py-2 leading-relaxed">{bloqueioExclusao}</p>
          )}
        </div>
      </div>
    </div>
  )
}
