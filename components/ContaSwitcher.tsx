'use client'

import { Home, Layers, Pencil, Plus, User } from 'lucide-react'
import type { Conta } from './FinanceApp'
import { ROTULO_SOMA } from '@/lib/contas-logic'

interface Props {
  contas: Conta[]
  selecionada: string | 'tudo'
  onSelecionar: (valor: string | 'tudo') => void
  onGerenciar: () => void
  onEditar: (conta: Conta) => void
}

/**
 * Barra de troca de conta. "Somar tudo" fica visualmente separado (não é conta,
 * é a soma), e a conta selecionada ganha um lápis para renomear/excluir.
 */
export default function ContaSwitcher({ contas, selecionada, onSelecionar, onGerenciar, onEditar }: Props) {
  const pessoais = contas.filter(c => (c.tipo ?? 'pessoal') === 'pessoal')
  const casas = contas.filter(c => c.tipo === 'casa')

  const base = 'shrink-0 flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition-all active:scale-95'
  const ativo = 'text-white shadow-snug'
  const inativo = 'bg-white dark:bg-[#342F2B] text-[#8C857C] dark:text-[#9E9890] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)]'

  const nomesSomados = contas.map(c => c.nome).join(' + ')

  const chip = (c: Conta, icone: React.ReactNode, extra?: React.ReactNode) => {
    const ativa = selecionada === c.id
    return (
      <div key={c.id} className="shrink-0 flex items-center">
        <button
          onClick={() => onSelecionar(c.id)}
          aria-pressed={ativa}
          title={c.tipo === 'casa' ? 'Conta da casa (compartilhada)' : 'Conta pessoal (só você vê)'}
          className={`${base} ${ativa ? ativo : inativo} ${ativa ? 'pr-1.5' : ''}`}
          style={ativa ? { backgroundColor: c.cor } : {}}
        >
          {icone} {c.nome}
          {extra}
          {ativa && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Editar a conta ${c.nome}`}
              title="Renomear ou excluir"
              onClick={e => { e.stopPropagation(); onEditar(c) }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onEditar(c) } }}
              className="ml-1 w-5 h-5 rounded-full bg-white/25 flex items-center justify-center active:scale-90 transition"
            >
              <Pencil size={10} />
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-[9] -mx-4 px-4 py-2 bg-[#FAF6F1]/95 dark:bg-[#2B2825]/95 backdrop-blur border-b border-[rgba(45,42,38,0.06)] dark:border-[rgba(255,255,255,0.06)]">
      <div className="max-w-2xl mx-auto flex items-center gap-2">
        <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar items-center">
          {pessoais.map(c => chip(c, <User size={11} className="opacity-80" />))}

          {casas.map(c => {
            const pessoas = c.membros.filter(m => m.status === 'active').length + (c.isOwner ? 1 : 0)
            return chip(
              c,
              <Home size={11} className="opacity-80" />,
              pessoas > 1 ? (
                <span className={`text-[9px] rounded-full px-1 ${selecionada === c.id ? 'bg-white/25' : 'bg-[#8C857C]/15'}`}>
                  {pessoas}
                </span>
              ) : null,
            )
          })}

          {/* Não é conta: é a soma de todas. Separado por uma linha. */}
          {contas.length > 1 && <span className="shrink-0 w-px h-5 bg-[rgba(45,42,38,0.12)] dark:bg-[rgba(255,255,255,0.12)] mx-0.5" />}
          {contas.length > 1 && (
            <button
              onClick={() => onSelecionar('tudo')}
              aria-pressed={selecionada === 'tudo'}
              title="Soma de todas as contas que você acessa (não é uma conta)"
              className={`${base} border-dashed ${
                selecionada === 'tudo'
                  ? 'bg-[#2D2A26] dark:bg-[#E8E0D5] text-white dark:text-[#2D2A26] shadow-snug border border-transparent'
                  : 'bg-transparent dark:bg-transparent text-[#8C857C] dark:text-[#9E9890] border border-[rgba(45,42,38,0.18)] dark:border-[rgba(255,255,255,0.18)]'
              }`}
            >
              <Layers size={11} className="opacity-80" /> {ROTULO_SOMA}
            </button>
          )}
        </div>

        <button
          onClick={onGerenciar}
          aria-label="Gerenciar contas e convites"
          title="Nova conta / convidar pessoa"
          className="shrink-0 w-8 h-8 rounded-full bg-white dark:bg-[#342F2B] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] text-[#8C857C] flex items-center justify-center active:scale-90 transition"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Deixa explícito o que "Somar tudo" está somando */}
      {selecionada === 'tudo' && contas.length > 1 && (
        <p className="max-w-2xl mx-auto mt-1 text-[10px] text-[#8C857C] dark:text-[#9E9890] truncate">
          Somando: {nomesSomados}
        </p>
      )}
      {selecionada !== 'tudo' && (
        <p className="max-w-2xl mx-auto mt-1 text-[10px] text-[#8C857C] dark:text-[#9E9890]">
          Toque no lápis ✏️ para renomear ou excluir a conta.
        </p>
      )}
    </div>
  )
}
