import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agruparContas,
  avaliarConvite,
  DIAS_VALIDADE_CONVITE,
  diasRestantes,
  idsDaVisao,
  linkConvite,
  linkWhatsApp,
  nomeContaPessoal,
  nomeCurto,
  normalizarContaSelecionada,
  resolverSelecao,
  rotuloVisao,
  validadeConvite,
  type ContaResumo,
} from './contas-logic'

const contas: ContaResumo[] = [
  { id: 'p-joao', nome: 'João', tipo: 'pessoal', isOwner: true },
  { id: 'casa', nome: 'Casa', tipo: 'casa', isOwner: true },
  { id: 'p-esposa', nome: 'Maria', tipo: 'pessoal', isOwner: false },
]

const agora = new Date('2026-11-03T12:00:00.000Z')

test('agruparContas separa pessoais de casas e define os padrões', () => {
  const g = agruparContas(contas)
  assert.deepEqual(g.pessoais.map(c => c.id), ['p-joao', 'p-esposa'])
  assert.deepEqual(g.casas.map(c => c.id), ['casa'])
  assert.equal(g.pessoalPadrao?.id, 'p-joao')
  assert.equal(g.casaPadrao?.id, 'casa')
})

test('resolverSelecao respeita a última escolha e cai na pessoal', () => {
  assert.equal(resolverSelecao(contas, 'casa'), 'casa')
  assert.equal(resolverSelecao(contas, 'tudo'), 'tudo')
  assert.equal(resolverSelecao(contas, 'conta-apagada'), 'p-joao') // id antigo
  assert.equal(resolverSelecao(contas, null), 'p-joao')
  assert.equal(resolverSelecao(contas, 'todas'), 'tudo') // compatibilidade
})

test('resolverSelecao cai na casa ou em "tudo" quando não existe pessoal', () => {
  const soCasa: ContaResumo[] = [{ id: 'casa', nome: 'Casa', tipo: 'casa', isOwner: false }]
  assert.equal(resolverSelecao(soCasa, null), 'casa')
  assert.equal(resolverSelecao([], null), 'tudo')
})

test('normalizarContaSelecionada aceita as variações antigas', () => {
  assert.equal(normalizarContaSelecionada('todas'), 'tudo')
  assert.equal(normalizarContaSelecionada('tudo'), 'tudo')
  assert.equal(normalizarContaSelecionada('abc-123'), 'abc-123')
  assert.equal(normalizarContaSelecionada(''), 'pessoal')
  assert.equal(normalizarContaSelecionada(undefined), 'pessoal')
})

test('idsDaVisao: pessoal, casa e tudo', () => {
  assert.deepEqual(idsDaVisao(contas, 'tudo'), ['p-joao', 'casa', 'p-esposa'])
  assert.deepEqual(idsDaVisao(contas, 'p-joao'), ['p-joao'])
  assert.deepEqual(idsDaVisao(contas, 'pessoal'), ['p-joao', 'p-esposa'])
  assert.deepEqual(idsDaVisao(contas, 'casa'), ['casa'])
})

test('rotuloVisao mostra o nome da conta ou "Tudo"', () => {
  assert.equal(rotuloVisao(contas, 'tudo'), 'Tudo')
  assert.equal(rotuloVisao(contas, 'casa'), 'Casa')
  assert.equal(rotuloVisao(contas, 'sumiu'), 'Tudo')
})

test('nomeCurto corta no primeiro nome e limita o tamanho', () => {
  assert.equal(nomeCurto('João Monteiro'), 'João')
  assert.equal(nomeCurto('  Ana  '), 'Ana')
  assert.equal(nomeCurto('Maximiliano'), 'Maximilia…')
  assert.equal(nomeContaPessoal('João Monteiro'), 'João')
  assert.equal(nomeContaPessoal('   '), 'Minha conta')
})

test('convite válido, sem expiração, é aceitável', () => {
  const r = avaliarConvite(
    { status: 'pending', inviteToken: 'tok', inviteExpiresAt: null, inviteUsedAt: null, userId: null },
    'u1',
    agora,
  )
  assert.deepEqual(r, { ok: true, estado: 'pendente' })
})

test('convite expirado, usado ou sem token é recusado', () => {
  const expirado = avaliarConvite(
    { status: 'pending', inviteToken: 'tok', inviteExpiresAt: new Date('2026-11-01T00:00:00Z'), userId: null },
    'u1',
    agora,
  )
  assert.deepEqual(expirado, { ok: false, motivo: 'expirado' })

  const usado = avaliarConvite(
    { status: 'active', inviteToken: 'tok', inviteUsedAt: agora, userId: 'outro' },
    'u1',
    agora,
  )
  assert.deepEqual(usado, { ok: false, motivo: 'usado' })

  assert.deepEqual(avaliarConvite(null, 'u1', agora), { ok: false, motivo: 'invalido' })
  assert.deepEqual(
    avaliarConvite({ status: 'pending', inviteToken: null }, 'u1', agora),
    { ok: false, motivo: 'invalido' },
  )
})

test('quem já é membro recebe ja_membro (não é erro)', () => {
  const r = avaliarConvite(
    { status: 'active', inviteToken: 'tok', userId: 'u1', inviteExpiresAt: null },
    'u1',
    agora,
  )
  assert.deepEqual(r, { ok: true, estado: 'ja_membro' })
})

test('validade do convite é de 7 dias e diasRestantes conta corretamente', () => {
  assert.equal(DIAS_VALIDADE_CONVITE, 7)
  const expira = validadeConvite(agora)
  assert.equal(diasRestantes(expira, agora), 7)
  assert.equal(diasRestantes(new Date(agora.getTime() - 1000), agora), 0)
  assert.equal(diasRestantes(null, agora), 0)
})

test('link do convite é absoluto e sem barra dupla', () => {
  assert.equal(linkConvite('https://app.com', 'abc'), 'https://app.com/convite/abc')
  assert.equal(linkConvite('https://app.com/', 'abc'), 'https://app.com/convite/abc')
})

test('link do WhatsApp contém a conta e o link codificados', () => {
  const url = linkWhatsApp('https://app.com/convite/abc', 'Casa', 'João')
  assert.ok(url.startsWith('https://wa.me/?text='))
  const texto = decodeURIComponent(url.split('text=')[1])
  assert.match(texto, /João te convidou/)
  assert.match(texto, /"Casa"/)
  assert.match(texto, /https:\/\/app\.com\/convite\/abc/)
  assert.match(texto, /7 dias/)
})
