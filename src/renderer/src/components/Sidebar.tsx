import React, { useState } from 'react'
import { Contact } from '../../../shared/types'

interface SelfInfo {
  wxid: string
  nickname: string
  avatar?: string
  accountRoot: string
}

interface SidebarProps {
  contacts: Contact[]
  selectedContact: Contact | null
  onSelectContact: (contact: Contact) => void
  onSearch: (keyword: string) => void
  onContentFilter: (keyword: string) => void
  width: number
  dateRange: string
  onDateRangeChange: (range: string) => void
  selfInfo: SelfInfo | null
  dbReady: boolean
  onOpenSettings: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  contacts,
  selectedContact,
  onSelectContact,
  onSearch,
  onContentFilter,
  width,
  dateRange,
  onDateRangeChange,
  selfInfo,
  dbReady,
  onOpenSettings
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [contentFilter, setContentFilter] = useState('')
  const [isGroupsExpanded, setIsGroupsExpanded] = useState(true)
  const [isContactsExpanded, setIsContactsExpanded] = useState(true)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const term = e.target.value
    setSearchTerm(term)
    onSearch(term)
  }

  const handleContentFilterChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const term = e.target.value
    setContentFilter(term)
    onContentFilter(term)
  }

  const groups = contacts.filter((c) => c.type === 'group')
  const users = contacts.filter((c) => c.type === 'user')

  const renderContactItem = (contact: Contact): React.ReactElement => (
    <div
      key={contact.md5}
      className={`contact-item ${selectedContact?.md5 === contact.md5 ? 'active' : ''}`}
      onClick={() => onSelectContact(contact)}
    >
      <div className="contact-avatar">
        {contact.avatar ? (
          <img
            src={contact.avatar}
            alt={contact.m_nsNickName}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
          />
        ) : (
          (contact.m_nsNickName || contact.m_nsUsrName || '?').charAt(0)
        )}
      </div>
      <div className="contact-info">
        <div className="contact-name">{contact.m_nsNickName}</div>
      </div>
    </div>
  )

  return (
    <div className="sidebar" style={{ width: width }}>
      <div className="sidebar-header">
        <input
          type="text"
          className="search-input"
          placeholder="搜索联系人"
          value={searchTerm}
          onChange={handleSearchChange}
          style={{ marginBottom: '8px' }}
        />
        <input
          type="text"
          className="search-input"
          placeholder="过滤消息内容"
          value={contentFilter}
          onChange={handleContentFilterChange}
        />
        <div className="date-range-selector">
          {[
            { key: 'today', label: '当天' },
            { key: 'yesterday', label: '昨日' },
            { key: '7', label: '近7天' },
            { key: '30', label: '近30天' },
            { key: 'all', label: '所有' }
          ].map((item) => (
            <button
              key={item.key}
              className={`range-btn ${dateRange === item.key ? 'active' : ''}`}
              onClick={() => onDateRangeChange(item.key)}
              title={item.label}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="contact-list">
        {/* 群聊部分 */}
        <div className="section-header" onClick={() => setIsGroupsExpanded(!isGroupsExpanded)}>
          <span className="arrow">{isGroupsExpanded ? '▼' : '▶'}</span> 群聊 ({groups.length})
        </div>
        {isGroupsExpanded && groups.map(renderContactItem)}
        {isGroupsExpanded && groups.length === 0 && <div className="section-empty">暂无群聊</div>}

        {/* 联系人部分 */}
        <div className="section-header" onClick={() => setIsContactsExpanded(!isContactsExpanded)}>
          <span className="arrow">{isContactsExpanded ? '▼' : '▶'}</span> 联系人 ({users.length})
        </div>
        {isContactsExpanded && users.map(renderContactItem)}
        {isContactsExpanded && users.length === 0 && (
          <div className="section-empty">暂无联系人</div>
        )}
      </div>
      <div className="sidebar-footer" onClick={onOpenSettings} title="设置">
        <div className="sidebar-self-avatar">
          {selfInfo?.avatar ? (
            <img
              src={selfInfo.avatar}
              alt={selfInfo.nickname}
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
            />
          ) : (
            ((selfInfo?.nickname || selfInfo?.wxid || '我').charAt(0))
          )}
        </div>
        <div className="sidebar-self-info">
          <div className="sidebar-self-nickname">
            {dbReady && selfInfo ? selfInfo.nickname || selfInfo.wxid || '我' : '未连接'}
          </div>
          <div className="sidebar-self-wxid">
            {dbReady && selfInfo ? selfInfo.wxid : '点击设置 →'}
          </div>
        </div>
        <div className="sidebar-self-arrow" aria-hidden>⚙</div>
      </div>
    </div>
  )
}
