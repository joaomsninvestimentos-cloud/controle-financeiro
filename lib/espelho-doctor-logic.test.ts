import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  casaPrincipal,
  diagnosticarEspelhos,
  resumoDiagnostico,
  type ContaRef,
  type ItemRef,
  type SerieRef,
} from './espelho-doctor-logic'

const contas: ContaRef[] = [
  { id: 'joao', nome: 'João', tipo: 'pessoal' },
  { id: 'casa', nome: 'Casa', tipo: 'casa' },
]

const serie = (over: Partial<SerieRef> = {}): SerieRef => ({
  id: 'serie-1',
  descricao: 'Predialnet',
  contaId: 'joao',
  espelharContaId: 'casa',
  ativa: true,
  ...over,
})

const origem = (over: Partial<ItemRef> = {}): ItemRef => ({
  id: 'item-nov',
  descricao: 'Predialnet',
  contaId: 'joao',
  recorrenciaId: 'serie-1',
  espelhoDe: null,
  mes: '2026-11',
  ...over,
})

const espelho = (over: Partial<ItemRef> = {}): ItemRef => ({
  id: 'espelho-nov',
  descricao: 'Predialnet',
  contaId: 'casa',
  recorrenciaId: 'serie-1',
  espelhoDe: 'item-nov',
  mes: '2026-11',
  ...over,
})

test('casaPrincipal só existe quando há exatamente uma conta da casa', () => {
  assert.equal(casaPrincipal(contas)?.id, 'casa')
  assert.equal(casaPrincipal([{ id: 'a', nome: 'A', tipo: 'pessoal' }]), null)
  assert.equal(casaPrincipal([
    { id: 'c1', nome: 'Casa 1', tipo: 'casa' },
    { id: 'c2', nome: 'Casa 2', tipo: 'casa' },
  ]), null)
})

test('tudo certo não gera problema nem ação', () => {
  const d = diagnosticarEspelhos({ contas, series: [serie()], itens: [origem(), espelho()] })
  assert.deepEqual(d.problemas, [])
  assert.deepEqual(d.plano, [])
  assert.deepEqual(d.resumo, { erros: 0, avisos: 0, corrigiveis: 0 })
  assert.equal(resumoDiagnostico(d.resumo), 'Tudo certo: os espelhos da casa estão no lugar.')
})

test('o caso do Predialnet: série marcada, cópia não criada', () => {
  const d = diagnosticarEspelhos({ contas, series: [serie()], itens: [origem()] })

  assert.equal(d.problemas.length, 1)
  assert.equal(d.problemas[0].tipo, 'ESPELHO_FALTANDO')
  assert.equal(d.problemas[0].severidade, 'erro')
  assert.match(d.problemas[0].detalhe, /"Casa"/)
  assert.deepEqual(d.plano, [
    { tipo: 'criar', origemItemId: 'item-nov', destinoContaId: 'casa' },
  ])
})

test('cópia na conta errada é movida para a casa certa', () => {
  const d = diagnosticarEspelhos({
    contas,
    series: [serie()],
    itens: [origem(), espelho({ contaId: 'joao' })],
  })

  assert.equal(d.problemas[0].tipo, 'ESPELHO_CONTA_ERRADA')
  assert.deepEqual(d.plano, [
    { tipo: 'mover', espelhoId: 'espelho-nov', destinoContaId: 'casa' },
  ])
})

test('cópia sem conta (não aparece em lugar nenhum) também é movida', () => {
  const d = diagnosticarEspelhos({
    contas,
    series: [serie()],
    itens: [origem(), espelho({ contaId: null })],
  })

  assert.equal(d.problemas[0].tipo, 'ESPELHO_CONTA_ERRADA')
  assert.match(d.problemas[0].titulo, /sem conta/)
  assert.deepEqual(d.plano, [{ tipo: 'mover', espelhoId: 'espelho-nov', destinoContaId: 'casa' }])
})

test('cópias repetidas: fica uma e apaga as extras', () => {
  const d = diagnosticarEspelhos({
    contas,
    series: [serie()],
    itens: [origem(), espelho(), espelho({ id: 'espelho-extra' })],
  })

  assert.equal(d.problemas.length, 1)
  assert.equal(d.problemas[0].tipo, 'ESPELHO_DUPLICADO')
  assert.deepEqual(d.plano, [{ tipo: 'apagar', espelhoId: 'espelho-extra' }])
})

test('destino apontando para conta que não é casa é corrigido para a casa', () => {
  const d = diagnosticarEspelhos({
    contas,
    series: [serie({ espelharContaId: 'joao' })],
    itens: [origem()],
  })

  assert.equal(d.problemas[0].tipo, 'SERIE_DESTINO_INVALIDO')
  assert.equal(d.problemas[0].corrigivel, true)
  assert.deepEqual(d.plano, [{ tipo: 'criar', origemItemId: 'item-nov', destinoContaId: 'casa' }])
})

test('destino apagado e mais de uma casa: avisa mas não mexe', () => {
  const d = diagnosticarEspelhos({
    contas: [
      { id: 'joao', nome: 'João', tipo: 'pessoal' },
      { id: 'c1', nome: 'Casa 1', tipo: 'casa' },
      { id: 'c2', nome: 'Casa 2', tipo: 'casa' },
    ],
    series: [serie({ espelharContaId: 'sumiu' })],
    itens: [origem()],
  })

  assert.equal(d.problemas[0].tipo, 'SERIE_DESTINO_INVALIDO')
  assert.equal(d.problemas[0].corrigivel, false)
  assert.deepEqual(d.plano, [])
})

test('cópia órfã (origem apagada) é removida', () => {
  const d = diagnosticarEspelhos({
    contas,
    series: [],
    itens: [espelho({ espelhoDe: 'nao-existe' })],
  })

  assert.equal(d.problemas[0].tipo, 'ESPELHO_ORFAO')
  assert.deepEqual(d.plano, [{ tipo: 'apagar', espelhoId: 'espelho-nov' }])
})

test('série só na pessoal, sem marca, vira aviso (não mexe em nada)', () => {
  const d = diagnosticarEspelhos({
    contas,
    series: [serie({ espelharContaId: null })],
    itens: [origem()],
  })

  assert.equal(d.problemas[0].tipo, 'SERIE_PODE_ESPELHAR')
  assert.equal(d.problemas[0].severidade, 'aviso')
  assert.equal(d.problemas[0].corrigivel, false)
  assert.deepEqual(d.plano, [])
})

test('série encerrada não entra no diagnóstico', () => {
  const d = diagnosticarEspelhos({
    contas,
    series: [serie({ ativa: false })],
    itens: [origem()],
  })
  assert.deepEqual(d.problemas, [])
})

test('resumo mostra erros e avisos', () => {
  assert.equal(resumoDiagnostico({ erros: 2, avisos: 1, corrigiveis: 2 }), '2 problemas · 1 aviso')
  assert.equal(resumoDiagnostico({ erros: 1, avisos: 0, corrigiveis: 1 }), '1 problema')
})
