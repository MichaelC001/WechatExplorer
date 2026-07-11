import React from 'react'
import { CloseIcon, SearchIcon } from './icons'

interface ConversationContentSearchProps {
  value: string
  resultCount: number
  onChange: (value: string) => void
  onClose: () => void
}

export function ConversationContentSearch({
  value,
  resultCount,
  onChange,
  onClose
}: ConversationContentSearchProps): React.ReactElement {
  return (
    <div className="chat-content-search">
      <span className="chat-content-search-icon">
        <SearchIcon />
      </span>
      <input
        type="text"
        value={value}
        placeholder="搜索当前聊天内容"
        onChange={(event) => onChange(event.target.value)}
        autoFocus
      />
      <span className="chat-content-search-count">
        {value ? `${resultCount} 条结果` : '输入关键词'}
      </span>
      <button type="button" className="chat-icon-button" onClick={onClose} title="关闭搜索">
        <CloseIcon />
      </button>
    </div>
  )
}
