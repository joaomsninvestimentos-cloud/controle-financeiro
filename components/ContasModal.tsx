'use client'

import { useState } from 'react'
import { Trash2, X, Plus, Users, UserPlus, Loader2, Mail, CheckCircle } from 'lucide-react'
import { type Conta, fmt, parsearValor, mascaraReal, fmtMes } from './FinanceApp'

const CORES_CONTA = ['#8FB39A','#B8A9D4','#D4A0A0','#E8A87C','#A0B8D4','#A0D4C4','#E8C4A0','#2D2A26']
const EMOJIS_CONTA = ['🏦','💳','💰','🏧','💵','🪙','💼','🏪']

interface Props {
  contas: Conta[]
  onClose: () => void
  mesSelecionado: string
  onAdd: (c: { nome: string; cor: string; emoji: string; saldoInicial: string; saldoInicialMes: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onInvite: (contaId: string, email: string) => Promise<string>
  onRemoveMembro: (contaId: string, memberId: string) => Promise<void>
}

export default function ContasModal({ contas, onClose, mesSelecionado, onAdd, onDelete, onInvite, onRemoveMembro }: Props) {
  const [adding, setAdding] = useState(false)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES_CONTA[0])
  const [emoji, setEmoji] = useState(EMOJIS_CONTA[0])
  const [saldoTexto, setSaldoTexto] = useState('')
  const [saving, setSaving] = useState(false)

  const [inviteContaId, setInviteContaId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMsg, setInviteMsg] = useState('')
  const [inviting, setInviting] = useState(false)

  const salvar = async () => {
    if (!nome.trim()) return
    setSaving(true)
    await onAdd({
      nome: nome.trim(), cor, emoji,
      saldoInicial: (parsearValor(saldoTexto) || 0).toFixed(2),
      saldoInicialMes: mesSelecionado,
    })
    setNome(''); setSaldoTexto(''); setAdding(false); setSaving(false)
  }

  const enviarConvite = async () => {
    if (!inviteContaId || !inviteEmail.trim()) return
    setInviting(true)
    const msg = await onInvite(inviteContaId, inviteEmail.trim())
    setInviteMsg(msg)
    setInviteEmail('')
    setInviting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-xl p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#2D2A26]">🏦 Contas</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#FAF6F1] text-[#8C857C] transition"><X size={16}/></button>
        </div>

        {contas.length === 0 && !adding && (
          <p className="text-sm text-[#8C857C] text-center py-4">Nenhuma conta cadastrada ainda.</p>
        )}

        {contas.map(c => (
          <div key={c.id} className="bg-[#FAF6F1] rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xl">{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#2D2A26] text-sm">{c.nome}</p>
                <p className="text-xs text-[#8C857C]">Saldo inicial: {fmt(parsearValor(c.saldoInicial))}</p>
              </div>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.cor }}/>
              {c.isOwner && (
                <button onClick={() => onDelete(c.id)} className="p-1.5 rounded-full text-[#8C857C] hover:text-[#D4A0A0] hover:bg-[#D4A0A0]/10 transition">
                  <Trash2 size={14}/>
                </button>
              )}
            </div>

            {/* Membros da conta */}
            {c.membros.length > 0 && (
              <div className="space-y-1 pl-1">
                {c.membros.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-xs text-[#8C857C]">
                    <Users size={11} className="shrink-0"/>
                    <span className="flex-1 truncate">
                      {m.userName ?? m.inviteEmail ?? 'Desconhecido'}
                      {m.status === 'pending' && <span className="ml-1 text-[#E8A87C]">(pendente)</span>}
                    </span>
                    {c.isOwner && (
                      <button onClick={() => onRemoveMembro(c.id, m.id)} className="hover:text-[#D4A0A0] transition">
                        <X size={11}/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Botão convidar */}
            {c.isOwner && (
              inviteContaId === c.id ? (
                <div className="space-y-2">
                  {inviteMsg && (
                    <div className="flex items-center gap-2 text-xs text-[#8FB39A] bg-[#8FB39A]/10 rounded-xl px-3 py-2">
                      <CheckCircle size={12}/> {inviteMsg}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C857C]"/>
                      <input
                        type="email"
                        placeholder="email@exemplo.com"
                        value={inviteEmail}
                        onChange={e => { setInviteEmail(e.target.value); setInviteMsg('') }}
                        onKeyDown={e => e.key === 'Enter' && enviarConvite()}
                        className="w-full rounded-xl border border-[rgba(45,42,38,0.12)] bg-white pl-8 pr-3 py-2 text-sm text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50"
                      />
                    </div>
                    <button onClick={enviarConvite} disabled={inviting || !inviteEmail.trim()} className="px-3 rounded-xl bg-[#8FB39A] text-white text-sm font-semibold disabled:opacity-60 hover:bg-[#7ea389] transition active:scale-95">
                      {inviting ? <Loader2 size={13} className="animate-spin"/> : 'OK'}
                    </button>
                    <button onClick={() => { setInviteContaId(null); setInviteMsg('') }} className="px-2 rounded-xl border border-[rgba(45,42,38,0.12)] text-[#8C857C] hover:bg-[#FAF6F1] transition">
                      <X size={13}/>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setInviteContaId(c.id); setInviteMsg('') }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-[#8C857C] hover:text-[#8FB39A] py-1 transition"
                >
                  <UserPlus size={12}/> Convidar pessoa para esta conta
                </button>
              )
            )}
          </div>
        ))}

        {adding ? (
          <div className="space-y-3 border border-[#8FB39A]/40 rounded-2xl p-4">
            <input
              type="text"
              placeholder="Nome da conta (ex: Nubank)"
              value={nome}
              onChange={e=>setNome(e.target.value)}
              className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] bg-[#FAF6F1] px-4 py-3 text-sm text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50"
            />
            <div>
              <p className="text-xs text-[#8C857C] mb-2 font-semibold">Emoji</p>
              <div className="flex gap-2 flex-wrap">
                {EMOJIS_CONTA.map(e => (
                  <button key={e} onClick={()=>setEmoji(e)} className={`text-xl p-1.5 rounded-xl transition ${emoji===e?'bg-[#8FB39A]/20 ring-2 ring-[#8FB39A]':'hover:bg-[#FAF6F1]'}`}>{e}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-[#8C857C] mb-2 font-semibold">Cor</p>
              <div className="flex gap-2 flex-wrap">
                {CORES_CONTA.map(c => (
                  <button key={c} onClick={()=>setCor(c)} className={`w-7 h-7 rounded-full transition ${cor===c?'ring-2 ring-offset-2 ring-[#2D2A26]':''}`} style={{backgroundColor:c}}/>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-[#8C857C] mb-1 font-semibold">Saldo atual na conta</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8C857C] text-sm font-semibold">R$</span>
                <input type="text" inputMode="numeric" placeholder="0,00" value={saldoTexto} onChange={e=>setSaldoTexto(mascaraReal(e.target.value))} className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] bg-[#FAF6F1] pl-10 pr-4 py-3 text-sm text-[#2D2A26] outline-none focus:ring-2 focus:ring-[#8FB39A]/50"/>
              </div>
              <p className="text-[10px] text-[#8C857C] mt-1">Saldo real de início de {fmtMes(mesSelecionado)}.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={salvar} disabled={saving || !nome.trim()} className="flex-1 rounded-full bg-[#8FB39A] hover:bg-[#7ea389] disabled:opacity-60 text-white font-semibold py-2.5 text-sm transition active:scale-95">
                {saving ? <Loader2 size={15} className="animate-spin mx-auto"/> : 'Salvar conta'}
              </button>
              <button onClick={()=>setAdding(false)} className="px-4 rounded-full border border-[rgba(45,42,38,0.12)] text-[#8C857C] text-sm font-semibold hover:bg-[#FAF6F1] transition active:scale-95">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={()=>setAdding(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#8FB39A]/50 text-[#8FB39A] font-semibold py-3 text-sm hover:bg-[#8FB39A]/5 transition active:scale-95"
          >
            <Plus size={16}/> Nova conta
          </button>
        )}
      </div>
    </div>
  )
}
