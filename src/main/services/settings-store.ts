import { app } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'

export interface AppSettings {
  dbRoot: string
  apiEnabled: boolean
  apiHost: string
  apiPort: number
}

const DEFAULT_SETTINGS: AppSettings = {
  dbRoot: path.join(
    os.homedir(),
    'Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files'
  ),
  apiEnabled: true,
  apiHost: '127.0.0.1',
  apiPort: 6131
}

const SETTINGS_FILE = path.join(
  process.env['WE_SETTINGS_DIR'] || app.getPath('userData'),
  'settings.json'
)

let cache: AppSettings | null = null

function ensureDir(): void {
  fs.ensureDirSync(path.dirname(SETTINGS_FILE))
}

export function loadSettings(): AppSettings {
  if (cache) return cache
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readJsonSync(SETTINGS_FILE) as Partial<AppSettings>
      cache = { ...DEFAULT_SETTINGS, ...raw }
      return cache
    }
  } catch (error) {
    console.warn('[Settings] failed to load, fallback to defaults:', error)
  }
  cache = { ...DEFAULT_SETTINGS }
  return cache
}

export function saveSettings(next: AppSettings): AppSettings {
  cache = { ...next }
  try {
    ensureDir()
    fs.writeJsonSync(SETTINGS_FILE, cache, { spaces: 2 })
  } catch (error) {
    console.error('[Settings] failed to save:', error)
  }
  return cache
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  return saveSettings({ ...loadSettings(), ...patch })
}

export function resetSettings(): AppSettings {
  cache = null
  try {
    if (fs.existsSync(SETTINGS_FILE)) fs.unlinkSync(SETTINGS_FILE)
  } catch {
    // best effort
  }
  return loadSettings()
}

export function getSettingsPath(): string {
  return SETTINGS_FILE
}