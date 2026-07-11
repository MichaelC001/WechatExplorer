import React from 'react'
import { Contact } from '../../../../shared/types'
import { ConversationItem } from './ConversationItem'

interface ConversationSectionProps {
  title: string
  contacts: Contact[]
  expanded: boolean
  selectedContact: Contact | null
  emptyText: string
  onToggle: () => void
  onSelectContact: (contact: Contact) => void
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={expanded ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'} />
    </svg>
  )
}

export function ConversationSection({
  title,
  contacts,
  expanded,
  selectedContact,
  emptyText,
  onToggle,
  onSelectContact
}: ConversationSectionProps): React.ReactElement {
  return (
    <section className="conversation-section">
      <button type="button" className="conversation-section-header" onClick={onToggle}>
        <span className="conversation-section-chevron">
          <ChevronIcon expanded={expanded} />
        </span>
        <span className="conversation-section-title">
          {title}（{contacts.length}）
        </span>
      </button>
      {expanded && (
        <div className="conversation-section-list">
          {contacts.length > 0 ? (
            contacts.map((contact) => (
              <ConversationItem
                key={contact.md5}
                contact={contact}
                active={selectedContact?.md5 === contact.md5}
                onSelect={onSelectContact}
              />
            ))
          ) : (
            <div className="conversation-section-empty">{emptyText}</div>
          )}
        </div>
      )}
    </section>
  )
}
