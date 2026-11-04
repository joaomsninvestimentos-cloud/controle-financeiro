import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DIAS_MARCA_VISIVEL,
  limparAntigas,
  marcasVisiveis,
  normalizarMarca,
  registrarMarca,
  removerMarca,
  resumoMovidos,
  type MarcaMovido,
} from './movidos-logic'

const DIA = 24 * 60 * 60 * 1000
const agora = Date.UTC(2026, 10, 4)

function marca(parcial: Partial<MarcaMovido> & { itemId: string }): MarcaMovido {
  return {
    destinoNome: 'João',
    destinoId: 'conta-joao',
    em: agora,
    ...parcial,
  }
}

test('registrar substitui marca anterior do mesmo item', () => {
  const lista = [marca({ itemId: 'i1', destinoNome: 'Casa', destinoId: 'casa', em: agora - DIA })]
  const nova = registrarMarca(
    lista,
    marca({ itemId: 'i1', destinoNome: 'João', destinoId: 'joao' }),
    agora,
  )
  assert.equal(nova.length, 1)
  assert.equal(nova[0].destinoNome, 'João')
  assert.equal(nova[0].destinoId, 'joao')
  assert.equal(nova[0].em, agora)
  assert.notEqual(nova, lista)
  assert.equal(lista[0].destinoNome, 'Casa')
})

test('limparAntigas remove > 7 dias e mantém as recentes', () => {
  const lista = [
    marca({ itemId: 'velha', em: agora - (DIAS_MARCA_VISIVEL * DIA + 1) }),
    marca({ itemId: 'limite', em: agora - DIAS_MARCA_VISIVEL * DIA }),
    marca({ itemId: 'recente', em: agora - DIA }),
  ]
  const limpa = limparAntigas(lista, agora)
  assert.deepEqual(limpa.map(m => m.itemId), ['limite', 'recente'])
})

test('normalizarMarca com JSON inválido/null devolve []', () => {
  assert.deepEqual(normalizarMarca(null), [])
  assert.deepEqual(normalizarMarca(undefined), [])
  assert.deepEqual(normalizarMarca('{quebrado'), [])
  assert.deepEqual(normalizarMarca({ itemId: 'x' }), [])
  assert.deepEqual(normalizarMarca(['lixo', 1, null]), [])
  assert.deepEqual(
    normalizarMarca([{ itemId: 'ok', destinoNome: 'João', destinoId: 'j', em: 1 }, { itemId: '' }]),
    [{ itemId: 'ok', destinoNome: 'João', destinoId: 'j', em: 1 }],
  )
})

test('resumoMovidos conta e deduplica nomes de destino', () => {
  const lista = [
    marca({ itemId: 'a', destinoNome: 'João' }),
    marca({ itemId: 'b', destinoNome: 'Casa' }),
    marca({ itemId: 'c', destinoNome: 'João' }),
    marca({ itemId: 'velha', destinoNome: 'Antiga', em: agora - 8 * DIA }),
  ]
  const resumo = resumoMovidos(lista, agora)
  assert.equal(resumo.total, 3)
  assert.deepEqual(resumo.destinos, ['João', 'Casa'])
})

test('marcasVisiveis não retorna item de outra conta', () => {
  const lista = [
    marca({ itemId: 'na-joao', destinoId: 'joao', destinoNome: 'João' }),
    marca({ itemId: 'na-casa', destinoId: 'casa', destinoNome: 'Casa' }),
    marca({ itemId: 'expirada', destinoId: 'joao', em: agora - 8 * DIA }),
  ]
  const visiveis = marcasVisiveis(lista, agora)
  assert.equal(visiveis.has('expirada'), false)
  assert.equal(visiveis.get('na-joao')?.destinoId, 'joao')
  assert.equal(visiveis.get('na-casa')?.destinoId, 'casa')
  assert.equal(visiveis.size, 2)
})

test('removerMarca tira só o item pedido', () => {
  const lista = [marca({ itemId: 'a' }), marca({ itemId: 'b' })]
  const nova = removerMarca(lista, 'a')
  assert.deepEqual(nova.map(m => m.itemId), ['b'])
})
