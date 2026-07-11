import React from 'react'
import { AccountSummary } from '../account/AccountSummary'
import { PrimaryNavigation } from './PrimaryNavigation'
import { AppPage, PRIMARY_NAV_ITEMS } from './navigation'

interface SelfInfo {
  wxid: string
  nickname: string
  avatar?: string
  accountRoot: string
}

interface AppShellProps {
  activePage: AppPage
  selfInfo: SelfInfo | null
  dbReady: boolean
  onPageChange: (page: AppPage) => void
  onOpenSettings: () => void
  children: React.ReactNode
}

function BrandLogo(): React.ReactElement {
  return (
    <div className="app-brand" title="WechatExplorer" aria-label="WechatExplorer">
      <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <path d="M13 15.5 20 10l7 5.5" />
        <path d="M13 24.5 20 30l7-5.5" />
        <path d="M13 15.5v9" />
        <path d="M27 15.5v9" />
        <circle cx="20" cy="10" r="2.6" />
        <circle cx="13" cy="15.5" r="2.6" />
        <circle cx="27" cy="15.5" r="2.6" />
        <circle cx="13" cy="24.5" r="2.6" />
        <circle cx="27" cy="24.5" r="2.6" />
        <circle cx="20" cy="30" r="2.6" />
      </svg>
    </div>
  )
}

export function AppShell({
  activePage,
  selfInfo,
  dbReady,
  onPageChange,
  onOpenSettings,
  children
}: AppShellProps): React.ReactElement {
  const activeItem = PRIMARY_NAV_ITEMS.find((item) => item.id === activePage)

  return (
    <div className="app-shell">
      <aside className="app-primary-rail">
        <BrandLogo />
        <PrimaryNavigation activePage={activePage} onPageChange={onPageChange} />
        <div className="app-rail-account">
          <AccountSummary selfInfo={selfInfo} dbReady={dbReady} compact onClick={onOpenSettings} />
        </div>
      </aside>
      <main className="app-shell-main">
        {activePage === 'archive' ? (
          children
        ) : (
          <div className="app-page-placeholder">
            <div className="app-page-placeholder-eyebrow">WechatExplorer</div>
            <h2>{activeItem?.label || '工作区'}</h2>
            <p>这个工作区会在后续 UI 重构阶段接入真实功能。</p>
          </div>
        )}
      </main>
    </div>
  )
}
