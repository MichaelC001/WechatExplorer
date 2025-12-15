import { app, shell, BrowserWindow, ipcMain, nativeImage, clipboard } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { WechatDb, Contact, WechatMessage } from './wechat-db'

let wechatDb: WechatDb | null = null

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
      wechatDb = new WechatDb(key)
      return true
    } catch (error) {
      console.error('Failed to init DB:', error)
      return false
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
      existingMd5s.add(md5)
      contacts.push({
        m_nsUsrName: user.m_nsUsrName,
        m_nsNickName: user.nickname || '未知用户',
        md5: md5,
        type: 'user'
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
    const rawMessages = wechatDb.getUserMessages(userMd5, startTime, endTime)
    const groupMembers = wechatDb.getAllGroupMembers()

    return rawMessages.map((msg: WechatMessage) => {
      const typeDict: Record<number, string> = {
        1: '普通文本',
        3: '图片',
        34: '语音',
        43: '视频',
        47: '表情包',
        48: '位置',
        49: '分享消息',
        10000: '系统消息'
      }

      const msgType = parseInt(msg.messageType)
      const createTime = parseInt(msg.msgCreateTime)
      const date = new Date(createTime * 1000)

      let content = msg.msgContent
      let img = ''
      let name = ''
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

      return {
        id: msg.mesLocalID || Math.random().toString(),
        from: msg.mesDes === '1' ? 'user' : 'assistant', // 1 通常是接收到的，0 是发送的？需要验证。Swift 说：[1: "user", 0: "assistant"]
        type: typeDict[msgType] || msg.messageType,
        datetime: date.toLocaleString('zh-CN', { hour12: false }),
        content: content,
        isSender: msg.mesDes === '0',
        img: img,
        name: name
        // 实际上让我们坚持我们观察到的：1=用户(其他人), 0=助手(我)
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
      options?: { apiKey?: string; model?: string }
    ) => {
      // @ts-ignore: vite env
      const apiKey = options?.apiKey || import.meta.env.VITE_DEEPSEEK_API_KEY
      const model = options?.model || 'deepseek-chat'

      if (!apiKey) {
        return { success: false, error: '未配置 DeepSeek API Key' }
      }

      // 动态导入以避免如果未安装或初始类型缺失的问题
      const { OpenAI } = await import('openai')

      const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: apiKey
      })
      try {
        const completion = await openai.chat.completions.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: messages as any,
          model: model
        })
        return { success: true, data: completion.choices[0].message.content }
      } catch (error: unknown) {
        console.error('DeepSeek API Error:', error)
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
