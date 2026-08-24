'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusCircle, Trash2, TrendingUp, TrendingDown, Wallet,
  Sparkles, BarChart2, List, ChevronDown, LogOut, User, Loader2,
  Pencil, Check, X, ChevronLeft, ChevronRight, Building2, Plus,
  Users, AlertTriangle, Target, RefreshCw, Download, Moon, Sun, FileText, Bell,
} from 'lucide-react'
import GraficosView from './GraficosView'
import ContasModal from './ContasModal'
import OrcamentosView from './OrcamentosView'
import ChatAssistant from './ChatAssistant'
import { useTheme } from './ThemeProvider'
import { exportarPDF } from './exportPDF'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type Tipo = 'despesa' | 'receita'

export const CATEGORIAS_DESPESA = [
  'Alimentação','Transporte','Moradia','Saúde','Educação','Lazer','Roupas','Serviços','Outros',
] as const

export const CATEGORIAS_RECEITA = ['Salário','Freelance','Investimentos','Presente','Outros'] as const

export type Categoria = (typeof CATEGORIAS_DESPESA)[number] | (typeof CATEGORIAS_RECEITA)[number]

export interface Item {
  id: string
  descricao: string
  valor: string
  tipo: string
  categoria: string
  data: string
  mes: string
  contaId: string | null
  recorrente: boolean
  userId?: string
  createdAt?: string
  autorNome?: string | null
  autorEmail?: string | null
}

export interface Membro {
  id: string
  userId: string | null
  role: string
  inviteEmail: string | null
  status: string
  userName: string | null
  userEmail: string | null
}

export interface Conta {
  id: string
  nome: string
  cor: string
  emoji: string
  saldoInicial: string
  saldoInicialMes: string
  isOwner: boolean
  membros: Membro[]
}

export interface Orcamento {
  id: string
  mes: string
  categoria: string
  limite: string
  contaId?: string | null
}

export interface AuthUser { id: string; name: string; email: string }

// ─── Cores ───────────────────────────────────────────────────────────────────
export const CORES: Record<string, string> = {
  Alimentação:'#E8A87C', Transporte:'#B8A9D4', Moradia:'#8FB39A',
  Saúde:'#D4A0A0', Educação:'#A0B8D4', Lazer:'#E8C4A0',
  Roupas:'#D4B8A0', Serviços:'#A0D4C4', Outros:'#C4C4C4',
  Salário:'#8FB39A', Freelance:'#A0D4B0', Investimentos:'#A0C4D4', Presente:'#D4A0C4',
}

const DICAS = [
  '💡 Reserve ao menos 10% da renda todo mês para emergências.',
  '💡 Anote tudo — até o cafezinho conta no final do mês!',
  '💡 Compare preços antes de comprar. Pequenas economias somam muito.',
  '💡 Pague as contas em dia e evite juros desnecessários.',
  '💡 Revise suas assinaturas mensais — algo pode ser cancelado!',
  '💡 Tenha um fundo de emergência de 3–6 meses de despesas.',
  '💡 Separe uma conta para gastos e outra para poupança.',
]

const NOMES_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── Utilitários ─────────────────────────────────────────────────────────────
export const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export const parsearValor = (t: string) => {
  if (!t) return 0
  if (t.includes(',')) {
    const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
    return isNaN(n) ? 0 : n
  }
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}

export const mascaraReal = (t: string) => {
  const d = t.replace(/\D/g, '')
  if (!d) return ''
  const n = parseInt(d, 10)
  return `${Math.floor(n/100).toLocaleString('pt-BR')},${String(n%100).padStart(2,'0')}`
}

export const dataHoje = () => new Date().toISOString().slice(0, 10)
export const mesAtual = () => new Date().toISOString().slice(0, 7)

export const fmtMes = (ym: string) => {
  const [y, m] = ym.split('-')
  return `${NOMES_MESES[parseInt(m,10)-1]} ${y}`
}

export const fmtData = (d: string) => {
  const [y,m,day] = d.split('-')
  return `${day}/${m}/${y}`
}

export const prevMes = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

export const nextMes = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

