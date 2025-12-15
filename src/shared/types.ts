export interface Contact {
  m_nsUsrName: string
  m_nsNickName: string
  md5: string
  type: 'user' | 'group'
  avatar?: string
}

export interface Message {
  id: string
  from: string
  type: string
  datetime: string
  content: string
  isSender: boolean
  img?: string
  name?: string
}

export interface ChatTable {
  name: string
  db_number: string
}
