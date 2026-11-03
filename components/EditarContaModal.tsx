'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, X, Trash2 } from 'lucide-react'
import { type Conta, fmt, parsearValor } from './FinanceApp'
import { motivoNaoExcluir, podeEditarConta, podeExcluirConta } from '@/lib/contas-logic'

const CORES = ['#8FB39A','#B8A9D4','#D4A0A0','#E8A87C','#A0B8D4','#A0D4C4','#E8C4A0','#2D2A26']
const EMOJIS = ['🏦','🏠','💰','👤','💳','🏧','💵','🪙','💼','🏪']

interface Props {
  conta: Conta
  onClose: () => void
  onSalvar: (campos: { nome: string; cor: string; emoji: string }) => Promise<void>
  onExcluir: () => Promise<void>
}

/**
 * Edição de uma conta direto da barra de contas: renomear, trocar cor/emoji
 * e — quando permitido — excluir. "Somar tudo" não entra aqui (não é conta).
 */
export default function EditarContaModal({ conta, onClose, onSalvar, onExcluir }: Props) {
  const [nome, setNome] = useState(conta.nome)
  const [cor, setCor] = useState(conta.cor ?? CORES[0])
  const [emoji, setEmoji] = useState(conta.emoji ?? '🏦')
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const tipo = (conta.tipo ?? 'pessoal') as 'pessoal' | 'casa'
  const regras = { tipo, isOwner: conta.isOwner }
  const podeSalvar = podeEditarConta(regras) && nome.trim().length > 0 && !salvando
  const bloqueioExclusao = motivoNaoExcluir(regras)
  const podeExcluir = podeExcluirConta(regras)
  const temOutrasPessoas = conta.membros.some(m => m.status === 'active')

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
