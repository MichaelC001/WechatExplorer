import { app, shell, BrowserWindow, ipcMain, nativeImage, clipboard } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { WechatDb, Contact, WechatMessage } from './wechat-db'
import { VoiceService } from './voice-service'
import { StickerService } from './sticker-service'
import {
  parseImageDatNameFromRow,
  parseMessageContent,
  parseStickerMessageFromRow
} from './message-parser'
import { ImageDecryptService } from './image-decrypt-service'

let wechatDb: WechatDb | null = null
let voiceService: VoiceService | null = null
let imageDecryptService: ImageDecryptService | null = null
let stickerService: StickerService | null = null
const BUILD_MARK = 'wechat4-open-account-continues-after-init-1000'

// WechatExplorer's WCDB native library runs InitProtection before wcdb_init.
// In dev, matching the host app name avoids failing the native protection gate.
app.setName('WechatExplorer')

const MSG_TYPE_DICT: Record<number, string> = {
  1: '普通文本',
  3: '图片',
  34: '语音',
  42: '名片',
  43: '视频',
  47: '表情包',
  48: '位置',
  49: '分享消息',
  50: '通话',
  10000: '系统消息'
}

function normalizeMsgType(value: string | number | undefined): number {
  const raw = String(value ?? '').trim()
  if (!raw) return 0

  try {
    const parsed = BigInt(raw)
    const low32 = Number(parsed & 0xffffffffn)
    return low32 || Number(parsed)
  } catch {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return 0
    return parsed > 0xffffffff ? parsed >>> 0 : parsed
  }
}

