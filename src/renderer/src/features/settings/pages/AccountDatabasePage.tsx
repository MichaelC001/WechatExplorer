import { AccountOverview } from '../account-database/AccountOverview'
import { ConnectionHealthSection } from '../account-database/ConnectionHealthSection'
import { LocalPrivacyNotice } from '../account-database/LocalPrivacyNotice'
import { useAccountDatabaseController } from '../account-database/useAccountDatabaseController'
import type { ConnectionOverviewStatus } from '../account-database/types'
import type { SettingsSelfInfo } from '../model/types'

const STATUS_LABELS: Record<ConnectionOverviewStatus, string> = {
  checking: '正在检测',
  success: '连接正常',
  warning: '部分能力不可用',
  error: '连接异常',
  unavailable: '尚未连接'
}

export function AccountDatabasePage({
  dbKey,
  dbReady,
  selfInfo,
  onNotice
}: {
  dbKey: string
  dbReady: boolean
  selfInfo: SettingsSelfInfo | null
  onNotice: (message: string) => void
}): React.ReactElement {
  const controller = useAccountDatabaseController({ dbKey, dbReady, selfInfo, onNotice })
  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <div>
          <h1>账号与数据库</h1>
          <p>查看当前微信账号与本地数据库连接状态</p>
        </div>
        <span className={`settings-status-badge ${controller.connectionStatus}`}>
          {STATUS_LABELS[controller.connectionStatus]}
        </span>
      </header>
      <div className="settings-page-scroll">
        <div className="settings-page-content">
          <LocalPrivacyNotice />
          <h2 className="settings-section-heading">账号概览</h2>
          <AccountOverview
            selfInfo={selfInfo}
            connectionStatus={controller.connectionStatus}
            lastCheckedLabel={controller.lastCheckedLabel}
            isChecking={controller.isChecking}
            onCheck={() => void controller.testConnection()}
            onOpenDirectory={() => void controller.openAccountDirectory()}
            onCopyDirectory={() => void controller.copyAccountDirectory()}
          />
          <h2 className="settings-section-heading">连接健康检查</h2>
          <ConnectionHealthSection
            diagnostics={controller.diagnostics}
            summary={
              controller.checkState.status === 'error' || controller.checkState.status === 'warning'
                ? controller.checkState.message
                : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}
