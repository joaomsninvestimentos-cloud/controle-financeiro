'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusCircle, Trash2, TrendingUp, TrendingDown, Wallet,
  Sparkles, BarChart2, List, ChevronDown, LogOut, User, Loader2,
  Pencil, Check, X, ChevronLeft, ChevronRight, Building2, Plus,
  Users, AlertTriangle, Target, Repeat, Download, Moon, Sun, FileText, Bell,
  Search, DownloadCloud,
} from 'lucide-react'
import GraficosView from './GraficosView'
import ContasModal from './ContasModal'
import RecorrenciasModal from './RecorrenciasModal'
import ContaSwitcher from './ContaSwitcher'
import EditarContaModal from './EditarContaModal'
import { normalizarRotuloSoma, resolverSelecao, ROTULO_SOMA } from '@/lib/contas-logic'
import {
  CHAVE_MARCAS,
  marcasVisiveis,
  normalizarMarca,
  registrarMarca,
  resumoMovidos,
  rotuloMarca,
  textoResumo,
  type MarcaMovido,
} from '@/lib/movidos-logic'
import {
  deveAtualizarAoSoltar,
  deveRecarregarAoVoltar,
  deslocamentoIndicador,
  estadoPull,
  opacidadeIndicador,
  podePuxar,
} from '@/lib/pull-refresh-logic'
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
  recorrenciaId?: string | null
  /** id do lançamento original (preenchido só no espelho da casa) */
  espelhoDe?: string | null
  /** conta da casa onde existe a cópia deste lançamento (se existir) */
  espelhadoNaContaId?: string | null
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
  conviteExpiraEmDias?: number
}

