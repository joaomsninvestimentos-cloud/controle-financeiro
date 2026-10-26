'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, Send, Loader2, Bot, ChevronDown, Sparkles, Lightbulb, Check } from 'lucide-react'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

interface Ideia {
  id: string
  titulo: string
  descricao: string
  justificativa: string
  impacto: string
  status: string
  createdAt?: string
}

const SUGESTOES = [
  'Como está meu saldo este mês?',
  'Onde estou gastando mais?',
  'Compare este mês com o anterior',
  'O que ainda não anotei que deveria?',
  'Sugira melhorias para o app',
]

interface Props {
  mesSelecionado: string
}

export default function ChatAssistant({ mesSelecionado }: Props) {
  const [aberto, setAberto] = useState(false)
  const [aba, setAba] = useState<'chat' | 'ideias'>('chat')
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou o **FinBot**.\n\nAnaliso só os seus lançamentos deste mês, sigo o que você pedir e, se vir algo que o app ainda não faz, anoto a ideia para o desenvolvedor.\n\nO que deseja saber?',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [ideias, setIdeias] = useState<Ideia[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const carregarIdeias = useCallback(() => {
    fetch('/api/melhorias')
      .then(r => r.json())
      .then(d => setIdeias(d.melhorias ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!aberto && msgs.length > 1) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 3000)
      return () => clearTimeout(t)
    }
  }, [msgs.length, aberto])

  useEffect(() => {
    if (aberto) setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [msgs, aberto, aba])

  useEffect(() => {
    if (aberto && aba === 'chat') setTimeout(() => inputRef.current?.focus(), 180)
  }, [aberto, aba])

  useEffect(() => {
    if (aberto && aba === 'ideias') carregarIdeias()
  }, [aberto, aba, carregarIdeias])

  const enviar = useCallback(async (texto?: string) => {
    const pergunta = (texto ?? input).trim()
    if (!pergunta || loading) return

    const novasMsgs: Msg[] = [...msgs, { role: 'user', content: pergunta }]
    setMsgs(novasMsgs)
    setInput('')
    setLoading(true)
    setAba('chat')

    try {
      const historico = novasMsgs.filter((_, i) => i > 0).slice(-16)
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historico, mes: mesSelecionado }),
      })
      const data = await res.json() as { reply?: string; error?: string; ideasSaved?: number }

      let reply = data.reply
      if (!res.ok) {
        if (data.error === 'LLM_NOT_CONFIGURED') {
          reply = 'A IA ainda não está configurada neste ambiente. Peça ao desenvolvedor para definir USER_LLM_BASE_URL e USER_LLM_API_KEY.'
        } else if (data.error === 'UNAUTHORIZED') {
          reply = 'Sua sessão expirou. Saia e entre de novo.'
        } else {
          reply = 'Não consegui responder agora. Tente de novo em instantes.'
        }
      }

      setMsgs(prev => [...prev, {
        role: 'assistant',
        content: reply ?? 'Desculpe, não consegui processar sua pergunta.',
      }])
      if ((data.ideasSaved ?? 0) > 0) carregarIdeias()
    } catch {
      setMsgs(prev => [...prev, {
        role: 'assistant',
        content: 'Erro de conexão. Verifique sua internet e tente novamente.',
      }])
    } finally {
      setLoading(false)
    }
  }, [input, msgs, loading, mesSelecionado, carregarIdeias])

  const marcar = async (id: string, status: Ideia['status']) => {
    const res = await fetch('/api/melhorias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (res.ok) {
      const { melhoria } = await res.json() as { melhoria: Ideia }
      setIdeias(prev => prev.map(i => i.id === id ? melhoria : i))
    }
  }

  function renderMd(text: string) {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g)
      const rendered = parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)
      if (line.startsWith('- ') || line.startsWith('• ')) {
        return <li key={i} className="ml-3 list-disc">{rendered}</li>
      }
      if (line === '') return <div key={i} className="h-1.5" />
      return <p key={i} className="leading-relaxed">{rendered}</p>
    })
  }

  const novasCount = ideias.filter(i => i.status === 'nova').length

  return (
    <>
      <button
        onClick={() => setAberto(v => !v)}
        className={`fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-90
          ${aberto ? 'bg-[#2D2A26] dark:bg-[#E8E0D5] rotate-0' : 'bg-[#8FB39A] hover:bg-[#7ea389]'}
          ${pulse ? 'ring-4 ring-[#8FB39A]/40 ring-offset-2 animate-pulse' : ''}
        `}
        aria-label="Assistente financeiro"
      >
        {aberto
          ? <X size={22} className="text-white dark:text-[#2D2A26]" />
          : <MessageCircle size={22} className="text-white" />}
        {!aberto && novasCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#D4A0A0] rounded-full text-[10px] text-white font-bold flex items-center justify-center">
            {novasCount}
          </span>
        )}
      </button>

      {aberto && (
        <div
          className="fixed bottom-24 right-4 z-40 w-[min(92vw,380px)] bg-white dark:bg-[#342F2B] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[rgba(45,42,38,0.08)] dark:border-[rgba(255,255,255,0.08)]"
          style={{ maxHeight: 'min(75vh, 560px)' }}
        >
          <div className="bg-gradient-to-r from-[#8FB39A] to-[#7ea389] px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Bot size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">FinBot</p>
              <p className="text-white/70 text-[10px]">Segue suas perguntas · ideias vão ao desenvolvedor</p>
            </div>
            <button onClick={() => setAberto(false)} className="p-1.5 rounded-full hover:bg-white/20 text-white/70 hover:text-white transition-colors">
              <ChevronDown size={16} />
            </button>
          </div>

          <div className="flex bg-[#FAF6F1] dark:bg-[#3E3935] px-2 pt-2 gap-1">
            <button
              onClick={() => setAba('chat')}
              className={`flex-1 rounded-t-xl py-2 text-xs font-bold ${aba === 'chat' ? 'bg-white dark:bg-[#342F2B] text-[#2D2A26] dark:text-[#E8E0D5]' : 'text-[#8C857C]'}`}
            >
              Conversa
            </button>
            <button
              onClick={() => setAba('ideias')}
              className={`flex-1 rounded-t-xl py-2 text-xs font-bold flex items-center justify-center gap-1 ${aba === 'ideias' ? 'bg-white dark:bg-[#342F2B] text-[#2D2A26] dark:text-[#E8E0D5]' : 'text-[#8C857C]'}`}
            >
              <Lightbulb size={12} /> Ideias
              {novasCount > 0 && (
                <span className="bg-[#D4A0A0] text-white text-[9px] rounded-full px-1.5">{novasCount}</span>
              )}
            </button>
          </div>

          {aba === 'chat' ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#FAF6F1]/60 dark:bg-[#2B2825]">
                {msgs.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                    {msg.role === 'assistant' && (
                      <div className="w-6 h-6 rounded-full bg-[#8FB39A]/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot size={12} className="text-[#8FB39A]" />
                      </div>
                    )}
                    <div
                      className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-[13px] ${
                        msg.role === 'user'
                          ? 'bg-[#2D2A26] text-white rounded-br-sm'
                          : 'bg-white dark:bg-[#3E3935] text-[#2D2A26] dark:text-[#E8E0D5] rounded-bl-sm shadow-snug'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="space-y-0.5">{renderMd(msg.content)}</div>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#8FB39A]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={12} className="text-[#8FB39A]" />
                    </div>
                    <div className="bg-white dark:bg-[#3E3935] rounded-2xl rounded-bl-sm px-4 py-3 shadow-snug flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#8FB39A] rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                      <span className="w-1.5 h-1.5 bg-[#8FB39A] rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                      <span className="w-1.5 h-1.5 bg-[#8FB39A] rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {msgs.length === 1 && !loading && (
                <div className="px-3 pt-2 pb-1 flex gap-2 overflow-x-auto no-scrollbar border-t border-[rgba(45,42,38,0.06)] dark:border-[rgba(255,255,255,0.06)]">
                  {SUGESTOES.map(s => (
                    <button
                      key={s}
                      onClick={() => enviar(s)}
                      className="shrink-0 text-[11px] bg-[#8FB39A]/10 text-[#8FB39A] font-semibold rounded-full px-3 py-1.5 hover:bg-[#8FB39A]/20 transition-colors active:scale-95 whitespace-nowrap"
                    >
                      <Sparkles size={9} className="inline mr-1" />{s}
                    </button>
                  ))}
                </div>
              )}

              <div className="px-3 pb-3 pt-2 border-t border-[rgba(45,42,38,0.06)] dark:border-[rgba(255,255,255,0.06)] bg-white dark:bg-[#342F2B]">
                <div className="flex gap-2 items-center bg-[#FAF6F1] dark:bg-[#3E3935] rounded-2xl px-3 py-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
                    placeholder="Pergunte sobre suas finanças…"
                    disabled={loading}
                    className="flex-1 bg-transparent text-[13px] text-[#2D2A26] dark:text-[#E8E0D5] placeholder-[#8C857C] outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={() => enviar()}
                    disabled={loading || !input.trim()}
                    className="w-8 h-8 rounded-full bg-[#8FB39A] hover:bg-[#7ea389] disabled:opacity-40 flex items-center justify-center transition-all active:scale-90 shrink-0"
                  >
                    {loading ? <Loader2 size={14} className="text-white animate-spin" /> : <Send size={14} className="text-white" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-[#FAF6F1]/60 dark:bg-[#2B2825]">
              <p className="text-[11px] text-[#8C857C] px-1">
                Ideias que o FinBot anotou a partir da sua conversa. Marque como feita quando implementar.
              </p>
              {ideias.length === 0 ? (
                <p className="text-sm text-[#8C857C] text-center py-8">
                  Nenhuma ideia ainda. Peça: “Sugira melhorias para o app”.
                </p>
              ) : ideias.map(ideia => (
                <div key={ideia.id} className="bg-white dark:bg-[#3E3935] rounded-2xl p-3 shadow-snug space-y-1">
                  <div className="flex items-start gap-2">
                    <p className="font-bold text-sm text-[#2D2A26] dark:text-[#E8E0D5] flex-1">{ideia.titulo}</p>
                    <span className={`text-[9px] font-bold uppercase rounded-full px-2 py-0.5 ${
                      ideia.impacto === 'alto' ? 'bg-[#D4A0A0]/20 text-[#D4A0A0]' :
                      ideia.impacto === 'baixo' ? 'bg-[#8C857C]/15 text-[#8C857C]' :
                      'bg-[#E8A87C]/20 text-[#E8A87C]'
                    }`}>{ideia.impacto}</span>
                  </div>
                  <p className="text-xs text-[#2D2A26] dark:text-[#C8C0B5]">{ideia.descricao}</p>
                  <p className="text-[11px] text-[#8C857C]">{ideia.justificativa}</p>
                  <div className="flex gap-2 pt-1">
                    {ideia.status !== 'feita' && (
                      <button
                        onClick={() => marcar(ideia.id, 'feita')}
                        className="text-[11px] font-semibold text-[#8FB39A] flex items-center gap-1"
                      >
                        <Check size={11} /> Feita
                      </button>
                    )}
                    {ideia.status !== 'descartada' && ideia.status !== 'feita' && (
                      <button
                        onClick={() => marcar(ideia.id, 'descartada')}
                        className="text-[11px] font-semibold text-[#8C857C]"
                      >
                        Descartar
                      </button>
                    )}
                    {ideia.status === 'feita' && (
                      <span className="text-[11px] text-[#8FB39A] font-semibold">Implementada</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
