import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_LLM_MODEL, normalizeLlmBaseUrl, resolveLlmConfig, type LlmEnv } from './llm'

const reactus = 'https://reactus-api.happyseeds.ai'

test('usa USER_LLM_BASE_URL + USER_LLM_API_KEY quando preenchidos', () => {
  const config = resolveLlmConfig({
    USER_LLM_BASE_URL: 'https://llm.exemplo.com/v1/',
    USER_LLM_API_KEY: 'chave-usuario',
  })
  assert.deepEqual(config, {
    baseUrl: 'https://llm.exemplo.com/v1',
    apiKey: 'chave-usuario',
    model: DEFAULT_LLM_MODEL,
    baseUrlSource: 'USER_LLM_BASE_URL',
    apiKeySource: 'USER_LLM_API_KEY',
  })
})

test('cai em BTY_LLM_SERVER_* quando as variáveis do usuário estão vazias', () => {
  const config = resolveLlmConfig({
    USER_LLM_BASE_URL: '   ',
    USER_LLM_API_KEY: '',
    BTY_LLM_SERVER_BASE_URL: 'https://gateway.exemplo.com/v1',
    BTY_LLM_SERVER_API_KEY: 'chave-gateway',
  })
  assert.equal(config?.baseUrl, 'https://gateway.exemplo.com/v1')
  assert.equal(config?.apiKey, 'chave-gateway')
  assert.equal(config?.baseUrlSource, 'BTY_LLM_SERVER_BASE_URL')
  assert.equal(config?.apiKeySource, 'BTY_LLM_SERVER_API_KEY')
})

test('deriva a base de REACTUS_BASE_URL e usa HAPPYSEEDS_KEY como último fallback', () => {
  const env: LlmEnv = {
    USER_LLM_BASE_URL: '',
    USER_LLM_API_KEY: '',
    REACTUS_BASE_URL: `${reactus}/`,
    HAPPYSEEDS_KEY: 'chave-happyseeds',
  }
  const config = resolveLlmConfig(env)
  assert.equal(config?.baseUrl, `${reactus}/v1`)
  assert.equal(config?.apiKey, 'chave-happyseeds')
  assert.equal(config?.baseUrlSource, 'REACTUS_BASE_URL')
  assert.equal(config?.apiKeySource, 'HAPPYSEEDS_KEY')
})

test('caso que quebrou: chave presente, só a base derivada do REACTUS', () => {
  // Era exatamente o estado do .env: BTY_LLM_SERVER_API_KEY preenchida,
  // USER_LLM_BASE_URL vazio e nenhuma BTY_LLM_SERVER_BASE_URL.
  const config = resolveLlmConfig({
    BTY_LLM_SERVER_API_KEY: 'chave-prod',
    REACTUS_BASE_URL: reactus,
  })
  assert.ok(config, 'não deveria voltar LLM_NOT_CONFIGURED')
  assert.equal(config.baseUrl, `${reactus}/v1`)
})

test('sem base e sem chave não configura', () => {
  assert.equal(resolveLlmConfig({}), null)
  assert.equal(resolveLlmConfig({ USER_LLM_API_KEY: 'só-chave' }), null)
  assert.equal(resolveLlmConfig({ REACTUS_BASE_URL: reactus }), null)
})

test('respeita USER_LLM_MODEL', () => {
  const config = resolveLlmConfig({
    USER_LLM_BASE_URL: 'https://llm.exemplo.com',
    USER_LLM_API_KEY: 'k',
    USER_LLM_MODEL: 'claude-opus-4.1',
  })
  assert.equal(config?.model, 'claude-opus-4.1')
})

test('normaliza bases coladas de formas diferentes', () => {
  assert.equal(normalizeLlmBaseUrl('https://api.anthropic.com'), 'https://api.anthropic.com/v1')
  assert.equal(normalizeLlmBaseUrl('https://api.anthropic.com/'), 'https://api.anthropic.com/v1')
  assert.equal(normalizeLlmBaseUrl('https://api.anthropic.com/v1/messages'), 'https://api.anthropic.com/v1')
  assert.equal(normalizeLlmBaseUrl('api.exemplo.com/v1/'), 'https://api.exemplo.com/v1')
  assert.equal(normalizeLlmBaseUrl('https://gateway.exemplo.com/llm/v1'), 'https://gateway.exemplo.com/llm/v1')
  assert.equal(normalizeLlmBaseUrl(''), '')
})
