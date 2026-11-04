import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparDuplicadas,
  avisoConsolidar,
  chaveDuplicata,
  compararParaPrincipal,
  planejarConsolidacao,
  resumoGrupo,
  type ItemDeSerie,
  type SerieDuplicavel,
} from './recorrencia-dup-logic'

const serie = (over: Partial<SerieDuplicavel>): SerieDuplicavel => ({
  id: 's1',
  descricao: 'Predialnet',
  valor: '99.90',
  contaId: 'joao',
  mesInicio: '2026-11',
  ativa: true,
  ocorrencias: 3,
  ...over,
})

test('chave ignora caixa e espaços, mas separa contas diferentes', () => {
  assert.equal(
    chaveDuplicata({ descricao: '  PREDIALNET ', contaId: 'joao' }),
    chaveDuplicata({ descricao: 'predialnet', contaId: 'joao' }),
  )
  assert.notEqual(
    chaveDuplicata({ descricao: 'Predialnet', contaId: 'joao' }),
    chaveDuplicata({ descricao: 'Predialnet', contaId: 'casa' }),
  )
  assert.equal(chaveDuplicata({ descricao: 'X', contaId: null }), 'x|sem-conta')
})

test('detecta duplicadas e ignora séries encerradas', () => {
  const grupos = agruparDuplicadas([
    serie({ id: 'a', mesInicio: '2026-11' }),
    serie({ id: 'b', mesInicio: '2026-12' }),
    serie({ id: 'c', descricao: 'Aluguel' }),
    serie({ id: 'd', descricao: 'Luz', ativa: false }),
    serie({ id: 'e', descricao: 'Luz', ativa: false }),
  ])

  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].principal.id, 'a') // mais antiga fica
  assert.deepEqual(grupos[0].outras.map(s => s.id), ['b'])
})

test('sem duplicadas não há nada para consertar', () => {
  assert.deepEqual(agruparDuplicadas([serie({ id: 'a' }), serie({ id: 'b', descricao: 'Aluguel' })]), [])
})

test('escolha da principal: antiga → mais ocorrências → id', () => {
  const antiga = serie({ id: 'z', mesInicio: '2026-01', ocorrencias: 1 })
  const nova = serie({ id: 'a', mesInicio: '2026-05', ocorrencias: 9 })
  assert.ok(compararParaPrincipal(antiga, nova) < 0)

  const mesmaDataPoucas = serie({ id: 'a', mesInicio: '2026-05', ocorrencias: 2 })
  const mesmaDataMuitas = serie({ id: 'b', mesInicio: '2026-05', ocorrencias: 7 })
  assert.ok(compararParaPrincipal(mesmaDataMuitas, mesmaDataPoucas) < 0)

  const empateA = serie({ id: 'a', mesInicio: '2026-05', ocorrencias: 2 })
  const empateB = serie({ id: 'b', mesInicio: '2026-05', ocorrencias: 2 })
  assert.ok(compararParaPrincipal(empateA, empateB) < 0)
})

test('consolidação move meses exclusivos e remove os repetidos', () => {
  const itens: ItemDeSerie[] = [
    // principal
    { id: 'p-nov', recorrenciaId: 'principal', mes: '2026-11', espelhoDe: null },
    { id: 'p-dez', recorrenciaId: 'principal', mes: '2026-12', espelhoDe: null },
    // duplicada: novembro repete, janeiro é exclusivo
    { id: 'd-nov', recorrenciaId: 'dup', mes: '2026-11', espelhoDe: null },
    { id: 'd-jan', recorrenciaId: 'dup', mes: '2027-01', espelhoDe: null },
    // espelhos na casa
    { id: 'e-p-nov', recorrenciaId: 'principal', mes: '2026-11', espelhoDe: 'p-nov' },
    { id: 'e-d-nov', recorrenciaId: 'dup', mes: '2026-11', espelhoDe: 'd-nov' },
    { id: 'e-d-jan', recorrenciaId: 'dup', mes: '2027-01', espelhoDe: 'd-jan' },
  ]

  const plano = planejarConsolidacao(itens, 'principal', ['dup'])

  assert.deepEqual(plano.mover, ['d-jan'])
  assert.deepEqual(plano.remover, ['d-nov'])
  // o espelho do lançamento removido sai junto; o do mês movido fica
  assert.deepEqual(plano.removerEspelhos, ['e-d-nov'])
})

test('consolidação de séries sem meses em comum só move', () => {
  const plano = planejarConsolidacao([
    { id: 'p-1', recorrenciaId: 'principal', mes: '2026-11', espelhoDe: null },
    { id: 'd-1', recorrenciaId: 'dup', mes: '2026-12', espelhoDe: null },
  ], 'principal', ['dup'])

  assert.deepEqual(plano.mover, ['d-1'])
  assert.deepEqual(plano.remover, [])
  assert.deepEqual(plano.removerEspelhos, [])
})

test('itens de outras séries não são tocados', () => {
  const plano = planejarConsolidacao([
    { id: 'b-1', recorrenciaId: 'outra', mes: '2026-11', espelhoDe: null },
    { id: 'd-1', recorrenciaId: 'dup', mes: '2026-11', espelhoDe: null },
  ], 'principal', ['dup'])

  assert.deepEqual(plano.mover, ['d-1'])
  assert.ok(!plano.remover.includes('b-1'))
})

test('avisos explicam a ação e o resumo do grupo', () => {
  const [grupo] = agruparDuplicadas([
    serie({ id: 'a', mesInicio: '2026-11' }),
    serie({ id: 'b', mesInicio: '2026-12' }),
  ])

  assert.match(avisoConsolidar(grupo, 5), /Juntar 2 despesas fixas "Predialnet"/)
  assert.match(avisoConsolidar(grupo, 5), /5 lançamento\(s\)/)
  assert.match(avisoConsolidar(grupo, 5), /nada é contado duas vezes/)
  assert.equal(resumoGrupo(grupo), '2 cópias · 6 lançamento(s)')
})
