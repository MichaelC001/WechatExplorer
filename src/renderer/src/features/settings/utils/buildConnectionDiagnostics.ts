import type { DiagnosticItem, SettingsSelfInfo } from '../model/types'

export function buildConnectionDiagnostics(input: {
  dbReady: boolean
  selfInfo: SettingsSelfInfo | null
  hasDbKey: boolean
  hasImageKey: boolean
}): DiagnosticItem[] {
  const connected = input.dbReady
  return [
    {
      id: 'db-key',
      label: '数据库密钥校验',
      status: input.hasDbKey ? (connected ? 'success' : 'warning') : 'unavailable',
      result: input.hasDbKey ? (connected ? '已用于当前连接' : '已保存，未验证') : '未检测'
    },
    {
      id: 'contacts',
      label: '联系人索引',
      status: connected ? 'success' : 'unavailable',
      result: connected ? '当前连接可读取' : '未检测'
    },
    {
      id: 'messages',
      label: '消息数据库挂载',
      status: connected ? 'success' : 'unavailable',
      result: connected ? '当前连接已挂载' : '未检测'
    },
    {
      id: 'identity',
      label: '账号身份识别',
      status: input.selfInfo?.wxid ? 'success' : 'unavailable',
      result: input.selfInfo?.wxid ? '匹配成功' : '未检测'
    },
    {
      id: 'image-key',
      label: '图片解密密钥',
      status: input.hasImageKey ? 'success' : 'unavailable',
      result: input.hasImageKey ? '已配置' : '未检测',
      detail: input.hasImageKey ? undefined : '图片密钥将在后续页面管理'
    }
  ]
}
