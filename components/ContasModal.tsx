'use client'

import { useEffect, useState } from 'react'
import { Trash2, X, Plus, Users, UserPlus, Loader2, Mail, CheckCircle, ArrowRightLeft } from 'lucide-react'
import { type Conta, fmt, parsearValor, mascaraReal, fmtMes } from './FinanceApp'

const CORES_CONTA = ['#8FB39A','#B8A9D4','#D4A0A0','#E8A87C','#A0B8D4','#A0D4C4','#E8C4A0','#2D2A26']
const EMOJIS_CONTA = ['🏦','💳','💰','🏧','💵','🪙','💼','🏪']

export type MoveResult = {
  ok: boolean
  fixas: number
  lancamentos: number
  orcamentos: number
  orcamentosIgnorados: number
}

interface Props {
  contas: Conta[]
  onClose: () => void
  mesSelecionado: string
  onAdd: (c: { nome: string; cor: string; emoji: string; saldoInicial: string; saldoInicialMes: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onInvite: (contaId: string, email: string) => Promise<string>
  onRemoveMembro: (contaId: string, memberId: string) => Promise<void>
  onPreviewMove: (deContaId: string, paraContaId: string, incluirLancamentos: boolean, incluirOrcamentos: boolean) => Promise<MoveResult | null>
  onMove: (deContaId: string, paraContaId: string, incluirLancamentos: boolean, incluirOrcamentos: boolean) => Promise<MoveResult | null>
}

export default function ContasModal({
  contas, onClose, mesSelecionado, onAdd, onDelete, onInvite, onRemoveMembro, onPreviewMove, onMove,
}: Props) {
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

  const [moveContaId, setMoveContaId] = useState<string | null>(null)
  const [paraContaId, setParaContaId] = useState('')
  const [incluirLancamentos, setIncluirLancamentos] = useState(true)
  const [incluirOrcamentos, setIncluirOrcamentos] = useState(false)
  const [preview, setPreview] = useState<MoveResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveMsg, setMoveMsg] = useState('')
  const [confirmMove, setConfirmMove] = useState(false)

  useEffect(() => {
    if (!moveContaId || !paraContaId) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewing(true)
    onPreviewMove(moveContaId, paraContaId, incluirLancamentos, incluirOrcamentos)
      .then(res => { if (!cancelled) setPreview(res) })
      .finally(() => { if (!cancelled) setPreviewing(false) })
    return () => { cancelled = true }
  }, [moveContaId, paraContaId, incluirLancamentos, incluirOrcamentos, onPreviewMove])

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
      <div className="bg-white dark:bg-[#342F2B] rounded-3xl w-full max-w-sm shadow-xl p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#2D2A26] dark:text-[#E8E0D5]">Contas</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#FAF6F1] dark:hover:bg-[#3E3935] text-[#8C857C] transition"><X size={16}/></button>
        </div>

        {contas.length === 0 && !adding && (
          <p className="text-sm text-[#8C857C] text-center py-4">Nenhuma conta cadastrada ainda.</p>
        )}

        {contas.map(c => (
          <div key={c.id} className="bg-[#FAF6F1] dark:bg-[#3E3935] rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xl">{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#2D2A26] dark:text-[#E8E0D5] text-sm">{c.nome}</p>
                <p className="text-xs text-[#8C857C] dark:text-[#9E9890]">Saldo inicial: {fmt(parsearValor(c.saldoInicial))}</p>
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

            {/* Transferir para outra conta */}
            {c.isOwner && contas.length > 1 && (
              moveContaId === c.id ? (
                <div className="space-y-2 pt-1 border-t border-[rgba(45,42,38,0.08)]">
                  <p className="text-xs font-semibold text-[#2D2A26] dark:text-[#E8E0D5]">Transferir registros</p>
                  <select
                    value={paraContaId}
                    onChange={e => { setParaContaId(e.target.value); setConfirmMove(false); setMoveMsg('') }}
                    className="w-full rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] bg-white dark:bg-[#3E3935] px-3 py-2 text-sm text-[#2D2A26] dark:text-[#E8E0D5] outline-none focus:ring-2 focus:ring-[#8FB39A]/50"
                  >
                    <option value="">Selecionar conta destino</option>
                    {contas.filter(d => d.id !== c.id).map(d => (
                      <option key={d.id} value={d.id}>{d.emoji} {d.nome}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-[#2D2A26] dark:text-[#E8E0D5]">
                    <input
                      type="checkbox"
                      checked={incluirLancamentos}
                      onChange={e => { setIncluirLancamentos(e.target.checked); setConfirmMove(false) }}
                      className="w-4 h-4 accent-[#8FB39A]"
                    />
                    Incluir lançamentos avulsos
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[#2D2A26] dark:text-[#E8E0D5]">
                    <input
                      type="checkbox"
                      checked={incluirOrcamentos}
                      onChange={e => { setIncluirOrcamentos(e.target.checked); setConfirmMove(false) }}
                      className="w-4 h-4 accent-[#8FB39A]"
                    />
                    Incluir orçamentos
                  </label>
                  {previewing && <p className="text-[10px] text-[#8C857C]">Contando registros...</p>}
                  {preview && paraContaId && (
                    <p className="text-[11px] text-[#8C857C] dark:text-[#9E9890] leading-relaxed">
                      {preview.fixas} fixa{preview.fixas === 1 ? '' : 's'}
                      {incluirLancamentos ? ` · ${preview.lancamentos} lançamento${preview.lancamentos === 1 ? '' : 's'}` : ''}
                      {incluirOrcamentos ? ` · ${preview.orcamentos} orçamento${preview.orcamentos === 1 ? '' : 's'}` : ''}
                      {preview.orcamentosIgnorados > 0 ? ` (${preview.orcamentosIgnorados} já existiam no destino)` : ''}
                    </p>
                  )}
                  {moveMsg && (
                    <div className="flex items-center gap-2 text-xs text-[#8FB39A] bg-[#8FB39A]/10 rounded-xl px-3 py-2">
                      <CheckCircle size={12}/> {moveMsg}
                    </div>
                  )}
                  {confirmMove ? (
                    <div className="flex gap-2">
                      <button
                        disabled={moving || !paraContaId}
                        onClick={async () => {
                          if (!paraContaId) return
                          setMoving(true)
                          const res = await onMove(c.id, paraContaId, incluirLancamentos, incluirOrcamentos)
                          setMoving(false)
                          if (res?.ok) {
                            setMoveMsg(`Transferidos: ${res.fixas} fixas, ${res.lancamentos} lançamentos, ${res.orcamentos} orçamentos.`)
                            setConfirmMove(false)
                            setPreview(res)
                          } else {
                            setMoveMsg('Não foi possível transferir.')
                          }
                        }}
                        className="flex-1 rounded-xl bg-[#8FB39A] text-white text-xs font-semibold py-2 disabled:opacity-60 hover:bg-[#7ea389] transition active:scale-95"
                      >
                        {moving ? <Loader2 size={13} className="animate-spin mx-auto"/> : 'Confirmar transferência'}
                      </button>
                      <button
                        onClick={() => setConfirmMove(false)}
                        className="px-3 rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] text-[#8C857C] text-xs font-semibold hover:bg-[#FAF6F1] dark:hover:bg-[#3E3935] transition"
                      >
                        Voltar
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        disabled={!paraContaId || previewing}
                        onClick={() => setConfirmMove(true)}
                        className="flex-1 rounded-xl bg-[#8FB39A] text-white text-xs font-semibold py-2 disabled:opacity-60 hover:bg-[#7ea389] transition active:scale-95"
                      >
                        Transferir
                      </button>
                      <button
                        onClick={() => {
                          setMoveContaId(null)
                          setParaContaId('')
                          setPreview(null)
                          setMoveMsg('')
                          setConfirmMove(false)
                          setIncluirLancamentos(true)
                          setIncluirOrcamentos(false)
                        }}
                        className="px-3 rounded-xl border border-[rgba(45,42,38,0.12)] dark:border-[rgba(255,255,255,0.07)] text-[#8C857C] hover:bg-[#FAF6F1] dark:hover:bg-[#3E3935] transition"
                      >
                        <X size={13}/>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setMoveContaId(c.id)
                    setParaContaId('')
                    setPreview(null)
                    setMoveMsg('')
                    setConfirmMove(false)
                    setIncluirLancamentos(true)
                    setIncluirOrcamentos(false)
                    setInviteContaId(null)
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-[#8C857C] hover:text-[#8FB39A] py-1 transition"
                >
                  <ArrowRightLeft size={12}/> Transferir para outra conta
                </button>
              )
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
