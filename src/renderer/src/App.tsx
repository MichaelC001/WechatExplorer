import React, { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import { SettingsPanel } from './components/SettingsPanel'
import { Contact, Message } from '../../shared/types'

interface SelfInfo {
  wxid: string
  nickname: string
  avatar?: string
  accountRoot: string
}

const MAC_KEY_FAQ_URL = 'https://github.com/hicccc77/WeFlow/blob/main/docs/MAC-KEY-FAQ.md'
const MESSAGE_MONITOR_DEBOUNCE_MS = 8000

const getMessageIdentity = (message: Message): string => {
  if (message.localId) return `local:${message.localId}`
  if (message.id) return `id:${message.id}`
  return `${message.createTime || 0}:${message.from}:${message.type}:${message.content}`
}

const areMessagesEquivalent = (left: Message[], right: Message[]): boolean => {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (getMessageIdentity(left[index]) !== getMessageIdentity(right[index])) return false
  }
  return true
}

type GroupSnapshot = {
  roomId: string
  memberCount: number
  members: { wxid: string; nickname: string; avatar: string }[]
}

type GroupMemberMeta = { nickname: string; avatar: string }

const formatGroupMemberName = (member: GroupSnapshot['members'][number]): string =>
  member.nickname || member.wxid

const buildSyntheticGroupMessages = (
  previous: GroupSnapshot | null,
  next: GroupSnapshot | null,
  referenceMessages: Message[]
): Message[] => {
  if (!previous || !next || previous.roomId !== next.roomId) return []

  const previousMap = new Map(previous.members.map((member) => [member.wxid, member]))
  const nextMap = new Map(next.members.map((member) => [member.wxid, member]))
  const latestMessageTime = referenceMessages.reduce(
    (max, message) => Math.max(max, message.createTime || 0),
    0
  )
  const fallbackNow = Math.floor(Date.now() / 1000)
  const events: Message[] = []

  let offset = 1
  for (const [wxid, member] of previousMap.entries()) {
    if (nextMap.has(wxid)) continue
    const name = formatGroupMemberName(member)
    const eventTime = Math.max(latestMessageTime + offset, fallbackNow)
    const eventDate = new Date(eventTime * 1000)
    offset += 1
    events.push({
      id: `synthetic-leave:${next.roomId}:${wxid}:${eventTime}`,
      from: 'system',
      type: '系统消息',
      datetime: eventDate.toLocaleString('zh-CN', { hour12: false }),
      content: `${name} 退出了群聊`,
      isSender: false,
      createTime: eventTime
    })
  }

  if (events.length) {
    console.log(
      `[GroupMonitor] synthetic leave detected roomId=${next.roomId} events=${events
        .map((event) => event.content)
        .join(' | ')}`
    )
  }

  return events
}

void buildSyntheticGroupMessages

const sortMessagesChronologically = (items: Message[]): Message[] =>
  [...items].sort((left, right) => {
    const timeDelta = (left.createTime || 0) - (right.createTime || 0)
    if (timeDelta !== 0) return timeDelta
    return getMessageIdentity(left).localeCompare(getMessageIdentity(right))
  })

