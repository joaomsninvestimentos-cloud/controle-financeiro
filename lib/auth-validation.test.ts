import assert from 'node:assert/strict'
import test from 'node:test'

import {
  emailIncompleto,
  emailValido,
  forcaSenha,
  normalizarEmail,
  SENHA_MINIMA,
  validarCadastro,
  validarLogin,
} from './auth-validation'

test('aceita e-mails comuns e recusa inválidos', () => {
  for (const ok of ['joao@email.com', 'joao.silva+financas@gmail.com', 'a@b.co', 'maria@empresa.com.br']) {
    assert.equal(emailValido(ok), true, ok)
  }
  for (const ruim of ['joao', 'joao@', '@email.com', 'joao @email.com', 'joao@email', 'a@b.c', '']) {
    assert.equal(emailValido(ruim), false, ruim)
  }
})

test('normalizarEmail tira espaço e caixa alta (evita conta duplicada)', () => {
  assert.equal(normalizarEmail('  Joao@Email.COM '), 'joao@email.com')
})

test('emailIncompleto explica o que falta', () => {
  assert.match(emailIncompleto('joao') ?? '', /@/)
  assert.match(emailIncompleto('joao@') ?? '', /domínio/)
  assert.match(emailIncompleto('joao@email') ?? '', /\.com/)
  assert.match(emailIncompleto('jo ao@email.com') ?? '', /espaços/)
  assert.equal(emailIncompleto('joao@email.com'), null)
})

test('senha curta não passa e o nível reflete a força', () => {
  assert.equal(SENHA_MINIMA, 8)
  assert.equal(forcaSenha('abc').nivel, 0)
  assert.match(forcaSenha('abc').label, /8 caracteres/)

  assert.equal(forcaSenha('abcdefgh').nivel, 1)
  assert.equal(forcaSenha('abcdef1!xyz').nivel, 2)
  assert.equal(forcaSenha('abcdefg1').nivel, 1) // fraca de propósito: só letras + 1 número
  assert.equal(forcaSenha('Abcdefgh1!').nivel, 3)
  assert.equal(forcaSenha('Abcdefgh1!').label, 'forte')
})

test('dicas de senha orientam o que falta', () => {
  const fraca = forcaSenha('abcdefgh')
  assert.ok(fraca.dicas.length > 0)
  assert.equal(forcaSenha('Abcdefgh1!').dicas.length, 0)
})

test('validarCadastro aponta o campo com problema', () => {
  const ok = validarCadastro({
    nome: 'João',
    email: 'joao@email.com',
    senha: 'Abcdefgh1!',
    confirmar: 'Abcdefgh1!',
  })
  assert.deepEqual(ok, [])

  const semNome = validarCadastro({ nome: 'J', email: 'joao@email.com', senha: 'Abcdefgh1!', confirmar: 'Abcdefgh1!' })
  assert.equal(semNome[0]?.campo, 'nome')

  const emailRuim = validarCadastro({ nome: 'João', email: 'joao@', senha: 'Abcdefgh1!', confirmar: 'Abcdefgh1!' })
  assert.equal(emailRuim[0]?.campo, 'email')

  const senhaCurta = validarCadastro({ nome: 'João', email: 'joao@email.com', senha: 'abc', confirmar: 'abc' })
  assert.equal(senhaCurta[0]?.campo, 'senha')

  const diferentes = validarCadastro({
    nome: 'João',
    email: 'joao@email.com',
    senha: 'Abcdefgh1!',
    confirmar: 'Abcdefgh2!',
  })
  assert.equal(diferentes[0]?.campo, 'confirmar')
  assert.match(diferentes[0]?.mensagem ?? '', /não são iguais/)
})

test('validarLogin não entrega se o e-mail existe', () => {
  assert.equal(validarLogin('joao@email.com', 'qualquer'), null)
  assert.match(validarLogin('joao', 'x') ?? '', /@/)
  assert.equal(validarLogin('joao@email.com', ''), 'Digite sua senha.')
})
