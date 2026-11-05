import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularSaldoCasa } from './saldo-casa'

const parse = (valor: string) => Number(valor)
const itens = [
  { mes: '2026-11', tipo: 'despesa', valor: '99.90' },
  { mes: '2026-12', tipo: 'despesa', valor: '99.90' },
]

test('casa contabiliza cada ocorrência apenas no próprio mês', () => {
  for (const mes of ['2026-11', '2026-12']) {
    assert.deepEqual(calcularSaldoCasa(itens, mes, parse), { saldoInicio: 0, receitas: 0, despesas: 99.9, saldoFim: -99.9 })
  }
  assert.deepEqual(calcularSaldoCasa(itens, '2027-01', parse), { saldoInicio: 0, receitas: 0, despesas: 0, saldoFim: 0 })
})

test('casa considera receitas e despesas do mês sem carregar meses anteriores', () => {
  assert.deepEqual(calcularSaldoCasa([...itens, { mes: '2026-12', tipo: 'receita', valor: '150' }], '2026-12', parse),
    { saldoInicio: 0, receitas: 150, despesas: 99.9, saldoFim: 150 - 99.9 })
})
