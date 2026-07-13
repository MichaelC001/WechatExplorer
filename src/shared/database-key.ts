export type DatabaseKeyValidationCode =
  | 'INVALID_FORMAT'
  | 'DATABASE_OPEN_FAILED'
  | 'ACCOUNT_MISMATCH'
  | 'ROOT_UNAVAILABLE'
  | 'DATABASE_FILE_MISSING'
  | 'UNKNOWN_VALIDATION_ERROR'

export interface DatabaseKeyValidationResult {
  success: boolean
  code?: DatabaseKeyValidationCode
  error?: string
  accountRoot?: string
  wxid?: string
  contacts?: { available: boolean; count?: number }
  messages?: { available: boolean; count?: number }
}

export interface DatabaseKeyStorageResult {
  success: boolean
  key?: string
  error?: string
  saved: boolean
  encryptionAvailable: boolean
}

export interface DatabaseKeyEnvironment {
  platform: NodeJS.Platform
  autoDetectSupported: boolean
  wechatRunning: boolean
  accountIdentified: boolean
  dbConnected: boolean
  encryptionAvailable: boolean
}
