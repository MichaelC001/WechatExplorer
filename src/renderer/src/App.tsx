import React, { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import { Contact, Message } from '../../shared/types'

const MAC_KEY_FAQ_URL = 'https://github.com/hicccc77/WeFlow/blob/main/docs/MAC-KEY-FAQ.md'

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

  React.useEffect(() => {
    let active = true
    void window.api.getSavedDbKey().then((result) => {
      if (!active) return
      if (result.success && result.key) {
        setDbKey(result.key)
        setDbKeyStatus('已加载安全保存的密钥')
        setDbKeyStatusKind('success')
      }
    })
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
        setIsAuthenticated(true)
        loadContacts()
      } else {
        const error = typeof result === 'boolean' ? '' : result.error
        alert(`Failed to open database.${error ? `\n\n${error}` : '\nCheck your key.'}`)
      }
    } catch (error) {
      console.error(error)
      alert('Error connecting to database')
    }
  }

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

  const loadContacts = async (): Promise<void> => {
    const list = await window.api.getContacts()
    setContacts(list)
    setFilteredContacts(list)
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
    const { startTime, endTime } = getDateRangeParams(dateRange)
    const msgs = await window.api.getMessages(contact.md5, startTime, endTime)
    setMessages(msgs)
  }

  const handleDateRangeChange = (range: string): void => {
    setDateRange(range)
    // 如果选择了联系人，则使用新范围重新加载消息
    if (selectedContact) {
      // 需要调用 handleSelectContact，但它需要一个联系人对象。
      // 由于状态更新是异步的，可能需要使用状态中的当前联系人，
      // 此函数内部 'selectedContact' 可从闭包中获得。
      // 但是，需要确保 'dateRange' 已更新。
      // 实际上，就在这里使用新范围手动触发获取。

      const { startTime, endTime } = getDateRangeParams(range)
      window.api.getMessages(selectedContact.md5, startTime, endTime).then(setMessages)
    }
  }

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
    </div>
  )
}

export default App
