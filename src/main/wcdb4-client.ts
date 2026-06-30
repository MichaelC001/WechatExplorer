import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { createRequire } from 'module'
import { createConnection, Socket } from 'net'

export interface Wcdb4Session {
  username: string
  nickname: string
  avatar?: string
  raw: Record<string, unknown>
}

export interface Wcdb4Message {
  mesLocalID: string
  mesDes: number
  messageType: string
  msgCreateTime: string
  msgContent: string
  sender?: string
  senderNickname?: string
  senderAvatar?: string
  raw: Record<string, unknown>
}

export interface Wcdb4GroupMember {
  m_nsUsrName: string
  nickname: string
  m_nsHeadImgUrl: string
}

export interface Wcdb4ImageHardlink {
  file_name?: string
  full_path?: string
  [key: string]: unknown
}

type KoffiModule = {
  load: (libraryPath: string) => KoffiLibrary
  decode: (ptr: unknown, type: string, length: number) => string
}

type KoffiLibrary = {
  func: (signature: string) => (...args: unknown[]) => unknown
}

type WcdbVoidOut = [unknown]
type WcdbHandleOut = [number]

const nodeRequire = createRequire(import.meta.url)

export class Wcdb4Client {
  static readonly defaultRoot = path.join(
    os.homedir(),
    'Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files'
  )

  private readonly key: string
  private readonly accountRoot: string
  private readonly wxid: string
  private readonly dbStoragePath: string
  private readonly sessionDbPath: string
  private koffi: KoffiModule | null = null
  private handle: number | null = null
  private initialized = false
  private displayNameCache = new Map<string, string>()
  private avatarCache = new Map<string, string>()
  private groupNicknameCache = new Map<string, Map<string, string>>()
  private cachedSessions: Wcdb4Session[] | null = null

  private wcdbInit: (() => number) | null = null
  private wcdbShutdown: (() => number) | null = null
  private wcdbOpenAccount:
    | ((sessionDbPath: string, key: string, handleOut: WcdbHandleOut) => number)
    | null = null
  private wcdbSetMyWxid: ((handle: number, wxid: string) => number) | null = null
  private wcdbFreeString: ((ptr: unknown) => void) | null = null
  private wcdbGetSessions: ((handle: number, outJson: WcdbVoidOut) => number) | null = null
  private wcdbGetMessages:
    | ((
        handle: number,
        username: string,
        limit: number,
        offset: number,
        outJson: WcdbVoidOut
      ) => number)
    | null = null
  private wcdbGetDisplayNames:
    | ((handle: number, usernamesJson: string, outJson: WcdbVoidOut) => number)
    | null = null
  private wcdbGetAvatarUrls:
    | ((handle: number, usernamesJson: string, outJson: WcdbVoidOut) => number)
    | null = null
  private wcdbExecQuery:
    | ((handle: number, kind: string, dbPath: string, sql: string, outJson: WcdbVoidOut) => number)
    | null = null
  private wcdbGetGroupMembers:
    | ((handle: number, chatroomId: string, outJson: WcdbVoidOut) => number)
    | null = null
  private wcdbGetGroupNicknames:
    | ((handle: number, chatroomId: string, outJson: WcdbVoidOut) => number)
    | null = null
  private wcdbOpenMessageCursor:
    | ((
        handle: number,
        username: string,
        batchSize: number,
        ascending: number,
        beginTimestamp: number,
        endTimestamp: number,
        cursorOut: WcdbHandleOut
      ) => number)
    | null = null
  private wcdbFetchMessageBatch:
    | ((handle: number, cursor: number, outJson: WcdbVoidOut, outHasMore: [number]) => number)
    | null = null
  private wcdbCloseMessageCursor: ((handle: number, cursor: number) => number) | null = null
  private wcdbGetVoiceData:
    | ((
        handle: number,
        sessionId: string,
        createTime: number,
        localId: number,
        svrId: bigint,
        candidatesJson: string,
        outHex: WcdbVoidOut
      ) => number)
    | null = null
  private wcdbResolveImageHardlink:
    | ((handle: number, md5: string, accountDir: string, outJson: WcdbVoidOut) => number)
    | null = null
  private wcdbGetEmoticonCdnUrl:
    | ((handle: number, dbPath: string, md5: string, outUrl: WcdbVoidOut) => number)
    | null = null
  private wcdbStartMonitorPipe: (() => number) | null = null
  private wcdbStopMonitorPipe: (() => void) | null = null
  private wcdbGetMonitorPipeName: ((outName: WcdbVoidOut) => number) | null = null
  private monitorPipeClient: Socket | null = null
  private monitorCallback: ((type: string, json: string) => void) | null = null
  private monitorConnectTimer: ReturnType<typeof setTimeout> | null = null
  private monitorReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private monitorPipePath = ''
  private monitorStarted = false

  constructor(key: string, accountRoot?: string) {
    this.key = key.replace(/^0x/i, '').trim()
    this.accountRoot = accountRoot || Wcdb4Client.findLatestAccountRoot()
    this.wxid = Wcdb4Client.cleanAccountDirName(path.basename(this.accountRoot))
    this.dbStoragePath = path.join(this.accountRoot, 'db_storage')
    this.sessionDbPath = this.findSessionDb()

    if (!this.sessionDbPath) {
      throw new Error(`未找到微信 4.0 session.db: ${this.dbStoragePath}`)
    }
  }

