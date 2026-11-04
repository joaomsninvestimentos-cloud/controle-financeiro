import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarResistencia,
  deveAtualizarAoSoltar,
  deveRecarregarAoVoltar,
  deslocamentoIndicador,
  estadoPull,
  INTERVALO_MINIMO_RECARGA_MS,
  LIMITE_ATUALIZAR,
  LIMITE_ELASTICO,
  opacidadeIndicador,
  podePuxar,
} from './pull-refresh-logic'

test('resistência freia o gesto e nunca passa do elástico', () => {
  assert.equal(aplicarResistencia(0), 0)
  assert.equal(aplicarResistencia(-30), 0) // puxar para cima não conta

  const curto = aplicarResistencia(40)
  assert.ok(curto < 40)

  const longo = aplicarResistencia(1000)
  assert.ok(longo <= LIMITE_ELASTICO)
  assert.equal(aplicarResistencia(1000), LIMITE_ELASTICO)
})

test('só puxa no topo e quando não está atualizando', () => {
  assert.equal(podePuxar(0, false), true)
  assert.equal(podePuxar(-12, false), true) // scroll elástico do iPhone
  assert.equal(podePuxar(120, false), false) // no meio da lista
  assert.equal(podePuxar(0, true), false) // já atualizando
})

test('indicador aparece só depois de um mínimo', () => {
  assert.equal(estadoPull(2, false).visivel, false)
  assert.equal(estadoPull(2, false).rotulo, '')

  const arrastando = estadoPull(60, false)
  assert.equal(arrastando.visivel, true)
  assert.equal(arrastando.rotulo, 'Puxe para atualizar')

  const pronto = estadoPull(200, false)
  assert.equal(pronto.vaiAtualizar, true)
  assert.equal(pronto.rotulo, 'Solte para atualizar')

  const carregando = estadoPull(0, true)
  assert.equal(carregando.visivel, true)
  assert.equal(carregando.rotulo, 'Atualizando…')
})

test('soltar dispara a atualização apenas depois do limite', () => {
  assert.equal(deveAtualizarAoSoltar(LIMITE_ATUALIZAR - 1, false), false)
  assert.equal(deveAtualizarAoSoltar(LIMITE_ATUALIZAR, false), true)
  assert.equal(deveAtualizarAoSoltar(LIMITE_ATUALIZAR + 30, false), true)
  assert.equal(deveAtualizarAoSoltar(LIMITE_ATUALIZAR + 30, true), false) // já atualizando
})

test('indicador nunca passa da altura e some quando não há gesto', () => {
  assert.equal(deslocamentoIndicador(0, false), 0)
  assert.ok(deslocamentoIndicador(1000, false) <= 56)
  assert.equal(deslocamentoIndicador(0, true), 56)

  assert.equal(opacidadeIndicador(0, false), 0)
  assert.equal(opacidadeIndicador(LIMITE_ATUALIZAR * 2, false), 1)
  assert.equal(opacidadeIndicador(0, true), 1)
})

test('voltar para o app recarrega só depois de um tempo', () => {
  const agora = 1_700_000_000_000
  assert.equal(deveRecarregarAoVoltar(agora - 1000, agora), false)
  assert.equal(deveRecarregarAoVoltar(agora - INTERVALO_MINIMO_RECARGA_MS, agora), true)
  assert.equal(deveRecarregarAoVoltar(agora - 60_000, agora), true)
})
