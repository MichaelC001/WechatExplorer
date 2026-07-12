import { useAccountDatabaseController } from '../account-database/useAccountDatabaseController'
import type { SettingsSelfInfo } from '../model/types'

function ShieldIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 19 6v5.8c0 4.5-3 7.5-7 8.7-4-1.2-7-4.2-7-8.7V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
function StatusIcon({ ok }: { ok: boolean }): React.ReactElement {
  return <span className={`settings-diagnostic-icon ${ok ? 'ok' : ''}`}>{ok ? '✓' : '—'}</span>
}

export function AccountDatabasePage({
  dbKey,
  dbReady,
  selfInfo,
  onConnectionChanged,
  onNotice
}: {
  dbKey: string
  dbReady: boolean
  selfInfo: SettingsSelfInfo | null
  onConnectionChanged: () => void
  onNotice: (message: string) => void
}): React.ReactElement {
  const controller = useAccountDatabaseController({
    dbKey,
    dbReady,
    selfInfo,
    onConnectionChanged,
    onNotice
  })
  const connected = controller.status === 'success'
  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <div>
          <h1>账号与数据库</h1>
          <p>管理当前微信账号以及本地数据库连接</p>
        </div>
        <span className={`settings-status-badge ${controller.status}`}>
          {controller.status === 'checking'
            ? '正在验证'
            : connected
              ? '连接正常'
              : controller.status === 'error'
                ? '连接异常'
                : '尚未连接'}
        </span>
      </header>
      <div className="settings-page-scroll">
        <div className="settings-page-content">
          <section className="settings-privacy-notice">
            <ShieldIcon />
            <div>
              <strong>数据仅在本机读取</strong>
              <p>WechatExplorer 不会将您的微信聊天数据上传到云端。所有解析和存储均在本地完成。</p>
            </div>
          </section>
          <h2 className="settings-section-heading">账号概览</h2>
          <section className="settings-card settings-account-overview">
            <div className="settings-avatar">
              {selfInfo?.avatar ? (
                <img src={selfInfo.avatar} alt="当前账号" referrerPolicy="no-referrer" />
              ) : (
                (selfInfo?.nickname || '?').charAt(0)
              )}
            </div>
            <div className="settings-account-meta">
              <span>昵称</span>
              <strong>{selfInfo?.nickname || '暂无数据'}</strong>
              <span>最近验证</span>
              <strong>{controller.lastVerifiedAt || '暂无数据'}</strong>
            </div>
            <div className="settings-account-meta">
              <span>WXID</span>
              <strong>{selfInfo?.wxid || '暂无数据'}</strong>
              <span>数据库连接状态</span>
              <strong className={connected ? 'success-text' : ''}>
                {connected ? '连接正常' : '尚未连接'}
              </strong>
            </div>
            <div className="settings-account-actions">
              <button
                type="button"
                className="api-primary-button"
                onClick={() => void controller.testConnection()}
                disabled={controller.isTesting}
              >
                {controller.isTesting ? '验证中...' : '重新验证'}
              </button>
              <button
                type="button"
                className="api-secondary-button"
                onClick={() => void controller.openAccountDirectory()}
              >
                打开账号目录
              </button>
            </div>
          </section>
          <h2 className="settings-section-heading">数据库连接</h2>
          <section className="settings-card">
            <label className="settings-field-label">数据库根目录</label>
            <div className="settings-path-row">
              <code title={controller.pendingRoot}>{controller.pendingRoot || '暂无数据'}</code>
              <button
                type="button"
                className="api-secondary-button"
                onClick={() => void controller.chooseDirectory()}
              >
                更改目录
              </button>
            </div>
            <div className="settings-apply-row">
              <button
                type="button"
                className="api-primary-button"
                onClick={() => void controller.applyDirectory()}
                disabled={!controller.pendingRoot || controller.isTesting}
              >
                应用并重新初始化
              </button>
            </div>
            <div className="settings-diagnostic-header">
              <span>连接状态自检</span>
              <button
                type="button"
                className="settings-text-button"
                onClick={() => void controller.testConnection()}
                disabled={controller.isTesting}
              >
                {controller.isTesting ? '正在测试...' : '重新测试连接'}
              </button>
            </div>
            <div className="settings-diagnostics">
              {controller.diagnostics.map((item) => (
                <div className="settings-diagnostic" key={item.id}>
                  <StatusIcon ok={item.status === 'success'} />
                  <span>{item.label}</span>
                  <small title={item.detail}>{item.result}</small>
                </div>
              ))}
            </div>
          </section>
          <h2 className="settings-section-heading danger">连接管理</h2>
          <section className="settings-card settings-danger-card">
            <div>
              <strong>断开数据库连接</strong>
              <p>断开后 WechatExplorer 暂时无法读取聊天记录，但不会删除微信原始数据。</p>
            </div>
            <button
              type="button"
              className="settings-danger-button"
              onClick={() => controller.setConfirmDisconnect(true)}
              disabled={!dbReady}
            >
              断开连接
            </button>
            <div className="settings-danger-divider" />
            <div>
              <strong>重置连接配置</strong>
              <p>重置逻辑尚未提供完整的安全边界，本阶段暂不开放。</p>
            </div>
            <button type="button" className="settings-danger-button" disabled>
              暂未开放
            </button>
          </section>
        </div>
      </div>
      {controller.confirmDisconnect && (
        <div className="settings-confirm-overlay" role="dialog" aria-modal="true">
          <div className="settings-confirm">
            <h2>断开数据库连接？</h2>
            <p>这不会删除微信原始数据。你可以稍后重新连接。</p>
            <div>
              <button
                type="button"
                className="api-secondary-button"
                onClick={() => controller.setConfirmDisconnect(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="settings-danger-button"
                onClick={() => void controller.disconnect()}
              >
                确认断开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
