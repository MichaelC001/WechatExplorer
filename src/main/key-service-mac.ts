import { app } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import { promisify } from 'util'
import { isValidDatabaseKey } from './database-key-store'

const execFileAsync = promisify(execFile)

export interface DatabaseKeyResult {
  success: boolean
  key?: string
  error?: string
  code?: string
}

export class KeyServiceMac {
  private getHelperPath(): string {
    // 多 candidate fallback:覆盖 extraResources、asarUnpack、dev 三种场景
    // (extraResources → Contents/Resources/resources/;asarUnpack 同路径;dev → cwd 或 app.getAppPath)
    const candidates = [
      // 1) extraResources 标准位置(electron-builder.yml 配的就是这个)
      path.join(process.resourcesPath, 'resources', 'xkey_helper'),
      // 2) process.resourcesPath 直接(防止 extraResources 没复制成功)
      path.join(process.resourcesPath, 'xkey_helper'),
      // 3) asarUnpack 路径(如果在 asar 内的 resources/ 被解包到 app.asar.unpacked)
      path.join(app.getAppPath(), 'app.asar.unpacked', 'resources', 'xkey_helper'),
      // 4) dev 模式 + 打包后某些版本 app.getAppPath() 也指向 .app 根目录
      path.join(app.getAppPath(), 'resources', 'xkey_helper'),
      // 5) dev 模式:cwd
      path.join(process.cwd(), 'resources', 'xkey_helper')
    ].filter((p, idx, arr) => arr.indexOf(p) === idx) // 去重

    // 诊断:即使命中也打 log,方便排查"装了但找不到"的问题(translocation / quarantine)
    const statusList = candidates.map((candidate) => ({
      path: candidate,
      exists: fs.existsSync(candidate)
    }))
    console.log('[KeyServiceMac] xkey_helper candidates:', JSON.stringify(statusList))
    const helperPath = candidates.find((candidate) => fs.existsSync(candidate))
    if (!helperPath) {
      throw new Error(
        `找不到 xkey_helper(尝试 ${candidates.length} 个路径;` +
          ` app.isPackaged=${app.isPackaged} resourcesPath=${process.resourcesPath} ` +
          ` appPath=${app.getAppPath()} cwd=${process.cwd()})`
      )
    }
    return helperPath
  }

  private async isSipEnabled(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('/usr/bin/csrutil', ['status'])
      return stdout.toLowerCase().includes('enabled')
    } catch {
      return false
    }
  }

  private async getWeChatPid(): Promise<number> {
    const commands: [string, string[]][] = [
      ['/usr/bin/pgrep', ['-x', 'WeChat']],
      ['/usr/bin/pgrep', ['-f', 'WeChat.app/Contents/MacOS/WeChat']]
    ]
    for (const [command, args] of commands) {
      try {
        const { stdout } = await execFileAsync(command, args)
        const pids = stdout
          .split(/\r?\n/)
          .map((value) => Number.parseInt(value.trim(), 10))
          .filter((value) => Number.isFinite(value) && value > 0)
        if (pids.length) return Math.max(...pids)
      } catch {
        // Try the next process lookup strategy.
      }
    }
    throw new Error('未找到微信主进程，请先启动并登录微信')
  }

  private parseHelperOutput(output: string): DatabaseKeyResult {
    const payloads: Record<string, unknown>[] = []
    for (const match of output.matchAll(/\{[^{}]*\}/g)) {
      try {
        payloads.push(JSON.parse(match[0]) as Record<string, unknown>)
      } catch {
        // Ignore helper progress that is not JSON.
      }
    }
    const payload = payloads.find((item) => item.success === true && typeof item.key === 'string')
    const rawKey = typeof payload?.key === 'string' ? payload.key.trim().replace(/^0x/i, '') : ''
    if (!isValidDatabaseKey(rawKey)) {
      const errorPayload = payloads.find((item) => typeof item.result === 'string')
      const rawError = typeof errorPayload?.result === 'string' ? errorPayload.result.trim() : ''
      const parsedError = rawError.match(/^ERROR:([^:]+):?(.*)$/i)
      const code = parsedError?.[1]?.toUpperCase()
      const detail = parsedError?.[2]?.trim() || ''
      if (code === 'SCAN_FAILED' && detail.toLowerCase().includes('sink pattern not found')) {
        return {
          success: false,
          code,
          error:
            '内存扫描失败：未匹配到目标函数特征（Sink pattern not found），当前微信版本可能暂未适配。\n' +
            '建议步骤：降级微信到 4.1.7 -> 重启电脑（冷启动） -> 自动获取密钥 -> 成功后再升级微信。\n' +
            '请不要连续重试，以免触发微信安全模式或系统内存保护。'
        }
      }
      if (code === 'SCAN_FAILED') {
        return {
          success: false,
          code,
          error: `内存扫描失败：${detail || '未匹配到可用特征，当前微信版本可能暂未适配。'}`
        }
      }
      return {
        success: false,
        code,
        error: rawError || '密钥工具未返回有效的 64 位密钥'
      }
    }
    return { success: true, key: rawKey }
  }

  async autoGetDbKey(
    onStatus?: (message: string) => void,
    timeoutMs = 60_000
  ): Promise<DatabaseKeyResult> {
    if (process.platform !== 'darwin') {
      return { success: false, error: '自动获取密钥目前仅支持 macOS' }
    }
    if (await this.isSipEnabled()) {
      return {
        success: false,
        error: 'macOS 系统完整性保护（SIP）已开启，自动获取不可用，请使用手动粘贴。'
      }
    }

    try {
      onStatus?.('正在查找微信进程...')
      const pid = await this.getWeChatPid()
      const helperPath = this.getHelperPath()
      const waitMs = Math.max(30_000, timeoutMs)
      const timeoutSeconds = Math.ceil(waitMs / 1000) + 30
      onStatus?.('正在请求管理员授权...')
      const scriptLines = [
        `set helperPath to ${JSON.stringify(helperPath)}`,
        `set cmd to quoted form of helperPath & " ${pid} ${waitMs}"`,
        `set timeoutSec to ${timeoutSeconds}`,
        'try',
        'with timeout of timeoutSec seconds',
        'set outText to do shell script cmd with administrator privileges',
        'end timeout',
        'return "OK::" & outText',
        'on error errMsg number errNum',
        'return "ERR::" & errNum & "::" & errMsg',
        'end try'
      ]
      onStatus?.('授权后请保持微信已登录并活动...')
      const { stdout } = await execFileAsync(
        '/usr/bin/osascript',
        scriptLines.flatMap((line) => ['-e', line]),
        { timeout: waitMs + 20_000 }
      )
      const output = String(stdout).trim()
      if (output.startsWith('ERR::-128')) return { success: false, error: '已取消管理员授权' }
      if (output.startsWith('ERR::')) {
        return {
          success: false,
          error: output.split('::').slice(2).join('::') || '密钥工具执行失败'
        }
      }
      const result = this.parseHelperOutput(output.startsWith('OK::') ? output.slice(4) : output)
      onStatus?.(result.success ? '密钥获取成功' : '密钥获取失败')
      return result
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
