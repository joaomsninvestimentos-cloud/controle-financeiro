'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, Send, Loader2, Bot, ChevronDown, Sparkles } from 'lucide-react'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const SUGESTOES = [
  'Como está meu saldo este mês?',
  'Onde estou gastando mais?',
  'Dicas para economizar no meu perfil',
  'Sugira melhorias para o app',
  'Compare este mês com o anterior',
]

interface Props {
  mesSelecionado: string
}

export default function ChatAssistant({ mesSelecionado }: Props) {
  const [aberto, setAberto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      content: '👋 Olá! Sou o **FinBot**, seu assistente financeiro pessoal.\n\nPosso analisar seus dados do mês, dar dicas de economia, explicar qualquer funcionalidade do app ou sugerir melhorias. O que deseja saber?',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pulse, setPulse] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Pulsar botão quando fechado após resposta
  useEffect(() => {
    if (!aberto && msgs.length > 1) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 3000)
      return () => clearTimeout(t)
    }
  }, [msgs.length, aberto])

  useEffect(() => {
    if (aberto) {
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [msgs, aberto])

  useEffect(() => {
    if (aberto) setTimeout(() => inputRef.current?.focus(), 200)
  }, [aberto])

  const enviar = useCallback(async (texto?: string) => {
    const pergunta = (texto ?? input).trim()
    if (!pergunta || loading) return

    const novasMsgs: Msg[] = [...msgs, { role: 'user', content: pergunta }]
    setMsgs(novasMsgs)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: novasMsgs.filter(m => m.role !== 'assistant' || novasMsgs.indexOf(m) > 0),
          mes: mesSelecionado,
        }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      setMsgs(prev => [...prev, {
        role: 'assistant',
        content: data.reply ?? 'Desculpe, não consegui processar sua pergunta. Tente novamente.',
      }])
    } catch {
      setMsgs(prev => [...prev, {
        role: 'assistant',
        content: 'Erro de conexão. Verifique sua internet e tente novamente.',
      }])
    } finally {
      setLoading(false)
    }
  }, [input, msgs, loading, mesSelecionado])

  // Renderiza markdown simples: **bold**, quebras de linha, listas
  function renderMd(text: string) {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      // Bold
      const parts = line.split(/\*\*(.*?)\*\*/g)
      const rendered = parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)
      // Lista
      if (line.startsWith('- ') || line.startsWith('• ')) {
        return <li key={i} className="ml-3 list-disc">{rendered.slice(1)}</li>
      }
      if (line === '') return <div key={i} className="h-1.5" />
      return <p key={i} className="leading-relaxed">{rendered}</p>
    })
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setAberto(v => !v)}
        className={`fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-90
          ${aberto ? 'bg-[#2D2A26] rotate-0' : 'bg-[#8FB39A] hover:bg-[#7ea389]'}
          ${pulse ? 'ring-4 ring-[#8FB39A]/40 ring-offset-2 animate-pulse' : ''}
        `}
        aria-label="Assistente financeiro"
      >
        {aberto ? <X size={22} className="text-white" /> : <MessageCircle size={22} className="text-white" />}
        {!aberto && msgs.length > 1 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#D4A0A0] rounded-full text-[10px] text-white font-bold flex items-center justify-center">
            {msgs.filter(m => m.role === 'assistant').length}
          </span>
        )}
      </button>

      {/* Janela do chat */}
      {aberto && (
        <div className="fixed bottom-24 right-4 z-40 w-[min(92vw,380px)] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[rgba(45,42,38,0.08)]"
          style={{ maxHeight: 'min(75vh, 560px)' }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#8FB39A] to-[#7ea389] px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Bot size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">FinBot</p>
              <p className="text-white/70 text-[10px]">Assistente financeiro com IA</p>
            </div>
            <button onClick={() => setAberto(false)} className="p-1.5 rounded-full hover:bg-white/20 text-white/70 hover:text-white transition-colors">
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#FAF6F1]/60">
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
                      : 'bg-white text-[#2D2A26] rounded-bl-sm shadow-snug'
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
                <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-snug flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#8FB39A] rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                  <span className="w-1.5 h-1.5 bg-[#8FB39A] rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                  <span className="w-1.5 h-1.5 bg-[#8FB39A] rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Sugestões rápidas (só na primeira mensagem) */}
          {msgs.length === 1 && !loading && (
            <div className="px-3 pt-2 pb-1 flex gap-2 overflow-x-auto no-scrollbar border-t border-[rgba(45,42,38,0.06)]">
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

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-[rgba(45,42,38,0.06)] bg-white">
            <div className="flex gap-2 items-center bg-[#FAF6F1] rounded-2xl px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
                placeholder="Pergunte algo sobre suas finanças…"
                disabled={loading}
                className="flex-1 bg-transparent text-[13px] text-[#2D2A26] placeholder-[#8C857C] outline-none disabled:opacity-50"
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
        </div>
      )}
    </>
  )
}
