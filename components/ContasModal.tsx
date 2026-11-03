'use client'

import { useState } from 'react'
import {
  Trash2, X, Plus, Users, UserPlus, Loader2, Mail, Copy, Check,
  Home, User, Link2, MessageCircle, Pencil, Layers,
} from 'lucide-react'
import { type Conta, fmt, parsearValor, mascaraReal } from './FinanceApp'
import { normalizarRotuloSoma, podeEditarConta, podeExcluirConta } from '@/lib/contas-logic'

const CORES_CONTA = ['#8FB39A','#B8A9D4','#D4A0A0','#E8A87C','#A0B8D4','#A0D4C4','#E8C4A0','#2D2A26']
const EMOJIS_CONTA = ['🏦','💳','💰','🏧','💵','🪙','💼','🏪']

export interface ConviteGerado {
  link: string
  whatsapp: string
  message: string
  diasValidade?: number
}

interface Props {
  contas: Conta[]
  onClose: () => void
  mesSelecionado: string
  onAdd: (c: { nome: string; cor: string; emoji: string; saldoInicial: string; saldoInicialMes: string; tipo: 'pessoal' | 'casa' }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onGerarConvite: (contaId: string, email?: string) => Promise<ConviteGerado | { erro: string }>
  onRemoveMembro: (contaId: string, memberId: string) => Promise<void>
  onEditarConta: (conta: Conta) => void
  rotuloSoma: string
  somaVisivel: boolean
  onSalvarAjustesSoma: (rotulo: string, visivel: boolean) => void
}

export default function ContasModal({
  contas, onClose, mesSelecionado, onAdd, onDelete, onGerarConvite, onRemoveMembro, onEditarConta,
  rotuloSoma, somaVisivel, onSalvarAjustesSoma,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES_CONTA[0])
  const [emoji, setEmoji] = useState(EMOJIS_CONTA[0])
  const [saldoTexto, setSaldoTexto] = useState('')
  const [novoTipo, setNovoTipo] = useState<'pessoal' | 'casa'>('pessoal')
  const [saving, setSaving] = useState(false)

  const [inviteContaId, setInviteContaId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [convite, setConvite] = useState<ConviteGerado | null>(null)
  const [erroConvite, setErroConvite] = useState('')
  const [inviting, setInviting] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [textoSoma, setTextoSoma] = useState(rotuloSoma)
  const [verSoma, setVerSoma] = useState(somaVisivel)
  const [ajusteSalvo, setAjusteSalvo] = useState(false)

  const salvar = async () => {
    if (!nome.trim()) return
    setSaving(true)
    await onAdd({
      nome: nome.trim(), cor, emoji,
      saldoInicial: (parsearValor(saldoTexto) || 0).toFixed(2),
      saldoInicialMes: mesSelecionado,
      tipo: novoTipo,
    })
    setNome(''); setSaldoTexto(''); setAdding(false); setSaving(false)
  }

  const gerarConvite = async () => {
    if (!inviteContaId) return
    setInviting(true)
    setErroConvite('')
    setConvite(null)
    const resultado = await onGerarConvite(inviteContaId, inviteEmail.trim() || undefined)
    if ('erro' in resultado) setErroConvite(resultado.erro)
    else setConvite(resultado)
    setInviting(false)
  }

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Fallback para navegador sem clipboard (ou sem HTTPS)
      setErroConvite('Não consegui copiar. Toque e segure no link para copiar manualmente.')
    }
  }

  const fecharConvite = () => {
    setInviteContaId(null); setInviteEmail(''); setConvite(null); setErroConvite(''); setCopiado(false)
  }

  const temPessoal = contas.some(c => (c.tipo ?? 'pessoal') === 'pessoal')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#342F2B] rounded-3xl w-full max-w-sm shadow-xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4 max-h-[85dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#2D2A26] dark:text-[#E8E0D5] flex items-center gap-2">
            <Users size={16} className="text-[#8FB39A]" /> Contas
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#FAF6F1] dark:hover:bg-[#3E3935] text-[#8C857C] transition">
            <X size={16} />
          </button>
        </div>

        <p className="text-[11px] text-[#8C857C] dark:text-[#9E9890]">
          <strong>Pessoal</strong> é só sua. <strong>Casa</strong> é compartilhada: quem entra vê e lança junto.
          Use o ✏️ para renomear.
        </p>

