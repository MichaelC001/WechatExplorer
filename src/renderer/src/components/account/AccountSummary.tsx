import React from 'react'

interface SelfInfo {
  wxid: string
  nickname: string
  avatar?: string
  accountRoot: string
}

interface AccountSummaryProps {
  selfInfo: SelfInfo | null
  dbReady: boolean
  compact?: boolean
  onClick?: () => void
}

export function AccountSummary({
  selfInfo,
  dbReady,
  compact = false,
  onClick
}: AccountSummaryProps): React.ReactElement {
  const displayName = dbReady && selfInfo ? selfInfo.nickname || selfInfo.wxid || '当前账号' : '未连接'
  const subtitle = dbReady && selfInfo ? selfInfo.wxid : '打开设置'
  const initial = (displayName || '?').charAt(0)

  return (
    <button
      type="button"
      className={`account-summary ${compact ? 'compact' : ''}`}
      onClick={onClick}
      title={compact ? `${displayName}\n${subtitle}` : undefined}
    >
      <span className="account-summary-avatar">
        {selfInfo?.avatar ? (
          <img src={selfInfo.avatar} alt={displayName} referrerPolicy="no-referrer" />
        ) : (
          initial
        )}
        <span className={`account-summary-status ${dbReady ? 'ready' : ''}`} aria-hidden />
      </span>
      {!compact && (
        <span className="account-summary-text">
          <span className="account-summary-name">{displayName}</span>
          <span className="account-summary-meta">{subtitle}</span>
        </span>
      )}
    </button>
  )
}
