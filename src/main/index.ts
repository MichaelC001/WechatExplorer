import './preload-env'
import { app, shell, BrowserWindow, ipcMain, nativeImage, clipboard, Menu, Tray } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { WechatDb } from './wechat-db'
import { bootstrapWcdbNative } from './wcdb4-client'
import { VoiceService } from './voice-service'
import { StickerService } from './sticker-service'
import { parseMessageContent } from './message-parser'
import { ImageDecryptService } from './image-decrypt-service'
import { exportGroupReport } from './group-report-service'
import { GroupReportExportRequest } from '../shared/group-report'
import { DatabaseKeyStore } from './database-key-store'
import { KeyServiceMac } from './key-service-mac'
import { KeyService as KeyServiceWin } from './key-service-win'
import * as chat from './services/chat-service'
import {
  apiServer
} from './http-server'
import {
  loadSettings,
  saveSettings,
  getSettingsPath,
  AppSettings
} from './services/settings-store'
import {
  getBootstrapCache,
  getCachedMessages,
  mergeBootstrapAvatars,
  mergeCachedContactAvatars,
  saveBootstrapContacts,
  saveBootstrapSelf,
  saveCachedMessages
} from './services/bootstrap-cache'
import { installSafeConsole } from './safe-log'

// electron-vite can close the child's stdout/stderr after spawning Electron.
// Plain console.error then throws EPIPE on a closed pipe and crashes the IPC
// handler. Wrap console.* before any other module logs anything.
installSafeConsole()

let voiceService: VoiceService | null = null
let imageDecryptService: ImageDecryptService | null = null
let stickerService: StickerService | null = null
const databaseKeyStore = new DatabaseKeyStore()
const keyServiceMac = new KeyServiceMac()
const keyServiceWin = new KeyServiceWin()
let tray: Tray | null = null

// WCDB's Windows runtime checks the host application name during wcdb_init.
// Mirroring WeFlow's name unblocks the -1006 init failure on Windows.
app.setName(process.platform === 'win32' ? 'WeFlow' : 'WechatExplorer')
let dbInitInFlight: Promise<{ success: boolean; monitoring?: boolean; error?: string }> | null = null
const BUILD_MARK = 'wechat4-local-http-api-2026-07-03'
const TRAY_MODE =
  process.argv.includes('--tray') || (process.env['WXE_TRAY'] || '').toString() === '1'

function normalizeImageXorKey(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const parsed = raw.toLowerCase().startsWith('0x')
    ? Number.parseInt(raw.slice(2), 16)
    : Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return raw
  return `0x${Math.max(0, parsed & 0xff).toString(16).toUpperCase().padStart(2, '0')}`
}

function getConfiguredImageKeys(): { xorKey: string; aesKey: string } {
  const settings = loadSettings()
  return {
    xorKey: settings.imageXorKey || import.meta.env.VITE_IMAGE_XOR_KEY || '0x40',
    aesKey: settings.imageAesKey || import.meta.env.VITE_IMAGE_AES_KEY || ''
  }
}


