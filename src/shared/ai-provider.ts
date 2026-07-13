export type AIProviderType =
  | 'openai-compatible'
  | 'anthropic-messages'
  | 'azure-openai'
  | 'ollama'
  | 'custom'

export type AIAuthType = 'bearer' | 'x-api-key' | 'custom-header' | 'none'

export interface AIProviderAuth {
  type: AIAuthType
  headerName?: string
}

export interface AIModelCapabilities {
  chat: boolean
  vision: boolean
  longContext: boolean
}

export interface AIModelDefinition {
  name: string
  id: string
  capabilities: AIModelCapabilities
  maxTokens?: number
}

export interface AIProviderAdvancedSettings {
  timeoutMs: number
  temperature?: number
  maxTokens?: number
  extraHeaders: Record<string, string>
}

export interface AIProviderConfig {
  id: string
  name: string
  type: AIProviderType
  baseUrl: string
  apiKey?: string
  auth: AIProviderAuth
  models: AIModelDefinition[]
  defaultModel: string
  advanced: AIProviderAdvancedSettings
}

export interface AIProviderSummary extends Omit<AIProviderConfig, 'apiKey'> {
  hasApiKey: boolean
  isDefault: boolean
  status: 'untested' | 'connected' | 'error'
  lastTestedAt?: number
  lastError?: string
}

export interface AIProviderListResult {
  success: boolean
  providers: AIProviderSummary[]
  defaultProviderId?: string
  error?: string
}

export interface AIRuntimeModelConfig {
  providerId?: string
  providerName: string
  model: string
  modelName: string
  configured: boolean
  status: AIProviderSummary['status']
}

export interface LegacyAIConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface AIChatRequestOptions {
  providerId?: string
  modelId?: string
  // Legacy compatibility only. New callers must use providerId/modelId.
  apiKey?: string
  baseURL?: string
  model?: string
}

export interface AIConnectionTestResult {
  success: boolean
  error?: string
  latencyMs?: number
}