        {/* A visão somada não é conta: é a soma. Aqui só se ajusta o rótulo. */}
        <div className="rounded-2xl border border-dashed border-[rgba(45,42,38,0.18)] dark:border-[rgba(255,255,255,0.14)] p-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <Layers size={14} className="text-[#8FB39A] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#2D2A26] dark:text-[#E8E0D5]">Visão somada</p>
              <p className="text-[10px] text-[#8C857C] dark:text-[#9E9890] leading-relaxed">
                Não é uma conta: ela mostra a <strong>soma</strong> das suas contas. Nada é lançado nela,
                então renomear aqui não move lançamentos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={textoSoma}
              onChange={e => { setTextoSoma(e.target.value); setAjusteSalvo(false) }}
              maxLength={18}
              aria-label="Nome da visão somada"
              placeholder="Somar tudo"
              className="flex-1 min-w-0 rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-3 py-2 text-xs text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50"
            />
            <button
              onClick={() => {
                onSalvarAjustesSoma(textoSoma, verSoma)
                setTextoSoma(normalizarRotuloSoma(textoSoma))
                setAjusteSalvo(true)
              }}
              className="shrink-0 rounded-xl bg-[#8FB39A] text-white text-xs font-bold px-3 py-2 active:scale-95 transition"
            >
              {ajusteSalvo ? 'Salvo' : 'Salvar'}
            </button>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-[#8C857C] dark:text-[#9E9890]">
            <input
              type="checkbox"
              checked={verSoma}
              onChange={e => { setVerSoma(e.target.checked); setAjusteSalvo(false); onSalvarAjustesSoma(textoSoma, e.target.checked) }}
              className="w-4 h-4 rounded accent-[#8FB39A]"
            />
            Mostrar essa visão na barra (se desmarcar, ela continua acessível quando estiver ativa)
          </label>
        </div>

        {contas.length === 0 && !adding && (
          <p className="text-sm text-[#8C857C] text-center py-4">Nenhuma conta ainda.</p>
        )}

        {contas.map(c => {
          const tipo = c.tipo ?? 'pessoal'
          const ativos = c.membros.filter(m => m.status === 'active')
          const pendentes = c.membros.filter(m => m.status === 'pending')
          return (
            <div key={c.id} className="bg-[#FAF6F1] dark:bg-[#3E3935] rounded-2xl p-3 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xl">{c.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#2D2A26] dark:text-[#E8E0D5] text-sm flex items-center gap-1.5">
                    {c.nome}
                    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 ${
                      tipo === 'casa'
                        ? 'bg-[#8FB39A]/20 text-[#5f8a6d] dark:text-[#8FB39A]'
                        : 'bg-[#8C857C]/15 text-[#8C857C]'
                    }`}>
                      {tipo === 'casa' ? <><Home size={8} /> casa</> : <><User size={8} /> pessoal</>}
                    </span>
                  </p>
                  <p className="text-xs text-[#8C857C]">Saldo inicial: {fmt(parsearValor(c.saldoInicial))}</p>
                </div>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                {podeEditarConta({ tipo, isOwner: c.isOwner }) && (
                  <button
                    onClick={() => onEditarConta(c)}
                    className="p-1.5 rounded-full text-[#8C857C] hover:text-[#8FB39A] hover:bg-[#8FB39A]/10 transition"
                    aria-label={`Renomear a conta ${c.nome}`}
                    title="Renomear / trocar cor"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                {podeExcluirConta({ tipo, isOwner: c.isOwner }) && (
                  <button
                    onClick={() => {
                      if (confirm(`Excluir a conta "${c.nome}"?\n\nOs lançamentos continuam no app, mas ficam sem conta.`)) onDelete(c.id)
                    }}
                    className="p-1.5 rounded-full text-[#8C857C] hover:text-[#D4A0A0] hover:bg-[#D4A0A0]/10 transition"
                    aria-label={`Excluir a conta ${c.nome}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Pessoas na conta */}
              {c.membros.length > 0 && (
                <div className="space-y-1 pl-1">
                  {c.membros.map(m => (
                    <div key={m.id} className="flex items-center gap-2 text-xs text-[#8C857C]">
                      <Users size={11} className="shrink-0" />
                      <span className="flex-1 truncate">
                        {m.userName ?? m.inviteEmail ?? 'Convite aberto'}
                        {m.status === 'pending' && (
                          <span className="ml-1 text-[#E8A87C]">
                            (convite pendente{typeof m.conviteExpiraEmDias === 'number' ? ` · ${m.conviteExpiraEmDias}d` : ''})
                          </span>
                        )}
                      </span>
                      {c.isOwner && (
                        <button onClick={() => onRemoveMembro(c.id, m.id)} className="hover:text-[#D4A0A0] transition" aria-label="Remover pessoa">
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Convite por link */}
              {c.isOwner && (
                inviteContaId === c.id ? (
                  <div className="space-y-2">
                    {convite ? (
                      <>
                        <div className="flex items-center gap-2 text-xs text-[#8FB39A] bg-[#8FB39A]/10 rounded-xl px-3 py-2">
                          <Check size={12} /> {convite.message}
                        </div>
                        <p className="text-[11px] text-[#2D2A26] dark:text-[#C8C0B5] bg-white dark:bg-[#2B2825] border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2 break-all select-all">
                          {convite.link}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => copiar(convite.link)}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#8FB39A] text-white text-xs font-bold py-2.5 active:scale-95 transition"
                          >
                            {copiado ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar link</>}
                          </button>
                          <a
                            href={convite.whatsapp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] text-white text-xs font-bold py-2.5 active:scale-95 transition"
                          >
                            <MessageCircle size={12} /> WhatsApp
                          </a>
                        </div>
                        <button onClick={fecharConvite} className="w-full text-[11px] text-[#8C857C] py-1">
                          Fechar
                        </button>
                      </>
                    ) : (
                      <>
                        {erroConvite && (
                          <p className="text-[11px] text-[#D4A0A0] bg-[#D4A0A0]/10 rounded-xl px-3 py-2">{erroConvite}</p>
                        )}
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C857C]" />
                            <input
                              type="email"
                              inputMode="email"
                              autoCapitalize="none"
                              placeholder="e-mail (opcional)"
                              value={inviteEmail}
                              onChange={e => { setInviteEmail(e.target.value); setErroConvite('') }}
                              onKeyDown={e => e.key === 'Enter' && gerarConvite()}
                              className="w-full rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] dark:bg-[#2B2825] dark:text-[#E8E0D5] pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#8FB39A]/50"
                            />
                          </div>
                          <button
                            onClick={gerarConvite}
                            disabled={inviting}
                            className="px-3 rounded-xl bg-[#8FB39A] text-white text-sm font-semibold disabled:opacity-60 active:scale-95 transition flex items-center gap-1"
                          >
                            {inviting ? <Loader2 size={13} className="animate-spin" /> : <><Link2 size={12} /> Gerar</>}
                          </button>
                          <button onClick={fecharConvite} className="px-2 rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] text-[#8C857C] active:scale-95 transition" aria-label="Cancelar">
                            <X size={13} />
                          </button>
                        </div>
                        <p className="text-[10px] text-[#8C857C]">
                          Gera um link de 7 dias. Funciona mesmo para quem ainda não tem conta.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => { setInviteContaId(c.id); setConvite(null); setErroConvite(''); setInviteEmail('') }}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-[#8C857C] hover:text-[#8FB39A] py-1 transition"
                  >
                    <UserPlus size={12} /> Convidar por link
                  </button>
                )
              )}

              {tipo === 'casa' && pendentes.length > 0 && (
                <p className="text-[10px] text-[#8C857C] pl-1">
                  {pendentes.length} convite(s) aguardando aceite.
                </p>
              )}
              {tipo === 'casa' && ativos.length === 0 && pendentes.length === 0 && (
                <p className="text-[10px] text-[#8C857C] pl-1">Ninguém entrou ainda — gere um convite.</p>
              )}
            </div>
          )
        })}

        {adding ? (
          <div className="space-y-3 border border-[#8FB39A]/40 rounded-2xl p-4">
            <input
              type="text"
              placeholder={novoTipo === 'casa' ? 'Nome da casa (ex: Casa)' : 'Nome da conta (ex: Nubank)'}
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] px-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setNovoTipo('pessoal')}
                disabled={temPessoal}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition ${
                  novoTipo === 'pessoal' ? 'bg-[#2D2A26] text-white' : 'bg-[#FAF6F1] dark:bg-[#3E3935] text-[#8C857C]'
                } disabled:opacity-40`}
              >
                <User size={12} /> Pessoal
              </button>
              <button
                onClick={() => setNovoTipo('casa')}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition ${
                  novoTipo === 'casa' ? 'bg-[#2D2A26] text-white' : 'bg-[#FAF6F1] dark:bg-[#3E3935] text-[#8C857C]'
                }`}
              >
                <Home size={12} /> Casa
              </button>
            </div>
            {temPessoal && novoTipo === 'pessoal' && (
              <p className="text-[10px] text-[#8C857C]">Você já tem uma conta pessoal (só pode haver uma).</p>
            )}

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8C857C] text-sm font-semibold">R$</span>
              <input
                type="text" inputMode="numeric" placeholder="Saldo inicial (opcional)"
                value={saldoTexto} onChange={e => setSaldoTexto(mascaraReal(e.target.value))}
                className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-[#FAF6F1] dark:bg-[#3E3935] pl-10 pr-4 py-3 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50"
              />
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {CORES_CONTA.map(k => (
                <button key={k} onClick={() => setCor(k)} style={{ backgroundColor: k }}
                  className={`w-6 h-6 rounded-full ${cor === k ? 'ring-2 ring-offset-2 ring-[#2D2A26]' : ''}`} aria-label={`Cor ${k}`} />
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {EMOJIS_CONTA.map(e => (
                <button key={e} onClick={() => setEmoji(e)}
                  className={`w-8 h-8 rounded-xl text-lg ${emoji === e ? 'bg-[#8FB39A]/20' : ''}`}>{e}</button>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={salvar} disabled={saving || !nome.trim()}
                className="flex-1 rounded-full bg-[#8FB39A] text-white font-bold py-2.5 text-sm disabled:opacity-60 active:scale-95 transition flex items-center justify-center gap-1.5">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Criar
              </button>
              <button onClick={() => setAdding(false)} className="px-4 rounded-full border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] text-[#8C857C] text-sm active:scale-95 transition">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 rounded-full border border-dashed border-[#8FB39A]/60 text-[#8FB39A] text-sm font-semibold py-2.5 active:scale-95 transition"
          >
            <Plus size={14} /> Nova conta ou casa
          </button>
        )}
      </div>
    </div>
  )
}
