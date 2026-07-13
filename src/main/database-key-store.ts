import { app, safeStorage } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import type { DatabaseKeyStorageResult } from '../shared/database-key'

const normalizeDatabaseKey = (value: string): string => value.trim().replace(/^0x/i, '')

export const isValidDatabaseKey = (value: string): boolean =>
  /^[0-9a-f]{64}$/i.test(normalizeDatabaseKey(value))

export class DatabaseKeyStore {
  private get filePath(): string {
    return path.join(app.getPath('userData'), 'wechat-db-key.bin')
  }

  async getStatus(): Promise<{ saved: boolean; encryptionAvailable: boolean }> {
    return {
      saved: await fs.pathExists(this.filePath),
      encryptionAvailable: safeStorage.isEncryptionAvailable()
    }
  }

  async load(): Promise<DatabaseKeyStorageResult> {
    try {
      const status = await this.getStatus()
      if (!status.saved) return { success: true, ...status }
      if (!status.encryptionAvailable) {
        return { success: false, error: '系统安全存储不可用', ...status }
      }
      const encrypted = await fs.readFile(this.filePath)
      const key = normalizeDatabaseKey(safeStorage.decryptString(encrypted))
      if (!isValidDatabaseKey(key)) {
        return { success: false, error: '已保存的密钥格式无效', ...status }
      }
      return { success: true, key, ...status }
    } catch (error) {
      const status = await this.getStatus()
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        ...status
      }
    }
  }

  async save(rawKey: string): Promise<DatabaseKeyStorageResult> {
    const key = normalizeDatabaseKey(rawKey)
    if (!isValidDatabaseKey(key)) {
      return {
        success: false,
        error: '密钥必须是 64 位十六进制字符',
        saved: await fs.pathExists(this.filePath),
        encryptionAvailable: safeStorage.isEncryptionAvailable()
      }
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return {
        success: false,
        error: '系统安全存储不可用',
        saved: await fs.pathExists(this.filePath),
        encryptionAvailable: false
      }
    }

    try {
      await fs.ensureDir(path.dirname(this.filePath))
      await fs.writeFile(this.filePath, safeStorage.encryptString(key), { mode: 0o600 })
      await fs.chmod(this.filePath, 0o600)
      return { success: true, key, saved: true, encryptionAvailable: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        saved: await fs.pathExists(this.filePath),
        encryptionAvailable: true
      }
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
