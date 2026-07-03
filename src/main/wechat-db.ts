import { Wcdb4Client } from './wcdb4-client'

export interface UserContact {
  m_nsUsrName: string
  nickname: string
  avatar?: string
}

export interface WechatMessage {
  mesLocalID: string
  mesDes: number
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
  avatar?: string
}

export interface GroupMemberInfo {
  m_nsUsrName: string
  nickname: string
  m_nsHeadImgUrl: string
}

export class WechatDb {
  private wcdb4Client: Wcdb4Client
  private chatMd5ToUsername = new Map<string, string>()

  constructor(rawKey: string) {
    console.log(`Initializing WechatDb with key length: ${rawKey.trim().length}`)
    const client = new Wcdb4Client(rawKey)
    client.open()
    this.wcdb4Client = client
    for (const table of client.getChatTables()) {
      if (table.name.startsWith('Chat_')) {
        this.chatMd5ToUsername.set(table.name.substring(5), table.db_number)
      }
    }
  }

  public getUserList(nicknameFilter?: string): UserContact[] {
    const keyword = (nicknameFilter || '').trim().toLowerCase()
    return this.wcdb4Client
      .getSessions()
      .map((session) => ({
        m_nsUsrName: session.username,
        nickname: session.nickname || session.username,
        avatar: session.avatar
      }))
      .filter((contact) => {
        if (!keyword) return true
        return (
          contact.m_nsUsrName.toLowerCase().includes(keyword) ||
          contact.nickname.toLowerCase().includes(keyword)
        )
      })
  }

  public getAllGroupContacts(): Record<string, string> {
    const groupContacts: Record<string, string> = {}
    for (const session of this.wcdb4Client.getSessions()) {
      if (session.username.endsWith('@chatroom')) {
        groupContacts[this.md5(session.username)] = session.nickname || session.username
      }
    }
    return groupContacts
  }

  public getAllGroupMembers(): Record<string, string> {
    const members: Record<string, string> = {}
    for (const session of this.wcdb4Client.getSessions()) {
      if (!session.username.endsWith('@chatroom')) continue
      for (const member of this.wcdb4Client.getGroupMembers(session.username)) {
        if (member.m_nsUsrName) {
          members[member.m_nsUsrName] = member.nickname || member.m_nsUsrName
        }
      }
    }
    return members
  }

  public getGroupMembersForChat(userMd5: string): Record<string, string> {
    const username = this.chatMd5ToUsername.get(userMd5)
    if (!username || !username.endsWith('@chatroom')) return {}

    const members: Record<string, string> = {}
    for (const member of this.wcdb4Client.getGroupMembers(username)) {
      if (member.m_nsUsrName) {
        members[member.m_nsUsrName] = member.nickname || member.m_nsUsrName
      }
    }
    return members
  }

  public getGroupMember(wxid: string, chatroomId?: string): GroupMemberInfo | null {
    if (!chatroomId) return null
    return (
      this.wcdb4Client
        .getGroupMembers(chatroomId)
        .find((member) => member.m_nsUsrName === wxid) || null
    )
  }

  public getAllChatTables(): { name: string; db_number: string }[] {
    return this.wcdb4Client.getChatTables()
  }

  public getMyAvatarUrl(): string | undefined {
    return this.wcdb4Client.getMyAvatarUrl()
  }

  public getWcdb4Client(): Wcdb4Client {
    return this.wcdb4Client
  }

  public close(): void {
    this.wcdb4Client.close()
  }

  public getUserMessages(userMd5: string, startTime?: number, endTime?: number): WechatMessage[] {
    const username = this.chatMd5ToUsername.get(userMd5)
    if (!username) return []
    return this.wcdb4Client.getMessages(username, startTime, endTime).map((message) => ({
      ...message,
      ...message.raw
    }))
  }

  public searchAllMessages(keyword: string): string | null {
    const lowerKeyword = keyword.trim().toLowerCase()
    if (!lowerKeyword) return null
    for (const session of this.wcdb4Client.getSessions()) {
      const found = this.wcdb4Client
        .getMessages(session.username)
        .some((message) => message.msgContent.toLowerCase().includes(lowerKeyword))
      if (found) return `Chat_${this.md5(session.username)}`
    }
    return null
  }

  public md5(str: string): string {
    return this.wcdb4Client.md5(str)
  }
}