export interface Conta {
  id: string
  nome: string
  tipo?: 'pessoal' | 'casa'
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
  const [contaSelecionada, setContaSelecionada] = useState<string | 'tudo'>('tudo')
  const [loading, setLoading] = useState(true)
  const [descricao, setDescricao] = useState('')
  const [valorTexto, setValorTexto] = useState('')
  const [tipo, setTipo] = useState<Tipo>('despesa')
  const [categoria, setCategoria] = useState<Categoria>('Alimentação')
  const [data, setData] = useState(dataHoje())
  const [itemContaId, setItemContaId] = useState<string>('')
  const [recorrente, setRecorrente] = useState(false)
  const [recorrenteAte, setRecorrenteAte] = useState('')
  const [tambemDaCasa, setTambemDaCasa] = useState(false)
  const [showFixas, setShowFixas] = useState(false)
  const [aviso, setAviso] = useState('')
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aba, setAba] = useState<'lancamentos' | 'graficos' | 'orcamentos'>('lancamentos')
  const [saving, setSaving] = useState(false)
  const [dicaIndex] = useState(() => Math.floor(Math.random() * DICAS.length))
  const [showContas, setShowContas] = useState(false)
  const [contaEmEdicao, setContaEmEdicao] = useState<Conta | null>(null)
  // Rótulo/visibilidade da visão somada: preferência do aparelho (não é conta).
  const [rotuloSoma, setRotuloSoma] = useState(ROTULO_SOMA)
  const [somaVisivel, setSomaVisivel] = useState(true)
  // Puxar para atualizar
  const [refreshKey, setRefreshKey] = useState(0)
  const [pullDistancia, setPullDistancia] = useState(0)
  const [atualizando, setAtualizando] = useState(false)
  // Checklist de "já movi para outra conta" (só no aparelho, expira em 7 dias)
  const [marcas, setMarcas] = useState<MarcaMovido[]>([])
  const [marcasCarregadas, setMarcasCarregadas] = useState(false)
  const pullInicio = useRef<number | null>(null)
  const pullDistanciaRef = useRef(0)
  const ultimaRecarga = useRef<number>(Date.now())
  const [modoLote, setModoLote] = useState(false)
  const [lote, setLote] = useState<Array<{
    descricao:string;valor:string;tipo:Tipo;categoria:string;data:string;contaId:string;
    recorrente:boolean; espelharNaContaId?: string | null;
  }>>([])
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null)
  const erroTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostrarErro = useCallback((msg: string) => {
    setErro(msg)
    if (erroTimer.current) clearTimeout(erroTimer.current)
    erroTimer.current = setTimeout(() => setErro(''), 4000)
  }, [])

  const mostrarAviso = useCallback((msg: string) => {
    setAviso(msg)
    if (avisoTimer.current) clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(''), 5000)
  }, [])

  // PWA (o service worker é registrado no layout, em PwaBoot)
  useEffect(() => {
    const onInstall = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as unknown as { prompt: () => Promise<void> })
    }
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => window.removeEventListener('beforeinstallprompt', onInstall)
  }, [])

  useEffect(() => {
    if (contaSelecionada !== 'tudo') setItemContaId(contaSelecionada)
  }, [contaSelecionada])

  // Carregar contas
  const carregarContas = useCallback(() => {
    fetch('/api/contas')
      .then(r => r.json())
      .then((d: { contas?: Conta[] }) => {
        const lista = d.contas ?? []
        setContas(lista)
        // Restaura a última conta usada no aparelho
        if (lista.length > 0) {
          const salva = typeof window !== 'undefined' ? localStorage.getItem('conta-selecionada') : null
          setContaSelecionada(prev => {
            if (prev !== 'tudo') return prev
            const resumo = lista.map(c => ({
              id: c.id,
              nome: c.nome,
              tipo: (c.tipo ?? 'pessoal') as 'pessoal' | 'casa',
              isOwner: c.isOwner,
            }))
            return resolverSelecao(resumo, salva)
          })
        }
      })
      .catch(() => {})
  }, [])
  useEffect(() => { carregarContas() }, [carregarContas])

  useEffect(() => {
    try {
      const rotulo = localStorage.getItem('soma-rotulo')
      if (rotulo) setRotuloSoma(normalizarRotuloSoma(rotulo))
      const visivel = localStorage.getItem('soma-visivel')
      if (visivel !== null) setSomaVisivel(visivel !== 'oculta')
    } catch { /* modo privado */ }
  }, [])

  const salvarAjustesSoma = useCallback((rotulo: string, visivel: boolean) => {
    const nome = normalizarRotuloSoma(rotulo)
    setRotuloSoma(nome)
    setSomaVisivel(visivel)
    try {
      localStorage.setItem('soma-rotulo', nome)
      localStorage.setItem('soma-visivel', visivel ? 'visivel' : 'oculta')
    } catch { /* modo privado */ }
  }, [])

  // Guarda a conta escolhida para abrir nela da próxima vez
  const selecionarConta = useCallback((valor: string | 'tudo') => {
    setContaSelecionada(valor)
    try { localStorage.setItem('conta-selecionada', valor) } catch { /* modo privado */ }
  }, [])

  // Carregar orçamentos do mês
  useEffect(() => {
    fetch(`/api/orcamentos?mes=${mesSelecionado}`)
      .then(r => r.json())
      .then(d => setOrcamentos(d.orcamentos ?? []))
      .catch(() => {})
  }, [mesSelecionado, refreshKey])

  // Carregar TODOS os items (carry-forward)
  const carregarTodosItems = useCallback(() => {
    const params = contaSelecionada !== 'tudo'
      ? `?contaId=${contaSelecionada}&todos=1`
      : '?todos=1'
    fetch(`/api/items${params}`)
      .then(r => r.json())
      .then(d => setTodosItems(d.items ?? []))
      .catch(() => {})
  }, [contaSelecionada])

  useEffect(() => { carregarTodosItems() }, [carregarTodosItems, refreshKey])

  // Carregar items do mês selecionado
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ mes: mesSelecionado })
    if (contaSelecionada !== 'tudo') params.set('contaId', contaSelecionada)
    fetch(`/api/items?${params}`)
      .then(r => r.json())
      .then(d => {
        const lista = (d.items ?? []) as Item[]
        // Na visão somada o espelho não entra: ele já está contado na origem.
        setItems(contaSelecionada === 'tudo' ? lista.filter(i => !i.espelhoDe) : lista)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [mesSelecionado, contaSelecionada, refreshKey])

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

  if (contaSelecionada !== 'tudo' && contas.length > 0) {
    const conta = contas.find(c => c.id === contaSelecionada)
    if (conta) {
      const itensConta = todosItems.filter(i => i.contaId === conta.id)
      const calc = calcularSaldoConta(conta, itensConta, mesSelecionado)
      saldoInicio = calc.saldoInicio
      saldo = calc.saldoFim
    }
  }

  // ── Marcas de "já movi" (localStorage) ────────────────────────────────────
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(CHAVE_MARCAS)
      setMarcas(normalizarMarca(bruto ? JSON.parse(bruto) : []))
    } catch {
      setMarcas([])
    }
    setMarcasCarregadas(true)
  }, [])

  useEffect(() => {
    if (!marcasCarregadas) return
    try {
      localStorage.setItem(CHAVE_MARCAS, JSON.stringify(marcas))
    } catch { /* modo privado */ }
  }, [marcas, marcasCarregadas])

  // ── Atualizar (puxar para baixo / voltar ao app) ───────────────────────────
  const recarregarTudo = useCallback(() => {
    setRefreshKey(k => k + 1)
    carregarContas()
    carregarTodosItems()
    ultimaRecarga.current = Date.now()
  }, [carregarContas, carregarTodosItems])

  const finalizarAtualizacao = useCallback(() => {
    setPullDistancia(0)
    pullDistanciaRef.current = 0
    // pequena pausa para o indicador não "piscar" na tela
    setTimeout(() => setAtualizando(false), 450)
  }, [])

  useEffect(() => {
    const aoComecar = (e: TouchEvent) => {
      if (!podePuxar(window.scrollY, atualizando)) return
      pullInicio.current = e.touches[0].clientY
    }

    const aoMover = (e: TouchEvent) => {
      if (pullInicio.current === null || atualizando) return
      const bruto = e.touches[0].clientY - pullInicio.current
      if (bruto <= 0) {
        pullDistanciaRef.current = 0
        setPullDistancia(0)
        return
      }
      // no topo: segura o gesto para não rolar a página junto
      if (window.scrollY <= 0 && bruto > 6 && e.cancelable) e.preventDefault()
      const distancia = estadoPull(bruto, false).distancia
      pullDistanciaRef.current = distancia
      setPullDistancia(distancia)
    }

    const aoSoltar = () => {
      if (pullInicio.current === null) return
      const distancia = pullDistanciaRef.current
      pullInicio.current = null
      pullDistanciaRef.current = 0
      if (deveAtualizarAoSoltar(distancia, atualizando)) {
        setAtualizando(true)
        recarregarTudo()
        finalizarAtualizacao()
      } else {
        setPullDistancia(0)
      }
    }

    window.addEventListener('touchstart', aoComecar, { passive: true })
    window.addEventListener('touchmove', aoMover, { passive: false })
    window.addEventListener('touchend', aoSoltar)
    window.addEventListener('touchcancel', aoSoltar)
    return () => {
      window.removeEventListener('touchstart', aoComecar)
      window.removeEventListener('touchmove', aoMover)
      window.removeEventListener('touchend', aoSoltar)
      window.removeEventListener('touchcancel', aoSoltar)
    }
  }, [atualizando, recarregarTudo, finalizarAtualizacao])

  // Voltou para o app (troca de aba, desbloqueio)? Recarrega se faz tempo.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return
      if (!deveRecarregarAoVoltar(ultimaRecarga.current, Date.now())) return
      recarregarTudo()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [recarregarTudo])

  // ── Espelho da casa ───────────────────────────────────────────────────────
  const contaCasa = contas.find(c => c.tipo === 'casa') ?? null
  const contaDoItem = contas.find(c => c.id === itemContaId) ?? null
  const podeMarcarCasa = tipo === 'despesa'
    && !!contaCasa
    && contaDoItem?.tipo === 'pessoal'
    && contaDoItem.id !== contaCasa.id

  // Alerta: despesas > 80% receitas
  const alertaDespesas = totalReceitas > 0 && totalDespesas / totalReceitas >= 0.8

  // ── Adicionar item único ──────────────────────────────────────────────────
  const adicionarItem = useCallback(async () => {
    const valor = parsearValor(valorTexto)
    if (!descricao.trim() || valor <= 0) {
      mostrarErro('Preencha a descrição e um valor maior que zero.')
      return
    }
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
          ...(recorrente ? { recorrenteAte: recorrenteAte || null } : {}),
          ...(podeMarcarCasa && tambemDaCasa && contaCasa ? { espelharNaContaId: contaCasa.id } : {}),
        }),
      })
      if (res.ok) {
        const { item, geradas } = await res.json() as { item: Item; geradas?: number }
        if (item.mes === mesSelecionado && (contaSelecionada === 'tudo' || item.contaId === contaSelecionada)) {
          setItems(prev => [item, ...prev])
        }
        setTodosItems(prev => [item, ...prev])
        if (recorrente) {
          mostrarAviso(
            geradas && geradas > 0
              ? `Despesa fixa criada em "${item.descricao}" — já repetida em mais ${geradas} mês(es).`
              : `Despesa fixa criada em "${item.descricao}".`,
          )
        }
        if (podeMarcarCasa && tambemDaCasa && contaCasa) {
          mostrarAviso(`Despesa também lançada na ${contaCasa.nome}.`)
        }
        setDescricao('')
        setValorTexto('')
        setRecorrente(false)
        setRecorrenteAte('')
        setTambemDaCasa(false)
      } else {
        const dados = await res.json().catch(() => ({})) as { error?: string; message?: string }
        mostrarErro(dados.message ?? 'Não foi possível salvar. Tente novamente.')
      }
    } catch {
      mostrarErro('Sem conexão. Verifique sua internet.')
    } finally { setSaving(false) }
  }, [descricao, valorTexto, tipo, categoria, data, itemContaId, recorrente, recorrenteAte, mesSelecionado, contaSelecionada, mostrarErro, mostrarAviso, podeMarcarCasa, tambemDaCasa, contaCasa])

  // ── Adicionar lote ────────────────────────────────────────────────────────
  const adicionarLoteAoCarrinho = () => {
    const valor = parsearValor(valorTexto)
    if (!descricao.trim() || valor <= 0) return
    setLote(prev => [...prev, {
      descricao: descricao.trim(), valor: valor.toFixed(2),
      tipo, categoria, data, contaId: itemContaId, recorrente,
      ...(podeMarcarCasa && tambemDaCasa && contaCasa ? { espelharNaContaId: contaCasa.id } : {}),
    }])
    setDescricao('')
    setValorTexto('')
    setTambemDaCasa(false)
  }

  const enviarLote = useCallback(async () => {
    if (lote.length === 0) return
    setSaving(true)
    try {
      const payload = lote.map(l => ({
        ...l,
        mes: l.data.slice(0, 7),
        contaId: l.contaId || null,
        ...(l.espelharNaContaId ? { espelharNaContaId: l.espelharNaContaId } : {}),
      }))
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const { items: novos } = await res.json()
        setItems(prev => [...novos.filter((i: Item) => i.mes === mesSelecionado), ...prev])
        setTodosItems(prev => [...novos, ...prev])
        const espelhados = lote.filter(l => l.espelharNaContaId).length
        if (espelhados > 0 && contaCasa) {
          mostrarAviso(`${espelhados} lançamento(s) também na ${contaCasa.nome}.`)
        }
        setLote([])
        setModoLote(false)
      } else {
        mostrarErro('Não foi possível salvar o lote. Tente novamente.')
      }
    } catch {
      mostrarErro('Sem conexão. Verifique sua internet.')
    } finally { setSaving(false) }
  }, [lote, mesSelecionado, mostrarErro, mostrarAviso, contaCasa])

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
      icon: '/icon-192.png',
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
          icon: '/icon-192.png',
        })
      } else if (pct >= 80) {
        new Notification(`⚡ Atenção: ${o.categoria}`, {
          body: `Você já usou ${pct}% do orçamento de ${o.categoria} este mês.`,
          icon: '/icon-192.png',
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
  const editarItem = useCallback(async (
    id: string,
    campos: Partial<Pick<Item, 'descricao'|'valor'|'categoria'|'data'|'contaId'|'recorrente'>> & { espelharNaContaId?: string | null },
  ) => {
    const res = await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...campos, ...(campos.data ? { mes: campos.data.slice(0, 7) } : {}) }),
    })
    if (res.ok) {
      const { item } = await res.json()

      // Trocou de conta? Marca para o usuário saber o que já resolveu.
      const destinoId = campos.contaId
      const contaAnterior = items.find(i => i.id === id)?.contaId
        ?? todosItems.find(i => i.id === id)?.contaId
      if (destinoId && destinoId !== contaAnterior) {
        const destino = contas.find(c => c.id === destinoId)
        if (destino) {
          const agora = Date.now()
          setMarcas(prev => registrarMarca(prev, {
            itemId: id, destinoId: destino.id, destinoNome: destino.nome, em: agora,
          }, agora))
        }
      }

      setItems(prev => prev.map(i => i.id === id ? { ...i, ...item } : i))
      setTodosItems(prev => prev.map(i => i.id === id ? { ...i, ...item } : i))
      carregarTodosItems()
      return
    }
    const dados = await res.json().catch(() => ({})) as { message?: string }
    mostrarErro(dados.message ?? 'Não foi possível salvar a edição.')
    throw new Error(dados.message ?? 'FALHA')
  }, [mostrarErro, carregarTodosItems, items, todosItems, contas])

  // ── Remover ──────────────────────────────────────────────────────────────
  const removerItem = useCallback(async (id: string) => {
    const alvo = items.find(i => i.id === id)
    let pergunta: string
    if (alvo?.espelhoDe) {
      const autor = alvo.autorNome?.split(' ')[0] ?? 'quem pagou'
      pergunta = `Remover "${alvo.descricao}" da visão da casa?\n\nO lançamento de ${autor} continua na conta pessoal.`
    } else if (alvo?.espelhadoNaContaId) {
      const nome = contas.find(c => c.id === alvo.espelhadoNaContaId)?.nome ?? 'casa'
      pergunta = `Excluir "${alvo.descricao}"?\n\nA cópia que aparece na ${nome} também será removida.`
    } else if (alvo?.recorrenciaId) {
      pergunta = `Pular "${alvo.descricao}" apenas em ${fmtMes(alvo.mes)}?\n\nA despesa fixa continua nos outros meses (para acabar de vez, use a aba Fixas).`
    } else {
      pergunta = 'Excluir este lançamento?'
    }
    if (!confirm(pergunta)) return
    const snapshot = items
    const snapshotTodos = todosItems
    setItems(prev => prev.filter(i => i.id !== id))
    setTodosItems(prev => prev.filter(i => i.id !== id))
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setItems(snapshot)
      setTodosItems(snapshotTodos)
      mostrarErro('Não foi possível excluir.')
      return
    }
    // Espelho/origem mexem nos dois lados: recarrega para ficar fiel.
    carregarTodosItems()
    const dados = await res.json().catch(() => ({})) as { eraEspelho?: boolean }
    if (dados.eraEspelho) mostrarAviso('Cópia removida da casa. O lançamento original continua.')
  }, [items, todosItems, mostrarErro, mostrarAviso, carregarTodosItems, contas])

  // ── Editar / excluir conta (direto da barra) ──────────────────────────────
  const atualizarConta = useCallback(async (id: string, campos: { nome: string; cor: string; emoji: string }) => {
    const res = await fetch(`/api/contas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campos),
    })
    if (!res.ok) {
      mostrarErro(res.status === 403 ? 'Só quem criou a conta pode alterá-la.' : 'Não foi possível salvar a conta.')
      return
    }
    carregarContas()
    mostrarAviso('Conta atualizada.')
  }, [carregarContas, mostrarErro, mostrarAviso])

  const excluirConta = useCallback(async (id: string) => {
    const res = await fetch(`/api/contas/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      mostrarErro('Não foi possível excluir a conta.')
      return
    }
    if (contaSelecionada === id) selecionarConta('tudo')
    setContaEmEdicao(null)
    carregarContas()
    carregarTodosItems()
    mostrarAviso('Conta excluída. Os lançamentos continuam em "Somar tudo".')
  }, [contaSelecionada, selecionarConta, carregarContas, carregarTodosItems, mostrarErro, mostrarAviso])

  // ── Transferir registros entre contas ─────────────────────────────────────
  const transferirRegistros = useCallback(async (
    deContaId: string,
    paraContaId: string,
    opcoes: { incluirLancamentos: boolean; incluirFixas: boolean; incluirOrcamentos: boolean },
  ): Promise<{ fixas: number; lancamentos: number; orcamentos: number; orcamentosIgnorados: number; espelhosPreservados: number } | { erro: string }> => {
    try {
      const res = await fetch(`/api/contas/${deContaId}/mover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paraContaId, ...opcoes }),
      })
      const dados = await res.json().catch(() => ({})) as {
        message?: string; fixas?: number; lancamentos?: number; orcamentos?: number
        orcamentosIgnorados?: number; espelhosPreservados?: number
      }
      if (!res.ok) return { erro: dados.message ?? 'Não foi possível transferir.' }

      const partes = [
        (dados.fixas ?? 0) > 0 ? `${dados.fixas} fixa(s)` : '',
        (dados.lancamentos ?? 0) > 0 ? `${dados.lancamentos} lançamento(s)` : '',
        (dados.orcamentos ?? 0) > 0 ? `${dados.orcamentos} orçamento(s)` : '',
      ].filter(Boolean)
      mostrarAviso(partes.length > 0 ? `Transferido: ${partes.join(', ')}.` : 'Nada para transferir.')

      carregarContas()
      carregarTodosItems()
      setRefreshKey(k => k + 1)
      return {
        fixas: dados.fixas ?? 0,
        lancamentos: dados.lancamentos ?? 0,
        orcamentos: dados.orcamentos ?? 0,
        orcamentosIgnorados: dados.orcamentosIgnorados ?? 0,
        espelhosPreservados: dados.espelhosPreservados ?? 0,
      }
    } catch {
      return { erro: 'Sem conexão. Verifique sua internet.' }
    }
  }, [carregarContas, carregarTodosItems, mostrarAviso])

  // ── Logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    await fetch('/api/auth/me', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const categorias = tipo === 'despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA
  const marcasMapa = marcasVisiveis(marcas, Date.now())
  const resumoMarcas = resumoMovidos(marcas, Date.now())

  const q = busca.trim().toLowerCase()
  const itemsFiltrados = q
    ? items.filter(i =>
        i.descricao.toLowerCase().includes(q) ||
        i.categoria.toLowerCase().includes(q) ||
        (contas.find(c => c.id === i.contaId)?.nome ?? '').toLowerCase().includes(q)
      )
    : items

  const instalarApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1] dark:bg-[#2B2825] font-nunito pb-10 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-[#342F2B] shadow-snug sticky top-0 z-10 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 flex items-center justify-between">
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
          {installPrompt && (
            <button
              onClick={instalarApp}
              className="p-2 rounded-full hover:bg-[#8FB39A]/10 text-[#8C857C] hover:text-[#8FB39A] transition-colors"
              title="Instalar no celular"
            >
              <DownloadCloud size={16} />
            </button>
          )}
          <button onClick={logout} className="p-2 rounded-full hover:bg-[#D4A0A0]/10 text-[#8C857C] hover:text-[#D4A0A0] transition-colors" title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Indicador do "puxar para atualizar" */}
      {(pullDistancia > 0 || atualizando) && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[70] pointer-events-none transition-opacity"
          style={{
            top: `calc(env(safe-area-inset-top) + ${deslocamentoIndicador(pullDistancia, atualizando)}px)`,
            opacity: opacidadeIndicador(pullDistancia, atualizando),
          }}
          aria-live="polite"
        >
          <div className="flex items-center gap-1.5 bg-white dark:bg-[#342F2B] text-[#8C857C] dark:text-[#9E9890] text-[11px] font-bold rounded-full px-3 py-1.5 shadow-snug">
            <Loader2 size={12} className={`text-[#8FB39A] ${atualizando ? 'animate-spin' : ''}`} />
            {estadoPull(pullDistancia, atualizando).rotulo}
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4 text-[#2D2A26] dark:text-[#E8E0D5]">
        {erro && (
          <div className="bg-[#D4A0A0]/20 border border-[#D4A0A0]/40 rounded-2xl px-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] font-semibold">
            {erro}
          </div>
        )}
        {aviso && (
          <div className="bg-[#8FB39A]/20 border border-[#8FB39A]/40 rounded-2xl px-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] font-semibold">
            {aviso}
          </div>
        )}

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

        {/* Barra fixa de contas: pessoal, casa e tudo */}
        {contas.length > 0 && (
          <ContaSwitcher
            contas={contas}
            selecionada={contaSelecionada}
            onSelecionar={selecionarConta}
            onGerenciar={() => setShowContas(true)}
            onEditar={c => setContaEmEdicao(c)}
            rotuloSoma={rotuloSoma}
            somaVisivel={somaVisivel}
          />
        )}

        {/* Saldo da conta com carry-forward */}
        {contaSelecionada !== 'tudo' && (() => {
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
            label={contaSelecionada !== 'tudo' ? 'Saldo Final' : 'Saldo'}
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
              {modoLote ? '📋 Lançamentos em lote' : 'Adicionar em '}
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
            </div>
          )}
          {podeMarcarCasa && contaCasa && (
            <label className="flex items-start gap-2 rounded-2xl border border-dashed border-[#8FB39A]/50 bg-[#8FB39A]/5 px-4 py-3 cursor-pointer mb-3">
              <input type="checkbox" checked={tambemDaCasa} onChange={e=>setTambemDaCasa(e.target.checked)} className="w-4 h-4 accent-[#8FB39A] mt-0.5" />
              <span className="text-sm text-[#2D2A26] dark:text-[#E8E0D5]">
                🏠 Também é despesa da {contaCasa.nome}
                <span className="flex flex-col text-[11px] text-[#8C857C] dark:text-[#9E9890]">
                  <span>Fica na sua conta como o que você pagou, e aparece na {contaCasa.nome} para os dois.</span>
                  <span>No total geral conta uma vez só.</span>
                </span>
              </span>
            </label>
          )}

          <label className="flex items-start gap-2 rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-4 py-3 cursor-pointer mb-3">
            <input type="checkbox" checked={recorrente} onChange={e=>{setRecorrente(e.target.checked); if(!e.target.checked) setRecorrenteAte('')}} className="w-4 h-4 accent-[#8FB39A] mt-0.5" />
            <span className="text-sm text-[#2D2A26] dark:text-[#E8E0D5]">
              🔁 Despesa fixa (repete todo mês)
              <span className="block text-[11px] text-[#8C857C] dark:text-[#9E9890]">
                Cria sozinha nos meses seguintes, até você encerrar na aba Fixas.
              </span>
            </span>
          </label>

          {recorrente && (
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-[#8C857C] dark:text-[#9E9890] mb-1 ml-1">
                Repetir até (opcional — em branco = até encerrar)
              </label>
              <input
                type="month"
                value={recorrenteAte}
                min={data.slice(0, 7)}
                onChange={e=>setRecorrenteAte(e.target.value)}
                className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition"
              />
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
              onClick={() => setShowFixas(true)}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all active:scale-95 bg-white dark:bg-[#3E3935] text-[#8C857C] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] shadow-snug hover:text-[#8FB39A]"
              title="Ver, pular ou encerrar as despesas fixas"
            >
              <Repeat size={12} /> Fixas
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
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8C857C]" />
              <input
                type="search"
                value={busca}
                onChange={e=>setBusca(e.target.value)}
                placeholder="Buscar lançamento, categoria ou conta…"
                className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-white dark:bg-[#342F2B] pl-10 pr-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 shadow-snug"
              />
            </div>
            {resumoMarcas.total > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#8FB39A]/10 border border-[#8FB39A]/30 px-3 py-2">
                <span className="text-[11px] font-bold text-[#5f8a6d] dark:text-[#8FB39A] flex items-center gap-1">
                  <Check size={12} /> {textoResumo(resumoMarcas)}
                </span>
                <button
                  type="button"
                  onClick={() => setMarcas([])}
                  className="text-[10px] font-semibold text-[#8C857C] hover:text-[#D4A0A0] transition shrink-0"
                >
                  limpar marcas
                </button>
              </div>
            )}
            {q && itemsFiltrados.length === 0 && (
              <p className="text-center text-sm text-[#8C857C] py-6">Nenhum lançamento para “{busca}”.</p>
            )}
            {itemsFiltrados.filter(i=>i.tipo==='receita').length>0&&(
              <Section titulo="💰 Receitas">
                {itemsFiltrados.filter(i=>i.tipo==='receita').map(i=>(
                  <ItemCard key={i.id} item={i} contas={contas} currentUser={user} contaSelecionada={contaSelecionada} onRemover={removerItem} onEditar={editarItem} marca={marcasMapa.get(i.id)}/>
                ))}
              </Section>
            )}
            {itemsFiltrados.filter(i=>i.tipo==='despesa').length>0&&(
              <Section titulo="💸 Despesas">
                {itemsFiltrados.filter(i=>i.tipo==='despesa').map(i=>(
                  <ItemCard key={i.id} item={i} contas={contas} currentUser={user} contaSelecionada={contaSelecionada} onRemover={removerItem} onEditar={editarItem} marca={marcasMapa.get(i.id)}/>
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
      {showFixas && (
        <RecorrenciasModal
          mesSelecionado={mesSelecionado}
          contas={contas}
          onClose={() => setShowFixas(false)}
          onChanged={() => {
            if (contaSelecionada !== 'tudo') {
              const params = new URLSearchParams({ mes: mesSelecionado, contaId: contaSelecionada })
              fetch(`/api/items?${params}`).then(r => r.json()).then(d => setItems(d.items ?? [])).catch(() => {})
            } else {
              fetch(`/api/items?mes=${mesSelecionado}`).then(r => r.json()).then(d => setItems(d.items ?? [])).catch(() => {})
            }
            carregarTodosItems()
          }}
          onAviso={mostrarAviso}
        />
      )}

      {contaEmEdicao && (
        <EditarContaModal
          conta={contaEmEdicao}
          contas={contas}
          onClose={() => setContaEmEdicao(null)}
          onSalvar={async campos => { await atualizarConta(contaEmEdicao.id, campos) }}
          onExcluir={async () => { await excluirConta(contaEmEdicao.id) }}
          onTransferir={transferirRegistros}
        />
      )}

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
            if (res.ok) { carregarContas(); mostrarAviso('Conta criada.') }
            else mostrarErro('Não foi possível criar a conta.')
          }}
          onDelete={async (id) => {
            const res = await fetch(`/api/contas/${id}`, { method: 'DELETE' })
            if (res.ok) { setContas(prev => prev.filter(c => c.id !== id)); if (contaSelecionada === id) setContaSelecionada('tudo') }
          }}
          onGerarConvite={async (contaId, email) => {
            const res = await fetch(`/api/contas/${contaId}/invite`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(email ? { email } : {}),
            })
            const data = await res.json().catch(() => ({})) as {
              link?: string; whatsapp?: string; message?: string; diasValidade?: number
              jaMembro?: boolean; error?: string
            }
            carregarContas()
            if (!res.ok) {
              return { erro: data.error === 'FORBIDDEN' ? 'Você não é o dono desta conta.' : 'Não foi possível gerar o convite.' }
            }
            if (data.jaMembro) return { erro: 'Essa pessoa já participa desta conta.' }
            if (!data.link) return { erro: 'O servidor não devolveu o link. Tente de novo.' }
            return {
              link: data.link,
              whatsapp: data.whatsapp ?? `https://wa.me/?text=${encodeURIComponent(data.link)}`,
              message: data.message ?? 'Convite criado.',
              diasValidade: data.diasValidade,
            }
          }}
          onRemoveMembro={async (contaId, memberId) => {
            await fetch(`/api/contas/${contaId}/invite?memberId=${memberId}`, { method: 'DELETE' })
            carregarContas()
          }}
          onEditarConta={c => { setShowContas(false); setContaEmEdicao(c) }}
          rotuloSoma={rotuloSoma}
          somaVisivel={somaVisivel}
          onSalvarAjustesSoma={salvarAjustesSoma}
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
  contaSelecionada: string | 'tudo'
  onRemover: (id: string) => void
  onEditar: (id: string, c: Partial<Pick<Item,'descricao'|'valor'|'categoria'|'data'|'contaId'|'recorrente'>> & { espelharNaContaId?: string | null }) => Promise<void>
  marca?: MarcaMovido
}

function ItemCard({ item, contas, currentUser, contaSelecionada, onRemover, onEditar, marca }: ItemCardProps) {
  const cor = CORES[item.categoria]??'#C4C4C4'
  const conta = contas.find(c => c.id === item.contaId)
  const [editando, setEditando] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [novaDesc, setNovaDesc] = useState(item.descricao)
  const [novoValor, setNovoValor] = useState(() => parsearValor(item.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}))
  const [novaCat, setNovaCat] = useState(item.categoria)
  const [novaData, setNovaData] = useState(item.data)
  const [novaContaId, setNovaContaId] = useState(item.contaId??'')
  const [novaRecorrencia, setNovaRecorrencia] = useState(item.recorrente)
  const [salvando, setSalvando] = useState(false)

  // Espelho da casa (ver lib/espelho-logic).
  const contaCasa = contas.find(c => c.tipo === 'casa') ?? null
  const contaEscolhida = contas.find(c => c.id === novaContaId) ?? null
  const ehEspelho = !!item.espelhoDe
  const estaEspelhado = !!item.espelhadoNaContaId
  const podeVirarEspelho = item.tipo === 'despesa'
    && !!contaCasa
    && contaEscolhida?.tipo === 'pessoal'
    && contaEscolhida.id !== contaCasa.id
    && !ehEspelho
  const [vaiEspelhar, setVaiEspelhar] = useState(estaEspelhado)
  const nomeContaEspelho = contas.find(c => c.id === (item.espelhadoNaContaId ?? ''))?.nome ?? null

  const categorias = item.tipo==='despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA

  // Usuário pode editar se: é o próprio autor OU é dono da conta selecionada
  const isOwnerDaConta = conta?.isOwner === true
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
    const campos: Parameters<typeof onEditar>[1] = {
      descricao: novaDesc.trim(), valor: valor.toFixed(2), categoria: novaCat,
      data: novaData, contaId: novaContaId||null, recorrente: novaRecorrencia,
    }
    if (podeVirarEspelho) {
      const querEspelhar = vaiEspelhar && !!contaCasa
      if (querEspelhar !== estaEspelhado) {
        campos.espelharNaContaId = querEspelhar ? (contaCasa?.id ?? null) : null
      }
    }
    try {
      await onEditar(item.id, campos)
      setEditando(false)
    } catch {
      // erro já foi mostrado ao usuário; mantém a edição aberta para corrigir
    } finally {
      setSalvando(false)
    }
  }

  const cancelar = () => {
    setNovaDesc(item.descricao)
    setNovoValor(parsearValor(item.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}))
    setNovaCat(item.categoria)
    setNovaData(item.data)
    setNovaContaId(item.contaId??'')
    setNovaRecorrencia(item.recorrente)
    setVaiEspelhar(estaEspelhado)
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
        <label className="flex items-start gap-2 text-sm text-[#2D2A26] dark:text-[#E8E0D5]">
          <input type="checkbox" checked={novaRecorrencia} onChange={e=>setNovaRecorrencia(e.target.checked)} className="w-4 h-4 accent-[#8FB39A] mt-0.5" />
          <span>
            🔁 Despesa fixa
            <span className="block text-[10px] text-[#8C857C] dark:text-[#9E9890]">
              {item.recorrenciaId
                ? 'Alterações valem deste mês em diante. Desmarcar tira só este mês da série.'
                : 'Marcar transforma este lançamento em despesa fixa.'}
            </span>
          </span>
        </label>
        {podeVirarEspelho && contaCasa && (
          <label className="flex items-start gap-2 text-sm text-[#2D2A26] dark:text-[#E8E0D5] rounded-xl border border-dashed border-[#8FB39A]/50 bg-[#8FB39A]/5 px-2 py-1.5">
            <input type="checkbox" checked={vaiEspelhar} onChange={e=>setVaiEspelhar(e.target.checked)} className="w-4 h-4 accent-[#8FB39A] mt-0.5" />
            <span>
              🏠 Também é despesa da {contaCasa.nome}
              <span className="block text-[10px] text-[#8C857C] dark:text-[#9E9890]">
                Aparece na {contaCasa.nome} sem contar duas vezes no total geral.
              </span>
            </span>
          </label>
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
            {item.recorrenciaId ? (
              <span className="ml-1.5 text-[10px] text-[#8FB39A] bg-[#8FB39A]/15 rounded-full px-1.5 py-0.5" title="Despesa fixa — repete todo mês">🔁 fixa</span>
            ) : item.recorrente ? (
              <span className="ml-1.5 text-[10px] text-[#8C857C] bg-[#8C857C]/10 rounded-full px-1.5 py-0.5" title="Marcado como recorrente (sem série)">🔄</span>
            ) : null}
            {ehEspelho && (
              <span
                className="ml-1.5 text-[10px] text-[#8FB39A] bg-[#8FB39A]/15 rounded-full px-1.5 py-0.5"
                title="Cópia de uma despesa paga na conta pessoal. Remover aqui não apaga o lançamento original."
              >
                🏠 espelho
              </span>
            )}
            {estaEspelhado && !ehEspelho && (
              <span
                className="ml-1.5 text-[10px] text-[#8FB39A] bg-[#8FB39A]/15 rounded-full px-1.5 py-0.5"
                title="Esta despesa também aparece na conta da casa"
              >
                🏠 {nomeContaEspelho ?? 'na casa'}
              </span>
            )}
            {marca && (
              <span
                className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-[#5f8a6d] dark:text-[#8FB39A] bg-[#8FB39A]/20 rounded-full px-1.5 py-0.5"
                title={`Já movido para ${marca.destinoNome} (marca do seu aparelho, some em 7 dias)`}
              >
                <Check size={9} /> {rotuloMarca(marca)}
              </span>
            )}
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
