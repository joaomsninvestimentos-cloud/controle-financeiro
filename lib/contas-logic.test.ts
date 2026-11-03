import assert from 'node:assert/strict'
import test from 'node:test'

import { planMoveConta, validateMoveInput } from './contas-logic'

test('validateMoveInput rejects missing destination', () => {
  assert.equal(validateMoveInput('a', ''), 'MISSING_DESTINATION')
  assert.equal(validateMoveInput('a', null), 'MISSING_DESTINATION')
  assert.equal(validateMoveInput('a', undefined), 'MISSING_DESTINATION')
})

test('validateMoveInput rejects same origin and destination', () => {
  assert.equal(validateMoveInput('conta-1', 'conta-1'), 'SAME_ACCOUNT')
})

test('validateMoveInput accepts distinct accounts', () => {
  assert.equal(validateMoveInput('conta-1', 'conta-2'), null)
})

test('planMoveConta ignores items from other accounts', () => {
  const plan = planMoveConta({
    deContaId: 'origem',
    incluirLancamentos: true,
    incluirOrcamentos: false,
    items: [
      { id: '1', contaId: 'origem', recorrente: true },
      { id: '2', contaId: 'outra', recorrente: true },
      { id: '3', contaId: null, recorrente: false },
    ],
    orcamentosOrigem: [],
    orcamentosDestino: [],
  })

  assert.deepEqual(plan.itemIds, ['1'])
  assert.deepEqual(plan.counts, {
    fixas: 1,
    lancamentos: 0,
    orcamentos: 0,
    orcamentosIgnorados: 0,
  })
})

test('planMoveConta always includes fixas and optionally lancamentos', () => {
  const items = [
    { id: 'f1', contaId: 'origem', recorrente: true },
    { id: 'f2', contaId: 'origem', recorrente: true },
    { id: 'l1', contaId: 'origem', recorrente: false },
    { id: 'l2', contaId: 'origem', recorrente: false },
  ]

  const comLancamentos = planMoveConta({
    deContaId: 'origem',
    incluirLancamentos: true,
    incluirOrcamentos: false,
    items,
    orcamentosOrigem: [],
    orcamentosDestino: [],
  })
  assert.deepEqual(comLancamentos.itemIds, ['f1', 'f2', 'l1', 'l2'])
  assert.equal(comLancamentos.counts.fixas, 2)
  assert.equal(comLancamentos.counts.lancamentos, 2)

  const soFixas = planMoveConta({
    deContaId: 'origem',
    incluirLancamentos: false,
    incluirOrcamentos: false,
    items,
    orcamentosOrigem: [],
    orcamentosDestino: [],
  })
  assert.deepEqual(soFixas.itemIds, ['f1', 'f2'])
  assert.equal(soFixas.counts.fixas, 2)
  assert.equal(soFixas.counts.lancamentos, 0)
})

test('planMoveConta skips destination orcamento duplicates by mes and categoria', () => {
  const plan = planMoveConta({
    deContaId: 'origem',
    incluirLancamentos: false,
    incluirOrcamentos: true,
    items: [],
    orcamentosOrigem: [
      { id: 'o1', contaId: 'origem', mes: '2026-01', categoria: 'Moradia' },
      { id: 'o2', contaId: 'origem', mes: '2026-01', categoria: 'Lazer' },
      { id: 'o3', contaId: 'origem', mes: '2026-02', categoria: 'Moradia' },
      { id: 'o4', contaId: 'outra', mes: '2026-01', categoria: 'Saúde' },
    ],
    orcamentosDestino: [
      { id: 'd1', contaId: 'destino', mes: '2026-01', categoria: 'Moradia' },
    ],
  })

  assert.deepEqual(plan.orcamentoIds, ['o2', 'o3'])
  assert.deepEqual(plan.orcamentoIdsIgnorados, ['o1'])
  assert.equal(plan.counts.orcamentos, 2)
  assert.equal(plan.counts.orcamentosIgnorados, 1)
})

test('planMoveConta leaves orcamentos untouched when flag is off', () => {
  const plan = planMoveConta({
    deContaId: 'origem',
    incluirLancamentos: true,
    incluirOrcamentos: false,
    items: [{ id: 'l1', contaId: 'origem', recorrente: false }],
    orcamentosOrigem: [
      { id: 'o1', contaId: 'origem', mes: '2026-01', categoria: 'Moradia' },
    ],
    orcamentosDestino: [],
  })

  assert.deepEqual(plan.orcamentoIds, [])
  assert.deepEqual(plan.orcamentoIdsIgnorados, [])
  assert.equal(plan.counts.orcamentos, 0)
  assert.equal(plan.counts.orcamentosIgnorados, 0)
})

test('planMoveConta returns empty plan for empty origin', () => {
  const plan = planMoveConta({
    deContaId: 'origem',
    incluirLancamentos: true,
    incluirOrcamentos: true,
    items: [],
    orcamentosOrigem: [],
    orcamentosDestino: [],
  })

  assert.deepEqual(plan, {
    itemIds: [],
    orcamentoIds: [],
    orcamentoIdsIgnorados: [],
    counts: { fixas: 0, lancamentos: 0, orcamentos: 0, orcamentosIgnorados: 0 },
  })
})
