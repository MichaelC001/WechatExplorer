import type {
  AIProviderConfig,
  AIProviderSummary,
  AIRuntimeModelConfig
} from '../../../../../shared/ai-provider'

export interface AIModelSettingsState {
  loading: boolean
  saving: boolean
  providers: AIProviderSummary[]
  runtime: AIRuntimeModelConfig | null
  editor: AIProviderConfig | null
  originalProviderId?: string
  presetId: string
  testingId?: string
  error?: string
}

export type AIModelSettingsAction =
  | { type: 'LOADED'; providers: AIProviderSummary[]; runtime: AIRuntimeModelConfig }
  | { type: 'ERROR'; error: string }
  | {
      type: 'OPEN_EDITOR'
      editor: AIProviderConfig
      presetId: string
      originalProviderId?: string
    }
  | { type: 'CLOSE_EDITOR' }
  | { type: 'EDIT'; editor: AIProviderConfig }
  | { type: 'SAVE_START' }
  | { type: 'TEST_START'; providerId: string }

export interface AIModelSettingsController {
  state: AIModelSettingsState
  openNew: () => void
  openEdit: (provider: AIProviderSummary) => void
  closeEditor: () => void
  selectPreset: (presetId: string) => void
  updateEditor: (editor: AIProviderConfig) => void
  save: () => Promise<void>
  remove: (providerId: string) => Promise<void>
  setDefault: (providerId: string) => Promise<void>
  test: (providerId: string) => Promise<void>
}
