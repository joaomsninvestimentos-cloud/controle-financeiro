import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addMeses,
  dataDaOcorrencia,
  diaDoMes,
  diffMeses,
  HORIZONTE_MESES,
  MAX_MESES_POR_SERIE,
  mesAlvoGerado,
  mesFinalPadrao,
  mesesParaGerar,
  planejarOcorrencias,
  ultimoDiaDoMes,
} from './recorrencia'

test('addMeses atravessa a virada de ano nos dois sentidos', () => {
  assert.equal(addMeses('2026-11', 12), '2027-11')
  assert.equal(addMeses('2026-12', 1), '2027-01')
  assert.equal(addMeses('2027-01', -1), '2026-12')
  assert.equal(addMeses('2026-03', -3), '2025-12')
  assert.equal(addMeses('2026-11', 0), '2026-11')
})

test('diffMeses conta meses entre dois períodos', () => {
  assert.equal(diffMeses('2026-11', '2026-11'), 0)
  assert.equal(diffMeses('2026-11', '2027-11'), 12)
  assert.equal(diffMeses('2027-01', '2026-12'), -1)
})

test('ultimoDiaDoMes respeita fevereiro e ano bissexto', () => {
  assert.equal(ultimoDiaDoMes('2026-02'), 28)
  assert.equal(ultimoDiaDoMes('2028-02'), 29)
  assert.equal(ultimoDiaDoMes('2026-04'), 30)
  assert.equal(ultimoDiaDoMes('2026-12'), 31)
})

test('dia 31 em mês curto cai no último dia do mês', () => {
  assert.equal(dataDaOcorrencia('2026-11', 31), '2026-11-30')
  assert.equal(dataDaOcorrencia('2026-02', 31), '2026-02-28')
  assert.equal(dataDaOcorrencia('2028-02', 30), '2028-02-29')
  assert.equal(dataDaOcorrencia('2026-12', 31), '2026-12-31')
  assert.equal(dataDaOcorrencia('2026-11', 5), '2026-11-05')
})

test('diaDoMes lê a data YYYY-MM-DD', () => {
  assert.equal(diaDoMes('2026-11-05'), 5)
  assert.equal(diaDoMes('2026-11-31'), 31)
  assert.equal(diaDoMes(''), 1)
})

test('cadastro gera o mês inicial + 12 meses', () => {
  assert.equal(HORIZONTE_MESES, 13)
  assert.equal(mesFinalPadrao('2026-11'), '2027-11')

  const meses = mesesParaGerar({ mesInicio: '2026-11' })
  assert.equal(meses.length, 13)
  assert.equal(meses[0], '2026-11')
  assert.equal(meses.at(-1), '2027-11')
})

test('mesFim limita a geração', () => {
  const meses = mesesParaGerar({ mesInicio: '2026-11', mesFim: '2027-01' })
  assert.deepEqual(meses, ['2026-11', '2026-12', '2027-01'])
})

test('abrir um mês além do horizonte estende a série até ele', () => {
  // já gerado até 2027-11 (horizonte do cadastro); abriu 2028-03
  const meses = mesesParaGerar({
    mesInicio: '2026-11',
    jaGeradoAte: '2027-11',
    mesSolicitado: '2028-03',
  })
  assert.deepEqual(meses, ['2027-12', '2028-01', '2028-02', '2028-03'])
})

test('não estende além do mesFim', () => {
  const meses = mesesParaGerar({
    mesInicio: '2026-11',
    mesFim: '2027-02',
    jaGeradoAte: '2027-02',
    mesSolicitado: '2028-06',
  })
  assert.deepEqual(meses, [])
})

test('segunda chamada no mesmo mês não gera nada (idempotente)', () => {
  const meses = mesesParaGerar({
    mesInicio: '2026-11',
    jaGeradoAte: '2027-11',
    mesSolicitado: '2026-12',
  })
  assert.deepEqual(meses, [])
})

test('meses pulados não são recriados', () => {
  // horizonte do cadastro vai até 2027-11; 2027-01 foi pulado pelo usuário
  const meses = mesesParaGerar({
    mesInicio: '2026-11',
    jaGeradoAte: '2026-12',
    mesSolicitado: '2027-03',
    pulados: ['2027-01'],
  })
  assert.equal(meses[0], '2027-02')
  assert.ok(!meses.includes('2027-01'))
  assert.equal(meses.at(-1), '2027-11')
})

