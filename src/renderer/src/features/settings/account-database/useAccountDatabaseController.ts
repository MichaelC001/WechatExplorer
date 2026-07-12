import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildConnectionDiagnostics } from '../utils/buildConnectionDiagnostics'
import type { ConnectionStatus, SettingsSelfInfo } from '../model/types'

interface AppSettings {
  dbRoot: string
  imageAesKey: string
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useAccountDatabaseController({
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
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [pendingRoot, setPendingRoot] = useState('')
  const [status, setStatus] = useState<ConnectionStatus>(dbReady ? 'success' : 'unavailable')
  const [isTesting, setIsTesting] = useState(false)
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const refresh = useCallback(async () => {
    const result = await window.api.getSettings()
    setSettings(result.settings)
    setPendingRoot(result.settings.dbRoot)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => setStatus(dbReady ? 'success' : 'unavailable'), [dbReady])

  const diagnostics = useMemo(
    () =>
      buildConnectionDiagnostics({
        dbReady,
        selfInfo,
        hasDbKey: Boolean(dbKey.trim()),
        hasImageKey: Boolean(settings?.imageAesKey.trim())
      }),
    [dbKey, dbReady, selfInfo, settings?.imageAesKey]
  )

  const chooseDirectory = async (): Promise<void> => {
    const result = await window.api.selectDbRoot()
    if (!result.canceled && result.path) setPendingRoot(result.path)
  }

  const applyDirectory = async (): Promise<void> => {
    if (!pendingRoot.trim()) return onNotice('请先选择数据库目录')
    setStatus('checking')
    const saved = await window.api.setSettings({ dbRoot: pendingRoot.trim() })
    setSettings(saved.settings)
    const result = await window.api.reopenWithRoot(saved.settings.dbRoot)
    if (!result.success) {
      setStatus('error')
      return onNotice(result.error || '重新初始化失败')
    }
    setStatus('success')
    setLastVerifiedAt(new Date().toLocaleString('zh-CN', { hour12: false }))
    onConnectionChanged()
    onNotice('数据库目录已应用并重新初始化')
  }

  const testConnection = async (): Promise<void> => {
    if (isTesting) return
    setIsTesting(true)
    setStatus('checking')
    try {
      const result = await window.api.testConnection(dbKey, pendingRoot || settings?.dbRoot)
      if (!result.success) {
        setStatus('error')
        onNotice(result.error || '连接测试失败')
        return
      }
      setStatus('success')
      setLastVerifiedAt(new Date().toLocaleString('zh-CN', { hour12: false }))
      onNotice('连接验证通过')
    } finally {
      setIsTesting(false)
    }
  }

  const openAccountDirectory = async (): Promise<void> => {
    const result = await window.api.openAccountRoot()
    if (!result.success) onNotice(result.error || '打开账号目录失败')
  }

  const disconnect = async (): Promise<void> => {
    const result = await window.api.disconnectDb()
    setConfirmDisconnect(false)
    if (!result.success) return onNotice(result.error || '断开连接失败')
    setStatus('unavailable')
    onConnectionChanged()
    onNotice('数据库连接已断开，微信原始数据未被修改')
  }

  return {
    settings,
    pendingRoot,
    status,
    diagnostics,
    isTesting,
    lastVerifiedAt,
    confirmDisconnect,
    setConfirmDisconnect,
    chooseDirectory,
    applyDirectory,
    testConnection,
    openAccountDirectory,
    disconnect
  }
}