  static findLatestAccountRoot(): string {
    const root = Wcdb4Client.defaultRoot
    if (!fs.existsSync(root)) {
      throw new Error(`未找到微信 4.0 数据目录: ${root}`)
    }

    if (fs.existsSync(path.join(root, 'db_storage'))) {
      return root
    }

    const candidates = fs
      .readdirSync(root)
      .map((name) => path.join(root, name))
      .filter((candidate) => {
        try {
          return (
            fs.statSync(candidate).isDirectory() &&
            fs.existsSync(path.join(candidate, 'db_storage'))
          )
        } catch {
          return false
        }
      })
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)

    if (!candidates[0]) {
      throw new Error(`未找到包含 db_storage 的微信 4.0 账号目录: ${root}`)
    }

    return candidates[0]
  }

  private static cleanAccountDirName(dirName: string): string {
    const trimmed = dirName.trim()
    if (!trimmed) return trimmed

    if (trimmed.toLowerCase().startsWith('wxid_')) {
      const match = trimmed.match(/^(wxid_[^_]+)/i)
      if (match) return match[1]
      return trimmed
    }

    const suffixMatch = trimmed.match(/^(.+)_([a-zA-Z0-9]{4})$/)
    return suffixMatch ? suffixMatch[1] : trimmed
  }

  open(): void {
    this.loadNativeLibrary()
    if (!this.wcdbInit || !this.wcdbOpenAccount) {
      throw new Error('WCDB 4.0 native 接口未就绪')
    }

    if (!this.initialized) {
      const initResult = this.wcdbInit()
      if (initResult !== 0) {
        console.warn(`wcdb_init 返回 ${initResult}，继续尝试 wcdb_open_account`)
      } else {
        this.initialized = true
      }
    }

    const handleOut: WcdbHandleOut = [0]
    const openResult = this.wcdbOpenAccount(this.sessionDbPath, this.key, handleOut)
    if (openResult !== 0 || handleOut[0] <= 0) {
      throw new Error(
        `wcdb_open_account 失败，错误码: ${openResult}; sessionDb=${this.sessionDbPath}; accountRoot=${this.accountRoot}; wxid=${this.wxid}`
      )
    }

    this.handle = handleOut[0]
    if (this.wcdbSetMyWxid) {
      try {
        this.wcdbSetMyWxid(this.handle, this.wxid)
      } catch {
        // Optional helper. Failure does not block message reads.
      }
    }
  }

  close(): void {
    this.stopMonitor()
    if (!this.initialized || !this.wcdbShutdown) return

    try {
      this.wcdbShutdown()
    } catch {
      // Mirror WechatExplorer: shutdown is best-effort on app close.
    }

    this.handle = null
    this.initialized = false
    this.cachedSessions = null
    this.displayNameCache.clear()
    this.avatarCache.clear()
    this.groupNicknameCache.clear()
  }

  startMonitor(callback: (type: string, json: string) => void): boolean {
    if (!this.wcdbStartMonitorPipe || !this.wcdbGetMonitorPipeName || !this.koffi) return false

    this.stopMonitor()
    this.monitorCallback = callback

    try {
      const startResult = this.wcdbStartMonitorPipe()
      if (startResult !== 0) {
        this.monitorCallback = null
        console.warn(`[WCDB4] wcdb_start_monitor_pipe 失败，错误码: ${startResult}`)
        return false
      }
      this.monitorStarted = true

      const outName: WcdbVoidOut = [null]
      const nameResult = this.wcdbGetMonitorPipeName(outName)
      if (nameResult !== 0 || !outName[0]) {
        console.warn(`[WCDB4] wcdb_get_monitor_pipe_name 失败，错误码: ${nameResult}`)
        this.stopMonitor()
        return false
      }

      try {
        this.monitorPipePath = this.koffi.decode(outName[0], 'char', -1).trim()
      } finally {
        this.wcdbFreeString?.(outName[0])
      }

      if (!this.monitorPipePath) {
        this.stopMonitor()
        return false
      }

      this.connectMonitorPipe()
      return true
    } catch (error) {
      console.warn('[WCDB4] 启动数据库监听失败:', error)
      this.stopMonitor()
      return false
    }
  }

  stopMonitor(): void {
    this.monitorCallback = null

    if (this.monitorConnectTimer) {
      clearTimeout(this.monitorConnectTimer)
      this.monitorConnectTimer = null
    }
    if (this.monitorReconnectTimer) {
      clearTimeout(this.monitorReconnectTimer)
      this.monitorReconnectTimer = null
    }
    if (this.monitorPipeClient) {
      this.monitorPipeClient.destroy()
      this.monitorPipeClient = null
    }
    if (this.monitorStarted && this.wcdbStopMonitorPipe) {
      try {
        this.wcdbStopMonitorPipe()
      } catch {
        // Native monitor cleanup is best-effort during reconnect or shutdown.
      }
    }

    this.monitorStarted = false
    this.monitorPipePath = ''
  }

  private connectMonitorPipe(): void {
    if (!this.monitorCallback || !this.monitorPipePath || this.monitorConnectTimer) return

    this.monitorConnectTimer = setTimeout(() => {
      this.monitorConnectTimer = null
      if (!this.monitorCallback || !this.monitorPipePath || this.monitorPipeClient) return

      const socket = createConnection(this.monitorPipePath)
      this.monitorPipeClient = socket
      let buffer = ''

      socket.on('data', (data) => {
        const normalizedChunk = data
          .toString('utf8')
          .split('\0')
          .join('\n')
          .replace(/}\s*{/g, '}\n{')
        buffer += normalizedChunk

        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''
        for (const line of lines) this.emitMonitorPayload(line)

        const tail = buffer.trim()
        if (tail.startsWith('{') && tail.endsWith('}')) {
          try {
            JSON.parse(tail)
            this.emitMonitorPayload(tail)
            buffer = ''
          } catch {
            // Keep the partial payload until the next socket chunk arrives.
          }
        }
      })

      socket.on('error', (error) => {
        console.warn('[WCDB4] 数据库监听管道异常:', error.message)
      })

      socket.on('close', () => {
        if (this.monitorPipeClient === socket) this.monitorPipeClient = null
        this.scheduleMonitorReconnect()
      })
    }, 100)
  }

  private emitMonitorPayload(rawPayload: string): void {
    const payload = rawPayload.trim()
    if (!payload || !this.monitorCallback) return

    try {
      const parsed = JSON.parse(payload) as { action?: string }
      this.monitorCallback(parsed.action || 'update', payload)
    } catch {
      this.monitorCallback('update', payload)
    }
  }

  private scheduleMonitorReconnect(): void {
    if (this.monitorReconnectTimer || !this.monitorCallback || !this.monitorPipePath) return
    this.monitorReconnectTimer = setTimeout(() => {
      this.monitorReconnectTimer = null
      this.connectMonitorPipe()
    }, 3000)
  }

  getSessions(): Wcdb4Session[] {
    if (this.cachedSessions) return this.cachedSessions
    if (!this.wcdbGetSessions) return []

    const rows = this.callJson<Record<string, unknown>[]>((handle, outJson) =>
      this.wcdbGetSessions!(handle, outJson)
    )

    const sessions = (Array.isArray(rows) ? rows : [])
      .map((row) => this.normalizeSession(row))
      .filter((session) => session.username)

    const sessionUsernames = sessions.map((session) => session.username)
    this.hydrateDisplayNames(sessionUsernames)
    this.hydrateAvatarUrls(sessionUsernames)
    this.cachedSessions = sessions.map((session) => ({
      ...session,
      nickname: this.displayNameCache.get(session.username) || session.nickname || session.username,
      avatar: this.avatarCache.get(session.username)
    }))

    return this.cachedSessions
  }

  getChatTables(): { name: string; db_number: string }[] {
    return this.getSessions().map((session) => ({
      name: `Chat_${this.md5(session.username)}`,
      db_number: session.username
    }))
  }

  getMessages(username: string, startTime?: number, endTime?: number): Wcdb4Message[] {
    const cursorMessages = this.getMessagesByCursor(username, startTime, endTime)
    if (cursorMessages) return cursorMessages

    if (!this.wcdbGetMessages) return []

    const allRows: Record<string, unknown>[] = []
    const limit = 1000
    let offset = 0

    while (true) {
      const rows = this.callJson<Record<string, unknown>[]>((handle, outJson) =>
        this.wcdbGetMessages!(handle, username, limit, offset, outJson)
      )
      const batch = Array.isArray(rows) ? rows : []
      allRows.push(...batch)
      if (batch.length < limit) break
      offset += limit
    }

    return this.finalizeMessages(username, allRows, startTime, endTime)
  }

  getMyAvatarUrl(): string | undefined {
    const candidates = this.getMyUsernameCandidates()
    this.hydrateAvatarUrls(candidates)

    for (const candidate of candidates) {
      const avatar = this.avatarCache.get(candidate)
      if (avatar) return avatar
    }

    return undefined
  }

  getMyGroupNickname(chatroomId: string): string | undefined {
    const groupNicknames = this.getGroupNicknames(chatroomId)
    for (const candidate of this.getMyUsernameCandidates()) {
      const nickname = groupNicknames.get(candidate)
      if (nickname) return nickname
    }
    return undefined
  }

  private getMessagesByCursor(
    username: string,
    startTime?: number,
    endTime?: number
  ): Wcdb4Message[] | null {
    if (
      !this.wcdbOpenMessageCursor ||
      !this.wcdbFetchMessageBatch ||
      !this.wcdbCloseMessageCursor
    ) {
      return null
    }

    const handle = this.ensureHandle()
    const batchSize = 1000
    const cursorOut: WcdbHandleOut = [0]
    const begin = this.normalizeTimestamp(startTime || 0)
    const end = this.normalizeTimestamp(endTime || 0)
    const openResult = this.wcdbOpenMessageCursor(
      handle,
      username,
      batchSize,
      1,
      begin,
      end,
      cursorOut
    )
    if (openResult !== 0 || cursorOut[0] <= 0) {
      return null
    }

    const cursor = cursorOut[0]
    const allRows: Record<string, unknown>[] = []

    try {
      while (true) {
        const outJson: WcdbVoidOut = [null]
        const outHasMore: [number] = [0]
        const fetchResult = this.wcdbFetchMessageBatch!(handle, cursor, outJson, outHasMore)
        if (fetchResult !== 0 || !outJson[0]) break

        try {
          const json = this.koffi!.decode(outJson[0], 'char', -1)
          const batch = JSON.parse(json) as Record<string, unknown>[]
          if (Array.isArray(batch)) allRows.push(...batch)
        } finally {
          this.wcdbFreeString?.(outJson[0])
        }

        if (!outHasMore[0]) break
      }
    } finally {
      try {
        this.wcdbCloseMessageCursor?.(handle, cursor)
      } catch {
        // Best effort cleanup; a stale cursor is less harmful than blocking UI.
      }
    }

    return this.finalizeMessages(username, allRows, startTime, endTime)
  }

  private finalizeMessages(
    username: string,
    rows: Record<string, unknown>[],
    startTime?: number,
    endTime?: number
  ): Wcdb4Message[] {
    const messages = rows.map((row) => this.normalizeMessage(row))
    const senderIds = messages.map((message) => message.sender || '').filter(Boolean)
    this.hydrateDisplayNames(senderIds)
    this.hydrateAvatarUrls(senderIds)

    return messages
      .filter((message) => {
        const createTime = Number(message.msgCreateTime)
        if (startTime && createTime < startTime) return false
        if (endTime && createTime > endTime) return false
        return true
      })
      .sort((a, b) => Number(a.msgCreateTime) - Number(b.msgCreateTime))
      .map((message) => {
        if (!message.sender) return message
        const senderNickname = this.displayNameCache.get(message.sender) || message.senderNickname
        const senderAvatar = this.avatarCache.get(message.sender) || message.senderAvatar
        const shouldPrefixSender =
          username.endsWith('@chatroom') &&
          message.mesDes === 1 &&
          message.sender &&
          message.msgContent &&
          !message.msgContent.startsWith(`${message.sender}:`)
        return {
          ...message,
          senderNickname,
          senderAvatar,
          msgContent: shouldPrefixSender
            ? `${message.sender}:\n${message.msgContent}`
            : message.msgContent
        }
      })
  }

  getGroupMembers(chatroomId: string): Wcdb4GroupMember[] {
    if (!this.wcdbGetGroupMembers || !chatroomId) return []

    try {
      const groupNicknames = this.getGroupNicknames(chatroomId)
      const rows = this.callJson<Record<string, unknown>[]>((handle, outJson) =>
        this.wcdbGetGroupMembers!(handle, chatroomId, outJson)
      )

      const members = (Array.isArray(rows) ? rows : []).map((row) => {
        const username = this.pickString(row, [
          'username',
          'userName',
          'user_name',
          'member_username',
          'm_nsUsrName'
        ])
        const memberNickname = this.pickString(row, [
          'nickname',
          'nickName',
          'displayName',
          'display_name',
          'groupNickname',
          'group_nickname',
          'roomNickname',
          'room_nickname',
          'remark',
          'm_nsNickName'
        ])
        const avatar = this.pickString(row, [
          'avatarUrl',
          'avatar_url',
          'headImgUrl',
          'm_nsHeadImgUrl'
        ])

        if (username) {
          if (avatar) this.avatarCache.set(username, avatar)
        }

        return {
          m_nsUsrName: username,
          nickname: groupNicknames.get(username) || memberNickname,
          m_nsHeadImgUrl: avatar
        }
      })

      const missingDisplayNames = members
        .filter((member) => !member.nickname)
        .map((member) => member.m_nsUsrName)
        .filter(Boolean)
      this.hydrateDisplayNames(missingDisplayNames)
      return members.map((member) => ({
        ...member,
        nickname:
          member.nickname || this.displayNameCache.get(member.m_nsUsrName) || member.m_nsUsrName,
        m_nsHeadImgUrl: member.m_nsHeadImgUrl || this.avatarCache.get(member.m_nsUsrName) || ''
      }))
    } catch {
      return []
    }
  }

  getGroupNicknames(chatroomId: string): Map<string, string> {
    const cached = this.groupNicknameCache.get(chatroomId)
    if (cached) return cached

    const nicknames = new Map<string, string>()
    if (!this.wcdbGetGroupNicknames || !chatroomId) return nicknames

    try {
      const rows = this.callJson<Record<string, string> | Record<string, unknown>[]>(
        (handle, outJson) => this.wcdbGetGroupNicknames!(handle, chatroomId, outJson)
      )
      this.readStringMap(rows, [
        'nickname',
        'nickName',
        'displayName',
        'display_name',
        'groupNickname',
        'group_nickname',
        'name'
      ]).forEach((nickname, username) => nicknames.set(username, nickname))
      this.groupNicknameCache.set(chatroomId, nicknames)
    } catch (error) {
      console.warn(`[WCDB4] failed to get group nicknames for ${chatroomId}:`, error)
    }

    return nicknames
  }

  async getVoiceData(
    sessionId: string,
    createTime: number,
    candidates: string[],
    localId: number = 0,
    svrId: string | number = 0
  ): Promise<{ success: boolean; hex?: string; error: string }> {
    if (!this.wcdbGetVoiceData) {
      return { success: false, error: '当前 DLL 版本不支持获取语音数据' }
    }

    const handle = this.ensureHandle()
    const outHex: WcdbVoidOut = [null]

    try {
      const result = this.wcdbGetVoiceData(
        handle,
        sessionId,
        createTime,
        localId,
        BigInt(svrId || 0),
        JSON.stringify(candidates),
        outHex
      )

      if (result !== 0 || !outHex[0]) {
        return { success: false, error: `获取语音数据失败: ${result}` }
      }

      const hex = this.decodeHexPtr(outHex[0])
      if (hex === null) {
        return { success: false, error: '解析语音数据失败' }
      }

      return { success: true, hex, error: '' }
    } finally {
      this.wcdbFreeString?.(outHex[0])
    }
  }

  private decodeHexPtr(ptr: unknown): string | null {
    if (!ptr || !this.koffi) return null
    try {
      const hex = this.koffi.decode(ptr, 'char', -1)
      return typeof hex === 'string' ? hex : null
    } catch {
      return null
    }
  }

  getUsernameByMd5(md5: string): string | undefined {
    return this.getSessions().find((session) => this.md5(session.username) === md5)?.username
  }

  getAccountRoot(): string {
    return this.accountRoot
  }

  resolveImageHardlink(md5: string): Wcdb4ImageHardlink | null {
    if (!this.wcdbResolveImageHardlink) return null
    const normalizedMd5 = String(md5 || '')
      .trim()
      .toLowerCase()
    if (!normalizedMd5) return null

    try {
      return this.callJson<Wcdb4ImageHardlink>((handle, outJson) =>
        this.wcdbResolveImageHardlink!(handle, normalizedMd5, this.accountRoot, outJson)
      )
    } catch (error) {
      console.warn('[WCDB4] resolve image hardlink failed:', error)
      return null
    }
  }

  resolveEmoticonCdnUrl(md5: string): string | undefined {
    if (!this.wcdbGetEmoticonCdnUrl) {
      console.warn(`[WCDB4] wcdb_get_emoticon_cdn_url unavailable for md5=${md5}`)
      return undefined
    }
    const normalizedMd5 = String(md5 || '')
      .trim()
      .toLowerCase()
    if (!/^[a-f0-9]{32}$/.test(normalizedMd5)) return undefined

    const dbPath = this.findEmoticonDb()
    if (!dbPath) {
      console.warn(`[WCDB4] emoticon.db not found for md5=${normalizedMd5}`)
      return undefined
    }

    const outUrl: WcdbVoidOut = [null]
    try {
      const result = this.wcdbGetEmoticonCdnUrl(this.ensureHandle(), dbPath, normalizedMd5, outUrl)
      if (result !== 0 || !outUrl[0] || !this.koffi) {
        console.warn(
          `[WCDB4] emoticon CDN URL lookup miss: result=${result}; md5=${normalizedMd5}; db=${dbPath}`
        )
        return undefined
      }
      const url = this.koffi.decode(outUrl[0], 'char', -1).trim()
      return url || undefined
    } catch (error) {
      console.warn('[WCDB4] resolve emoticon CDN URL failed:', error)
      return undefined
    } finally {
      this.wcdbFreeString?.(outUrl[0])
    }
  }

  md5(value: string): string {
    return crypto.createHash('md5').update(value).digest('hex')
  }

  private loadNativeLibrary(): void {
    if (this.koffi) return

    const koffi = nodeRequire('koffi') as KoffiModule
    this.koffi = koffi

    const libPath = this.findNativeLibrary()
    const libDir = path.dirname(libPath)
    const wcdbCorePath = path.join(libDir, 'libWCDB.dylib')
    if (fs.existsSync(wcdbCorePath)) {
      try {
        koffi.load(wcdbCorePath)
      } catch {
        // Some builds resolve this dependency through rpath.
      }
    }

    const lib = koffi.load(libPath)
    this.initProtection(lib, libDir)

    this.wcdbInit = lib.func('int32 wcdb_init()') as () => number
    this.wcdbShutdown = lib.func('int32 wcdb_shutdown()') as () => number
    this.wcdbOpenAccount = lib.func(
      'int32 wcdb_open_account(const char* path, const char* key, _Out_ int64* handle)'
    ) as (sessionDbPath: string, key: string, handleOut: WcdbHandleOut) => number
    this.wcdbFreeString = lib.func('void wcdb_free_string(void* ptr)') as (ptr: unknown) => void
    this.wcdbGetSessions = lib.func(
      'int32 wcdb_get_sessions(int64 handle, _Out_ void** outJson)'
    ) as (handle: number, outJson: WcdbVoidOut) => number
    this.wcdbGetMessages = lib.func(
      'int32 wcdb_get_messages(int64 handle, const char* username, int32 limit, int32 offset, _Out_ void** outJson)'
    ) as (
      handle: number,
      username: string,
      limit: number,
      offset: number,
      outJson: WcdbVoidOut
    ) => number
    this.wcdbGetDisplayNames = lib.func(
      'int32 wcdb_get_display_names(int64 handle, const char* usernamesJson, _Out_ void** outJson)'
    ) as (handle: number, usernamesJson: string, outJson: WcdbVoidOut) => number

    try {
      this.wcdbSetMyWxid = lib.func('int32 wcdb_set_my_wxid(int64 handle, const char* wxid)') as (
        handle: number,
        wxid: string
      ) => number
    } catch {
      this.wcdbSetMyWxid = null
    }

    try {
      this.wcdbGetAvatarUrls = lib.func(
        'int32 wcdb_get_avatar_urls(int64 handle, const char* usernamesJson, _Out_ void** outJson)'
      ) as (handle: number, usernamesJson: string, outJson: WcdbVoidOut) => number
    } catch {
      this.wcdbGetAvatarUrls = null
    }

    try {
      this.wcdbExecQuery = lib.func(
        'int32 wcdb_exec_query(int64 handle, const char* kind, const char* path, const char* sql, _Out_ void** outJson)'
      ) as (
        handle: number,
        kind: string,
        dbPath: string,
        sql: string,
        outJson: WcdbVoidOut
      ) => number
    } catch {
      this.wcdbExecQuery = null
    }

    try {
      this.wcdbGetGroupMembers = lib.func(
        'int32 wcdb_get_group_members(int64 handle, const char* chatroomId, _Out_ void** outJson)'
      ) as (handle: number, chatroomId: string, outJson: WcdbVoidOut) => number
    } catch {
      this.wcdbGetGroupMembers = null
    }

    try {
      this.wcdbGetGroupNicknames = lib.func(
        'int32 wcdb_get_group_nicknames(int64 handle, const char* chatroomId, _Out_ void** outJson)'
      ) as (handle: number, chatroomId: string, outJson: WcdbVoidOut) => number
    } catch {
      this.wcdbGetGroupNicknames = null
    }

    try {
      this.wcdbOpenMessageCursor = lib.func(
        'int32 wcdb_open_message_cursor(int64 handle, const char* sessionId, int32 batchSize, int32 ascending, int32 beginTimestamp, int32 endTimestamp, _Out_ int64* outCursor)'
      ) as (
        handle: number,
        username: string,
        batchSize: number,
        ascending: number,
        beginTimestamp: number,
        endTimestamp: number,
        cursorOut: WcdbHandleOut
      ) => number
      this.wcdbFetchMessageBatch = lib.func(
        'int32 wcdb_fetch_message_batch(int64 handle, int64 cursor, _Out_ void** outJson, _Out_ int32* outHasMore)'
      ) as (handle: number, cursor: number, outJson: WcdbVoidOut, outHasMore: [number]) => number
      this.wcdbCloseMessageCursor = lib.func(
        'int32 wcdb_close_message_cursor(int64 handle, int64 cursor)'
      ) as (handle: number, cursor: number) => number
    } catch {
      this.wcdbOpenMessageCursor = null
      this.wcdbFetchMessageBatch = null
      this.wcdbCloseMessageCursor = null
    }

    try {
      this.wcdbGetVoiceData = lib.func(
        'int32 wcdb_get_voice_data(int64 handle, const char* sessionId, int32 createTime, int32 localId, int64 svrId, const char* candidatesJson, _Out_ void** outHex)'
      ) as (
        handle: number,
        sessionId: string,
        createTime: number,
        localId: number,
        svrId: bigint,
        candidatesJson: string,
        outHex: WcdbVoidOut
      ) => number
    } catch {
      this.wcdbGetVoiceData = null
    }

    try {
      this.wcdbResolveImageHardlink = lib.func(
        'int32 wcdb_resolve_image_hardlink(int64 handle, const char* md5, const char* accountDir, _Out_ void** outJson)'
      ) as (handle: number, md5: string, accountDir: string, outJson: WcdbVoidOut) => number
    } catch {
      this.wcdbResolveImageHardlink = null
    }

    try {
      this.wcdbGetEmoticonCdnUrl = lib.func(
        'int32 wcdb_get_emoticon_cdn_url(int64 handle, const char* dbPath, const char* md5, _Out_ void** outUrl)'
      ) as (handle: number, dbPath: string, md5: string, outUrl: WcdbVoidOut) => number
    } catch {
      console.warn('[WCDB4] wcdb_get_emoticon_cdn_url symbol unavailable')
      this.wcdbGetEmoticonCdnUrl = null
    }

    try {
      this.wcdbStartMonitorPipe = lib.func('int32 wcdb_start_monitor_pipe()') as () => number
      this.wcdbStopMonitorPipe = lib.func('void wcdb_stop_monitor_pipe()') as () => void
      this.wcdbGetMonitorPipeName = lib.func(
        'int32 wcdb_get_monitor_pipe_name(_Out_ void** outName)'
      ) as (outName: WcdbVoidOut) => number
    } catch {
      console.warn('[WCDB4] monitor pipe symbols unavailable')
      this.wcdbStartMonitorPipe = null
      this.wcdbStopMonitorPipe = null
      this.wcdbGetMonitorPipeName = null
    }
  }

  private initProtection(lib: KoffiLibrary, libDir: string): void {
    const initProtection = lib.func('int32 InitProtection(const char* resourcePath)') as (
      resourcePath: string
    ) => number

    const resourceRoots = Array.from(
      new Set([
        libDir,
        path.dirname(libDir),
        process.env.WCDB_RESOURCES_PATH || '',
        path.join(process.resourcesPath || process.cwd(), 'resources'),
        process.resourcesPath || process.cwd(),
        path.join(process.cwd(), 'resources')
      ])
    )

    let lastCode = -1
    for (const resourceRoot of resourceRoots) {
      try {
        lastCode = initProtection(resourceRoot)
        if (lastCode === 0) return
      } catch {
        // Try next candidate.
      }
    }

    console.warn(
      `InitProtection 返回 ${lastCode}，继续尝试 wcdb_init/open; tried=${resourceRoots.join(' | ')}`
    )
  }

  private findNativeLibrary(): string {
    const libName =
      process.platform === 'darwin'
        ? 'libwcdb_api.dylib'
        : process.platform === 'linux'
          ? 'libwcdb_api.so'
          : 'wcdb_api.dll'
    const platformDir = process.platform === 'darwin' ? 'macos' : process.platform
    const resourcesPath = process.resourcesPath || process.cwd()
    const candidates = [
      process.env.WCDB_DLL_PATH,
      path.join(resourcesPath, 'resources', platformDir, libName),
      path.join(resourcesPath, 'resources', libName),
      path.join(process.cwd(), 'resources', platformDir, libName),
      path.join(process.cwd(), 'resources', libName)
    ].filter(Boolean) as string[]

    const found = candidates.find((candidate) => fs.existsSync(candidate))
    if (!found) {
      throw new Error(`找不到 WCDB native 库: ${candidates.join(', ')}`)
    }
    return found
  }

  private findSessionDb(): string {
    const direct = path.join(this.dbStoragePath, 'session', 'session.db')
    if (fs.existsSync(direct)) return direct
    return this.findFile(this.dbStoragePath, 'session.db') || ''
  }

  private findEmoticonDb(): string {
    const candidates = [
      path.join(this.dbStoragePath, 'emoticon', 'emoticon.db'),
      path.join(this.dbStoragePath, 'emotion', 'emoticon.db'),
      path.join(this.accountRoot, this.wxid, 'db_storage', 'emoticon', 'emoticon.db'),
      path.join(this.accountRoot, this.wxid, 'db_storage', 'emotion', 'emoticon.db')
    ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
    return this.findFile(this.dbStoragePath, 'emoticon.db') || ''
  }

  private findFile(dir: string, filename: string, depth = 0): string | null {
    if (!fs.existsSync(dir) || depth > 5) return null

    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      if (entry.toLowerCase() === filename.toLowerCase() && fs.statSync(fullPath).isFile()) {
        return fullPath
      }
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      if (fs.statSync(fullPath).isDirectory()) {
        const found = this.findFile(fullPath, filename, depth + 1)
        if (found) return found
      }
    }

    return null
  }

  private callJson<T>(call: (handle: number, outJson: WcdbVoidOut) => number): T {
    const handle = this.ensureHandle()
    const outJson: WcdbVoidOut = [null]
    const result = call(handle, outJson)
    if (result !== 0 || !outJson[0]) {
      throw new Error(`WCDB 调用失败，错误码: ${result}`)
    }

    try {
      const json = this.koffi!.decode(outJson[0], 'char', -1)
      return JSON.parse(json) as T
    } finally {
      this.wcdbFreeString?.(outJson[0])
    }
  }

  private ensureHandle(): number {
    if (!this.handle) throw new Error('微信 4.0 数据库未打开')
    return this.handle
  }

  private normalizeSession(row: Record<string, unknown>): Wcdb4Session {
    const username = this.pickString(row, [
      'username',
      'user_name',
      'userName',
      'usrName',
      'UsrName',
      'talker',
      'talker_id',
      'talkerId',
      'sessionId',
      'session_id'
    ])
    const nickname = this.pickString(row, [
      'nickname',
      'nickName',
      'displayName',
      'display_name',
      'remark',
      'name'
    ])
    return { username, nickname, raw: row }
  }

  private normalizeMessage(row: Record<string, unknown>): Wcdb4Message {
    const contentRaw = this.pickValue(row, [
      'message_content',
      'messageContent',
      'content',
      'msg_content',
      'msgContent',
      'WCDB_CT_message_content'
    ])
    const compressRaw = this.pickValue(row, [
      'compress_content',
      'compressContent',
      'compressed_content',
      'msg_compress_content',
      'msgCompressContent',
      'WCDB_CT_compress_content',
      'WCDB_CT_compressContent'
    ])
    const content = this.decodeMessageContent(contentRaw, compressRaw)
    const sender = this.pickString(row, [
      'sender_username',
      'senderUsername',
      'sender',
      'fromUsername',
      'from_username',
      'WCDB_CT_sender_username'
    ])
    const createTime = this.pickNumber(row, [
      'create_time',
      'createTime',
      'msg_create_time',
      'msgCreateTime',
      'time',
      'WCDB_CT_create_time'
    ])
    const localId = this.pickString(row, [
      'local_id',
      'localId',
      'msg_local_id',
      'msgLocalId',
      'mesLocalID',
      'id'
    ])
    const messageType = this.pickString(row, [
      'local_type',
      'localType',
      'message_type',
      'messageType',
      'msg_type',
      'msgType',
      'type',
      'WCDB_CT_local_type'
    ])
    const isSend = this.pickBoolean(row, [
      'computed_is_send',
      'computedIsSend',
      'is_send',
      'isSend',
      'mesDes',
      'WCDB_CT_is_send'
    ])

    return {
      mesLocalID: localId || `${createTime}-${this.md5(JSON.stringify(row))}`,
      mesDes: isSend ? 0 : 1,
      messageType: messageType || '1',
      msgCreateTime: String(createTime),
      msgContent: content,
      sender,
      senderNickname: sender ? this.displayNameCache.get(sender) : undefined,
      senderAvatar: sender ? this.avatarCache.get(sender) : undefined,
      raw: row
    }
  }

  private hydrateDisplayNames(usernames: string[]): void {
    if (!this.wcdbGetDisplayNames) return
    const missing = this.uniq(usernames).filter((username) => !this.displayNameCache.has(username))
    if (missing.length === 0) return

    try {
      const rows = this.callJson<Record<string, string> | Record<string, unknown>[]>(
        (handle, outJson) => this.wcdbGetDisplayNames!(handle, JSON.stringify(missing), outJson)
      )
      this.readStringMap(rows, [
        'nickname',
        'displayName',
        'display_name',
        'remark',
        'name'
      ]).forEach((name, username) => this.displayNameCache.set(username, name))
    } catch {
      // Names are optional; usernames are still enough to load chats.
    }
  }

  private hydrateAvatarUrls(usernames: string[]): void {
    const missing = this.uniq(usernames).filter((username) => !this.avatarCache.has(username))
    if (missing.length === 0) return

    if (this.wcdbGetAvatarUrls) {
      try {
        const rows = this.callJson<Record<string, string> | Record<string, unknown>[]>(
          (handle, outJson) => this.wcdbGetAvatarUrls!(handle, JSON.stringify(missing), outJson)
        )
        this.readStringMap(rows, [
          'avatarUrl',
          'avatar_url',
          'headImgUrl',
          'm_nsHeadImgUrl',
          'big_head_img_url',
          'small_head_img_url'
        ]).forEach((avatar, username) => this.avatarCache.set(username, avatar))
      } catch {
        // Try the contact database below.
      }
    }

    const stillMissing = missing.filter((username) => !this.avatarCache.has(username))
    if (stillMissing.length === 0) return

    try {
      this.readContactAvatarUrls(stillMissing).forEach((avatar, username) =>
        this.avatarCache.set(username, avatar)
      )
    } catch {
      // Avatars are optional.
    }
  }

  private readContactAvatarUrls(usernames: string[]): Map<string, string> {
    const result = new Map<string, string>()
    if (!this.wcdbExecQuery || usernames.length === 0) return result

    const inList = this.uniq(usernames)
      .map((username) => `'${username.replace(/'/g, "''")}'`)
      .join(',')
    if (!inList) return result

    const sql = `SELECT * FROM contact WHERE username IN (${inList})`
    const rows = this.callJson<Record<string, unknown>[]>((handle, outJson) =>
      this.wcdbExecQuery!(handle, 'contact', '', sql, outJson)
    )

    if (!Array.isArray(rows)) return result

    for (const row of rows) {
      const username = this.pickString(row, ['username', 'user_name', 'userName'])
      const avatar = this.pickString(row, [
        'big_head_img_url',
        'bigHeadImgUrl',
        'bigHeadUrl',
        'big_head_url',
        'small_head_img_url',
        'smallHeadImgUrl',
        'smallHeadUrl',
        'small_head_url',
        'head_img_url',
        'headImgUrl',
        'avatar_url',
        'avatarUrl'
      ])
      if (username && avatar) result.set(username, avatar)
    }

    return result
  }

  private readStringMap(
    rows: Record<string, string> | Record<string, unknown>[],
    valueKeys: string[]
  ): Map<string, string> {
    const result = new Map<string, string>()

    if (Array.isArray(rows)) {
      for (const row of rows) {
        const username = this.pickString(row, ['username', 'userName', 'user_name', 'm_nsUsrName'])
        const value = this.pickString(row, valueKeys)
        if (username && value) result.set(username, value)
      }
      return result
    }

    for (const [username, value] of Object.entries(rows || {})) {
      if (username && value) result.set(username, String(value))
    }

    return result
  }

  private pickString(row: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = this.pickValue(row, [key])
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    }
    return ''
  }

  private pickValue(row: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) return row[key]
      const foundKey = Object.keys(row).find(
        (candidate) => candidate.toLowerCase() === key.toLowerCase()
      )
      if (foundKey) return row[foundKey]
    }
    return undefined
  }

  private decodeMessageContent(messageContent: unknown, compressContent: unknown): string {
    const compressed = this.decodeMaybeCompressed(compressContent)
    if (compressed) return compressed
    return this.decodeMaybeCompressed(messageContent)
  }

  private decodeMaybeCompressed(raw: unknown): string {
    if (raw === null || raw === undefined) return ''
    if (Buffer.isBuffer(raw)) return this.decodeBinaryContent(raw)
    if (raw instanceof Uint8Array) return this.decodeBinaryContent(Buffer.from(raw))
    if (Array.isArray(raw)) return this.decodeBinaryContent(Buffer.from(raw))

    if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : ''
    if (typeof raw !== 'string') {
      const data = (raw as { data?: unknown })?.data
      if (Array.isArray(data)) return this.decodeBinaryContent(Buffer.from(data))
      return ''
    }

    const trimmed = raw.trim()
    if (!trimmed) return ''
    if (/^[0-9]+$/.test(trimmed)) return trimmed

    if (trimmed.length > 16 && this.looksLikeHex(trimmed)) {
      try {
        const decoded = this.decodeBinaryContent(Buffer.from(trimmed, 'hex'))
        if (decoded) return decoded
      } catch {
        // Fall back to the original string below.
      }
    }

    if (trimmed.length > 16 && this.looksLikeBase64(trimmed)) {
      try {
        const decoded = this.decodeBinaryContent(Buffer.from(trimmed, 'base64'))
        if (decoded) return decoded
      } catch {
        // Fall back to the original string below.
      }
    }

    return trimmed
  }

  private decodeBinaryContent(data: Buffer): string {
    if (data.length === 0) return ''

    try {
      if (data.length >= 4 && data.readUInt32LE(0) === 0xfd2fb528) {
        const fzstd = nodeRequire('fzstd') as { decompress: (input: Buffer) => Uint8Array }
        const decompressed = fzstd.decompress(data)
        return Buffer.from(decompressed).toString('utf-8')
      }
    } catch {
      return ''
    }

    const decoded = data.toString('utf-8')
    const replacementCount = (decoded.match(/\uFFFD/g) || []).length
    if (replacementCount < decoded.length * 0.2 && this.isMostlyReadableText(decoded)) {
      return decoded.replace(/\uFFFD/g, '')
    }
    return ''
  }

  private looksLikeHex(value: string): boolean {
    return value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value)
  }

  private looksLikeBase64(value: string): boolean {
    if (value.length % 4 !== 0) return false
    return /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  }

  private isMostlyReadableText(value: string): boolean {
    if (!value) return false
    const readable = Array.from(value).filter((char) => {
      const code = char.charCodeAt(0)
      return code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20
    }).length
    return readable / value.length > 0.85
  }

  private pickNumber(row: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
      const value = this.pickValue(row, [key])
      const parsed =
        typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
      if (Number.isFinite(parsed)) {
        return parsed > 1e12 ? Math.floor(parsed / 1000) : Math.floor(parsed)
      }
    }
    return 0
  }

  private pickBoolean(row: Record<string, unknown>, keys: string[]): boolean {
    for (const key of keys) {
      const value = this.pickValue(row, [key])
      if (typeof value === 'boolean') return value
      if (typeof value === 'number') return value === 1
      if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true'
    }
    return false
  }

  private uniq(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
  }

  private getMyUsernameCandidates(): string[] {
    const rawAccountName = path.basename(this.accountRoot)
    return this.uniq([this.wxid, rawAccountName, Wcdb4Client.cleanAccountDirName(rawAccountName)])
  }

  private normalizeTimestamp(input: number): number {
    if (!input || input <= 0) return 0
    const normalized = input > 1e12 ? Math.floor(input / 1000) : Math.floor(input)
    return Math.min(Math.max(normalized, 0), 2147483647)
  }
}
