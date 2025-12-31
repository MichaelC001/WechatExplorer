import DatabaseConstructor from 'better-sqlite3-multiple-ciphers'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import os from 'os'

type Database = import('better-sqlite3-multiple-ciphers').Database

export interface UserContact {
  m_nsUsrName: string
  nickname: string
}

export interface WechatMessage {
  mesLocalID: string
  mesDes: string
  messageType: string
  msgCreateTime: string
  msgContent: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface Contact {
  m_nsUsrName: string
  m_nsNickName: string
  md5: string
  type: 'user' | 'group'
}

export interface GroupMemberInfo {
  m_nsUsrName: string
  nickname: string
  m_nsHeadImgUrl: string
}

export class WechatDb {
  private static WECHAT_DIR = path.join(
    os.homedir(),
    'Library/Containers/com.tencent.xinWeChat/Data/Library/Application Support/com.tencent.xinWeChat/2.0b4.0.9'
  )

  private rawKey: string
  private correctUserId: string | null = null
  private chatDb: { name: string; db_number: string }[] | null = null
  private groupMemberCache = new Map<string, GroupMemberInfo | null>()

  constructor(rawKey: string) {
    this.rawKey = rawKey
    console.log(`Initializing WechatDb with key: ${rawKey}`)

    if (!fs.existsSync(WechatDb.WECHAT_DIR)) {
      throw new Error(`WeChat directory not found at ${WechatDb.WECHAT_DIR}`)
    }

    if (this.getUser()) {
      console.log('User found, getting chat DB number')
      this.chatDb = this.getChatDbNumber()
    } else {
      throw new Error('No valid user found or invalid key')
    }
  }

  private connectDb(dbPath: string): Database | null {
    const targetPath = path.resolve(dbPath)
    if (!fs.existsSync(targetPath)) {
      console.error(`❌ 错误：数据库文件不存在于路径：${targetPath}`)
      return null
    }

    try {
      const db = new DatabaseConstructor(targetPath, {
        // verbose: console.log
      })

      // 配置加密方案 (Cipher Scheme)
      db.pragma("cipher='sqlcipher'")
      db.pragma('cipher_page_size = 1024')
      db.pragma('legacy=3')
      db.pragma('kdf_iter = 64000')
      db.pragma('cipher_hmac_algorithm = HMAC_SHA1')
      db.pragma('cipher_kdf_algorithm = PBKDF2_HMAC_SHA1')

      const processedKey = this.processRawKey(this.rawKey)
      // console.log(`🔑 应用密钥 (前6位): ${processedKey.substring(0, 6)}...`)

      db.pragma(`key = "x'${processedKey}'"`)

      // 验证连接
      db.prepare('SELECT count(*) as count FROM sqlite_master').get()

      return db
    } catch (error) {
      console.error(`❌ 连接失败:`, error)

      const errString = String(error)
      if (errString.includes('file is not a database')) {
        console.error(
          "💡 诊断建议：\n1. 请确认是否已安装 'better-sqlite3-multiple-ciphers'。\n2. 检查密钥是否正确（WeChat密钥与设备强绑定）。\n3. 尝试将页大小改为 4096 (db.pragma('cipher_page_size = 4096'))。"
        )
      } else if (errString.includes('HMAC')) {
        console.error(
          '💡 诊断建议：密钥可能正确，但HMAC算法或页大小不匹配。尝试调整 cipher_hmac_algorithm。'
        )
      }

      return null
    }
  }

  private processRawKey(key: string): string {
    // 移除可能的 '0x' 前缀并修剪空格
    return key.replace(/^0x/i, '').trim()
  }

  private getUser(): boolean {
    const keyValuePath = path.join(WechatDb.WECHAT_DIR, 'KeyValue')
    if (!fs.existsSync(keyValuePath)) return false

    const contents = fs.readdirSync(keyValuePath)
    const potentialUsers = contents.filter((name) => !name.startsWith('.'))

    for (const user of potentialUsers) {
      const dbPath = path.join(keyValuePath, user, 'KeyValue.db')
      if (fs.existsSync(dbPath)) {
        const db = this.connectDb(dbPath)
        if (db) {
          this.correctUserId = user
          console.log(`Valid user found: ${user}`)
          db.close()
          return true
        }
      }
    }
    return false
  }

  private getChatDbNumber(): { name: string; db_number: string }[] {
    const chatDb: { name: string; db_number: string }[] = []
    if (!this.correctUserId) return []

    for (let i = 0; i < 10; i++) {
      const dbPath = path.join(WechatDb.WECHAT_DIR, this.correctUserId, 'Message', `msg_${i}.db`)
      if (!fs.existsSync(dbPath)) continue

      const db = this.connectDb(dbPath)
      if (db) {
        const tables = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Chat_%'")
          .all() as { name: string }[]
        for (const table of tables) {
          chatDb.push({ name: table.name, db_number: `msg_${i}.db` })
        }
        db.close()
      }
    }
    return chatDb
  }

