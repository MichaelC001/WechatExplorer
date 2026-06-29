import { ElectronAPI } from '@electron-toolkit/preload'
import { Contact, Message } from '../shared/types'

export type ParsedContent =
  | { type: 'text'; content: string }
  | { type: 'voice'; duration?: number }
  | { type: 'location'; poiname?: string; label?: string; lat: number; lng: number }
  | { type: 'card'; username: string; nickname: string; avatarUrl?: string }
  | { type: 'share'; title: string; des?: string; url: string; appname?: string; type?: string }
  | { type: 'voip'; duration?: number; status: string; roomType?: number }
  | { type: 'image'; md5?: string; datName?: string; aeskey?: string; encrypVer?: number }
  | {
      type: 'sticker'
      md5?: string
      url?: string
      thumbUrl?: string
      encryptUrl?: string
      aeskey?: string
    }
  | {
      type: 'quote'
      title?: string
      content?: string
      sender?: string
      quotedContent?: string
      quotedSender?: string
      quotedType?: string
    }
  | { type: 'system'; content: string }
  | { type: 'unknown'; raw: string }

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      initDb: (key: string) => Promise<boolean | { success: boolean; error?: string }>
      getContacts: (filter?: string) => Promise<Contact[]>
      getMessages: (userMd5: string, startTime?: number, endTime?: number) => Promise<Message[]>
      search: (keyword: string) => Promise<string | null>
      aiChat: (
        messages: { role: string; content: string }[],
        options?: { apiKey?: string; model?: string; baseURL?: string }
      ) => Promise<{ success: boolean; data?: string; error?: string }>
      copyImage: (base64String: string) => Promise<{ success: boolean; error?: string }>
      getVoiceData: (
        sessionId: string,
        localId: number,
        createTime: number,
        svrId?: string | number
      ) => Promise<{ success: boolean; data?: string; error?: string }>
      parseMessage: (content: string, messageType: number) => Promise<ParsedContent>
      getImage: (
        imageMd5?: string,
        imageDatNameOrThumb?: string | boolean,
        sessionId?: string
      ) => Promise<{ success: boolean; data?: string; error?: string }>
      getSticker: (
        cdnUrl?: string,
        md5?: string
      ) => Promise<{ success: boolean; data?: string; error?: string }>
    }
  }
}
