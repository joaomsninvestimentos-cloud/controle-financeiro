import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoTransferencia,
  destinosPossiveis,
  itensTransferiveis,
  nadaParaTransferir,
  planejarTransferencia,
  podeTransferir,
  resumoTransferencia,
  type ItemTransferivel,
  type OrcamentoTransferivel,
  type SerieTransferivel,
} from './mover-logic'

const item = (over: Partial<ItemTransferivel> = {}): ItemTransferivel => ({
  id: 'item-1',
  contaId: 'joao',
  recorrente: false,
  recorrenciaId: null,
  espelhoDe: null,
  userId: 'joao-user',
  ...over,
})

const serie = (over: Partial<SerieTransferivel> = {}): SerieTransferivel => ({
  id: 'serie-1',
  contaId: 'joao',
  userId: 'joao-user',
  ativa: true,
  ...over,
})

const orcamento = (over: Partial<OrcamentoTransferivel> = {}): OrcamentoTransferivel => ({
  id: 'orc-1',
  contaId: 'joao',
  mes: '2026-11',
  categoria: 'Moradia',
  ...over,
})

const opcoes = (over: Partial<{ incluirLancamentos: boolean; incluirFixas: boolean; incluirOrcamentos: boolean }> = {}) => ({
  incluirLancamentos: true,
  incluirFixas: true,
  incluirOrcamentos: false,
  ...over,
})

test('regras de permissão da transferência', () => {
  const base = {
    origemId: 'joao',
    destinoId: 'casa',
    usuarioEhDonoOrigem: true,
    temAcessoDestino: true,
  }
  assert.equal(podeTransferir(base), null)
  assert.equal(podeTransferir({ ...base, destinoId: null }), 'SEM_DESTINO')
  assert.equal(podeTransferir({ ...base, destinoId: 'joao' }), 'MESMA_CONTA')
  assert.equal(podeTransferir({ ...base, usuarioEhDonoOrigem: false }), 'NAO_E_DONO')
  assert.equal(podeTransferir({ ...base, temAcessoDestino: false }), 'SEM_ACESSO_DESTINO')
})

test('destinos possíveis excluem a própria origem', () => {
  const contas = [{ id: 'joao' }, { id: 'casa' }, { id: 'maria' }]
  assert.deepEqual(destinosPossiveis(contas, 'joao').map(c => c.id), ['casa', 'maria'])
})

test('nunca move espelhos: eles ficam na casa apontando para o original', () => {
  const itens = [
    item({ id: 'origem' }),
    item({ id: 'espelho', contaId: 'casa', espelhoDe: 'origem' }),
  ]
  const moviveis = itensTransferiveis(itens, { id: 'joao', tipo: 'pessoal' }, 'joao-user')
  assert.deepEqual(moviveis.map(i => i.id), ['origem'])
})

test('origem pessoal move tudo; origem casa move só o que é do usuário', () => {
  const itens = [
    item({ id: 'meu', contaId: 'casa', userId: 'joao-user' }),
    item({ id: 'dela', contaId: 'casa', userId: 'maria-user' }),
  ]

  const daCasa = itensTransferiveis(itens, { id: 'casa', tipo: 'casa' }, 'joao-user')
  assert.deepEqual(daCasa.map(i => i.id), ['meu'])

  const daPessoal = itensTransferiveis(
    [item({ id: 'a' }), item({ id: 'b' })],
    { id: 'joao', tipo: 'pessoal' },
    'joao-user',
  )
  assert.deepEqual(daPessoal.map(i => i.id), ['a', 'b'])
})

test('itens de outras contas não entram no plano', () => {
  const plano = planejarTransferencia({
    origem: { id: 'joao', tipo: 'pessoal' },
    usuarioId: 'joao-user',
    opcoes: opcoes(),
    itens: [item({ id: 'meu' }), item({ id: 'alheio', contaId: 'casa' })],
    series: [],
    orcamentosOrigem: [],
    orcamentosDestino: [],
  })
  assert.deepEqual(plano.itemIds, ['meu'])
})

