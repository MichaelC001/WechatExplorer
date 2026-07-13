import { app } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import type {
  AIChatRequestOptions,
  AIConnectionTestResult,
  AIProviderConfig,
  AIProviderListResult,
  AIProviderSummary,
  AIRuntimeModelConfig,
  LegacyAIConfig
} from '../../shared/ai-provider'
import { AIProviderKeyStore } from '../ai-provider-key-store'

interface AIProviderMetadataFile {
  version: 1
  defaultProviderId?: string
  providers: Array<Omit<AIProviderSummary, 'hasApiKey' | 'isDefault'>>
}

type AIMessage = { role: string; content: string }
type AIRequestResult = {
  data: string
  usage?: { input?: number; output?: number; total?: number; estimated?: boolean }
}
interface OpenAIResponsePayload {
  error?: { message?: string }
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}
interface AnthropicResponsePayload {
  error?: { message?: string }
  content?: Array<{ type?: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

export class AIProviderService {
  constructor(private readonly keyStore = new AIProviderKeyStore()) {}

  list(): AIProviderListResult {
    this.ensureEnvironmentMigration()
    try {
      const data = this.readMetadata()
      return {
        success: true,
        defaultProviderId: data.defaultProviderId,
        providers: data.providers.map((provider) =>
          this.toSummary(provider, data.defaultProviderId)
        )
      }
    } catch {
      return { success: false, providers: [], error: 'AI Provider 配置无法读取' }
    }
  }

  getRuntimeConfig(): AIRuntimeModelConfig {
    const result = this.list()
    const provider =
      result.providers.find((item) => item.id === result.defaultProviderId) || result.providers[0]
    const model = provider?.models.find((item) => item.id === provider.defaultModel)
    return {
      providerId: provider?.id,
      providerName: provider?.name || '尚未配置',
      model: provider?.defaultModel || '',
      modelName: model?.name || provider?.defaultModel || '尚未选择模型',
      configured: Boolean(
        provider && provider.models.length && (provider.hasApiKey || !needsApiKey(provider))
      ),
      status: provider?.status || 'untested'
    }
  }

  save(input: AIProviderConfig): AIProviderListResult {
    const validationError = validateProvider(input)
    if (validationError) return { success: false, providers: [], error: validationError }
    const data = this.readMetadata()
    const existing = data.providers.find((provider) => provider.id === input.id)
    if (input.apiKey?.trim()) {
      const saved = this.keyStore.save(input.id, input.apiKey.trim())
      if (!saved.success) return { success: false, providers: [], error: saved.error }
    } else if (needsApiKey(input) && !this.keyStore.get(input.id).key) {
      return { success: false, providers: [], error: '请填写 API Key' }
    }

    const metadata: Omit<AIProviderSummary, 'hasApiKey' | 'isDefault'> = {
      id: input.id,
      name: input.name.trim(),
      type: input.type,
      baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
      auth: input.auth,
      models: input.models,
      defaultModel: input.defaultModel,
      advanced: input.advanced,
      status: existing?.status || 'untested',
      lastTestedAt: existing?.lastTestedAt,
      lastError: existing?.lastError
    }
    const index = data.providers.findIndex((provider) => provider.id === input.id)
    if (index >= 0) data.providers[index] = metadata
    else data.providers.push(metadata)
    if (!data.defaultProviderId) data.defaultProviderId = input.id
    this.writeMetadata(data)
    return this.list()
  }

  delete(providerId: string): AIProviderListResult {
    const data = this.readMetadata()
    data.providers = data.providers.filter((provider) => provider.id !== providerId)
    if (data.defaultProviderId === providerId) data.defaultProviderId = data.providers[0]?.id
    const cleared = this.keyStore.clear(providerId)
    if (!cleared.success) return { success: false, providers: [], error: cleared.error }
    this.writeMetadata(data)
    return this.list()
  }

  setDefault(providerId: string): AIProviderListResult {
    const data = this.readMetadata()
    if (!data.providers.some((provider) => provider.id === providerId)) {
      return { success: false, providers: [], error: '供应商不存在' }
    }
    data.defaultProviderId = providerId
    this.writeMetadata(data)
    return this.list()
  }

  migrateLegacy(config: LegacyAIConfig): AIProviderListResult {
    const data = this.readMetadata()
    if (data.providers.length) return this.list()
    const provider = deepSeekProvider(config.baseUrl, config.model)
    if (config.apiKey?.trim()) {
      const saved = this.keyStore.save(provider.id, config.apiKey.trim())
      if (!saved.success) return { success: false, providers: [], error: saved.error }
    }
    data.providers = [stripRuntimeFields(provider)]
    data.defaultProviderId = provider.id
    this.writeMetadata(data)
    return this.list()
  }

  async test(providerId: string): Promise<AIConnectionTestResult> {
    const startedAt = Date.now()
    try {
      await this.request([{ role: 'user', content: 'Reply with OK.' }], { providerId }, true)
      this.updateTestStatus(providerId, 'connected')
      return { success: true, latencyMs: Date.now() - startedAt }
    } catch (error) {
      const message = safeAIError(error)
      this.updateTestStatus(providerId, 'error', message)
      return { success: false, error: message, latencyMs: Date.now() - startedAt }
    }
  }

  async chat(
    messages: AIMessage[],
    options?: AIChatRequestOptions
  ): Promise<{
    success: boolean
    data?: string
    usage?: { input?: number; output?: number; total?: number; estimated?: boolean }
    error?: string
  }> {
    try {
      return { success: true, ...(await this.request(messages, options)) }
    } catch (error) {
      return { success: false, error: safeAIError(error) }
    }
  }

  private async request(
    messages: AIMessage[],
    options?: AIChatRequestOptions,
    testing = false
  ): Promise<{
    data: string
    usage?: { input?: number; output?: number; total?: number; estimated?: boolean }
  }> {
    if (options?.apiKey) return this.requestLegacy(messages, options)
    const list = this.list()
    const provider =
      list.providers.find((item) => item.id === options?.providerId) ||
      list.providers.find((item) => item.id === list.defaultProviderId)
    if (!provider) throw new Error('尚未配置 AI Provider')
    const model = options?.modelId || provider.defaultModel
    const key = this.keyStore.get(provider.id).key || ''
    if (needsApiKey(provider) && !key) throw new Error('当前供应商尚未配置 API Key')
    return provider.type === 'anthropic-messages'
      ? requestAnthropic(provider, key, model, messages, testing)
      : requestOpenAICompatible(provider, key, model, messages, testing)
  }

  private async requestLegacy(
    messages: AIMessage[],
    options: AIChatRequestOptions
  ): Promise<AIRequestResult> {
    const provider = deepSeekProvider(options.baseURL, options.model)
    return requestOpenAICompatible(
      provider,
      options.apiKey || '',
      options.model || provider.defaultModel,
      messages
    )
  }

  private updateTestStatus(
    providerId: string,
    status: 'connected' | 'error',
    lastError?: string
  ): void {
    const data = this.readMetadata()
    const provider = data.providers.find((item) => item.id === providerId)
    if (!provider) return
    provider.status = status
    provider.lastTestedAt = Date.now()
    provider.lastError = lastError
    this.writeMetadata(data)
  }

  private ensureEnvironmentMigration(): void {
    const data = this.readMetadata()
    if (data.providers.length) return
    const apiKey = String(import.meta.env.VITE_DEEPSEEK_API_KEY || '').trim()
    if (!apiKey) return
    this.migrateLegacy({
      apiKey,
      baseUrl: String(import.meta.env.VITE_AI_BASE_URL || ''),
      model: String(import.meta.env.VITE_AI_MODEL || '')
    })
  }

  private toSummary(
    provider: Omit<AIProviderSummary, 'hasApiKey' | 'isDefault'>,
    defaultProviderId?: string
  ): AIProviderSummary {
    return {
      ...provider,
      hasApiKey: Boolean(this.keyStore.get(provider.id).key),
      isDefault: provider.id === defaultProviderId
    }
  }

  private readMetadata(): AIProviderMetadataFile {
    const filePath = this.metadataPath
    if (!fs.existsSync(filePath)) return { version: 1, providers: [] }
    const data = fs.readJsonSync(filePath) as AIProviderMetadataFile
    if (data.version !== 1 || !Array.isArray(data.providers))
      throw new Error('invalid provider metadata')
    return data
  }

  private writeMetadata(data: AIProviderMetadataFile): void {
    fs.ensureDirSync(path.dirname(this.metadataPath))
    fs.writeJsonSync(this.metadataPath, data, { spaces: 2 })
  }

  private get metadataPath(): string {
    return path.join(app.getPath('userData'), 'ai-providers.json')
  }
}

function deepSeekProvider(baseUrl?: string, model?: string): AIProviderSummary {
  const modelId = model?.trim() || 'deepseek-chat'
  return {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: baseUrl?.trim() || 'https://api.deepseek.com',
    auth: { type: 'bearer' },
    models: [
      {
        name: modelId === 'deepseek-chat' ? 'DeepSeek Chat' : modelId,
        id: modelId,
        capabilities: { chat: true, vision: false, longContext: true }
      }
    ],
    defaultModel: modelId,
    advanced: { timeoutMs: 120_000, temperature: 0.7, maxTokens: 4096, extraHeaders: {} },
    hasApiKey: false,
    isDefault: true,
    status: 'untested'
  }
}

function stripRuntimeFields(
  provider: AIProviderSummary
): Omit<AIProviderSummary, 'hasApiKey' | 'isDefault'> {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    auth: provider.auth,
    models: provider.models,
    defaultModel: provider.defaultModel,
    advanced: provider.advanced,
    status: provider.status,
    lastTestedAt: provider.lastTestedAt,
    lastError: provider.lastError
  }
}

function needsApiKey(provider: Pick<AIProviderConfig, 'type' | 'auth'>): boolean {
  return provider.type !== 'ollama' && provider.auth.type !== 'none'
}

function validateProvider(provider: AIProviderConfig): string | undefined {
  if (!provider.id.trim() || !/^[a-z0-9][a-z0-9-_]*$/i.test(provider.id))
    return '供应商 ID 格式不正确'
  if (!provider.name.trim()) return '供应商名称不能为空'
  if (!provider.baseUrl.trim()) return 'Base URL 不能为空'
  if (!provider.models.length) return '请至少添加一个模型'
  if (provider.models.some((model) => !model.name.trim() || !model.id.trim()))
    return '模型名称和 ID 不能为空'
  if (!provider.models.some((model) => model.id === provider.defaultModel))
    return '默认模型不在模型列表中'
  if (provider.auth.type === 'custom-header' && !provider.auth.headerName?.trim())
    return '请填写自定义认证字段'
  return undefined
}

function buildHeaders(provider: AIProviderSummary, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...provider.advanced.extraHeaders
  }
  if (!apiKey || provider.auth.type === 'none') return headers
  if (provider.auth.type === 'bearer') headers.authorization = `Bearer ${apiKey}`
  else if (provider.auth.type === 'x-api-key') headers['x-api-key'] = apiKey
  else headers[provider.auth.headerName || 'authorization'] = apiKey
  return headers
}

