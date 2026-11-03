'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Loader2, CheckCircle2, XCircle, Users, Home } from 'lucide-react'

interface Info {
  valido: boolean
  motivo?: 'invalido' | 'expirado' | 'usado'
  contaNome?: string
  contaEmoji?: string
  donoNome?: string
  expiraEmDias?: number
  jaMembro?: boolean
  logado?: boolean
  usuario?: { name: string; email: string } | null
}

const MENSAGENS: Record<string, { titulo: string; texto: string }> = {
  invalido: {
    titulo: 'Convite não encontrado',
    texto: 'Este link pode ter sido copiado errado ou o convite foi removido. Peça um novo convite a quem te chamou.',
  },
  expirado: {
    titulo: 'Convite expirado',
    texto: 'Convites valem por 7 dias. Peça um novo link para quem te convidou.',
  },
  usado: {
    titulo: 'Convite já utilizado',
    texto: 'Este convite já foi aceito por outra pessoa. Peça um novo link.',
  },
}

export default function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [info, setInfo] = useState<Info | null>(null)
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const carregar = useCallback(() => {
    fetch(`/api/convites/${token}`)
      .then(r => r.json())
      .then(d => setInfo(d as Info))
      .catch(() => setErro('Sem conexão. Verifique sua internet.'))
  }, [token])

  useEffect(() => { carregar() }, [carregar])

  const aceitar = async () => {
    if (!info?.logado) {
      // volta para o convite depois do login
      const destino = encodeURIComponent(`/convite/${token}`)
      router.push(`/login?voltar=${destino}`)
      return
    }

    setEntrando(true)
    setErro('')
    try {
      const res = await fetch(`/api/convites/${token}`, { method: 'POST' })
      const data = await res.json().catch(() => ({})) as { contaNome?: string; motivo?: string }

      if (res.ok) {
        setSucesso(data.contaNome ?? info.contaNome ?? 'a conta')
        setTimeout(() => router.push('/'), 1200)
        return
      }

      if (data.motivo && MENSAGENS[data.motivo]) {
        setInfo(i => ({ ...(i ?? { valido: false }), valido: false, motivo: data.motivo as Info['motivo'] }))
      } else {
        setErro('Não foi possível entrar agora. Tente de novo.')
      }
    } catch {
      setErro('Sem conexão. Verifique sua internet.')
    } finally {
      setEntrando(false)
    }
  }

  const invalido = info && !info.valido ? MENSAGENS[info.motivo ?? 'invalido'] : null

  return (
    <div className="min-h-[100dvh] bg-[#FAF6F1] font-nunito flex flex-col items-center justify-center px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 mb-7">
        <div className="bg-[#8FB39A] rounded-2xl p-3 shadow-snug">
          <Wallet className="text-white" size={26} />
        </div>
        <div>
          <h1 className="text-[#2D2A26] font-extrabold text-xl leading-tight">Meu Controle</h1>
          <p className="text-[#8C857C] text-xs">Financeiro</p>
        </div>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-snug text-center space-y-4">
        {!info && !erro && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 size={22} className="animate-spin text-[#8FB39A]" />
            <p className="text-sm text-[#8C857C]">Verificando convite…</p>
          </div>
        )}

        {erro && (
          <p role="alert" className="text-sm text-[#D4A0A0] bg-[#D4A0A0]/10 rounded-2xl px-4 py-3">{erro}</p>
        )}

        {invalido && (
          <div className="py-6 space-y-2">
            <XCircle size={34} className="text-[#D4A0A0] mx-auto" />
            <h2 className="font-extrabold text-[#2D2A26]">{invalido.titulo}</h2>
            <p className="text-sm text-[#8C857C]">{invalido.texto}</p>
            <button
              onClick={() => router.push('/')}
              className="mt-3 w-full bg-[#FAF6F1] text-[#2D2A26] font-bold rounded-full py-3 text-sm active:scale-95 transition"
            >
              Ir para o app
            </button>
          </div>
        )}

        {sucesso && (
          <div className="py-6 space-y-2">
            <CheckCircle2 size={34} className="text-[#8FB39A] mx-auto" />
            <h2 className="font-extrabold text-[#2D2A26]">Você entrou em “{sucesso}”</h2>
            <p className="text-sm text-[#8C857C]">Abrindo o app…</p>
          </div>
        )}

        {info?.valido && !sucesso && (
          <>
            <div className="py-2">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-[#8FB39A]/15 flex items-center justify-center text-3xl mb-3">
                {info.contaEmoji ?? <Home size={26} className="text-[#8FB39A]" />}
              </div>
              <h2 className="font-extrabold text-[#2D2A26] text-lg leading-tight">
                {info.donoNome ? `${info.donoNome} te convidou` : 'Você foi convidado(a)'}
              </h2>
              <p className="text-sm text-[#8C857C] mt-1 flex items-center justify-center gap-1.5">
                <Users size={13} /> para a conta <strong className="text-[#2D2A26]">{info.contaNome}</strong>
              </p>
              {typeof info.expiraEmDias === 'number' && (
                <p className="text-[11px] text-[#8C857C] mt-2">
                  Convite válido por {info.expiraEmDias} dia(s).
                </p>
              )}
            </div>

            <p className="text-[11px] text-[#8C857C] bg-[#FAF6F1] rounded-2xl px-3 py-2 text-left">
              Nessa conta vocês dois veem e lançam juntos. Sua conta pessoal continua privada.
            </p>

            <button
              onClick={aceitar}
              disabled={entrando}
              className="w-full bg-[#8FB39A] hover:bg-[#7ea389] active:scale-95 disabled:opacity-60 text-white font-bold rounded-full py-3.5 text-sm transition-all shadow-snug flex items-center justify-center gap-2"
            >
              {entrando && <Loader2 size={16} className="animate-spin" />}
              {info.logado ? `Entrar na conta ${info.contaNome}` : 'Entrar ou criar conta para aceitar'}
            </button>

            {info.logado && info.usuario && (
              <p className="text-[11px] text-[#8C857C]">
                Você está logado como {info.usuario.name} ({info.usuario.email}).
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
