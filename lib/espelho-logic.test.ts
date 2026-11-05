import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  apenasCamposSincronizados,
  avisoRemoverEspelho,
  avisoRemoverOrigemComEspelho,
  ehEspelho,
  entraNaSoma,
  impedimentoEspelho,
  montarEspelho,
  podeEspelhar,
  seloEspelhado,
  seloOrigem,
  somarSemEspelhos,
  type ItemEspelhavel,
} from './espelho-logic'

const base: ItemEspelhavel = {
  id: 'origem-1',
  userId: 'user-1',
  contaId: 'conta-pessoal',
  descricao: 'Luz',
  valor: '180.00',
  tipo: 'despesa',
  categoria: 'Moradia',
  data: '2026-11-05',
  mes: '2026-11',
  recorrente: true,
  recorrenciaId: 'serie-1',
  espelhoDe: null,
}

test('espelho é identificado e não entra na soma consolidada', () => {
  const espelho = { ...base, id: 'espelho-1', contaId: 'conta-casa', espelhoDe: 'origem-1' }
  assert.equal(ehEspelho(espelho), true)
  assert.equal(entraNaSoma(espelho), false)
  assert.equal(ehEspelho(base), false)
  assert.equal(entraNaSoma(base), true)
})

test('somarSemEspelhos conta o gasto uma única vez', () => {
  const espelho = { ...base, id: 'espelho-1', contaId: 'conta-casa', espelhoDe: 'origem-1' }
  const receita: ItemEspelhavel = {
    ...base, id: 'r1', descricao: 'Salário', valor: '5000.00', tipo: 'receita', recorrente: false, recorrenciaId: null,
  }

  const total = somarSemEspelhos([base, espelho, receita])
  assert.equal(total.receitas, 5000)
  assert.equal(total.despesas, 180) // não 360
  assert.equal(total.saldo, 4820)
  assert.equal(total.espelhosIgnorados, 1)
})

test('sem espelho o somatório é o de sempre', () => {
  const total = somarSemEspelhos([base])
  assert.equal(total.despesas, 180)
  assert.equal(total.espelhosIgnorados, 0)
})

test('só espelha despesa de conta pessoal para uma conta da casa', () => {
  const ok = {
    tipoContaOrigem: 'pessoal' as const,
    contaOrigemId: 'conta-pessoal',
    contaDestinoId: 'conta-casa',
    destinoEhCasa: true,
  }
  assert.equal(podeEspelhar(ok), true)
  assert.equal(impedimentoEspelho(ok), null)

  assert.equal(
    impedimentoEspelho({ ...ok, tipoContaOrigem: 'casa' }),
    'CONTA_ORIGEM_NAO_PESSOAL',
  )
  assert.equal(
    impedimentoEspelho({ ...ok, contaDestinoId: null }),
    'SEM_CONTA_DA_CASA',
  )
  assert.equal(
    impedimentoEspelho({ ...ok, contaDestinoId: 'conta-pessoal' }),
    'DESTINO_IGUAL_ORIGEM',
  )
  assert.equal(
    impedimentoEspelho({ ...ok, destinoEhCasa: false }),
    'CONTA_DESTINO_NAO_E_CASA',
  )
})

test('montarEspelho copia os dados e aponta para o original', () => {
  const espelho = montarEspelho(base, 'conta-casa', 'novo-id')

  assert.equal(espelho.id, 'novo-id')
  assert.equal(espelho.contaId, 'conta-casa')
  assert.equal(espelho.espelhoDe, 'origem-1')
  assert.equal(espelho.userId, base.userId)
  assert.equal(espelho.valor, base.valor)
  assert.equal(espelho.data, base.data)
  // não herda a série: (recorrencia_id, mes) é único e o mês é o mesmo
  assert.equal(espelho.recorrenciaId, null)
  assert.equal(espelho.recorrente, true)
})

test('sincronização mexe só nos campos compartilhados', () => {
  const campos = apenasCamposSincronizados({
    valor: '200.00',
    descricao: 'Luz',
    contaId: 'outra-conta',
    userId: 'outro-user',
    recorrenciaId: 'outra-serie',
  })

  assert.deepEqual(campos, { valor: '200.00', descricao: 'Luz' })
})

test('selos explicam de onde vem cada lado', () => {
  assert.equal(seloEspelhado('Casa'), '🏠 também na Casa')
  assert.equal(seloEspelhado(null), '🏠 também na casa')
  assert.equal(seloOrigem('João Monteiro'), '🏠 pago por João')
  assert.equal(seloOrigem(null), '🏠 despesa da casa')
})

test('avisos de remoção dizem o que acontece com cada lado', () => {
  const aviso = avisoRemoverEspelho('Luz', 'João Monteiro')
  assert.match(aviso, /continua na conta pessoal/)

  const avisoOrigem = avisoRemoverOrigemComEspelho('Luz', 'Casa')
  assert.match(avisoOrigem, /também remove a cópia/)
  assert.match(avisoOrigem, /Casa/)
})