test('mês solicitado antes do início da série não gera nada', () => {
  const meses = mesesParaGerar({ mesInicio: '2026-11', mesSolicitado: '2026-09' })
  // ainda assim o cadastro já materializou o horizonte padrão a partir do início
  assert.equal(meses[0], '2026-11')
})

test('mesAlvoGerado nunca ultrapassa mesFim, mesmo sem solo pedido', () => {
  assert.equal(mesAlvoGerado({ mesInicio: '2026-11', mesFim: '2027-01' }), '2027-01')
  assert.equal(mesAlvoGerado({ mesInicio: '2026-11', mesFim: '2040-01' }), '2027-11')
  assert.equal(mesAlvoGerado({ mesInicio: '2026-11', mesSolicitado: '2029-05' }), '2029-05')
})

test('trava de segurança limita a geração por chamada', () => {
  const meses = mesesParaGerar({ mesInicio: '2000-01', mesSolicitado: '2035-01' })
  assert.equal(meses.length, MAX_MESES_POR_SERIE)
})

test('planejarOcorrencias gera o primeiro lote completo de uma despesa fixa', () => {
  const planejadas = planejarOcorrencias(
    [{
      id: 'serie-1', userId: 'u1', contaId: null,
      descricao: 'Aluguel', valor: '1800.00', tipo: 'despesa', categoria: 'Moradia',
      dia: 5, mesInicio: '2026-11',
    }],
    {},
    '2026-11',
  )

  assert.equal(planejadas.length, 13)
  assert.equal(planejadas[0].mes, '2026-11')
  assert.equal(planejadas[0].data, '2026-11-05')
  assert.equal(planejadas.at(-1)?.mes, '2027-11')
  assert.ok(planejadas.every(p => p.recorrenciaId === 'serie-1' && p.recorrente === true))
})

test('planejarOcorrencias não duplica o que já foi gerado', () => {
  const planejadas = planejarOcorrencias(
    [{
      id: 'serie-1', userId: 'u1', contaId: null,
      descricao: 'Internet', valor: '120.00', tipo: 'despesa', categoria: 'Serviços',
      dia: 10, mesInicio: '2026-11',
    }],
    { ultimoPorSerie: { 'serie-1': '2027-11' } },
    '2027-11',
  )
  assert.deepEqual(planejadas, [])
})

test('planejarOcorrencias estende ao abrir mês distante e respeita série encerrada', () => {
  const series = [
    { id: 'ativa', userId: 'u1', contaId: null, descricao: 'Academia', valor: '99.00', tipo: 'despesa', categoria: 'Saúde', dia: 1, mesInicio: '2026-11' },
    { id: 'encerrada', userId: 'u1', contaId: null, descricao: 'Curso', valor: '50.00', tipo: 'despesa', categoria: 'Educação', dia: 2, mesInicio: '2026-11', mesFim: '2027-01' },
  ]
  const planejadas = planejarOcorrencias(
    series,
    { ultimoPorSerie: { ativa: '2027-11', encerrada: '2027-01' } },
    '2028-02',
  )
  assert.deepEqual(planejadas.map(p => `${p.recorrenciaId}:${p.mes}`), [
    'ativa:2027-12', 'ativa:2028-01', 'ativa:2028-02',
  ])
})

test('planejarOcorrencias gera várias séries numa passada', () => {
  const plano = planejarOcorrencias(
    [
      { id: 'a', userId: 'u1', contaId: 'c1', descricao: 'Aluguel', valor: '1800.00', tipo: 'despesa', categoria: 'Moradia', dia: 31, mesInicio: '2026-11' },
      { id: 'b', userId: 'u1', contaId: null, descricao: 'Salário', valor: '5000.00', tipo: 'receita', categoria: 'Salário', dia: 5, mesInicio: '2026-11', mesFim: '2026-12' },
    ],
    {},
    '2026-11',
  )
  const porSerie = plano.reduce<Record<string, number>>((acc, p) => {
    acc[p.recorrenciaId] = (acc[p.recorrenciaId] ?? 0) + 1
    return acc
  }, {})
  assert.equal(porSerie.a, 13)
  assert.equal(porSerie.b, 2)
  assert.equal(plano.find(p => p.recorrenciaId === 'a')?.data, '2026-11-30')
})