function createWindow(): void {
  // 创建浏览器窗口
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 670,
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

  // 基于 electron-vite cli 的渲染器 HMR
  // 加载开发环境的远程 URL 或生产环境的本地 html 文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 当 Electron 完成初始化并准备好创建浏览器窗口时，将调用此方法
// 某些 API 只能在此事件发生后使用
app.whenReady().then(() => {
  console.log(`WechatExplorer main build: ${BUILD_MARK}`)
  // 为窗口设置应用程序用户模型 ID
  electronApp.setAppUserModelId('com.electron')

  // 在开发环境中默认按 F12 打开或关闭 DevTools
  // 在生产环境中忽略 CommandOrControl + R
  // 参见 https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('db:init', (_, key: string) => {
    try {
      const trimmedKey = String(key || '').trim()
      console.log(
        `db:init build=${BUILD_MARK} keyLength=${trimmedKey.length} keyPreview=${trimmedKey.slice(0, 6)}...${trimmedKey.slice(-6)}`
      )
      wechatDb = new WechatDb(key)
      const wcdb4Client = wechatDb.getWcdb4Client()
      if (wcdb4Client) {
        voiceService = new VoiceService(wcdb4Client)
        stickerService = new StickerService(wcdb4Client)
      }
      imageDecryptService = null
      return { success: true }
    } catch (error) {
      console.error('Failed to init DB:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('db:getContacts', (_, filter?: string) => {
    if (!wechatDb) return []

    const contacts: Contact[] = []
    const groupContacts = wechatDb.getAllGroupContacts()
    const userList = wechatDb.getUserList(filter)
    const existingMd5s = new Set<string>()

    // 1. 处理普通联系人
    for (const user of userList) {
      const md5 = wechatDb.md5(user.m_nsUsrName)
      const isGroup = user.m_nsUsrName.endsWith('@chatroom')
      existingMd5s.add(md5)
      contacts.push({
        m_nsUsrName: user.m_nsUsrName,
        m_nsNickName: user.nickname || '未知用户',
        md5: md5,
        type: isGroup ? 'group' : 'user',
        avatar: typeof user.avatar === 'string' ? user.avatar : undefined
      })
    }

    // 2. 处理聊天表
    const chatTables = wechatDb.getAllChatTables()
    for (const table of chatTables) {
      if (!table.name.startsWith('Chat_')) continue
      const md5 = table.name.substring(5)

      if (!existingMd5s.has(md5)) {
        if (groupContacts[md5]) {
          contacts.push({
            m_nsUsrName: `Group_${md5}`,
            m_nsNickName: groupContacts[md5],
            md5: md5,
            type: 'group'
          })
        } else {
          contacts.push({
            m_nsUsrName: `Unknown_${md5}`,
            m_nsNickName: `Chat_${md5}`,
            md5: md5,
            type: 'user'
          })
        }
      }
    }
    return contacts
  })

  ipcMain.handle('db:getMessages', (_, userMd5: string, startTime?: number, endTime?: number) => {
    if (!wechatDb) return []
    const wcdb4Client = wechatDb.getWcdb4Client()
    const username = wcdb4Client?.getUsernameByMd5(userMd5)
    const rawMessages = wechatDb.getUserMessages(userMd5, startTime, endTime)
    const groupMembers = wechatDb.getGroupMembersForChat(userMd5)
    const myAvatar = wechatDb.getMyAvatarUrl()

    return rawMessages.map((msg: WechatMessage) => {
      const rawMsgType = parseInt(msg.messageType)
      const msgType = normalizeMsgType(msg.messageType)
      const createTime = parseInt(msg.msgCreateTime)
      const date = new Date(createTime * 1000)
      const isMine = msg.mesDes !== 1
      const localId = parseInt(msg.mesLocalID) || 0

      let content = msg.msgContent
      let img = ''
      let name = ''
      if (isMine && myAvatar) {
        img = myAvatar
      } else if (typeof msg.senderAvatar === 'string') {
        img = msg.senderAvatar
      }
      if (typeof msg.senderNickname === 'string') {
        name = msg.senderNickname
      }
      // 检查内容是否以 wxid 开头并包含冒号
      // 示例: wxid_xxxx:\nContent 或 wxid_xxxx:Content
      if (content && typeof content === 'string') {
        const colonIndex = content.indexOf(':')
        if (colonIndex > 0) {
          const potentialWxid = content.substring(0, colonIndex)
          if (potentialWxid.startsWith('wxid_')) {
            // 尝试获取头像
            if (wechatDb) {
              const member = wechatDb.getGroupMember(potentialWxid)
              if (member) {
                img = member.m_nsHeadImgUrl
              }
            }

            if (groupMembers[potentialWxid]) {
              const nickname = groupMembers[potentialWxid]
              name = nickname
              content = content.substring(colonIndex + 1) // +1 to skip the colon
            }
          }
        }
      }

      // 解析富媒体消息内容
      let contentData: ReturnType<typeof parseMessageContent> | undefined = undefined
      let displayType = MSG_TYPE_DICT[msgType] || msg.messageType
      const inferredMsgType =
        typeof content === 'string' &&
        /<appmsg\b|<refermsg\b|&lt;appmsg\b|&lt;refermsg\b/i.test(content)
          ? 49
          : msgType
      if ([3, 42, 47, 48, 49, 50].includes(inferredMsgType)) {
        try {
          const parsed =
            inferredMsgType === 47
              ? parseStickerMessageFromRow(msg, content)
              : parseMessageContent(content, inferredMsgType)
          if (parsed.type !== 'unknown') {
            content = ''
          }
          if (parsed.type === 'image') {
            const imageDatName = parseImageDatNameFromRow(msg)
            contentData = { ...parsed, datName: parsed.datName || imageDatName }
          } else {
            if (parsed.type === 'sticker' && !parsed.url && parsed.md5 && wcdb4Client) {
              parsed.url = wcdb4Client.resolveEmoticonCdnUrl(parsed.md5)
            }
            contentData = parsed
          }
          if (inferredMsgType !== msgType || rawMsgType !== msgType) {
            displayType = MSG_TYPE_DICT[inferredMsgType] || displayType
          }
        } catch {
          // ignore parse errors
        }
      }

      if (
        !contentData &&
        typeof content === 'string' &&
        /^[0-9a-fA-F]{64,}$/.test(content.trim())
      ) {
        const parsed = parseStickerMessageFromRow(msg, content)
        if (parsed.type === 'sticker') {
          if (!parsed.url && parsed.md5 && wcdb4Client) {
            parsed.url = wcdb4Client.resolveEmoticonCdnUrl(parsed.md5)
          }
          content = ''
          contentData = parsed
          displayType = '表情包'
        }
      }

      if (msgType === 34) {
        content = '[语音消息]'
      }

      return {
        id: msg.mesLocalID || Math.random().toString(),
        from: isMine ? 'assistant' : 'user',
        type: displayType,
        datetime: date.toLocaleString('zh-CN', { hour12: false }),
        content: content,
        img: img,
        name: name,
        sessionId: username,
        localId: localId,
        createTime: createTime,
        contentData: contentData
      }
    })
  })

  ipcMain.handle('db:search', (_, keyword: string) => {
    if (!wechatDb) return null
    return wechatDb.searchAllMessages(keyword)
  })

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

      // 动态导入以避免如果未安装或初始类型缺失的问题
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
    async (_, imageMd5?: string, imageDatNameOrThumb?: string | boolean, _sessionId?: string) => {
      void _sessionId
      if (!imageDecryptService) {
        // 从环境变量获取密钥
        const xorKey = import.meta.env.VITE_IMAGE_XOR_KEY || '0x40'
        const aesKey = import.meta.env.VITE_IMAGE_AES_KEY || ''
        if (!aesKey) {
          return { success: false, error: '未配置图片解密密钥' }
        }
        imageDecryptService = new ImageDecryptService(xorKey, aesKey, wechatDb?.getWcdb4Client())
      }

      const imageDatName = typeof imageDatNameOrThumb === 'string' ? imageDatNameOrThumb : undefined
      const filePath = imageDecryptService.findImageFile(imageMd5, imageDatName)
      if (!filePath) {
        return { success: false, error: '未找到图片文件' }
      }

      const base64 = imageDecryptService.decryptImageToBase64(filePath)
      if (!base64) {
        return { success: false, error: '图片解密失败' }
      }

      return { success: true, data: base64 }
    }
  )

  ipcMain.handle('db:getSticker', async (_, cdnUrl?: string, md5?: string) => {
    if (!stickerService) {
      stickerService = new StickerService(wechatDb?.getWcdb4Client())
    }
    return stickerService.resolveSticker(cdnUrl, md5)
  })

  createWindow()

  app.on('activate', function () {
    // 在 macOS 上，当点击 dock 图标且没有其他窗口打开时，
    // 通常会在应用程序中重新创建一个窗口。
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 当所有窗口关闭时退出，除了 macOS。在那里，
// 应用程序及其菜单栏通常会保持活动状态，直到用户
// 显式使用 Cmd + Q 退出。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
