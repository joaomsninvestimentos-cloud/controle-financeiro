/** Validações de cadastro/login por e-mail — puras, compartilhadas e testáveis. */

export const SENHA_MINIMA = 8

export function emailValido(email: string): boolean {
  const limpo = email.trim()
  if (limpo.length < 5 || limpo.length > 254) return false
  if (/\s/.test(limpo)) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo)
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function emailIncompleto(email: string): string | null {
  const limpo = email.trim()
  if (!limpo) return 'Digite seu e-mail.'
  if (!limpo.includes('@')) return 'Falta o @ no e-mail (ex.: nome@email.com).'
  if (limpo.endsWith('@') || limpo.split('@')[1] === '') return 'Falta o domínio depois do @ (ex.: @gmail.com).'
  if (!/\.[a-z]{2,}$/i.test(limpo)) return 'O domínio precisa terminar com algo como .com ou .br.'
  if (/\s/.test(limpo)) return 'O e-mail não pode ter espaços.'
  return emailValido(limpo) ? null : 'E-mail inválido.'
}

export type NivelSenha = 0 | 1 | 2 | 3

export interface ForcaSenha {
  nivel: NivelSenha
  label: string
  dicas: string[]
}

export function forcaSenha(senha: string): ForcaSenha {
  if (senha.length < SENHA_MINIMA) {
    return {
      nivel: 0,
      label: `mínimo ${SENHA_MINIMA} caracteres`,
      dicas: senha.length > 0 ? [`faltam ${SENHA_MINIMA - senha.length} caractere(s)`] : [],
    }
  }

  const dicas: string[] = []
  if (senha.length < 12) dicas.push('use 12+ caracteres')
  const temMaiuscula = /[A-Z]/.test(senha)
  const temMinuscula = /[a-z]/.test(senha)
  const temNumero = /\d/.test(senha)
  const temSimbolo = /[^A-Za-z0-9]/.test(senha)

  if (!(temMaiuscula && temMinuscula)) dicas.push('misture maiúsculas e minúsculas')
  if (!temNumero) dicas.push('inclua um número')
  if (!temSimbolo) dicas.push('inclua um símbolo')

  let pontos = 0
  if (senha.length >= 12) pontos++
  if (temMaiuscula && temMinuscula) pontos++
  if (temNumero) pontos++
  if (temSimbolo) pontos++

  if (pontos >= 3) return { nivel: 3, label: 'forte', dicas: [] }
  if (pontos === 2) return { nivel: 2, label: 'boa', dicas }
  return { nivel: 1, label: 'fraca', dicas }
}

export interface CadastroInput {
  nome: string
  email: string
  senha: string
  confirmar: string
}

export type ErroCadastro = { campo: 'nome' | 'email' | 'senha' | 'confirmar'; mensagem: string }

/** Valida o cadastro inteiro e devolve o primeiro erro por campo. */
export function validarCadastro({ nome, email, senha, confirmar }: CadastroInput): ErroCadastro[] {
  const erros: ErroCadastro[] = []

  if (nome.trim().length < 2) {
    erros.push({ campo: 'nome', mensagem: 'Digite seu nome (mínimo 2 letras).' })
  }

  const erroEmail = emailIncompleto(email)
  if (erroEmail) erros.push({ campo: 'email', mensagem: erroEmail })

  if (senha.length < SENHA_MINIMA) {
    erros.push({ campo: 'senha', mensagem: `A senha precisa ter no mínimo ${SENHA_MINIMA} caracteres.` })
  }

  if (confirmar.length === 0) {
    erros.push({ campo: 'confirmar', mensagem: 'Repita a senha para confirmar.' })
  } else if (senha !== confirmar) {
    erros.push({ campo: 'confirmar', mensagem: 'As duas senhas não são iguais.' })
  }

  return erros
}

/** Valida só o login (mensagens genéricas de propósito, por segurança). */
export function validarLogin(email: string, senha: string): string | null {
  const erroEmail = emailIncompleto(email)
  if (erroEmail) return erroEmail
  if (senha.length === 0) return 'Digite sua senha.'
  return null
}
