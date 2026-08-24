'use client'

import { useState } from 'react'
import { Plus, Trash2, Target, ChevronDown, Loader2 } from 'lucide-react'
import { type Item, type Orcamento, CATEGORIAS_DESPESA, CORES, fmt, parsearValor, mascaraReal } from './FinanceApp'

interface Props {
  orcamentos: Orcamento[]
  items: Item[]
  mes: string
  onSalvar: (orc: { mes: string; categoria: string; limite: string }) => Promise<void>
  onRemover: (id: string) => Promise<void>
}

export default function OrcamentosView({ orcamentos, items, mes, onSalvar, onRemover }: Props) {
  const [adicionando, setAdicionando] = useState(false)
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_DESPESA[0])
  const [limiteTexto, setLimiteTexto] = useState('')
  const [saving, setSaving] = useState(false)

  // Calcular gastos por categoria no mês
  const gastosPorCategoria: Record<string, number> = {}
  for (const item of items) {
    if (item.tipo === 'despesa') {
      gastosPorCategoria[item.categoria] = (gastosPorCategoria[item.categoria] ?? 0) + parsearValor(item.valor)
    }
  }

  // Categorias com gastos mas sem orçamento definido
  const categoriasSemOrcamento = CATEGORIAS_DESPESA.filter(
    cat => gastosPorCategoria[cat] > 0 && !orcamentos.find(o => o.categoria === cat)
  )

  const salvar = async () => {
    const limite = parsearValor(limiteTexto)
    if (limite <= 0) return
    setSaving(true)
    await onSalvar({ mes, categoria, limite: limite.toFixed(2) })
    setLimiteTexto('')
    setAdicionando(false)
    setSaving(false)
  }

  const allCategorias = [...new Set([
    ...orcamentos.map(o => o.categoria),
    ...Object.keys(gastosPorCategoria),
  ])]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-3xl p-5 shadow-snug">
        <div className="flex items-center gap-2 mb-1">
          <Target size={18} className="text-[#8FB39A]"/>
          <h3 className="font-bold text-[#2D2A26]">Orçamentos por Categoria</h3>
        </div>
        <p className="text-xs text-[#8C857C]">Defina limites de gasto por categoria e acompanhe o progresso do mês.</p>
      </div>

      {/* Categorias com orçamento */}
      {orcamentos.length === 0 && allCategorias.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-3xl shadow-snug">
          <p className="text-3xl mb-3">🎯</p>
          <p className="font-semibold text-[#2D2A26]">Nenhum orçamento definido</p>
          <p className="text-sm text-[#8C857C] mt-1">Adicione um limite para controlar seus gastos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orcamentos.map(orc => {
            const gasto = gastosPorCategoria[orc.categoria] ?? 0
            const limite = parsearValor(orc.limite)
            const pct = Math.min(gasto / limite * 100, 100)
            const excedeu = gasto > limite
            const cor = CORES[orc.categoria] ?? '#C4C4C4'

            return (
              <div key={orc.id} className="bg-white rounded-2xl p-4 shadow-snug">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cor }}/>
                    <span className="font-semibold text-[#2D2A26] text-sm">{orc.categoria}</span>
                    {excedeu && <span className="text-[10px] bg-[#D4A0A0]/20 text-[#D4A0A0] font-bold rounded-full px-2 py-0.5">Excedeu!</span>}
                  </div>
                  <button onClick={() => onRemover(orc.id)} className="p-1 rounded-full text-[#8C857C] hover:text-[#D4A0A0] hover:bg-[#D4A0A0]/10 transition">
                    <Trash2 size={13}/>
                  </button>
                </div>
                {/* Barra de progresso */}
                <div className="w-full bg-[#FAF6F1] rounded-full h-2.5 mb-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: excedeu ? '#D4A0A0' : pct >= 80 ? '#E8A87C' : cor,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={excedeu ? 'text-[#D4A0A0] font-semibold' : 'text-[#8C857C]'}>
                    Gasto: {fmt(gasto)}
                  </span>
                  <span className="text-[#8C857C]">
                    Limite: {fmt(limite)}
                    {pct > 0 && <span className={`ml-1.5 font-bold ${excedeu ? 'text-[#D4A0A0]' : pct >= 80 ? 'text-[#E8A87C]' : 'text-[#8FB39A]'}`}>
                      {Math.round(pct)}%
                    </span>}
                  </span>
                </div>
                {excedeu && (
                  <p className="text-[10px] text-[#D4A0A0] mt-1">
                    {fmt(gasto - limite)} acima do limite
                  </p>
                )}
              </div>
            )
          })}

          {/* Categorias com gastos sem orçamento */}
          {categoriasSemOrcamento.map(cat => (
            <div key={cat} className="bg-[#FAF6F1] rounded-2xl p-4 border-2 border-dashed border-[rgba(45,42,38,0.1)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CORES[cat] ?? '#C4C4C4' }}/>
                  <span className="text-sm text-[#8C857C]">{cat}</span>
                  <span className="text-sm font-semibold text-[#2D2A26]">{fmt(gastosPorCategoria[cat])}</span>
                </div>
                <button
                  onClick={() => { setCategoria(cat); setAdicionando(true) }}
                  className="text-xs text-[#8FB39A] font-semibold flex items-center gap-1 hover:underline"
                >
                  <Plus size={12}/> Definir limite
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulário para adicionar orçamento */}
      {adicionando ? (
        <div className="bg-white rounded-2xl p-4 shadow-snug space-y-3 border-2 border-[#8FB39A]/30">
          <p className="font-semibold text-[#2D2A26] text-sm">Novo orçamento</p>
          <div className="relative">
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="w-full appearance-none rounded-2xl border border-[rgba(45,42,38,0.12)] bg-[#FAF6F1] px-4 py-3 text-sm text-[#2D2A26] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition pr-8"
            >
              {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C857C] pointer-events-none"/>
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8C857C] text-sm font-semibold">R$</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Limite mensal"
              value={limiteTexto}
              onChange={e => setLimiteTexto(mascaraReal(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && salvar()}
              className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] bg-[#FAF6F1] pl-10 pr-4 py-3 text-sm text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={salvar} disabled={saving || parsearValor(limiteTexto) <= 0} className="flex-1 rounded-full bg-[#8FB39A] hover:bg-[#7ea389] disabled:opacity-60 text-white font-semibold py-2.5 text-sm transition active:scale-95">
              {saving ? <Loader2 size={15} className="animate-spin mx-auto"/> : 'Salvar'}
            </button>
            <button onClick={() => setAdicionando(false)} className="px-4 rounded-full border border-[rgba(45,42,38,0.12)] text-[#8C857C] text-sm font-semibold hover:bg-[#FAF6F1] transition active:scale-95">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdicionando(true)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#8FB39A]/50 text-[#8FB39A] font-semibold py-3 text-sm hover:bg-[#8FB39A]/5 transition active:scale-95"
        >
          <Plus size={16}/> Adicionar orçamento
        </button>
      )}
    </div>
  )
}