function App(): React.ReactElement {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [dbKey, setDbKey] = useState(import.meta.env.VITE_DB_KEY || '')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([])
  const [dateRange, setDateRange] = useState('today') // 默认为今天
  const [contentFilter, setContentFilter] = useState('')
  const [isFetchingDbKey, setIsFetchingDbKey] = useState(false)
  const [dbKeyStatus, setDbKeyStatus] = useState('')
  const [dbKeyStatusKind, setDbKeyStatusKind] = useState<'normal' | 'success' | 'error'>('normal')
  const [showDbKey, setShowDbKey] = useState(false)
  const [showMacKeyFaq, setShowMacKeyFaq] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selfInfo, setSelfInfo] = useState<SelfInfo | null>(null)
  const [isNativeMonitorActive, setIsNativeMonitorActive] = useState(false)
  const [bootState, setBootState] = useState<'loading' | 'connecting' | 'login'>('loading')
  const [autoConnectSource, setAutoConnectSource] = useState<'env' | 'saved' | null>(null)
  const currentGroupSnapshotRef = React.useRef<GroupSnapshot | null>(null)
  const syntheticGroupMessagesRef = React.useRef<Record<string, Message[]>>({})
  const groupMemberMetaRef = React.useRef<Record<string, Map<string, GroupMemberMeta>>>({})
  const selectedContactMd5Ref = React.useRef<string>('')

  const refreshSelfInfo = async (): Promise<void> => {
    try {
      const result = await window.api.getSelf()
      if (result.ready) {
        setSelfInfo(result.info)
      } else {
        setSelfInfo(null)
      }
    } catch (error) {
      console.warn('[SelfInfo] 加载失败:', error)
      setSelfInfo(null)
    }
  }

  const loadContacts = async (): Promise<void> => {
    const list = await window.api.getContacts()
    setContacts(list)
    setFilteredContacts(list)
    void hydrateContactAvatars(list)
  }

  const hydrateContactAvatars = async (list: Contact[]): Promise<void> => {
    const usernames = Array.from(
      new Set(
        list
          .map((contact) => contact.m_nsUsrName)
          .filter((username) => username && !username.startsWith('Group_') && !username.startsWith('Unknown_'))
      )
    )
    const chunkSize = 60
    for (let index = 0; index < usernames.length; index += chunkSize) {
      const chunk = usernames.slice(index, index + chunkSize)
      if (chunk.length === 0) continue
      try {
        const avatars = await window.api.getContactAvatars(chunk)
        setContacts((current) =>
          current.map((contact) => avatars[contact.m_nsUsrName] ? { ...contact, avatar: avatars[contact.m_nsUsrName] } : contact)
        )
        setFilteredContacts((current) =>
          current.map((contact) => avatars[contact.m_nsUsrName] ? { ...contact, avatar: avatars[contact.m_nsUsrName] } : contact)
        )
      } catch (error) {
        console.warn('[Contacts] avatar hydrate failed:', error)
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    }
  }

  React.useEffect(() => {
    let active = true
    const attemptAutoConnect = async (): Promise<void> => {
      // 优先级 1:构建期环境变量 VITE_DB_KEY(本地开发/打包时硬编码的密钥)
      const envKey = String(import.meta.env.VITE_DB_KEY || '').trim()
      // 优先级 2:上一次保存到 safeStorage 的密钥
      let savedKey = ''
      if (!envKey) {
        const result = await window.api.getSavedDbKey()
        if (result.success && result.key) savedKey = result.key
      }
      const key = envKey || savedKey
      if (!key) {
        if (active) setBootState('login')
        return
      }
      if (active) {
        setDbKey(key)
        setAutoConnectSource(envKey ? 'env' : 'saved')
        setDbKeyStatus(
          envKey ? '已加载环境变量中的密钥，请手动点击 Connect' : '已加载安全保存的密钥，请手动点击 Connect'
        )
        setDbKeyStatusKind('normal')
        setBootState('login')
      }
      if (true) return
      if (active) {
        setBootState('connecting')
        setDbKey(key)
        setAutoConnectSource(envKey ? 'env' : 'saved')
        setDbKeyStatus(
          envKey ? '检测到环境变量中的密钥,正在自动连接...' : '已加载安全保存的密钥,正在自动连接...'
        )
        setDbKeyStatusKind('normal')
      }
      try {
        const result: any = await window.api.initDb(key)
        if (!active) return
        const success = typeof result === 'boolean' ? result : result.success
        if (success) {
          setIsNativeMonitorActive(typeof result !== 'boolean' && result.monitoring === true)
          setIsAuthenticated(true)
          setDbKeyStatus('已自动连接')
          setDbKeyStatusKind('success')
          await loadContacts()
          void refreshSelfInfo()
        } else {
          const error = typeof result === 'boolean' ? '' : result.error
          setDbKeyStatus(
            `自动连接失败,请重新输入${error ? `: ${error}` : ''}`
          )
          setDbKeyStatusKind('error')
          setBootState('login')
        }
      } catch (error: any) {
        if (!active) return
        const message = error instanceof Error ? error.message : String(error)
        setDbKeyStatus(`自动连接失败: ${message}`)
        setDbKeyStatusKind('error')
        setBootState('login')
      }
    }
    void attemptAutoConnect()
    const unsubscribe = window.api.onDbKeyStatus(({ message }) => {
      if (!active) return
      setDbKeyStatus(message)
      setDbKeyStatusKind('normal')
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  // useEffect(() => {
  //   if (import.meta.env.VITE_DB_KEY) {
  //     handleLogin(import.meta.env.VITE_DB_KEY);
  //   }
  // }, []);

  const handleLogin = async (keyInput?: string): Promise<void> => {
    const keyToUse = keyInput || dbKey
    if (!keyToUse) return
    try {
      const result = await window.api.initDb(keyToUse)
      const success = typeof result === 'boolean' ? result : result.success
      if (success) {
        setIsNativeMonitorActive(typeof result !== 'boolean' && result.monitoring === true)
        setIsAuthenticated(true)
        // 手动输入也持久化,下次启动可自动连接(参考 WeFlow)
        void window.api.saveDbKey(keyToUse).catch(() => undefined)
        loadContacts()
        void refreshSelfInfo()
      } else {
        const error = typeof result === 'boolean' ? '' : result.error
        alert(`Failed to open database.${error ? `\n\n${error}` : '\nCheck your key.'}`)
      }
    } catch (error) {
      console.error(error)
      alert('Error connecting to database')
    }
  }

  const logGroupSnapshot = React.useCallback(
    async (contact: Contact | null, reason: string): Promise<GroupSnapshot | null> => {
      if (!contact || contact.type !== 'group') return null
      try {
        const snapshot = (await window.api.getGroupSnapshot(contact.md5)) as GroupSnapshot | null
        if (!snapshot) {
          return null
        }
        return snapshot
      } catch (error) {
        console.warn(`[GroupSnapshot] reason=${reason} name=${contact.m_nsNickName} failed:`, error)
        return null
      }
    },
    []
  )

  const mergeSyntheticMessages = React.useCallback(
    (contact: Contact | null, baseMessages: Message[], roomId?: string): Message[] => {
      if (!contact || contact.type !== 'group') return baseMessages
      const resolvedRoomId = roomId || currentGroupSnapshotRef.current?.roomId
      if (!resolvedRoomId) return baseMessages
      const synthetic = syntheticGroupMessagesRef.current[resolvedRoomId] || []
      return synthetic.length
        ? sortMessagesChronologically([...baseMessages, ...synthetic])
        : baseMessages
    },
    []
  )

  const applyGroupMemberMeta = React.useCallback(
    (contact: Contact | null, baseMessages: Message[]): Message[] => {
      if (!contact || contact.type !== 'group') return baseMessages
      const memberMap = groupMemberMetaRef.current[contact.md5]
      if (!memberMap || memberMap.size === 0) return baseMessages

      return baseMessages.map((message) => {
        const senderId = String(message.senderId || message.name || '').trim()
        if (!senderId || !senderId.startsWith('wxid_')) return message
        const member = memberMap.get(senderId)
        if (!member) return message
        const nickname = member.nickname && !member.nickname.startsWith('wxid_') ? member.nickname : senderId
        return {
          ...message,
          name: nickname,
          img: message.img || member.avatar
        }
      })
    },
    []
  )

  const loadGroupMemberMeta = React.useCallback(
    async (contact: Contact | null): Promise<GroupSnapshot | null> => {
      if (!contact || contact.type !== 'group') return null
      const snapshot = await logGroupSnapshot(contact, 'load-member-meta')
      if (!snapshot) return null
      currentGroupSnapshotRef.current = snapshot
      groupMemberMetaRef.current[contact.md5] = new Map(
        snapshot.members.map((member) => [
          member.wxid,
          { nickname: member.nickname || member.wxid, avatar: member.avatar || '' }
        ])
      )
      return snapshot
    },
    [logGroupSnapshot]
  )

  const handleAutoGetDbKey = async (): Promise<void> => {
    if (isFetchingDbKey) return
    setIsFetchingDbKey(true)
    setDbKeyStatus('正在准备获取密钥...')
    setDbKeyStatusKind('normal')
    setShowMacKeyFaq(false)
    try {
      const result = await window.api.autoGetDbKey()
      if (!result.success || !result.key) {
        setShowMacKeyFaq(result.code === 'SCAN_FAILED')
        throw new Error(result.error || '获取密钥失败')
      }
      setDbKey(result.key)
      setDbKeyStatus(result.saved ? '密钥已获取并安全保存' : result.warning || '密钥已获取')
      setDbKeyStatusKind(result.saved ? 'success' : 'normal')
    } catch (error) {
      setDbKeyStatus(error instanceof Error ? error.message : String(error))
      setDbKeyStatusKind('error')
    } finally {
      setIsFetchingDbKey(false)
    }
  }

  const handlePasteAndSaveDbKey = async (): Promise<void> => {
    setShowMacKeyFaq(false)
    const result = await window.api.pasteAndSaveDbKey()
    if (result.success && result.key) {
      setDbKey(result.key)
      setDbKeyStatus('已从剪贴板粘贴并安全保存')
      setDbKeyStatusKind('success')
    } else {
      setDbKeyStatus(result.error || '粘贴并保存失败')
      setDbKeyStatusKind('error')
    }
  }

  const handleClearSavedDbKey = async (): Promise<void> => {
    setShowMacKeyFaq(false)
    const result = await window.api.clearSavedDbKey()
    if (!result.success) {
      setDbKeyStatus(result.error || '清除密钥失败')
      setDbKeyStatusKind('error')
      return
    }
    setDbKey('')
    setDbKeyStatus('已清除保存的密钥')
    setDbKeyStatusKind('normal')
  }

  const getDateRangeParams = (
    range: string
  ): { startTime: number | undefined; endTime: number | undefined } => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000

    let startTime: number | undefined
    let endTime: number | undefined

    switch (range) {
      case 'today':
        startTime = startOfToday
        break
      case 'yesterday':
        startTime = startOfToday - 86400
        endTime = startOfToday - 1 // 昨天结束
        break
      case '7':
        startTime = Math.floor(Date.now() / 1000) - 7 * 86400
        break
      case '30':
        startTime = Math.floor(Date.now() / 1000) - 30 * 86400
        break
      case 'all':
        startTime = undefined
        break
      default:
        startTime = startOfToday
    }
    return { startTime, endTime }
  }

  const handleSelectContact = async (contact: Contact): Promise<void> => {
    setSelectedContact(contact)
    selectedContactMd5Ref.current = contact.md5
    currentGroupSnapshotRef.current = null
    const { startTime, endTime } = getDateRangeParams(dateRange)
    const msgs = await window.api.getMessages(contact.md5, startTime, endTime)
    if (selectedContactMd5Ref.current !== contact.md5) return
    const cachedMessages = applyGroupMemberMeta(contact, mergeSyntheticMessages(contact, msgs))
    setMessages(cachedMessages)
    if (contact.type === 'group') {
      void loadGroupMemberMeta(contact).then((snapshot) => {
        if (selectedContactMd5Ref.current !== contact.md5) return
        if (!snapshot) return
        setMessages((current) =>
          applyGroupMemberMeta(contact, mergeSyntheticMessages(contact, current, snapshot.roomId))
        )
      })
    }
  }

  const handleDateRangeChange = (range: string): void => {
    setDateRange(range)
    if (selectedContact) {
      const { startTime, endTime } = getDateRangeParams(range)
      window.api.getMessages(selectedContact.md5, startTime, endTime).then((nextMessages) => {
        setMessages(applyGroupMemberMeta(selectedContact, mergeSyntheticMessages(selectedContact, nextMessages)))
      })
    }
  }

  React.useEffect(() => {
    if (!isAuthenticated || !selectedContact || !isNativeMonitorActive) return

    let disposed = false
    let refreshTimer: number | null = null
    let refreshInFlight = false
    let refreshQueued = false
    const contactMd5 = selectedContact.md5

    const refreshCurrentConversation = async (): Promise<void> => {
      if (refreshInFlight) {
        refreshQueued = true
        return
      }
      refreshInFlight = true
      try {
        const range = getDateRangeParams(dateRange)
        const latestMessages = await window.api.getMessages(
          contactMd5,
          range.startTime,
          range.endTime
        )
        const nextMessages = applyGroupMemberMeta(
          selectedContact,
          mergeSyntheticMessages(selectedContact, latestMessages)
        )
        if (!disposed) {
          setMessages((current) =>
            areMessagesEquivalent(current, nextMessages) ? current : nextMessages
          )
        }
      } catch (error) {
        console.warn('[MessageMonitor] 刷新当前会话失败:', error)
      }
      refreshInFlight = false
      if (refreshQueued && !disposed) {
        refreshQueued = false
        if (refreshTimer) window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => {
          refreshTimer = null
          void refreshCurrentConversation()
        }, MESSAGE_MONITOR_DEBOUNCE_MS)
      }
    }

    const unsubscribe = window.api.onWcdbChange(() => {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void refreshCurrentConversation()
      }, MESSAGE_MONITOR_DEBOUNCE_MS)
    })

    return () => {
      disposed = true
      if (refreshTimer) window.clearTimeout(refreshTimer)
      unsubscribe()
    }
  }, [
    dateRange,
    isAuthenticated,
    isNativeMonitorActive,
    selectedContact,
    logGroupSnapshot,
    applyGroupMemberMeta,
    mergeSyntheticMessages
  ])

  const handleSearchContacts = (keyword: string): void => {
    if (!keyword) {
      setFilteredContacts(contacts)
    } else {
      const lower = keyword.toLowerCase()
      const filtered = contacts.filter(
        (c) =>
          c.m_nsNickName.toLowerCase().includes(lower) ||
          c.m_nsUsrName.toLowerCase().includes(lower)
      )
      setFilteredContacts(filtered)
    }
  }

  const [sidebarWidth, setSidebarWidth] = useState(250)
  const [isResizing, setIsResizing] = useState(false)

  const startResizing = React.useCallback(() => {
    setIsResizing(true)
  }, [])

  const stopResizing = React.useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = React.useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        setSidebarWidth(mouseMoveEvent.clientX)
      }
    },
    [isResizing]
  )

  React.useEffect(() => {
    window.addEventListener('mousemove', resize)
    window.addEventListener('mouseup', stopResizing)
    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [resize, stopResizing])

  if (!isAuthenticated && bootState !== 'login') {
    return (
      <div className="boot-splash">
        <div className="boot-splash-spinner" aria-hidden />
        <div className="boot-splash-title">
          {bootState === 'connecting' ? '正在自动连接数据库...' : '正在准备...'}
        </div>
        <div className="boot-splash-subtitle">
          {bootState === 'connecting'
            ? autoConnectSource === 'env'
              ? '检测到环境变量中的密钥'
              : '使用上次安全保存的密钥'
            : 'WechatExplorer'}
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="login-modal">
        <div className="login-box">
          <h2>Enter WeChat DB Key</h2>
          <div className="login-input-wrapper">
            <input
              type={showDbKey ? 'text' : 'password'}
              className="login-input"
              value={dbKey}
              onChange={(e) => setDbKey(e.target.value)}
              placeholder="Key (e.g. 0x...)"
            />
            <button
              type="button"
              className="login-input-toggle"
              onClick={() => setShowDbKey(!showDbKey)}
              title={showDbKey ? '隐藏密钥' : '显示密钥'}
            >
              {showDbKey ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          <button
            className="login-btn login-btn-secondary"
            onClick={handleAutoGetDbKey}
            disabled={isFetchingDbKey}
          >
            {isFetchingDbKey ? '正在获取...' : '自动获取密钥'}
          </button>
          <button className="login-btn login-btn-secondary" onClick={handlePasteAndSaveDbKey}>
            粘贴并安全保存
          </button>
          <button className="login-btn" onClick={() => handleLogin()}>
            Connect
          </button>
          <button className="login-clear-btn" onClick={handleClearSavedDbKey}>
            清除已保存密钥
          </button>
          {dbKeyStatus && (
            <div className={`login-key-status ${dbKeyStatusKind}`}>{dbKeyStatus}</div>
          )}
          {showMacKeyFaq && (
            <a
              className="login-key-help-link"
              href={MAC_KEY_FAQ_URL}
              target="_blank"
              rel="noreferrer"
            >
              查看 macOS 获取密钥排障指引
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <Sidebar
        contacts={filteredContacts}
        selectedContact={selectedContact}
        onSelectContact={handleSelectContact}
        onSearch={handleSearchContacts}
        onContentFilter={setContentFilter}
        width={sidebarWidth}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        selfInfo={selfInfo}
        dbReady={isAuthenticated}
        onOpenSettings={() => setShowSettings(true)}
      />
      <div className="resizer" onMouseDown={startResizing} />
      <ChatWindow
        key={`${selectedContact?.md5}-${contentFilter}`}
        contact={selectedContact}
        messages={messages}
        contentFilter={contentFilter}
        onRefresh={() => selectedContact && handleSelectContact(selectedContact)}
        onRefreshData={loadContacts}
      />
      <SettingsPanel
        open={showSettings}
        selfInfo={selfInfo}
        dbReady={isAuthenticated}
        dbKey={dbKey}
        onClose={() => setShowSettings(false)}
        onDbKeyChange={setDbKey}
        onDbRootChanged={() => {
          void refreshSelfInfo()
          void loadContacts()
        }}
      />
    </div>
  )
}

export default App
