import React, { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import { Contact, Message } from '../../shared/types'

function App(): React.ReactElement {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [dbKey, setDbKey] = useState(import.meta.env.VITE_DB_KEY || '')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([])
  const [dateRange, setDateRange] = useState('today') // 默认为今天
  const [contentFilter, setContentFilter] = useState('')

  // useEffect(() => {
  //   if (import.meta.env.VITE_DB_KEY) {
  //     handleLogin(import.meta.env.VITE_DB_KEY);
  //   }
  // }, []);

  const handleLogin = async (keyInput?: string): Promise<void> => {
    const keyToUse = keyInput || dbKey
    if (!keyToUse) return
    try {
      const success = await window.api.initDb(keyToUse)
      if (success) {
        setIsAuthenticated(true)
        loadContacts()
      } else {
        alert('Failed to open database. Check your key.')
      }
    } catch (error) {
      console.error(error)
      alert('Error connecting to database')
    }
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
          <input
            type="password"
            className="login-input"
            value={dbKey}
            onChange={(e) => setDbKey(e.target.value)}
            placeholder="Key (e.g. 0x...)"
          />
          <button className="login-btn" onClick={() => handleLogin()}>
            Connect
          </button>
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
