import { ElectronAPI } from '@electron-toolkit/preload'
import { Contact, Message } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      initDb: (key: string) => Promise<boolean>
      getContacts: (filter?: string) => Promise<Contact[]>
      getMessages: (userMd5: string, startTime?: number, endTime?: number) => Promise<Message[]>
      search: (keyword: string) => Promise<string | null>
      aiChat: (
        messages: { role: string; content: string }[],
        options?: { apiKey?: string; model?: string }
      ) => Promise<{ success: boolean; data?: string; error?: string }>
      copyImage: (base64String: string) => Promise<{ success: boolean; error?: string }>
    }
  }
}