test('movendo fixas, as ocorrências da série vão junto', () => {
  const plano = planejarTransferencia({
    origem: { id: 'joao', tipo: 'pessoal' },
    usuarioId: 'joao-user',
    // mesmo com "lançamentos avulsos" desmarcado, a série leva seu histórico
    opcoes: opcoes({ incluirLancamentos: false, incluirFixas: true }),
    itens: [
      item({ id: 'ocorrencia-1', recorrenciaId: 'serie-1', recorrente: true }),
      item({ id: 'ocorrencia-2', recorrenciaId: 'serie-1', recorrente: true }),
      item({ id: 'avulso' }),
    ],
    series: [serie()],
    orcamentosOrigem: [],
    orcamentosDestino: [],
  })

  assert.deepEqual(plano.serieIds, ['serie-1'])
  assert.deepEqual(plano.itemIds.sort(), ['ocorrencia-1', 'ocorrencia-2'])
  assert.equal(plano.counts.fixas, 1)
})

test('sem incluir fixas, só os avulsos saem', () => {
  const plano = planejarTransferencia({
    origem: { id: 'joao', tipo: 'pessoal' },
    usuarioId: 'joao-user',
    opcoes: opcoes({ incluirFixas: false }),
    itens: [
      item({ id: 'ocorrencia', recorrenciaId: 'serie-1', recorrente: true }),
      item({ id: 'avulso' }),
    ],
    series: [serie()],
    orcamentosOrigem: [],
    orcamentosDestino: [],
  })

  assert.deepEqual(plano.serieIds, [])
  assert.deepEqual(plano.itemIds, ['avulso'])
  assert.equal(plano.counts.fixas, 0)
})

test('orçamentos: ignora os que já existem no destino (mês + categoria)', () => {
  const plano = planejarTransferencia({
    origem: { id: 'joao', tipo: 'pessoal' },
    usuarioId: 'joao-user',
    opcoes: opcoes({ incluirOrcamentos: true }),
    itens: [],
    series: [],
    orcamentosOrigem: [
      orcamento({ id: 'o1', mes: '2026-11', categoria: 'Moradia' }),
      orcamento({ id: 'o2', mes: '2026-11', categoria: 'Lazer' }),
      orcamento({ id: 'o3', mes: '2026-12', categoria: 'Moradia' }),
    ],
    orcamentosDestino: [
      orcamento({ id: 'd1', contaId: 'casa', mes: '2026-11', categoria: 'Moradia' }),
    ],
  })

  assert.deepEqual(plano.orcamentoIds, ['o2', 'o3'])
  assert.deepEqual(plano.orcamentosIgnorados, ['o1'])
  assert.equal(plano.counts.orcamentosIgnorados, 1)
})

test('orçamentos ficam fora quando a opção está desmarcada', () => {
  const plano = planejarTransferencia({
    origem: { id: 'joao', tipo: 'pessoal' },
    usuarioId: 'joao-user',
    opcoes: opcoes({ incluirOrcamentos: false }),
    itens: [],
    series: [],
    orcamentosOrigem: [orcamento()],
    orcamentosDestino: [],
  })
  assert.deepEqual(plano.orcamentoIds, [])
  assert.equal(plano.counts.orcamentos, 0)
})

test('conta vazia não tem nada a transferir', () => {
  const plano = planejarTransferencia({
    origem: { id: 'joao', tipo: 'pessoal' },
    usuarioId: 'joao-user',
    opcoes: opcoes({ incluirOrcamentos: true }),
    itens: [],
    series: [],
    orcamentosOrigem: [],
    orcamentosDestino: [],
  })
  assert.equal(nadaParaTransferir(plano.counts), true)
  assert.deepEqual(resumoTransferencia(plano.counts), [])
})

test('resumo e aviso explicam o que vai acontecer', () => {
  const counts = { fixas: 2, lancamentos: 14, orcamentos: 3, orcamentosIgnorados: 1 }
  const resumo = resumoTransferencia(counts)
  assert.deepEqual(resumo, [
    '2 despesa(s) fixa(s)',
    '14 lançamento(s)',
    '3 orçamento(s)',
    '1 orçamento(s) já existiam no destino',
  ])
  assert.equal(nadaParaTransferir(counts), false)

  const aviso = avisoTransferencia('Casa', 'João', counts)
  assert.match(aviso, /Mover de "Casa" para "João"/)
  assert.match(aviso, /nada é recriado/)
  assert.match(aviso, /continuam repetindo todo mês/)
  assert.match(aviso, /já existiam no destino foram mantidos/)
})