async function requestOpenAICompatible(
  provider: AIProviderSummary,
  apiKey: string,
  model: string,
  messages: AIMessage[],
  testing = false
): Promise<AIRequestResult> {
  const endpoint = provider.baseUrl.endsWith('/chat/completions')
    ? provider.baseUrl
    : `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: buildHeaders(provider, apiKey),
      body: JSON.stringify({
        model,
        messages,
        temperature: provider.advanced.temperature,
        max_tokens: testing ? 8 : provider.advanced.maxTokens
      })
    },
    provider.advanced.timeoutMs
  )
  const payload = (await response.json()) as OpenAIResponsePayload
  if (!response.ok) throw new Error(payload.error?.message || `AI 请求失败 (${response.status})`)
  return {
    data: String(payload.choices?.[0]?.message?.content || ''),
    usage: payload.usage
      ? {
          input: payload.usage.prompt_tokens,
          output: payload.usage.completion_tokens,
          total: payload.usage.total_tokens,
          estimated: false
        }
      : undefined
  }
}

async function requestAnthropic(
  provider: AIProviderSummary,
  apiKey: string,
  model: string,
  messages: AIMessage[],
  testing = false
): Promise<AIRequestResult> {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const anthropicMessages = messages.filter((message) => message.role !== 'system')
  const headers = buildHeaders(provider, apiKey)
  if (!headers['anthropic-version']) headers['anthropic-version'] = '2023-06-01'
  const endpoint = provider.baseUrl.endsWith('/messages')
    ? provider.baseUrl
    : `${provider.baseUrl.replace(/\/+$/, '')}/messages`
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        system: system || undefined,
        messages: anthropicMessages,
        temperature: provider.advanced.temperature,
        max_tokens: testing ? 8 : provider.advanced.maxTokens || 4096
      })
    },
    provider.advanced.timeoutMs
  )
  const payload = (await response.json()) as AnthropicResponsePayload
  if (!response.ok)
    throw new Error(payload.error?.message || `Anthropic 请求失败 (${response.status})`)
  return {
    data: Array.isArray(payload.content)
      ? payload.content
          .filter((item) => item.type === 'text')
          .map((item) => item.text || '')
          .join('\n')
      : '',
    usage: payload.usage
      ? {
          input: payload.usage.input_tokens,
          output: payload.usage.output_tokens,
          total: Number(payload.usage.input_tokens || 0) + Number(payload.usage.output_tokens || 0),
          estimated: false
        }
      : undefined
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs || 120_000))
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function safeAIError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'AI 请求超时'
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/sk-[a-z0-9_-]+/gi, '***').slice(0, 300)
}
