import { app, safeStorage } from 'electron'
import fs from 'fs-extra'
import path from 'path'

export interface StoredKeyResult {
  success: boolean
  key?: string
  error?: string
}

const normalizeDatabaseKey = (value: string): string => value.trim().replace(/^0x/i, '')

export const isValidDatabaseKey = (value: string): boolean =>
  /^[0-9a-f]{64}$/i.test(normalizeDatabaseKey(value))

export class DatabaseKeyStore {
  private get filePath(): string {
    return path.join(app.getPath('userData'), 'wechat-db-key.bin')
  }

  async load(): Promise<StoredKeyResult> {
    try {
      if (!(await fs.pathExists(this.filePath))) return { success: true }
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: '系统安全存储不可用' }
      }
      const encrypted = await fs.readFile(this.filePath)
      const key = normalizeDatabaseKey(safeStorage.decryptString(encrypted))
      if (!isValidDatabaseKey(key)) return { success: false, error: '已保存的密钥格式无效' }
      return { success: true, key }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async save(rawKey: string): Promise<StoredKeyResult> {
    const key = normalizeDatabaseKey(rawKey)
    if (!isValidDatabaseKey(key)) {
      return { success: false, error: '密钥必须是 64 位十六进制字符' }
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: '系统安全存储不可用' }
    }

    try {
      await fs.ensureDir(path.dirname(this.filePath))
      await fs.writeFile(this.filePath, safeStorage.encryptString(key), { mode: 0o600 })
      await fs.chmod(this.filePath, 0o600)
      return { success: true, key }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async clear(): Promise<{ success: boolean; error?: string }> {
    try {
      await fs.remove(this.filePath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
