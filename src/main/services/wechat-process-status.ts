import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const WINDOWS_WECHAT_IMAGES = ['Weixin.exe', 'WeChat.exe']

export async function isWindowsWechatRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return false

  for (const imageName of WINDOWS_WECHAT_IMAGES) {
    try {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH'],
        { windowsHide: true }
      )
      if (stdout.toLowerCase().includes(`"${imageName.toLowerCase()}"`)) return true
    } catch {
      // Try the other supported WeChat executable name.
    }
  }
  return false
}
