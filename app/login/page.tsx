'use client'

import { Suspense, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Wallet, Eye, EyeOff, Loader2, Check, X, ShieldCheck } from 'lucide-react'
import {
  SENHA_MINIMA,
  emailIncompleto,
  emailValido,
  forcaSenha,
  validarCadastro,
  validarLogin,
} from '@/lib/auth-validation'

type Mode = 'login' | 'register'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // permite voltar para onde a pessoa estava (ex.: /convite/<token>)
  const voltarPara = searchParams.get('voltar')
  const destino = voltarPara && voltarPara.startsWith('/') && !voltarPara.startsWith('//') ? voltarPara : '/'
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tocado, setTocado] = useState<{ email?: boolean; password?: boolean; confirmar?: boolean; name?: boolean }>({})
  const confirmarRef = useRef<HTMLInputElement>(null)

  const emailOk = emailValido(email)
  const senhaOk = mode === 'register' ? password.length >= 8 : password.length > 0
  const confereOk = mode === 'register' ? password === confirmar && confirmar.length > 0 : true
  const nomeOk = mode === 'register' ? name.trim().length >= 2 : true

  const forca = useMemo(() => forcaSenha(password), [password])

  const podeEnviar = emailOk && senhaOk && confereOk && nomeOk && !loading

  const trocarModo = (novo: Mode) => {
    setMode(novo)
    setError('')
    setPassword('')
    setConfirmar('')
    setTocado({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'login') {
      const erroLogin = validarLogin(email, password)
      if (erroLogin) return setError(erroLogin)
    } else {
      const erros = validarCadastro({ nome: name, email, senha: password, confirmar })
      if (erros.length > 0) {
        setTocado({ name: true, email: true, password: true, confirmar: true })
        return setError(erros[0].mensagem)
      }
    }

    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = mode === 'login'
        ? { email: email.trim(), password }
        : { name: name.trim(), email: email.trim(), password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        router.push(destino)
        router.refresh()
        return
      }

      const data = await res.json().catch(() => ({})) as { error?: string }
      if (data.error === 'ACCOUNT_ALREADY_EXISTS') {
        setError('Este e-mail já tem conta. Use a aba “Entrar”.')
        setMode('login')
      } else if (data.error === 'INVALID_CREDENTIALS') {
        setError('E-mail ou senha incorretos. Confira e tente de novo.')
      } else if (data.error === 'INVALID_INPUT') {
        setError(
          mode === 'register'
            ? 'Confira os dados: nome, e-mail válido e senha com 8+ caracteres.'
            : 'Confira o e-mail e a senha.',
        )
      } else if (data.error === 'INTERNAL_ERROR') {
        setError('O servidor não conseguiu concluir agora. Tente em instantes.')
      } else {
        setError('Algo deu errado. Tente novamente.')
      }
    } catch {
      setError('Sem conexão. Verifique sua internet e tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  const borda = (ok: boolean, mostrado: boolean) =>
    !mostrado ? 'border-[rgba(45,42,38,0.12)]' : ok ? 'border-[#8FB39A]' : 'border-[#D4A0A0]'

  return (
    <div className="min-h-[100dvh] bg-[#FAF6F1] font-nunito flex flex-col items-center justify-center px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-12">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-7">
        <div className="bg-[#8FB39A] rounded-2xl p-3 shadow-snug">
          <Wallet className="text-white" size={26} />
        </div>
        <div>
          <h1 className="text-[#2D2A26] font-extrabold text-xl leading-tight">Meu Controle</h1>
          <p className="text-[#8C857C] text-xs">Financeiro</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-7 shadow-snug">
        {/* Abas */}
        <div className="flex bg-[#FAF6F1] rounded-2xl p-1 mb-6" role="tablist" aria-label="Entrar ou criar conta">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => trocarModo('login')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
              mode === 'login' ? 'bg-white shadow-snug text-[#2D2A26]' : 'text-[#8C857C]'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => trocarModo('register')}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
              mode === 'register' ? 'bg-white shadow-snug text-[#2D2A26]' : 'text-[#8C857C]'
            }`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {/* Nome (somente no cadastro) */}
          {mode === 'register' && (
            <div>
              <label htmlFor="nome" className="text-xs font-bold text-[#8C857C] uppercase tracking-wide block mb-1">
                Nome
              </label>
              <input
                id="nome"
                type="text"
                placeholder="Como quer ser chamado"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTocado(t => ({ ...t, name: true }))}
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                required
                className={`w-full rounded-2xl border ${borda(nomeOk, !!tocado.name && name.length > 0)} bg-[#FAF6F1] px-4 py-3 text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition`}
              />
            </div>
          )}

          {/* E-mail */}
          <div>
            <label htmlFor="email" className="text-xs font-bold text-[#8C857C] uppercase tracking-wide block mb-1">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTocado(t => ({ ...t, email: true }))}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              className={`w-full rounded-2xl border ${borda(emailOk, !!tocado.email && email.length > 0)} bg-[#FAF6F1] px-4 py-3 text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition`}
            />
            {tocado.email && email.length > 0 && !emailOk && (
              <p className="text-[11px] text-[#D4A0A0] mt-1 ml-1">{emailIncompleto(email)}</p>
            )}
          </div>

          {/* Senha */}
          <div>
            <label htmlFor="senha" className="text-xs font-bold text-[#8C857C] uppercase tracking-wide block mb-1">
              Senha {mode === 'register' && <span className="normal-case font-normal">(mínimo {SENHA_MINIMA} caracteres)</span>}
            </label>
            <div className="relative">
              <input
                id="senha"
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTocado(t => ({ ...t, password: true }))}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                enterKeyHint={mode === 'register' ? 'next' : 'go'}
                required
                minLength={mode === 'register' ? SENHA_MINIMA : 1}
                className={`w-full rounded-2xl border ${borda(senhaOk, !!tocado.password && password.length > 0)} bg-[#FAF6F1] px-4 py-3 pr-11 text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition`}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C857C] hover:text-[#2D2A26] transition p-1"
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {mode === 'register' && password.length > 0 && (
              <div className="flex items-center gap-2 mt-1.5 ml-1">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3].map(n => (
                    <span
                      key={n}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        forca.nivel >= n
                          ? forca.nivel === 1 ? 'bg-[#D4A0A0]' : forca.nivel === 2 ? 'bg-[#E8C4A0]' : 'bg-[#8FB39A]'
                          : 'bg-[rgba(45,42,38,0.10)]'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-[#8C857C]">{forca.label}</span>
              </div>
            )}
            {mode === 'register' && forca.dicas.length > 0 && (
              <p className="text-[10px] text-[#8C857C] mt-1 ml-1">Dica: {forca.dicas.slice(0, 2).join(' · ')}</p>
            )}
          </div>

          {/* Confirmar senha (somente no cadastro) */}
          {mode === 'register' && (
            <div>
              <label htmlFor="confirmar" className="text-xs font-bold text-[#8C857C] uppercase tracking-wide block mb-1">
                Repetir senha
              </label>
              <div className="relative">
                <input
                  id="confirmar"
                  ref={confirmarRef}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  onBlur={() => setTocado(t => ({ ...t, confirmar: true }))}
                  autoComplete="new-password"
                  enterKeyHint="go"
                  required
                  className={`w-full rounded-2xl border ${borda(confereOk, !!tocado.confirmar && confirmar.length > 0)} bg-[#FAF6F1] px-4 py-3 pr-10 text-[#2D2A26] placeholder-[#8C857C] outline-none focus:ring-2 focus:ring-[#8FB39A]/50 transition`}
                />
                {confirmar.length > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {confereOk
                      ? <Check size={15} className="text-[#8FB39A]" />
                      : <X size={15} className="text-[#D4A0A0]" />}
                  </span>
                )}
              </div>
              {confirmar.length > 0 && !confereOk && (
                <p className="text-[11px] text-[#D4A0A0] mt-1 ml-1">As senhas não são iguais.</p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-[#D4A0A0] text-sm bg-[#D4A0A0]/10 rounded-2xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!podeEnviar}
            className="w-full bg-[#8FB39A] hover:bg-[#7ea389] active:scale-95 disabled:opacity-50 text-white font-bold rounded-full py-3.5 text-sm transition-all duration-200 shadow-snug flex items-center justify-center gap-2 mt-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {mode === 'login' ? 'Entrar' : 'Criar minha conta'}
          </button>

          <p className="text-[11px] text-[#8C857C] text-center pt-1">
            {mode === 'login'
              ? 'Primeira vez aqui? Use “Criar conta” — leva 20 segundos.'
              : 'Use um e-mail que você acessa: ele identifica sua conta.'}
          </p>
        </form>
      </div>

      <p className="text-[#8C857C] text-xs mt-6 text-center flex items-center gap-1.5">
        <ShieldCheck size={13} /> Seus dados são privados e protegidos.
      </p>
    </div>
  )
}

export default function LoginPage() {
  // useSearchParams precisa de Suspense para o prerender do build não quebrar
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-[#FAF6F1] flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[#8FB39A]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
