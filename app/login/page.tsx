'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Eye, EyeOff, Loader2 } from 'lucide-react'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = mode === 'login' ? { email, password } : { name, email, password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        const data = await res.json()
        if (data.error === 'ACCOUNT_ALREADY_EXISTS') {
          setError('Este e-mail já está cadastrado. Tente fazer login.')
        } else if (data.error === 'INVALID_CREDENTIALS') {
          setError('E-mail ou senha incorretos.')
        } else if (data.error === 'INVALID_INPUT') {
          setError('Verifique os campos e tente novamente.')
        } else {
          setError('Algo deu errado. Tente novamente.')
        }
      }
    } catch {
      setError('Sem conexão. Verifique sua internet.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1] font-nunito flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="bg-[#8FB39A] rounded-2xl p-3 shadow-snug">
          <Wallet className="text-white" size={28} />
        </div>
        <div>
          <h1 className="text-[#2D2A26] font-extrabold text-xl leading-tight">Meu Controle</h1>
          <p className="text-[#8C857C] text-xs">Financeiro</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl p-7 shadow-snug">
        {/* Abas */}
        <div className="flex bg-[#FAF6F1] rounded-2xl p-1 mb-6">
          <button
            onClick={() => { setMode('login'); setError('') }}
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition-all ${
              mode === 'login' ? 'bg-white shadow-snug text-[#2D2A26]' : 'text-[#8C857C]'
            }`}
          >
            Entrar
          </button>
          <button
            onClick={() => { setMode('register'); setError('') }}
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition-all ${
              mode === 'register' ? 'bg-white shadow-snug text-[#2D2A26]' : 'text-[#8C857C]'
            }`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Nome (somente no cadastro) */}
          {mode === 'register' && (
            <div>
              <label className="text-xs font-bold text-[#8C857C] uppercase tracking-wide block mb-1">
                Nome
              </label>
              <input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] bg-[#FAF6F1] px-4 py-3 text-sm text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition"
              />
            </div>
          )}

          {/* E-mail */}
          <div>
            <label className="text-xs font-bold text-[#8C857C] uppercase tracking-wide block mb-1">
              E-mail
            </label>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] bg-[#FAF6F1] px-4 py-3 text-sm text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition"
            />
          </div>

          {/* Senha */}
          <div>
            <label className="text-xs font-bold text-[#8C857C] uppercase tracking-wide block mb-1">
              Senha {mode === 'register' && <span className="normal-case font-normal">(mínimo 8 caracteres)</span>}
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : 1}
                className="w-full rounded-2xl border border-[rgba(45,42,38,0.12)] bg-[#FAF6F1] px-4 py-3 pr-11 text-sm text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C857C] hover:text-[#2D2A26] transition"
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Erro */}
          {error && (
            <p className="text-[#D4A0A0] text-sm bg-[#D4A0A0]/10 rounded-2xl px-4 py-2">
              {error}
            </p>
          )}

          {/* Botão */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#8FB39A] hover:bg-[#7ea389] active:scale-95 disabled:opacity-60 text-white font-bold rounded-full py-3 text-sm transition-all duration-200 shadow-snug flex items-center justify-center gap-2 mt-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {mode === 'login' ? 'Entrar' : 'Criar minha conta'}
          </button>
        </form>
      </div>

      <p className="text-[#8C857C] text-xs mt-6 text-center">
        Seus dados são privados e protegidos. 🔒
      </p>
    </div>
  )
}
