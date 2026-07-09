import React, { useEffect, useState } from 'react'

interface SelfInfo {
  wxid: string
  nickname: string
  avatar?: string
  accountRoot: string
}

interface AppSettings {
  dbRoot: string
  apiEnabled: boolean
  apiHost: string
  apiPort: number
}

interface ApiState {
  running: boolean
  host: string
  port: number
  error?: string
}

interface SettingsPanelProps {
  open: boolean
  selfInfo: SelfInfo | null
  dbReady: boolean
  dbKey: string
  onClose: () => void
  onDbKeyChange: (key: string) => void
  onDbRootChanged: () => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  open,
  selfInfo,
  dbReady,
  dbKey,
  onClose,
  onDbKeyChange,
  onDbRootChanged
}) => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsPath, setSettingsPath] = useState('')
  const [apiState, setApiState] = useState<ApiState | null>(null)
  const [testStatus, setTestStatus] = useState<
    { kind: 'idle' | 'ok' | 'fail'; message: string; wxid?: string; accountRoot?: string }
  >({ kind: 'idle', message: '' })
  const [reopenStatus, setReopenStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open])

  async function refresh(): Promise<void> {
    const [{ settings, settingsPath }, api] = await Promise.all([
      window.api.getSettings(),
      window.api.apiStatus()
    ])
    setSettings(settings)
    setSettingsPath(settingsPath)
    setApiState(api)
  }

  if (!open) return null

  async function handleSave(patch: Partial<AppSettings>): Promise<void> {
    if (!settings) return
    setBusy(true)
    const next = await window.api.setSettings(patch)
    setSettings(next.settings)
    setBusy(false)
  }

  async function handleTest(): Promise<void> {
    setTestStatus({ kind: 'idle', message: '测试中...' })
    setBusy(true)
    try {
      const result = await window.api.testConnection(dbKey, settings?.dbRoot)
      if (result.success) {
        setTestStatus({
          kind: 'ok',
          message: '连接成功',
          wxid: result.wxid,
          accountRoot: result.accountRoot
        })
        if (result.accountRoot && settings && result.accountRoot !== settings.dbRoot) {
          const next = await window.api.setSettings({ dbRoot: result.accountRoot })
          setSettings(next.settings)
        }
      } else {
        setTestStatus({ kind: 'fail', message: result.error || '连接失败' })
      }
    } catch (error) {
      setTestStatus({ kind: 'fail', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  async function handleReopen(): Promise<void> {
    if (!settings) return
    setBusy(true)
    setReopenStatus('重新初始化中...')
    try {
      const result = await window.api.reopenWithRoot(settings.dbRoot)
      if (result.success) {
        setReopenStatus(`已重新打开:${result.info?.wxid || '未知'}`)
        onDbRootChanged()
      } else {
        setReopenStatus(result.error || '重新打开失败')
      }
    } catch (error) {
      setReopenStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleApiToggle(enabled: boolean): Promise<void> {
    setBusy(true)
    await handleSave({ apiEnabled: enabled })
    const state = await window.api.apiToggle(enabled)
    setApiState(state)
    setBusy(false)
  }

  async function handleApiRestart(): Promise<void> {
    if (!settings) return
    setBusy(true)
    await window.api.apiStop()
    const state = await window.api.apiStart(settings.apiHost, settings.apiPort)
    setApiState(state)
    setBusy(false)
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div className="settings-body">
          {/* 自我信息卡片 */}
          <section className="settings-section">
            <div className="settings-section-title">账号信息</div>
            {dbReady && selfInfo ? (
              <div className="settings-self">
                <div className="settings-self-avatar">
                  {selfInfo.avatar ? (
                    <img src={selfInfo.avatar} alt={selfInfo.nickname} referrerPolicy="no-referrer" />
                  ) : (
                    (selfInfo.nickname || selfInfo.wxid || '?').charAt(0)
                  )}
                </div>
                <div className="settings-self-info">
                  <div className="settings-self-nickname">{selfInfo.nickname}</div>
                  <div className="settings-self-wxid">{selfInfo.wxid}</div>
                  <div className="settings-self-account">{selfInfo.accountRoot}</div>
                </div>
              </div>
            ) : (
              <div className="settings-self-empty">尚未连接数据库</div>
            )}
          </section>

          {/* 测试连接 */}
          <section className="settings-section">
            <div className="settings-section-title">连接测试</div>
            <div className="settings-row">
              <button
                className="settings-btn settings-btn-primary"
                onClick={handleTest}
                disabled={busy || !dbKey}
              >
                测试连接
              </button>
              {testStatus.kind !== 'idle' && (
                <span className={`settings-status ${testStatus.kind}`}>
                  {testStatus.kind === 'ok' ? '✓' : '✗'} {testStatus.message}
                  {testStatus.wxid ? ` · ${testStatus.wxid}` : ''}
                  {testStatus.accountRoot ? ` · ${testStatus.accountRoot}` : ''}
                </span>
              )}
            </div>
            <div className="settings-hint">
              使用当前密钥 + 下方配置的根目录尝试打开数据库,只校验不持久化。
            </div>
          </section>

          {/* 解密密钥 */}
          <section className="settings-section">
            <div className="settings-section-title">解密密钥</div>
            <div className="settings-row">
              <input
                type="text"
                className="settings-input"
                value={dbKey}
                onChange={(e) => onDbKeyChange(e.target.value)}
                placeholder="64 位 hex 密钥,如 0x..."
                spellCheck={false}
              />
            </div>
            <div className="settings-hint">
              密钥保存在本机 macOS Keychain(safeStorage 加密),不会上传任何服务器。
            </div>
          </section>

          {/* 数据库根目录 */}
          <section className="settings-section">
            <div className="settings-section-title">数据库根目录</div>
            <div className="settings-row">
              <input
                type="text"
                className="settings-input"
                value={settings?.dbRoot ?? ''}
                onChange={(e) => setSettings(settings ? { ...settings, dbRoot: e.target.value } : null)}
                onBlur={(e) => handleSave({ dbRoot: e.target.value })}
                placeholder="~/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files"
                spellCheck={false}
              />
            </div>
            <div className="settings-row">
              <button
                className="settings-btn"
                onClick={handleReopen}
                disabled={busy || !dbReady}
              >
                应用并重新初始化
              </button>
              {reopenStatus && <span className="settings-status">{reopenStatus}</span>}
            </div>
            <div className="settings-hint">
              指向 xwechat_files 目录,内部包含 db_storage/。修改后需重新初始化才能生效。
            </div>
          </section>

          {/* API 服务 */}
          <section className="settings-section">
            <div className="settings-section-title">本地 HTTP API</div>
            <div className="settings-row">
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings?.apiEnabled ?? false}
                  onChange={(e) => handleApiToggle(e.target.checked)}
                  disabled={busy}
                />
                <span>启用 API 服务(127.0.0.1:6131)</span>
              </label>
              {apiState && (
                <span className={`settings-status ${apiState.running ? 'ok' : 'fail'}`}>
                  {apiState.running ? '运行中' : '已停止'}
                  {apiState.error ? ` · ${apiState.error}` : ''}
                </span>
              )}
            </div>
            <div className="settings-row">
              <input
                type="text"
                className="settings-input settings-input-half"
                value={settings?.apiHost ?? ''}
                onChange={(e) => setSettings(settings ? { ...settings, apiHost: e.target.value } : null)}
                onBlur={(e) => handleSave({ apiHost: e.target.value })}
                placeholder="host"
                spellCheck={false}
              />
              <input
                type="number"
                className="settings-input settings-input-quarter"
                value={settings?.apiPort ?? 6131}
                onChange={(e) =>
                  setSettings(settings ? { ...settings, apiPort: Number(e.target.value) || 6131 } : null)
                }
                onBlur={(e) => handleSave({ apiPort: Number(e.target.value) || 6131 })}
                placeholder="port"
              />
              <button className="settings-btn" onClick={handleApiRestart} disabled={busy}>
                重启 API
              </button>
            </div>
            <div className="settings-hint">
              API 仅本机访问,无鉴权。关闭后 Claude / Codex 等客户端无法读取聊天数据。
              <br />
              配置文档:<code>docs/skill/wechatexplorer-reader/SKILL.md</code>
            </div>
          </section>

          {/* 配置文件位置 */}
          <section className="settings-section">
            <div className="settings-section-title">配置文件</div>
            <div className="settings-row">
              <code className="settings-path">{settingsPath}</code>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}