  public getUserList(nicknameFilter?: string): UserContact[] {
    if (!this.correctUserId) return []
    const dbPath = path.join(WechatDb.WECHAT_DIR, this.correctUserId, 'Contact/wccontact_new2.db')
    const db = this.connectDb(dbPath)
    if (!db) return []

    let query = "SELECT m_nsUsrName, nickname FROM WCContact WHERE m_nsUsrName NOT LIKE 'gh_%'"
    if (nicknameFilter) {
      query += ` AND nickname LIKE '%${nicknameFilter}%'`
    }

    const results = db.prepare(query).all() as unknown as UserContact[]
    db.close()
    return results
  }

  public getAllGroupContacts(): Record<string, string> {
    if (!this.correctUserId) return {}
    const dbPath = path.join(WechatDb.WECHAT_DIR, this.correctUserId, 'Group/group_new.db')
    const db = this.connectDb(dbPath)
    if (!db) return {}

    const results = db.prepare('SELECT m_nsUsrName, nickname FROM GroupContact').all() as {
      m_nsUsrName: string
      nickname: string
    }[]
    db.close()

    const groupContacts: Record<string, string> = {}
    for (const row of results) {
      if (row.m_nsUsrName && row.nickname) {
        const md5 = this.md5(row.m_nsUsrName)
        groupContacts[md5] = row.nickname
      }
    }
    return groupContacts
  }

  public getAllGroupMembers(): Record<string, string> {
    if (!this.correctUserId) return {}
    const dbPath = path.join(WechatDb.WECHAT_DIR, this.correctUserId, 'Group/group_new.db')
    const db = this.connectDb(dbPath)
    if (!db) return {}

    // 查询 GroupMember 表
    const results = db.prepare('SELECT m_nsUsrName, nickname FROM GroupMember').all() as {
      m_nsUsrName: string
      nickname: string
    }[]
    db.close()

    const groupMembers: Record<string, string> = {}
    for (const row of results) {
      if (row.m_nsUsrName && row.nickname) {
        // 将 wxid (m_nsUsrName) 映射到昵称
        groupMembers[row.m_nsUsrName] = row.nickname
      }
    }
    return groupMembers
  }

  public getGroupMember(wxid: string): GroupMemberInfo | null {
    if (!this.correctUserId) return null

    // 检查缓存
    if (this.groupMemberCache.has(wxid)) {
      return this.groupMemberCache.get(wxid) || null
    }

    const dbPath = path.join(WechatDb.WECHAT_DIR, this.correctUserId, 'Group/group_new.db')
    const db = this.connectDb(dbPath)
    if (!db) {
      this.groupMemberCache.set(wxid, null)
      return null
    }

    const result = db
      .prepare(
        'SELECT m_nsUsrName, nickname, m_nsHeadImgUrl FROM GroupMember WHERE m_nsUsrName = ?'
      )
      .get(wxid) as GroupMemberInfo

    db.close()

    // 写入缓存
    this.groupMemberCache.set(wxid, result || null)

    return result || null
  }

  public getAllChatTables(): { name: string; db_number: string }[] {
    return this.chatDb || []
  }

  public getUserMessages(userMd5: string, startTime?: number, endTime?: number): WechatMessage[] {
    if (!this.chatDb || !this.correctUserId) return []

    const tableName = `Chat_${userMd5}`
    const tableInfo = this.chatDb.find((t) => t.name === tableName)

    if (!tableInfo) {
      console.error(`No table found for ${tableName}`)
      return []
    }

    const dbPath = path.join(
      WechatDb.WECHAT_DIR,
      this.correctUserId,
      'Message',
      tableInfo.db_number
    )
    const db = this.connectDb(dbPath)
    if (!db) return []

    try {
      let query = `SELECT * FROM ${tableName}`
      const conditions: string[] = []

      // console.log(startTime, endTime, 'time range')

      if (startTime) {
        conditions.push(`msgCreateTime >= ${startTime}`)
      }
      if (endTime) {
        conditions.push(`msgCreateTime <= ${endTime}`)
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`
      }

      // 添加排序以确保存储正确的顺序
      query += ` ORDER BY msgCreateTime ASC`

      const results = db.prepare(query).all() as unknown as WechatMessage[]
      db.close()
      return results
    } catch (e) {
      console.error(`Error querying messages for ${tableName}:`, e)
      db.close()
      return []
    }
  }

  public searchAllMessages(keyword: string): string | null {
    if (!this.correctUserId) return null

    for (let i = 0; i < 10; i++) {
      const dbName = `msg_${i}.db`
      const dbPath = path.join(WechatDb.WECHAT_DIR, this.correctUserId, 'Message', dbName)
      if (!fs.existsSync(dbPath)) continue

      const db = this.connectDb(dbPath)
      if (!db) continue

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Chat_%'")
        .all() as { name: string }[]
      for (const table of tables) {
        try {
          // 首先检查 msgContent 列是否存在以避免错误？
          // 或者像 Swift 代码中那样使用 try/catch "抑制错误"
          const results = db
            .prepare(`SELECT 1 FROM ${table.name} WHERE msgContent LIKE '%${keyword}%' LIMIT 1`)
            .get()
          if (results) {
            console.log(`Found keyword in ${table.name} (${dbName})`)
            db.close()
            return table.name
          }
        } catch {
          // 忽略没有 msgContent 的表
        }
      }
      db.close()
    }
    return null
  }

  public md5(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex')
  }
}