export function calcularSaldoConta(
  conta: Conta,
  itensConta: Item[],
  mes: string
): { saldoInicio: number; receitas: number; despesas: number; saldoFim: number } {
  const [yRef, mRef] = mes.split('-').map(Number)
  const saldoInicialMes = conta.saldoInicialMes || mes
  const [yIni, mIni] = saldoInicialMes.split('-').map(Number)

  let saldoAcumulado = parsearValor(conta.saldoInicial)

  if (yRef < yIni || (yRef === yIni && mRef < mIni)) {
    return { saldoInicio: 0, receitas: 0, despesas: 0, saldoFim: 0 }
  }

  let cur = saldoInicialMes
  while (cur !== mes) {
    const itensMes = itensConta.filter(i => i.mes === cur)
    for (const i of itensMes) {
      const v = parsearValor(i.valor)
      if (i.tipo === 'receita') saldoAcumulado += v
      else saldoAcumulado -= v
    }
    cur = nextMes(cur)
  }

  const saldoInicio = saldoAcumulado
  const itensMesAtual = itensConta.filter(i => i.mes === mes)
  const receitas = itensMesAtual.filter(i => i.tipo === 'receita').reduce((a, i) => a + parsearValor(i.valor), 0)
  const despesas = itensMesAtual.filter(i => i.tipo === 'despesa').reduce((a, i) => a + parsearValor(i.valor), 0)
  return { saldoInicio, receitas, despesas, saldoFim: saldoInicio + receitas - despesas }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ControleFinanceiro({ user }: { user: AuthUser }) {
  const router = useRouter()
  const { theme, toggle: toggleTheme } = useTheme()
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual())
  const [items, setItems] = useState<Item[]>([])
  const [todosItems, setTodosItems] = useState<Item[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [contaSelecionada, setContaSelecionada] = useState<string | 'todas'>('todas')
  const [loading, setLoading] = useState(true)
  const [descricao, setDescricao] = useState('')
  const [valorTexto, setValorTexto] = useState('')
  const [tipo, setTipo] = useState<Tipo>('despesa')
  const [categoria, setCategoria] = useState<Categoria>('Alimentação')
  const [data, setData] = useState(dataHoje())
  const [itemContaId, setItemContaId] = useState<string>('')
  const [recorrente, setRecorrente] = useState(false)
  const [aba, setAba] = useState<'lancamentos' | 'graficos' | 'orcamentos'>('lancamentos')
  const [saving, setSaving] = useState(false)
  const [dicaIndex] = useState(() => Math.floor(Math.random() * DICAS.length))
  const [showContas, setShowContas] = useState(false)
  const [modoLote, setModoLote] = useState(false)
  const [lote, setLote] = useState<Array<{descricao:string;valor:string;tipo:Tipo;categoria:string;data:string;contaId:string;recorrente:boolean}>>([])
  const swRef = useRef(false)

  // PWA
  useEffect(() => {
    if (!swRef.current && 'serviceWorker' in navigator) {
      swRef.current = true
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  // Carregar contas
  const carregarContas = useCallback(() => {
    fetch('/api/contas').then(r => r.json()).then(d => setContas(d.contas ?? [])).catch(() => {})
  }, [])
  useEffect(() => { carregarContas() }, [carregarContas])

  // Carregar orçamentos do mês
  useEffect(() => {
    fetch(`/api/orcamentos?mes=${mesSelecionado}`)
      .then(r => r.json())
      .then(d => setOrcamentos(d.orcamentos ?? []))
      .catch(() => {})
  }, [mesSelecionado])

  // Carregar TODOS os items (carry-forward)
  const carregarTodosItems = useCallback(() => {
    const params = contaSelecionada !== 'todas'
      ? `?contaId=${contaSelecionada}&todos=1`
      : `?todos=1`
    fetch(`/api/items${params}`)
      .then(r => r.json())
      .then(d => setTodosItems(d.items ?? []))
      .catch(() => {})
  }, [contaSelecionada])

  useEffect(() => { carregarTodosItems() }, [carregarTodosItems])

  // Carregar items do mês selecionado
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ mes: mesSelecionado })
    if (contaSelecionada !== 'todas') params.set('contaId', contaSelecionada)
    fetch(`/api/items?${params}`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [mesSelecionado, contaSelecionada])

  useEffect(() => {
    setCategoria(tipo === 'despesa' ? 'Alimentação' : 'Salário')
  }, [tipo])

  useEffect(() => {
    const hoje = dataHoje()
    const mesHoje = hoje.slice(0, 7)
    setData(mesSelecionado === mesHoje ? hoje : `${mesSelecionado}-01`)
  }, [mesSelecionado])

  // ── Cálculos ─────────────────────────────────────────────────────────────
  const totalReceitas = items.filter(i => i.tipo==='receita').reduce((a,i) => a+parsearValor(i.valor), 0)
  const totalDespesas = items.filter(i => i.tipo==='despesa').reduce((a,i) => a+parsearValor(i.valor), 0)

  let saldo = totalReceitas - totalDespesas
  let saldoInicio = 0

  if (contaSelecionada !== 'todas' && contas.length > 0) {
    const conta = contas.find(c => c.id === contaSelecionada)
    if (conta) {
      const itensConta = todosItems.filter(i => i.contaId === conta.id)
      const calc = calcularSaldoConta(conta, itensConta, mesSelecionado)
      saldoInicio = calc.saldoInicio
      saldo = calc.saldoFim
    }
  }

  // Alerta: despesas > 80% receitas
  const alertaDespesas = totalReceitas > 0 && totalDespesas / totalReceitas >= 0.8

  // ── Adicionar item único ──────────────────────────────────────────────────
  const adicionarItem = useCallback(async () => {
    const valor = parsearValor(valorTexto)
    if (!descricao.trim() || valor <= 0) return
    setSaving(true)
    const mesItem = data.slice(0, 7)
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: descricao.trim(), valor: valor.toFixed(2),
          tipo, categoria, data, mes: mesItem,
          contaId: itemContaId || null, recorrente,
        }),
      })
      if (res.ok) {
        const { item } = await res.json()
        setItems(prev => [item, ...prev])
        setTodosItems(prev => [item, ...prev])
        setDescricao('')
        setValorTexto('')
        setRecorrente(false)
      }
    } finally { setSaving(false) }
  }, [descricao, valorTexto, tipo, categoria, data, itemContaId, recorrente])

  // ── Adicionar lote ────────────────────────────────────────────────────────
  const adicionarLoteAoCarrinho = () => {
    const valor = parsearValor(valorTexto)
    if (!descricao.trim() || valor <= 0) return
    setLote(prev => [...prev, {
      descricao: descricao.trim(), valor: valor.toFixed(2),
      tipo, categoria, data, contaId: itemContaId, recorrente,
    }])
    setDescricao('')
    setValorTexto('')
  }

  const enviarLote = useCallback(async () => {
    if (lote.length === 0) return
    setSaving(true)
    try {
      const payload = lote.map(l => ({ ...l, mes: l.data.slice(0, 7), contaId: l.contaId || null }))
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const { items: novos } = await res.json()
        setItems(prev => [...novos, ...prev])
        setTodosItems(prev => [...novos, ...prev])
        setLote([])
        setModoLote(false)
      }
    } finally { setSaving(false) }
  }, [lote])

  // ── Repetir recorrentes do mês anterior ──────────────────────────────────
  const repetirRecorrentes = useCallback(async () => {
    const mesAnterior = prevMes(mesSelecionado)
    const params = new URLSearchParams({ mes: mesAnterior })
    if (contaSelecionada !== 'todas') params.set('contaId', contaSelecionada)
    const res = await fetch(`/api/items?${params}`)
    const { items: itensAnt } = await res.json() as { items: Item[] }
    const recorrentes = itensAnt.filter(i => i.recorrente)
    if (recorrentes.length === 0) return alert('Nenhum lançamento recorrente no mês anterior.')
    if (!confirm(`Copiar ${recorrentes.length} lançamento(s) recorrente(s) de ${fmtMes(mesAnterior)} para ${fmtMes(mesSelecionado)}?`)) return

    const payload = recorrentes.map(i => ({
      descricao: i.descricao,
      valor: i.valor,
      tipo: i.tipo as Tipo,
      categoria: i.categoria,
      data: `${mesSelecionado}-01`,
      mes: mesSelecionado,
      contaId: i.contaId,
      recorrente: true,
    }))
    const postRes = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (postRes.ok) {
      const { items: novos } = await postRes.json()
      setItems(prev => [...novos, ...prev])
      setTodosItems(prev => [...novos, ...prev])
    }
  }, [mesSelecionado, contaSelecionada])

  // ── Notificações de orçamento ────────────────────────────────────────────
  const solicitarNotificacoes = useCallback(async () => {
    if (!('Notification' in window)) {
      alert('Seu navegador não suporta notificações.')
      return
    }
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      alert('Permissão de notificações negada.')
      return
    }
    // Notificação imediata de teste + agendar verificação diária via localStorage
    new Notification('Meu Controle Financeiro 💰', {
      body: 'Notificações ativadas! Você receberá alertas de orçamento.',
      icon: '/icons/icon-192.png',
    })
    localStorage.setItem('notificacoes', '1')
    // Verificar orçamentos agora
    verificarOrcamentosNotif()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const verificarOrcamentosNotif = useCallback(() => {
    if (typeof window === 'undefined' || !localStorage.getItem('notificacoes')) return
    if (Notification.permission !== 'granted') return
    orcamentos.forEach(o => {
      const gasto = items.filter(i => i.tipo === 'despesa' && i.categoria === o.categoria)
        .reduce((a, i) => a + parsearValor(i.valor), 0)
      const limite = parsearValor(o.limite)
      const pct = Math.round(gasto / limite * 100)
      if (pct >= 100) {
        new Notification(`⚠️ Orçamento excedido: ${o.categoria}`, {
          body: `Você gastou ${gasto.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} de ${fmt(limite)} (${pct}%)`,
          icon: '/icons/icon-192.png',
        })
      } else if (pct >= 80) {
        new Notification(`⚡ Atenção: ${o.categoria}`, {
          body: `Você já usou ${pct}% do orçamento de ${o.categoria} este mês.`,
          icon: '/icons/icon-192.png',
        })
      }
    })
  }, [orcamentos, items])

  useEffect(() => {
    verificarOrcamentosNotif()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamentos, items])

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const exportarCSV = useCallback(() => {
    const linhas = [
      ['Data','Descrição','Tipo','Categoria','Valor','Conta'],
      ...items.map(i => [
        fmtData(i.data),
        i.descricao,
        i.tipo,
        i.categoria,
        parsearValor(i.valor).toFixed(2).replace('.', ','),
        contas.find(c => c.id === i.contaId)?.nome ?? '',
      ]),
    ]
    const csv = linhas.map(l => l.map(v => `"${v}"`).join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lancamentos-${mesSelecionado}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [items, contas, mesSelecionado])

  // ── Editar ───────────────────────────────────────────────────────────────
  const editarItem = useCallback(async (id: string, campos: Partial<Pick<Item, 'descricao'|'valor'|'categoria'|'data'|'contaId'|'recorrente'>>) => {
    const res = await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...campos, ...(campos.data ? { mes: campos.data.slice(0, 7) } : {}) }),
    })
    if (res.ok) {
      const { item } = await res.json()
      setItems(prev => prev.map(i => i.id === id ? item : i))
      setTodosItems(prev => prev.map(i => i.id === id ? item : i))
    }
  }, [])

  // ── Remover ──────────────────────────────────────────────────────────────
  const removerItem = useCallback(async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    setTodosItems(prev => prev.filter(i => i.id !== id))
    await fetch(`/api/items/${id}`, { method: 'DELETE' })
  }, [])

  // ── Logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    await fetch('/api/auth/me', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const categorias = tipo === 'despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA

  return (
    <div className="min-h-screen bg-[#FAF6F1] dark:bg-[#2B2825] font-nunito pb-10 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-[#342F2B] shadow-snug sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="text-[#8FB39A]" size={20} />
          <span className="text-[#2D2A26] dark:text-[#E8E0D5] font-bold text-sm">Meu Controle Financeiro</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowContas(true)}
            className="flex items-center gap-1.5 bg-[#FAF6F1] dark:bg-[#3E3935] rounded-full px-3 py-1.5 hover:bg-[#8FB39A]/10 transition-colors"
          >
            <Building2 size={13} className="text-[#8C857C]" />
            <span className="text-xs text-[#2D2A26] dark:text-[#E8E0D5] font-semibold hidden sm:inline">Contas</span>
          </button>
          <div className="flex items-center gap-1.5 bg-[#FAF6F1] dark:bg-[#3E3935] rounded-full px-3 py-1.5">
            <User size={13} className="text-[#8C857C]" />
            <span className="text-xs text-[#2D2A26] dark:text-[#E8E0D5] font-semibold max-w-[80px] truncate">{user.name}</span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-[#8FB39A]/10 text-[#8C857C] hover:text-[#8FB39A] transition-colors"
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={logout} className="p-2 rounded-full hover:bg-[#D4A0A0]/10 text-[#8C857C] hover:text-[#D4A0A0] transition-colors" title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4 text-[#2D2A26] dark:text-[#E8E0D5]">

        {/* Seletor de mês */}
        <div className="bg-white dark:bg-[#342F2B] rounded-2xl shadow-snug flex items-center justify-between px-4 py-3">
          <button onClick={() => setMesSelecionado(prevMes(mesSelecionado))} className="p-2 rounded-full hover:bg-[#FAF6F1] dark:hover:bg-[#3E3935] active:scale-90 transition-all text-[#8C857C]">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="font-bold text-[#2D2A26] dark:text-[#E8E0D5] text-base">{fmtMes(mesSelecionado)}</p>
            {mesSelecionado === mesAtual() && (
              <span className="text-[10px] text-[#8FB39A] font-semibold uppercase tracking-wide">Mês atual</span>
            )}
          </div>
          <button onClick={() => setMesSelecionado(nextMes(mesSelecionado))} className="p-2 rounded-full hover:bg-[#FAF6F1] dark:hover:bg-[#3E3935] active:scale-90 transition-all text-[#8C857C]">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Seletor de conta */}
        {contas.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setContaSelecionada('todas')}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95 ${contaSelecionada === 'todas' ? 'bg-[#2D2A26] text-white shadow-snug' : 'bg-white dark:bg-[#342F2B] text-[#8C857C] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] shadow-snug'}`}
            >
              🏦 Todas
            </button>
            {contas.map(c => (
              <button
                key={c.id}
                onClick={() => setContaSelecionada(c.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1 ${contaSelecionada === c.id ? 'text-white shadow-snug' : 'bg-white dark:bg-[#342F2B] text-[#8C857C] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] shadow-snug'}`}
                style={contaSelecionada === c.id ? { backgroundColor: c.cor } : {}}
              >
                {c.emoji} {c.nome}
                {c.membros.some(m => m.status === 'active') && (
                  <Users size={10} className="opacity-70" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Saldo da conta com carry-forward */}
        {contaSelecionada !== 'todas' && (() => {
          const conta = contas.find(c => c.id === contaSelecionada)
          if (!conta) return null
          const itensConta = todosItems.filter(i => i.contaId === conta.id)
          const calc = calcularSaldoConta(conta, itensConta, mesSelecionado)
          return (
            <div className="bg-white dark:bg-[#342F2B] rounded-2xl shadow-snug p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{conta.emoji}</span>
                <span className="font-bold text-[#2D2A26] dark:text-[#E8E0D5] text-sm">{conta.nome}</span>
                {conta.membros.some(m => m.status === 'active') && (
                  <span className="flex items-center gap-1 text-[10px] text-[#8C857C] bg-[#8C857C]/10 rounded-full px-2 py-0.5">
                    <Users size={9} /> {conta.membros.filter(m => m.status === 'active').length + 1} pessoas
                  </span>
                )}
                <span className="text-xs text-[#8C857C] ml-auto">Evolução do mês</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-[#FAF6F1] dark:bg-[#3E3935] rounded-xl p-2">
                  <p className="text-[#8C857C] text-[10px] font-bold uppercase tracking-wide">Início</p>
                  <p className="font-bold text-[#2D2A26] dark:text-[#E8E0D5] mt-1">{fmt(calc.saldoInicio)}</p>
                </div>
                <div className="bg-[#8FB39A]/10 rounded-xl p-2">
                  <p className="text-[#8C857C] text-[10px] font-bold uppercase tracking-wide">+ Receitas</p>
                  <p className="font-bold text-[#8FB39A] mt-1">{fmt(calc.receitas)}</p>
                </div>
                <div className="bg-[#D4A0A0]/10 rounded-xl p-2">
                  <p className="text-[#8C857C] text-[10px] font-bold uppercase tracking-wide">− Despesas</p>
                  <p className="font-bold text-[#D4A0A0] mt-1">{fmt(calc.despesas)}</p>
                </div>
              </div>
              <div className="bg-[#2D2A26]/5 dark:bg-[#2B2825]/60 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm font-bold text-[#2D2A26] dark:text-[#E8E0D5]">Saldo Final</span>
                <span className={`font-bold text-lg ${calc.saldoFim >= 0 ? 'text-[#8FB39A]' : 'text-[#D4A0A0]'}`}>{fmt(calc.saldoFim)}</span>
              </div>
            </div>
          )
        })()}

        {/* Alerta de despesas altas */}
        {alertaDespesas && (
          <div className="bg-[#E8A87C]/20 border border-[#E8A87C]/40 rounded-2xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="text-[#E8A87C] shrink-0" size={18} />
            <div>
              <p className="text-[#2D2A26] dark:text-[#E8E0D5] text-sm font-semibold">Atenção com os gastos!</p>
              <p className="text-[#8C857C] dark:text-[#9E9890] text-xs">Suas despesas já representam {Math.round(totalDespesas/totalReceitas*100)}% das receitas deste mês.</p>
            </div>
          </div>
        )}

        {/* Dica */}
        <div className="bg-[#E8C4A0]/30 dark:bg-[#3E3935] rounded-2xl px-4 py-3 flex items-start gap-3">
          <Sparkles className="text-[#D4A0A0] mt-0.5 shrink-0" size={15} />
          <p className="text-[#2D2A26] dark:text-[#C8C0B5] text-xs leading-relaxed">{DICAS[dicaIndex]}</p>
        </div>

        {/* Resumo do mês */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Receitas" valor={totalReceitas} cor="text-[#8FB39A]" bg="bg-[#8FB39A]/10" icon={<TrendingUp size={15} className="text-[#8FB39A]" />} />
          <SummaryCard label="Despesas" valor={totalDespesas} cor="text-[#D4A0A0]" bg="bg-[#D4A0A0]/10" icon={<TrendingDown size={15} className="text-[#D4A0A0]" />} />
          <SummaryCard
            label={contaSelecionada !== 'todas' ? 'Saldo Final' : 'Saldo'}
            valor={saldo}
            cor={saldo>=0?'text-[#8FB39A]':'text-[#D4A0A0]'}
            bg={saldo>=0?'bg-[#8FB39A]/10':'bg-[#D4A0A0]/10'}
            icon={<Wallet size={15} className={saldo>=0?'text-[#8FB39A]':'text-[#D4A0A0]'} />}
          />
        </div>

        {/* Formulário */}
        <div className="bg-white dark:bg-[#342F2B] rounded-3xl p-5 shadow-snug">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#2D2A26] dark:text-[#E8E0D5] text-sm">
              {modoLote ? '📋 Lançamentos em lote' : `Adicionar em `}
              {!modoLote && <span className="text-[#8FB39A]">{fmtMes(mesSelecionado)}</span>}
            </h2>
            <button
              onClick={() => { setModoLote(v => !v); setLote([]) }}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 transition-all active:scale-95 ${modoLote ? 'bg-[#2D2A26] text-white' : 'bg-[#FAF6F1] dark:bg-[#3E3935] text-[#8C857C] dark:text-[#9E9890] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)]'}`}
            >
              {modoLote ? 'Modo simples' : '+ Lote'}
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <TipoBtn ativo={tipo==='despesa'} onClick={()=>setTipo('despesa')} label="💸 Despesa" cor="bg-[#D4A0A0] text-white" />
            <TipoBtn ativo={tipo==='receita'} onClick={()=>setTipo('receita')} label="💰 Receita" cor="bg-[#8FB39A] text-white" />
          </div>

          <input
            type="text"
            placeholder="O que é? (ex: Aluguel, Salário…)"
            value={descricao}
            onChange={e=>setDescricao(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&(modoLote?adicionarLoteAoCarrinho():adicionarItem())}
            className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] placeholder-[#8C857C] dark:placeholder-[#756E66] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition mb-3"
          />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="relative">
              <select value={categoria} onChange={e=>setCategoria(e.target.value as Categoria)} className="w-full appearance-none rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition pr-8">
                {categorias.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C857C] pointer-events-none" />
            </div>
            <input type="date" value={data} onChange={e=>setData(e.target.value)} className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition" />
          </div>

          {contas.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="relative">
                <select value={itemContaId} onChange={e=>setItemContaId(e.target.value)} className="w-full appearance-none rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition pr-8">
                  <option value="">Sem conta</option>
                  {contas.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C857C] pointer-events-none" />
              </div>
              <label className="flex items-center gap-2 rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-4 py-3 cursor-pointer">
                <input type="checkbox" checked={recorrente} onChange={e=>setRecorrente(e.target.checked)} className="w-4 h-4 accent-[#8FB39A]" />
                <span className="text-sm text-[#2D2A26] dark:text-[#E8E0D5]">🔄 Recorrente</span>
              </label>
            </div>
          )}

          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8C857C] text-sm font-semibold">R$</span>
              <input type="text" inputMode="numeric" placeholder="0,00" value={valorTexto} onChange={e=>setValorTexto(mascaraReal(e.target.value))} onKeyDown={e=>e.key==='Enter'&&(modoLote?adicionarLoteAoCarrinho():adicionarItem())} className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] pl-10 pr-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] placeholder-[#8C857C] dark:placeholder-[#756E66] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition" />
            </div>
            {modoLote ? (
              <button onClick={adicionarLoteAoCarrinho} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#B8A9D4] hover:bg-[#a899c4] active:scale-95 text-white font-semibold px-5 py-3 text-sm transition-all shadow-snug shrink-0">
                <Plus size={18} /><span className="hidden sm:inline">Adicionar à lista</span>
              </button>
            ) : (
              <button onClick={adicionarItem} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#8FB39A] hover:bg-[#7ea389] active:scale-95 disabled:opacity-60 text-white font-semibold px-5 py-3 text-sm transition-all shadow-snug shrink-0">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />}
                <span className="hidden sm:inline">Adicionar</span>
              </button>
            )}
          </div>

          {/* Carrinho do lote */}
          {modoLote && lote.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold text-[#2D2A26] dark:text-[#E8E0D5] uppercase tracking-wide">{lote.length} item(ns) na lista</p>
              {lote.map((l, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#FAF6F1] dark:bg-[#3E3935] rounded-xl px-3 py-2 text-sm">
                  <span className={`font-semibold flex-1 truncate ${l.tipo==='receita'?'text-[#8FB39A]':'text-[#D4A0A0]'}`}>{l.descricao}</span>
                  <span className="text-[#8C857C] dark:text-[#9E9890] text-xs">{l.categoria}</span>
                  <span className="font-bold text-[#2D2A26] dark:text-[#E8E0D5] shrink-0">{fmt(parsearValor(l.valor))}</span>
                  <button onClick={()=>setLote(prev=>prev.filter((_,j)=>j!==i))} className="text-[#8C857C] hover:text-[#D4A0A0] transition-colors shrink-0">
                    <X size={13}/>
                  </button>
                </div>
              ))}
              <button onClick={enviarLote} disabled={saving} className="w-full rounded-full bg-[#8FB39A] hover:bg-[#7ea389] disabled:opacity-60 text-white font-semibold py-3 text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-snug">
                {saving ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>}
                Salvar {lote.length} lançamento(s)
              </button>
            </div>
          )}
        </div>

        {/* Abas */}
        {!loading && (
          <div className="flex gap-2 flex-wrap">
            <AbaBtn ativo={aba==='lancamentos'} onClick={()=>setAba('lancamentos')} label="📋 Lançamentos" icon={<List size={13} />} />
            <AbaBtn ativo={aba==='graficos'} onClick={()=>setAba('graficos')} label="📊 Gráficos" icon={<BarChart2 size={13} />} />
            <AbaBtn ativo={aba==='orcamentos'} onClick={()=>setAba('orcamentos')} label="🎯 Orçamentos" icon={<Target size={13} />} />
            <button
              onClick={repetirRecorrentes}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all active:scale-95 bg-white dark:bg-[#3E3935] text-[#8C857C] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] shadow-snug hover:text-[#8FB39A]"
              title="Repetir lançamentos recorrentes do mês anterior"
            >
              <RefreshCw size={12} /> Recorrentes
            </button>
            {items.length > 0 && (
              <button
                onClick={exportarCSV}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all active:scale-95 bg-white dark:bg-[#3E3935] text-[#8C857C] border border-[rgba(45,42,38,0.12)] shadow-snug hover:text-[#8FB39A]"
                title="Exportar para Excel/CSV"
              >
                <Download size={12} /> CSV
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={() => exportarPDF(items, contas, orcamentos, mesSelecionado, user.name)}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all active:scale-95 bg-white dark:bg-[#3E3935] text-[#8C857C] border border-[rgba(45,42,38,0.12)] shadow-snug hover:text-[#D4A0A0]"
                title="Exportar relatório em PDF"
              >
                <FileText size={12} /> PDF
              </button>
            )}
            <button
              onClick={solicitarNotificacoes}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all active:scale-95 bg-white dark:bg-[#3E3935] text-[#8C857C] border border-[rgba(45,42,38,0.12)] shadow-snug hover:text-[#E8A87C]"
              title="Ativar notificações de orçamento"
            >
              <Bell size={12} /> Alertas
            </button>
          </div>
        )}

        {/* Conteúdo */}
        {loading ? (
          <div className="flex justify-center py-14"><Loader2 className="animate-spin text-[#8FB39A]" size={32} /></div>
        ) : aba === 'orcamentos' ? (
          <OrcamentosView
            orcamentos={orcamentos}
            items={items}
            mes={mesSelecionado}
            onSalvar={async (orc) => {
              const res = await fetch('/api/orcamentos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orc),
              })
              if (res.ok) {
                const { orcamento } = await res.json()
                setOrcamentos(prev => {
                  const existing = prev.find(o => o.categoria === orc.categoria)
                  if (existing) return prev.map(o => o.categoria === orc.categoria ? orcamento : o)
                  return [...prev, orcamento]
                })
              }
            }}
            onRemover={async (id) => {
              await fetch(`/api/orcamentos?id=${id}`, { method: 'DELETE' })
              setOrcamentos(prev => prev.filter(o => o.id !== id))
            }}
          />
        ) : items.length === 0 ? (
          <div className="text-center py-14 bg-white dark:bg-[#342F2B] rounded-3xl shadow-snug">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-semibold text-[#2D2A26] dark:text-[#E8E0D5]">Nenhum lançamento em {fmtMes(mesSelecionado)}</p>
            <p className="text-sm text-[#8C857C] mt-1">Adicione uma receita ou despesa acima.</p>
            <p className="text-xs text-[#8C857C] mt-3">Use as setas para navegar entre os meses.</p>
          </div>
        ) : aba === 'lancamentos' ? (
          <div className="space-y-3">
            {items.filter(i=>i.tipo==='receita').length>0&&(
              <Section titulo="💰 Receitas">
                {items.filter(i=>i.tipo==='receita').map(i=>(
                  <ItemCard key={i.id} item={i} contas={contas} currentUser={user} contaSelecionada={contaSelecionada} onRemover={removerItem} onEditar={editarItem}/>
                ))}
              </Section>
            )}
            {items.filter(i=>i.tipo==='despesa').length>0&&(
              <Section titulo="💸 Despesas">
                {items.filter(i=>i.tipo==='despesa').map(i=>(
                  <ItemCard key={i.id} item={i} contas={contas} currentUser={user} contaSelecionada={contaSelecionada} onRemover={removerItem} onEditar={editarItem}/>
                ))}
              </Section>
            )}
          </div>
        ) : (
          <GraficosView items={items} />
        )}

        {/* Saldo final */}
        {!loading && items.length > 0 && aba === 'lancamentos' && (
          <div className="bg-white dark:bg-[#342F2B] rounded-3xl p-5 shadow-snug flex items-center justify-between">
            <span className="font-bold text-[#2D2A26]">Saldo — {fmtMes(mesSelecionado)}</span>
            <span className={`font-bold text-xl ${saldo>=0?'text-[#8FB39A]':'text-[#D4A0A0]'}`}>{fmt(saldo)}</span>
          </div>
        )}
      </div>

      {/* Assistente IA flutuante */}
      <ChatAssistant mesSelecionado={mesSelecionado} />

      {/* Modal Contas */}
      {showContas && (
        <ContasModal
          contas={contas}
          onClose={() => setShowContas(false)}
          mesSelecionado={mesSelecionado}
          onAdd={async (nova) => {
            const res = await fetch('/api/contas', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(nova),
            })
            if (res.ok) { const { conta } = await res.json(); setContas(prev => [...prev, conta]) }
          }}
          onDelete={async (id) => {
            const res = await fetch(`/api/contas/${id}`, { method: 'DELETE' })
            if (res.ok) { setContas(prev => prev.filter(c => c.id !== id)); if (contaSelecionada === id) setContaSelecionada('todas') }
          }}
          onInvite={async (contaId, email) => {
            const res = await fetch(`/api/contas/${contaId}/invite`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            })
            const data = await res.json()
            if (res.ok) { carregarContas(); return data.message }
            if (data.error === 'ALREADY_INVITED') return 'Este email já foi convidado.'
            return 'Erro ao convidar.'
          }}
          onRemoveMembro={async (contaId, memberId) => {
            await fetch(`/api/contas/${contaId}/invite?memberId=${memberId}`, { method: 'DELETE' })
            carregarContas()
          }}
        />
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function SummaryCard({label,valor,cor,bg,icon}:{label:string;valor:number;cor:string;bg:string;icon:React.ReactNode}) {
  return (
    <div className={`${bg} dark:bg-opacity-20 rounded-2xl p-3 flex flex-col gap-1.5 shadow-snug`}>
      <div className="flex items-center gap-1">{icon}<span className="text-[#8C857C] dark:text-[#9E9890] text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
      <span className={`${cor} font-bold text-sm leading-tight`}>{valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2})}</span>
    </div>
  )
}

function TipoBtn({ativo,onClick,label,cor}:{ativo:boolean;onClick:()=>void;label:string;cor:string}) {
  return <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-95 ${ativo?cor+' shadow-snug':'bg-[#FAF6F1] dark:bg-[#3E3935] text-[#8C857C] dark:text-[#9E9890] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)]'}`}>{label}</button>
}

function AbaBtn({ativo,onClick,label,icon}:{ativo:boolean;onClick:()=>void;label:string;icon:React.ReactNode}) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-95 ${ativo?'bg-[#2D2A26] text-white shadow-snug':'bg-white dark:bg-[#3E3935] text-[#8C857C] border border-[rgba(45,42,38,0.12)] shadow-snug'}`}>{icon}{label}</button>
}

function Section({titulo,children}:{titulo:string;children:React.ReactNode}) {
  return <div className="bg-white dark:bg-[#342F2B] rounded-3xl p-5 shadow-snug"><h3 className="font-bold text-[#2D2A26] dark:text-[#E8E0D5] text-sm mb-3">{titulo}</h3><div className="space-y-2">{children}</div></div>
}

function fmtHorario(iso: string | undefined) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
  } catch { return '' }
}

interface ItemCardProps {
  item: Item
  contas: Conta[]
  currentUser: AuthUser
  contaSelecionada: string | 'todas'
  onRemover: (id: string) => void
  onEditar: (id: string, c: Partial<Pick<Item,'descricao'|'valor'|'categoria'|'data'|'contaId'|'recorrente'>>) => Promise<void>
}

function ItemCard({ item, contas, currentUser, contaSelecionada, onRemover, onEditar }: ItemCardProps) {
  const cor = CORES[item.categoria]??'#C4C4C4'
  const conta = contas.find(c => c.id === item.contaId)
  const [editando, setEditando] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [novaDesc, setNovaDesc] = useState(item.descricao)
  const [novoValor, setNovoValor] = useState(() => parsearValor(item.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}))
  const [novaCat, setNovaCat] = useState(item.categoria)
  const [novaData, setNovaData] = useState(item.data)
  const [novaContaId, setNovaContaId] = useState(item.contaId??'')
  const [salvando, setSalvando] = useState(false)

  const categorias = item.tipo==='despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA

  // Usuário pode editar se: é o próprio autor OU é dono da conta selecionada
  const isOwnerDaConta = contaSelecionada !== 'todas' && conta?.isOwner === true
  const isAutor = item.userId === currentUser.id
  const podeEditar = isAutor || isOwnerDaConta

  // Mostrar badge de autor apenas em contas compartilhadas com membros
  const contaCompartilhada = conta && conta.membros.some(m => m.status === 'active')
  const autorLabel = item.autorNome ?? item.autorEmail ?? null
  const ehProprio = item.userId === currentUser.id

  const salvar = async () => {
    const valor = parsearValor(novoValor)
    if (!novaDesc.trim() || valor <= 0) return
    setSalvando(true)
    await onEditar(item.id, { descricao: novaDesc.trim(), valor: valor.toFixed(2), categoria: novaCat, data: novaData, contaId: novaContaId||null })
    setSalvando(false)
    setEditando(false)
  }

  const cancelar = () => {
    setNovaDesc(item.descricao)
    setNovoValor(parsearValor(item.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}))
    setNovaCat(item.categoria)
    setNovaData(item.data)
    setNovaContaId(item.contaId??'')
    setEditando(false)
  }

  if (editando) {
    return (
      <div className="bg-[#FAF6F1] dark:bg-[#3E3935] rounded-2xl px-4 py-3 space-y-2 border-2 border-[#8FB39A]/40">
        {isOwnerDaConta && !isAutor && (
          <p className="text-[10px] text-[#E8A87C] font-semibold">
            ✏️ Editando lançamento de {autorLabel ?? 'outro membro'}
          </p>
        )}
        <input type="text" value={novaDesc} onChange={e=>setNovaDesc(e.target.value)} className="w-full rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-white dark:bg-[#2B2825] px-3 py-2 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50" placeholder="Descrição"/>
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <select value={novaCat} onChange={e=>setNovaCat(e.target.value)} className="w-full appearance-none rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-white dark:bg-[#2B2825] px-3 py-2 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 pr-7">
              {categorias.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8C857C] pointer-events-none"/>
          </div>
          <input type="date" value={novaData} onChange={e=>setNovaData(e.target.value)} className="w-full rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-white dark:bg-[#2B2825] px-3 py-2 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50"/>
        </div>
        {contas.length > 0 && (
          <div className="relative">
            <select value={novaContaId} onChange={e=>setNovaContaId(e.target.value)} className="w-full appearance-none rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-white dark:bg-[#2B2825] px-3 py-2 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 pr-7">
              <option value="">Sem conta</option>
              {contas.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8C857C] pointer-events-none"/>
          </div>
        )}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C857C] text-sm font-semibold">R$</span>
            <input type="text" inputMode="numeric" value={novoValor} onChange={e=>setNovoValor(mascaraReal(e.target.value))} className="w-full rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-white dark:bg-[#2B2825] pl-9 pr-3 py-2 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50" placeholder="0,00"/>
          </div>
          <button onClick={salvar} disabled={salvando} className="p-2 rounded-full bg-[#8FB39A] text-white hover:bg-[#7ea389] active:scale-95 transition disabled:opacity-60">
            {salvando ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>}
          </button>
          <button onClick={cancelar} className="p-2 rounded-full bg-[#FAF6F1] dark:bg-[#2B2825] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] text-[#8C857C] hover:text-[#D4A0A0] active:scale-95 transition">
            <X size={15}/>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#FAF6F1] dark:bg-[#3E3935] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:cor}}/>
        <div className="flex-1 min-w-0">
          <p className="text-[#2D2A26] dark:text-[#E8E0D5] text-sm font-semibold truncate">
            {item.descricao}
            {item.recorrente && <span className="ml-1.5 text-[10px] text-[#8C857C] bg-[#8C857C]/10 rounded-full px-1.5 py-0.5">🔄</span>}
          </p>
          <p className="text-[#8C857C] dark:text-[#9E9890] text-xs flex items-center gap-1 flex-wrap">
            <span>{item.categoria} · {fmtData(item.data)}</span>
            {conta && <span style={{color:conta.cor}}>{conta.emoji} {conta.nome}</span>}
            {/* Autor — só mostra em contas compartilhadas */}
            {contaCompartilhada && autorLabel && (
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ehProprio ? 'bg-[#8FB39A]/15 text-[#8FB39A]' : 'bg-[#B8A9D4]/20 text-[#B8A9D4]'}`}>
                <User size={9}/>{ehProprio ? 'Você' : autorLabel.split(' ')[0]}
              </span>
            )}
          </p>
        </div>
        <span className={`font-bold text-sm shrink-0 ${item.tipo==='receita'?'text-[#8FB39A]':'text-[#D4A0A0]'}`}>
          {item.tipo==='receita'?'+':'−'} {parsearValor(item.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2})}
        </span>
        {/* Botão info (horário + autor completo) */}
        {contaCompartilhada && (
          <button onClick={()=>setShowInfo(v=>!v)} className={`p-1 rounded-full transition-colors shrink-0 ${showInfo ? 'bg-[#B8A9D4]/20 text-[#B8A9D4]' : 'text-[#8C857C] hover:text-[#B8A9D4] hover:bg-[#B8A9D4]/10'}`} title="Ver detalhes do lançamento">
            <User size={13}/>
          </button>
        )}
        {podeEditar && (
          <button onClick={()=>setEditando(true)} className="text-[#8C857C] hover:text-[#8FB39A] transition-colors p-1 rounded-full hover:bg-[#8FB39A]/10 active:scale-90 shrink-0" aria-label="Editar">
            <Pencil size={14}/>
          </button>
        )}
        {podeEditar && (
          <button onClick={()=>onRemover(item.id)} className="text-[#8C857C] hover:text-[#D4A0A0] transition-colors p-1 rounded-full hover:bg-[#D4A0A0]/10 active:scale-90 shrink-0" aria-label="Remover">
            <Trash2 size={14}/>
          </button>
        )}
      </div>
      {/* Painel de auditoria — quem lançou e quando */}
      {showInfo && (
        <div className="border-t border-[rgba(45,42,38,0.07)] dark:border-[rgba(255,255,255,0.06)] bg-white/60 dark:bg-[#2B2825]/50 px-4 py-2.5 flex flex-col gap-0.5">
          <p className="text-[11px] text-[#2D2A26] dark:text-[#C8C0B5] font-semibold flex items-center gap-1.5">
            <User size={11} className="text-[#B8A9D4]"/>
            Lançado por: <span className={ehProprio ? 'text-[#8FB39A]' : 'text-[#B8A9D4]'}>{ehProprio ? 'Você' : (item.autorNome ?? item.autorEmail ?? 'Desconhecido')}</span>
            {!ehProprio && item.autorEmail && (
              <span className="text-[#8C857C] dark:text-[#9E9890] font-normal">({item.autorEmail})</span>
            )}
          </p>
          {item.createdAt && (
            <p className="text-[10px] text-[#8C857C] dark:text-[#9E9890]">
              📅 Registrado em: {fmtHorario(item.createdAt)}
            </p>
          )}
          {isOwnerDaConta && !isAutor && (
            <p className="text-[10px] text-[#E8A87C] mt-0.5 font-semibold">
              ⚠️ Como dono da conta, você pode editar ou excluir este lançamento.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
