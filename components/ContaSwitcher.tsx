'use client'

import { Home, Layers, Plus, User } from 'lucide-react'
import type { Conta } from './FinanceApp'

interface Props {
  contas: Conta[]
  selecionada: string | 'tudo'
  onSelecionar: (valor: string | 'tudo') => void
  onGerenciar: () => void
}

/**
 * Barra fixa de troca de conta: uma conta pessoal por usuário, as contas da
 * casa (compartilhadas) e a visão "Tudo". Lembra a última escolha no aparelho.
 */
export default function ContaSwitcher({ contas, selecionada, onSelecionar, onGerenciar }: Props) {
  const pessoais = contas.filter(c => (c.tipo ?? 'pessoal') === 'pessoal')
  const casas = contas.filter(c => c.tipo === 'casa')

  const base = 'shrink-0 flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold transition-all active:scale-95'
  const ativo = 'text-white shadow-snug'
  const inativo = 'bg-white dark:bg-[#342F2B] text-[#8C857C] dark:text-[#9E9890] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)]'

  return (
    <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-[9] -mx-4 px-4 py-2 bg-[#FAF6F1]/95 dark:bg-[#2B2825]/95 backdrop-blur border-b border-[rgba(45,42,38,0.06)] dark:border-[rgba(255,255,255,0.06)]">
      <div className="max-w-2xl mx-auto flex items-center gap-2">
        <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
          {pessoais.map(c => {
            const ativa = selecionada === c.id
            return (
              <button
                key={c.id}
                onClick={() => onSelecionar(c.id)}
                aria-pressed={ativa}
                title={`Conta pessoal de ${c.nome} (só você vê)`}
                className={`${base} ${ativa ? ativo : inativo}`}
                style={ativa ? { backgroundColor: c.cor } : {}}
              >
                <User size={11} className="opacity-80" /> {c.nome}
              </button>
            )
          })}

          {casas.map(c => {
            const ativa = selecionada === c.id
            const pessoas = c.membros.filter(m => m.status === 'active').length + (c.isOwner ? 1 : 0)
            return (
              <button
                key={c.id}
                onClick={() => onSelecionar(c.id)}
                aria-pressed={ativa}
                title={`Conta da casa — ${pessoas} pessoa(s)`}
                className={`${base} ${ativa ? ativo : inativo}`}
                style={ativa ? { backgroundColor: c.cor } : {}}
              >
                <Home size={11} className="opacity-80" /> {c.nome}
                {pessoas > 1 && (
                  <span className={`text-[9px] rounded-full px-1 ${ativa ? 'bg-white/25' : 'bg-[#8C857C]/15'}`}>
                    {pessoas}
                  </span>
                )}
              </button>
            )
          })}

          <button
            onClick={() => onSelecionar('tudo')}
            aria-pressed={selecionada === 'tudo'}
            title="Somar todas as contas que você acessa"
            className={`${base} ${selecionada === 'tudo' ? 'bg-[#2D2A26] dark:bg-[#E8E0D5] text-white dark:text-[#2D2A26] shadow-snug' : inativo}`}
          >
            <Layers size={11} className="opacity-80" /> Tudo
          </button>
        </div>

        <button
          onClick={onGerenciar}
          aria-label="Gerenciar contas e convites"
          title="Gerenciar contas e convites"
          className="shrink-0 w-8 h-8 rounded-full bg-white dark:bg-[#342F2B] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] text-[#8C857C] flex items-center justify-center active:scale-90 transition"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
