/**
 * Resolução da configuração do provedor de IA (API compatível com Anthropic).
 *
 * O FinBot precisa de `baseUrl` + `apiKey`. Em vez de exigir que o usuário
 * preencha `USER_LLM_BASE_URL`/`USER_LLM_API_KEY` (que costumam ficar vazios),
 * esta função cai em fallbacks do ambiente:
 *
 *   baseUrl: USER_LLM_BASE_URL → BTY_LLM_SERVER_BASE_URL → REACTUS_BASE_URL + "/v1"
 *   apiKey:  USER_LLM_API_KEY  → BTY_LLM_SERVER_API_KEY  → HAPPYSEEDS_KEY
 *   model:   USER_LLM_MODEL    → claude-sonnet-4.6
 *
 * Módulo puro (sem `server-only`) para poder ser testado com node:test.
 */

export const DEFAULT_LLM_MODEL = 'claude-sonnet-4.6'

export interface LlmEnv {
  USER_LLM_BASE_URL?: string
  BTY_LLM_SERVER_BASE_URL?: string
  REACTUS_BASE_URL?: string
  USER_LLM_API_KEY?: string
  BTY_LLM_SERVER_API_KEY?: string
  HAPPYSEEDS_KEY?: string
  USER_LLM_MODEL?: string
}

export interface LlmConfig {
  /** Base já normalizada, sem barra final e sem `/messages`. */
  baseUrl: string
  apiKey: string
  model: string
  /** De onde veio a base (útil no log/health). */
  baseUrlSource: 'USER_LLM_BASE_URL' | 'BTY_LLM_SERVER_BASE_URL' | 'REACTUS_BASE_URL'
  /** De onde veio a chave (útil no log/health). */
  apiKeySource: 'USER_LLM_API_KEY' | 'BTY_LLM_SERVER_API_KEY' | 'HAPPYSEEDS_KEY'
}

export interface LlmStatus {
  configured: boolean
  baseUrl?: string
  baseUrlSource?: LlmConfig['baseUrlSource']
  apiKeySource?: LlmConfig['apiKeySource']
  model: string
  /** Variáveis que o desenvolvedor precisa definir para completar a configuração. */
  missing: string[]
}

const clean = (value?: string): string => (value ?? '').trim()

function firstNonEmpty<T extends string>(candidates: Array<[T, string | undefined]>): { value: string; source: T } | null {
  for (const [source, raw] of candidates) {
    const value = clean(raw)
    if (value) return { value, source }
  }
  return null
}

/**
 * Normaliza a base para o formato usado na chamada: `${baseUrl}/messages`.
 * - remove barras finais
 * - remove `/messages` se o usuário colou a URL completa do endpoint
 * - adiciona `/v1` quando é só host (ex.: https://api.anthropic.com)
 */
export function normalizeLlmBaseUrl(raw: string): string {
  let base = clean(raw).replace(/\/+$/, '')
  if (!base) return ''
  base = base.replace(/\/messages$/i, '').replace(/\/+$/, '')

  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`
  }

  try {
    const url = new URL(base)
    if (url.pathname === '' || url.pathname === '/') {
      return `${url.origin}/v1`
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return base
  }
}

export function resolveLlmConfig(env: LlmEnv): LlmConfig | null {
  const explicitBase = firstNonEmpty<'USER_LLM_BASE_URL' | 'BTY_LLM_SERVER_BASE_URL'>([
    ['USER_LLM_BASE_URL', env.USER_LLM_BASE_URL],
    ['BTY_LLM_SERVER_BASE_URL', env.BTY_LLM_SERVER_BASE_URL],
  ])

  let base: { value: string; source: LlmConfig['baseUrlSource'] } | null = explicitBase

  if (!base) {
    const reactus = clean(env.REACTUS_BASE_URL).replace(/\/+$/, '')
    if (reactus) {
      base = { value: `${reactus}/v1`, source: 'REACTUS_BASE_URL' }
    }
  }

  const apiKey = firstNonEmpty<LlmConfig['apiKeySource']>([
    ['USER_LLM_API_KEY', env.USER_LLM_API_KEY],
    ['BTY_LLM_SERVER_API_KEY', env.BTY_LLM_SERVER_API_KEY],
    ['HAPPYSEEDS_KEY', env.HAPPYSEEDS_KEY],
  ])

  if (!base || !apiKey) return null

  const baseUrl = normalizeLlmBaseUrl(base.value)
  if (!baseUrl) return null

  return {
    baseUrl,
    apiKey: apiKey.value,
    model: clean(env.USER_LLM_MODEL) || DEFAULT_LLM_MODEL,
    baseUrlSource: base.source,
    apiKeySource: apiKey.source,
  }
}

/** Lê direto de process.env (referências literais para o Next inlinar no build). */
export function llmEnvFromProcess(): LlmEnv {
  return {
    USER_LLM_BASE_URL: process.env.USER_LLM_BASE_URL,
    BTY_LLM_SERVER_BASE_URL: process.env.BTY_LLM_SERVER_BASE_URL,
    REACTUS_BASE_URL: process.env.REACTUS_BASE_URL,
    USER_LLM_API_KEY: process.env.USER_LLM_API_KEY,
    BTY_LLM_SERVER_API_KEY: process.env.BTY_LLM_SERVER_API_KEY,
    HAPPYSEEDS_KEY: process.env.HAPPYSEEDS_KEY,
    USER_LLM_MODEL: process.env.USER_LLM_MODEL,
  }
}

export function getLlmConfig(): LlmConfig | null {
  return resolveLlmConfig(llmEnvFromProcess())
}

/** Diagnóstico sem vazar a chave (apenas nomes de variáveis). */
export function getLlmStatus(): LlmStatus {
  const env = llmEnvFromProcess()
  const config = resolveLlmConfig(env)
  const model = clean(env.USER_LLM_MODEL) || DEFAULT_LLM_MODEL

  if (config) {
    return {
      configured: true,
      baseUrl: config.baseUrl,
      baseUrlSource: config.baseUrlSource,
      apiKeySource: config.apiKeySource,
      model: config.model,
      missing: [],
    }
  }

  const hasKey = [env.USER_LLM_API_KEY, env.BTY_LLM_SERVER_API_KEY, env.HAPPYSEEDS_KEY].some(v => clean(v))
  const hasBase = [env.USER_LLM_BASE_URL, env.BTY_LLM_SERVER_BASE_URL, env.REACTUS_BASE_URL].some(v => clean(v))

  const missing: string[] = []
  if (!hasBase) missing.push('USER_LLM_BASE_URL (ou BTY_LLM_SERVER_BASE_URL / REACTUS_BASE_URL)')
  if (!hasKey) missing.push('USER_LLM_API_KEY (ou BTY_LLM_SERVER_API_KEY / HAPPYSEEDS_KEY)')

  return { configured: false, model, missing }
}
