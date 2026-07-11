import React from 'react'
import { Contact } from '../../../../shared/types'

interface ConversationItemProps {
  contact: Contact
  active: boolean
  onSelect: (contact: Contact) => void
}

export function ConversationItem({
  contact,
  active,
  onSelect
}: ConversationItemProps): React.ReactElement {
  const nickname = contact.m_nsNickName?.trim()
  const wxid = contact.m_nsUsrName
  const displayName = nickname || wxid || '未命名会话'
  const initial = (displayName || wxid || '?').charAt(0)

  return (
    <button
      type="button"
      className={`conversation-item ${active ? 'active' : ''}`}
      onClick={() => onSelect(contact)}
      title={wxid && wxid !== displayName ? wxid : displayName}
    >
      <span className="conversation-item-active-mark" aria-hidden />
      <span className="conversation-item-avatar">
        {contact.avatar ? (
          <img
            src={contact.avatar}
            alt={displayName}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
          />
        ) : (
          initial
        )}
      </span>
      <span className="conversation-item-body">
        <span className="conversation-item-name">{displayName}</span>
      </span>
    </button>
  )
}
