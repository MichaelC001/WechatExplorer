export type SettingsCategoryId =
  | 'account-database'
  | 'database-key'
  | 'image-key'
  | 'ai-model'
  | 'local-api'
  | 'storage-export'
  | 'cache-cleanup'
  | 'appearance'
  | 'advanced'
  | 'about'

export type ConnectionStatus = 'idle' | 'checking' | 'success' | 'warning' | 'error' | 'unavailable'

export interface SettingsSelfInfo {
  wxid: string
  nickname: string
  avatar?: string
  accountRoot: string
}

export interface DiagnosticItem {
  id: string
  label: string
  status: ConnectionStatus
  result: string
  detail?: string
}