function createWindow(): void {
  // 鍒涘缓娴忚鍣ㄧ獥鍙?
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 鍩轰簬 electron-vite cli 鐨勬覆鏌撳櫒 HMR
  // 鍔犺浇寮€鍙戠幆澧冪殑杩滅▼ URL 鎴栫敓浜х幆澧冪殑鏈湴 html 鏂囦欢
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 褰?Electron 瀹屾垚鍒濆鍖栧苟鍑嗗濂藉垱寤烘祻瑙堝櫒绐楀彛鏃讹紝灏嗚皟鐢ㄦ鏂规硶
// 鏌愪簺 API 鍙兘鍦ㄦ浜嬩欢鍙戠敓鍚庝娇鐢?
app.whenReady().then(async () => {
  console.log(`WechatExplorer main build: ${BUILD_MARK}`)

  // WCDB's Windows runtime returns -1006 if wcdb_init is called more than once
  // per process. Bootstrap native once here so any later Wcdb4Client instance
  // reuses the already-initialized library and skips wcdb_init.
  try {
    bootstrapWcdbNative()
    console.log('[WCDB4] bootstrap complete at whenReady top')
  } catch (bootstrapError) {
    console.error('[WCDB4] bootstrap failed at whenReady top:', bootstrapError)
  }

  // 涓虹獥鍙ｈ缃簲鐢ㄧ▼搴忕敤鎴锋ā鍨?ID
  electronApp.setAppUserModelId('com.electron')

  // 鍦ㄥ紑鍙戠幆澧冧腑榛樿鎸?F12 鎵撳紑鎴栧叧闂?DevTools
  // 鍦ㄧ敓浜х幆澧冧腑蹇界暐 CommandOrControl + R
  // 鍙傝 https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('db:init', async (_, key: string) => {
    if (dbInitInFlight) return dbInitInFlight

    dbInitInFlight = (async () => {
    try {
      const trimmedKey = String(key || '').trim()
      console.log(`db:init build=${BUILD_MARK} keyLength=${trimmedKey.length}`)
      const settings = loadSettings()
      if (
        chat.isReady() &&
        chat.getCurrentKey().replace(/^0x/i, '').trim() === trimmedKey.replace(/^0x/i, '') &&
        (!settings.dbRoot || chat.getCurrentAccountRoot() === settings.dbRoot)
      ) {
        console.log('[WCDB4] db:init reuse current connection')
        return { success: true, monitoring: true }
      }
      const nextWechatDb = await WechatDb.create(key, settings.dbRoot)
      const resolvedRoot = nextWechatDb.getWcdb4Client().getAccountRoot()
      if (resolvedRoot && resolvedRoot !== settings.dbRoot) {
        saveSettings({ ...settings, dbRoot: resolvedRoot })
      }
      chat.setChatDb(nextWechatDb)
      const wcdb4Client = nextWechatDb.getWcdb4Client()
      voiceService = new VoiceService(wcdb4Client)
      stickerService = new StickerService(wcdb4Client)
      const monitoring = wcdb4Client.startMonitor((type, json) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) window.webContents.send('wcdb-change', { type, json })
        }
      })
      imageDecryptService = null
      return { success: true, monitoring }
    } catch (error) {
      console.error('Failed to init DB:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      dbInitInFlight = null
    }
    })()

    return dbInitInFlight
  })

  ipcMain.handle('key:getSavedDbKey', async () => databaseKeyStore.load())

  ipcMain.handle('key:pasteAndSaveDbKey', async () => {
    const clipboardKey = clipboard.readText().trim()
    return databaseKeyStore.save(clipboardKey)
  })

  ipcMain.handle('key:saveDbKey', async (_, key: string) => databaseKeyStore.save(String(key || '')))

  ipcMain.handle('key:clearSavedDbKey', async () => databaseKeyStore.clear())

  ipcMain.handle('key:autoGetDbKey', async (event) => {
    const onStatus = (message: string): void => {
      if (!event.sender.isDestroyed()) event.sender.send('key:dbKeyStatus', { message })
    }
    const result =
      process.platform === 'win32'
        ? await keyServiceWin.autoGetDbKey(60_000, onStatus)
        : await keyServiceMac.autoGetDbKey(onStatus)
    if (!result.success || !result.key) return result

    const saved = await databaseKeyStore.save(result.key)
    return {
      ...result,
      saved: saved.success,
      warning: saved.success ? undefined : saved.error
    }
  })

  ipcMain.handle('key:autoGetImageKey', async (event) => {
    const settings = loadSettings()
    const self = chat.getSelfAccountInfo()
    const accountRoot = settings.imageKeyRoot || self?.accountRoot || settings.dbRoot
    const wxid = self?.wxid
    const onStatus = (message: string): void => {
      if (!event.sender.isDestroyed()) event.sender.send('key:imageKeyStatus', { message })
    }
    const result =
      process.platform === 'win32'
        ? await keyServiceWin.autoGetImageKeyByMemoryScan(accountRoot, onStatus)
        : await keyServiceMac.autoGetImageKey(accountRoot, onStatus, wxid)

    if (!result.success || !result.aesKey) return result

    const imageXorKey = normalizeImageXorKey(result.xorKey)
    const nextSettings = saveSettings({
      ...settings,
      imageXorKey,
      imageAesKey: result.aesKey
    })
    imageDecryptService = null
    return {
      ...result,
      imageXorKey,
      imageAesKey: result.aesKey,
      settings: nextSettings
    }
  })

  ipcMain.handle('db:getBootstrapCache', () => {
    if (!chat.isReady()) return null
    return getBootstrapCache(chat.getCurrentAccountRoot())
  })

  ipcMain.handle(
    'db:getCachedMessages',
    (_, userMd5: string, startTime?: number, endTime?: number) => {
      if (!chat.isReady()) return []
      return getCachedMessages(chat.getCurrentAccountRoot(), userMd5, startTime, endTime)
    }
  )

  ipcMain.handle('db:getContacts', (_, filter?: string) => {
    const accountRoot = chat.getCurrentAccountRoot()
    const contacts = accountRoot ? mergeCachedContactAvatars(accountRoot, chat.listContacts(filter)) : chat.listContacts(filter)
    if (!filter && chat.isReady() && accountRoot) {
      saveBootstrapContacts(accountRoot, contacts)
    }
    return contacts
  })

  ipcMain.handle('db:getContactAvatars', (_, usernames: string[]) => {
    const avatars = chat.getContactAvatars(usernames)
    if (chat.isReady()) mergeBootstrapAvatars(chat.getCurrentAccountRoot(), avatars)
    return avatars
  })

  ipcMain.handle(
    'db:getMessages',
    (_, userMd5: string, startTime?: number, endTime?: number, options?: { limit?: number }) => {
      const messages = chat.listMessages(userMd5, startTime, endTime, options)
      if (chat.isReady()) {
        saveCachedMessages(chat.getCurrentAccountRoot(), userMd5, startTime, endTime, messages)
      }
      return messages
    }
  )

  ipcMain.handle('db:getGroupSnapshot', (_, userMd5: string) => chat.getGroupSnapshot(userMd5))

  ipcMain.handle('db:search', (_, keyword: string) => chat.searchMessages(keyword))

  ipcMain.handle(
    'ai:chat',
    async (
      _,
      messages: { role: string; content: string }[],
      options?: { apiKey?: string; model?: string; baseURL?: string }
    ) => {
      // @ts-ignore: vite env
      const apiKey = options?.apiKey || import.meta.env.VITE_DEEPSEEK_API_KEY
      const model = options?.model || import.meta.env.VITE_AI_MODEL || 'deepseek-chat'
      const baseURL =
        options?.baseURL || import.meta.env.VITE_AI_BASE_URL || 'https://api.deepseek.com'

      if (!apiKey) {
        return { success: false, error: '未配置 API Key' }
      }

      // 鍔ㄦ€佸鍏ヤ互閬垮厤濡傛灉鏈畨瑁呮垨鍒濆绫诲瀷缂哄け鐨勯棶棰?
      const { OpenAI } = await import('openai')

      const openai = new OpenAI({
        baseURL,
        apiKey
      })
      try {
        const completion = await openai.chat.completions.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: messages as any,
          model: model
        })
        return { success: true, data: completion.choices[0].message.content }
      } catch (error: unknown) {
        console.error('AI API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('copy-image', async (_, base64String) => {
    try {
      const image = nativeImage.createFromDataURL(base64String)
      clipboard.writeImage(image)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle('report:export', async (_, request: GroupReportExportRequest) => {
    return exportGroupReport(request)
  })

  ipcMain.handle('report:reveal', async (_, filePath: string) => {
    try {
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(
    'db:getVoiceData',
    async (_, sessionId: string, localId: number, createTime: number, svrId?: string | number) => {
      if (!voiceService) {
        return { success: false, error: 'VoiceService 未初始化' }
      }
      return voiceService.resolveVoice(sessionId, localId, createTime, svrId)
    }
  )

  ipcMain.handle('db:parseMessage', async (_, content: string, messageType: number) => {
    return parseMessageContent(content, messageType)
  })

  ipcMain.handle(
    'db:getImage',
    async (
      _,
      imageMd5?: string,
      imageDatNameOrThumb?: string | boolean,
      _sessionId?: string,
      options?: { force?: boolean }
    ) => {
      void _sessionId
      if (!imageDecryptService) {
        const { xorKey, aesKey } = getConfiguredImageKeys()
        if (!aesKey) {
          return { success: false, error: '未配置图片解密密钥' }
        }
        imageDecryptService = new ImageDecryptService(
          xorKey,
          aesKey,
          chat.getChatDb()?.getWcdb4Client()
        )
      }

      const imageDatName = typeof imageDatNameOrThumb === 'string' ? imageDatNameOrThumb : undefined
      const force = options?.force === true
      let filePath = force
        ? imageDecryptService.findImageFile(imageMd5, imageDatName, { allowThumbnail: false })
        : null
      if (!filePath) {
        filePath = imageDecryptService.findImageFile(imageMd5, imageDatName, {
          allowThumbnail: true
        })
      }
      if (!filePath) {
        return { success: false, error: force ? '未找到原图或缩略图文件' : '未找到图片文件' }
      }

      const base64 = imageDecryptService.decryptImageToBase64(filePath)
      if (!base64) {
        return { success: false, error: '图片解密失败' }
      }

      return {
        success: true,
        data: base64,
        isThumb: imageDecryptService.isThumbnailFile(filePath),
        filePath
      }
    }
  )

  ipcMain.handle('db:getSticker', async (_, cdnUrl?: string, md5?: string) => {
    if (!stickerService) {
      stickerService = new StickerService(chat.getChatDb()?.getWcdb4Client())
    }
    return stickerService.resolveSticker(cdnUrl, md5)
  })

  // -------- Settings & API service --------

  ipcMain.handle('settings:get', () => ({
    settings: loadSettings(),
    settingsPath: getSettingsPath()
  }))

  ipcMain.handle('settings:set', (_, patch: Partial<AppSettings>) => {
    const before = loadSettings()
    const merged = saveSettings({ ...before, ...patch })
    if (
      before.imageXorKey !== merged.imageXorKey ||
      before.imageAesKey !== merged.imageAesKey
    ) {
      imageDecryptService = null
    }
    return { settings: merged, settingsPath: getSettingsPath() }
  })

  ipcMain.handle('settings:getSelf', () => {
    const info = chat.getSelfAccountInfo()
    if (!info) return { ready: false }
    if (chat.isReady()) saveBootstrapSelf(chat.getCurrentAccountRoot(), info)
    return { ready: true, info }
  })

  ipcMain.handle('db:testConnection', (_, key: string, accountRoot?: string) => {
    return chat.testConnection(key, accountRoot)
  })

  ipcMain.handle('db:reopenWithRoot', (_, accountRoot: string) => {
    const ok = chat.reopenWithRoot(accountRoot)
    if (!ok) return { success: false, error: '数据库未初始化或重新打开失败' }
    const info = chat.getSelfAccountInfo()
    return { success: true, info }
  })

  ipcMain.handle('api:getStatus', () => apiServer.getState())

  ipcMain.handle('api:start', async (_, host?: string, port?: number) => {
    const settings = loadSettings()
    const target = {
      host: host || settings.apiHost,
      port: port || settings.apiPort
    }
    if (host || port) saveSettings({ ...settings, ...target })
    return apiServer.start(target.host, target.port)
  })

  ipcMain.handle('api:stop', async () => apiServer.stop())

  ipcMain.handle('api:toggle', async (_, enabled: boolean) => {
    const settings = saveSettings({ ...loadSettings(), apiEnabled: enabled })
    if (enabled) {
      return apiServer.start(settings.apiHost, settings.apiPort)
    }
    return apiServer.stop()
  })

  createWindow()

  // 鍚姩鏈湴 HTTP API(鏍规嵁 settings.apiEnabled 鎺у埗)
  const settings = loadSettings()
  if (settings.apiEnabled) {
    await apiServer.start(settings.apiHost, settings.apiPort)
  }

  if (TRAY_MODE) {
    app.dock?.hide()
    setupTray()
  }

  app.on('activate', function () {
    // 鍦?macOS 涓婏紝褰撶偣鍑?dock 鍥炬爣涓旀病鏈夊叾浠栫獥鍙ｆ墦寮€鏃讹紝
    // 閫氬父浼氬湪搴旂敤绋嬪簭涓噸鏂板垱寤轰竴涓獥鍙ｃ€?
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 褰撴墍鏈夌獥鍙ｅ叧闂椂閫€鍑猴紝闄や簡 macOS銆傚湪閭ｉ噷锛?
// 搴旂敤绋嬪簭鍙婂叾鑿滃崟鏍忛€氬父浼氫繚鎸佹椿鍔ㄧ姸鎬侊紝鐩村埌鐢ㄦ埛
// 鏄惧紡浣跨敤 Cmd + Q 閫€鍑恒€?
app.on('window-all-closed', () => {
  if (TRAY_MODE) return
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  chat.setChatDb(null)
  await apiServer.stop().catch(() => undefined)
  if (tray) {
    tray.destroy()
    tray = null
  }
})

function showMainWindow(): void {
  if (TRAY_MODE) app.dock?.show().catch(() => undefined)
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) {
    createWindow()
    return
  }
  const win = wins[0]
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: '打开主窗口',
      click: () => showMainWindow()
    },
    {
      label: 'API 状态',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: '退出 WechatExplorer',
      click: () => {
        tray?.destroy()
        tray = null
        app.quit()
      }
    }
  ])
}

function setupTray(): void {
  if (tray) return
  try {
    const image = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
    tray.setToolTip('WechatExplorer')
    tray.setContextMenu(buildTrayMenu())
    tray.on('click', () => showMainWindow())
  } catch (error) {
    console.warn('[Tray] Failed to create tray:', error)
  }
}
