import React from 'react'

interface ChatStatusBarProps {
  count: number
  showAvatar: boolean
  isAtLatest: boolean
  onShowAvatarChange: (show: boolean) => void
  onJumpToLatest: () => void
}

export function ChatStatusBar({
  count,
  showAvatar,
  isAtLatest,
  onShowAvatarChange,
  onJumpToLatest
}: ChatStatusBarProps): React.ReactElement {
  const jumpDisabled = isAtLatest || count === 0

  return (
    <div className="chat-status-bar">
      <div>已显示当前范围 {count} 条消息</div>
      <div className="chat-status-actions">
        <label className="chat-avatar-toggle">
          <input
            type="checkbox"
            checked={showAvatar}
            onChange={(event) => onShowAvatarChange(event.target.checked)}
          />
          <span>显示头像</span>
        </label>
        <span className="chat-status-separator" aria-hidden />
        <button type="button" onClick={onJumpToLatest} disabled={jumpDisabled}>
          {jumpDisabled ? '已是最新消息' : '跳转到最新消息'}
        </button>
      </div>
    </div>
  )
}
