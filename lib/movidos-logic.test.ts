import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAVE_MARCAS,
  DIAS_MARCA_VISIVEL,
  limparAntigas,
  marcasVisiveis,
  normalizarMarca,
  registrarMarca,
  removerMarca,
  resumoMovidos,
  rotuloMarca,
  textoResumo,
  type MarcaMovido,
} from './movidos-logic'

const MS_DIA = 24 * 60 * 60 * 1000
const AGORA = 1_800_000_000_000

const marca = (over: Partial<MarcaMovido> = {}): MarcaMovido => ({
  itemId: 'item-1',
  destinoId: 'conta-joao',
  destinoNome: 'João',
  em: AGORA,
  ...over,
})

test('chave do localStorage é estável', () => {
  assert.equal(CHAVE_MARCAS, 'lancamentos-movidos')
  assert.equal(DIAS_MARCA_VISIVEL, 7)
})

test('registrar substitui a marca anterior do mesmo lançamento', () => {
  const anterior = marca({ destinoNome: 'Casa', em: AGORA - MS_DIA })
  const lista = registrarMarca([anterior], marca({ destinoNome: 'João' }), AGORA)

  assert.equal(lista.length, 1)
  assert.equal(lista[0].destinoNome, 'João')
  assert.equal(lista[0].em, AGORA)
})

test('registrar em lançamentos diferentes acumula', () => {
  const lista = registrarMarca(
    registrarMarca([], marca({ itemId: 'a' }), AGORA),
    marca({ itemId: 'b' }),
    AGORA,
  )
  assert.deepEqual(lista.map(m => m.itemId).sort(), ['a', 'b'])
})

test('marcas vencidas saem, recentes ficam', () => {
  const velha = marca({ itemId: 'velha', em: AGORA - 8 * MS_DIA })
  const recente = marca({ itemId: 'nova', em: AGORA - 2 * MS_DIA })
  const limite = marca({ itemId: 'limite', em: AGORA - DIAS_MARCA_VISIVEL * MS_DIA })

  const restantes = limparAntigas([velha, recente, limite], AGORA)
  assert.deepEqual(restantes.map(m => m.itemId).sort(), ['limite', 'nova'])
})

test('registrar já limpa as antigas de brinde', () => {
  const velha = marca({ itemId: 'velha', em: AGORA - 30 * MS_DIA })
  const lista = registrarMarca([velha], marca({ itemId: 'nova' }), AGORA)
  assert.deepEqual(lista.map(m => m.itemId), ['nova'])
})

test('remover apaga só o lançamento pedido', () => {
  const lista = [marca({ itemId: 'a' }), marca({ itemId: 'b' })]
  assert.deepEqual(removerMarca(lista, 'a').map(m => m.itemId), ['b'])
})

test('marcasVisiveis ignora vencidas e indexa por item', () => {
  const mapa = marcasVisiveis([
    marca({ itemId: 'ok', em: AGORA - MS_DIA }),
    marca({ itemId: 'velha', em: AGORA - 20 * MS_DIA }),
  ], AGORA)

  assert.equal(mapa.size, 1)
  assert.equal(mapa.get('ok')?.destinoNome, 'João')
  assert.equal(mapa.get('velha'), undefined)
})

test('normalizarMarca tolera lixo do localStorage', () => {
  assert.deepEqual(normalizarMarca(null), [])
  assert.deepEqual(normalizarMarca('quebrado'), [])
  assert.deepEqual(normalizarMarca({}), [])
  assert.deepEqual(normalizarMarca([{ itemId: 'x' }]), []) // faltando campos
  assert.deepEqual(normalizarMarca([marca({ em: Number.NaN })]), [])

  const valida = marca()
  assert.deepEqual(normalizarMarca([valida]), [valida])
})

test('normalizarMarca descarta duplicatas e fica com a primeira', () => {
  const a = marca({ destinoNome: 'João' })
  const b = marca({ destinoNome: 'Casa' })
  const lista = normalizarMarca([a, b])
  assert.equal(lista.length, 1)
  assert.equal(lista[0].destinoNome, 'João')
})

test('resumo conta e deduplica destinos, ignorando vencidas', () => {
  const resumo = resumoMovidos([
    marca({ itemId: 'a', destinoNome: 'João' }),
    marca({ itemId: 'b', destinoNome: 'João' }),
    marca({ itemId: 'c', destinoNome: 'Casa' }),
    marca({ itemId: 'd', destinoNome: 'Casa', em: AGORA - 30 * MS_DIA }),
  ], AGORA)

  assert.equal(resumo.total, 3)
  assert.deepEqual(resumo.destinos, ['João', 'Casa'])
})

test('textos do selo e do resumo', () => {
  assert.equal(rotuloMarca(marca()), '→ João')
  assert.equal(textoResumo({ total: 0, destinos: [] }), '')
  assert.equal(textoResumo({ total: 1, destinos: ['João'] }), '1 movido para João')
  assert.equal(textoResumo({ total: 6, destinos: ['João', 'Casa'] }), '6 movidos para João, Casa')
})
