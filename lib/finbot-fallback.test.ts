import assert from 'node:assert/strict'
import test from 'node:test'

import { buildOfflineReply } from './finbot-fallback'

test('resume o mês em modo offline com os dados reais', () => {
  const reply = buildOfflineReply({
    mesLabel: 'Outubro 2026',
    receitas: 8500,
    despesas: 6120.5,
    saldo: 2379.5,
    nLancamentos: 42,
    topCategoria: { nome: 'Alimentação', valor: 1800 },
    orcamentosExcedidos: [{ categoria: 'Lazer', gasto: 450, limite: 300 }],
    motivo: 'LLM_NOT_CONFIGURED',
    faltando: ['USER_LLM_API_KEY (ou BTY_LLM_SERVER_API_KEY / HAPPYSEEDS_KEY)'],
  })

  assert.match(reply, /modo offline/)
  assert.match(reply, /Outubro 2026/)
  assert.match(reply, /R\$\s?8\.500,00/)
  assert.match(reply, /Maior gasto:\*\* Alimentação/)
  assert.match(reply, /Lazer: R\$\s?450,00 de R\$\s?300,00/)
  assert.match(reply, /faltando: USER_LLM_API_KEY/)
})

test('avisa quando não há lançamentos e não lista orçamentos vazios', () => {
  const reply = buildOfflineReply({
    mesLabel: 'Novembro 2026',
    receitas: 0,
    despesas: 0,
    saldo: 0,
    nLancamentos: 0,
    motivo: 'LLM_ERROR',
  })

  assert.match(reply, /Não há lançamentos neste mês/)
  assert.doesNotMatch(reply, /Orçamentos estourados/)
  assert.match(reply, /_Detalhe técnico: o provedor de IA falhou ao responder\._/)
})
