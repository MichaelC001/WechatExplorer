import React, { useState } from 'react'
import { Contact } from '../../../../shared/types'
import { AccountSummary } from '../account/AccountSummary'
import { ConversationSection } from './ConversationSection'
import { ConversationSidebarHeader } from './ConversationSidebarHeader'

interface SelfInfo {
  wxid: string
  nickname: string
  avatar?: string
  accountRoot: string
}

export interface ConversationSidebarProps {
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

export function ConversationSidebar({
  contacts,
  selectedContact,
  onSelectContact,
  onSearch,
  width,
  dateRange,
  onDateRangeChange,
  selfInfo,
  dbReady,
  onOpenSettings
}: ConversationSidebarProps): React.ReactElement {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedSection, setExpandedSection] = useState<'groups' | 'contacts'>('groups')

  const groups = contacts.filter((contact) => contact.type === 'group')
  const users = contacts.filter((contact) => contact.type === 'user')

  const handleSearchChange = (term: string): void => {
    setSearchTerm(term)
    onSearch(term)
  }

  return (
    <aside className="conversation-sidebar" style={{ width }}>
      <ConversationSidebarHeader
        totalCount={contacts.length}
        searchValue={searchTerm}
        dateRange={dateRange}
        onSearchChange={handleSearchChange}
        onDateRangeChange={onDateRangeChange}
      />
      <div className="conversation-list" aria-label="会话列表">
        <ConversationSection
          title="群聊"
          contacts={groups}
          expanded={expandedSection === 'groups'}
          selectedContact={selectedContact}
          emptyText="暂无群聊"
          onToggle={() => setExpandedSection('groups')}
          onSelectContact={onSelectContact}
        />
        <ConversationSection
          title="联系人"
          contacts={users}
          expanded={expandedSection === 'contacts'}
          selectedContact={selectedContact}
          emptyText="暂无联系人"
          onToggle={() => setExpandedSection('contacts')}
          onSelectContact={onSelectContact}
        />
      </div>
      <div className="conversation-sidebar-account">
        <AccountSummary selfInfo={selfInfo} dbReady={dbReady} onClick={onOpenSettings} />
      </div>
    </aside>
  )
}
