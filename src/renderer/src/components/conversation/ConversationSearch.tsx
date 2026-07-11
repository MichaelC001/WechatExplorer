import React from 'react'

interface ConversationSearchProps {
  value: string
  onChange: (value: string) => void
}

function SearchIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

export function ConversationSearch({
  value,
  onChange
}: ConversationSearchProps): React.ReactElement {
  return (
    <label className="conversation-search">
      <span className="conversation-search-icon">
        <SearchIcon />
      </span>
      <input
        type="text"
        value={value}
        placeholder="搜索群聊、联系人或 wxid"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
