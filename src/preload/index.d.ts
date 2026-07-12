import { ElectronAPI } from '@electron-toolkit/preload'
import { Contact, Message } from '../shared/types'
import { GroupReportExportRequest, GroupReportExportResult } from '../shared/group-report'
import {
  DeleteGeneratedReportResult,
  ReportHistoryResult,
  SaveGeneratedReportRequest,
  SaveGeneratedReportResult
} from '../shared/report-history'

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
      initDb: (
        key: string
      ) => Promise<boolean | { success: boolean; error?: string; monitoring?: boolean }>
      getBootstrapCache: () => Promise<{
        self?: { wxid: string; nickname: string; avatar?: string; accountRoot: string }
        contacts: Contact[]
        updatedAt: number
      } | null>
      getContacts: (filter?: string) => Promise<Contact[]>
      getContactAvatars: (usernames: string[]) => Promise<Record<string, string>>
      getCachedMessages: (
        userMd5: string,
        startTime?: number,
        endTime?: number
      ) => Promise<Message[]>
      getMessages: (
        userMd5: string,
        startTime?: number,
        endTime?: number,
        options?: { limit?: number }
      ) => Promise<Message[]>
      getGroupSnapshot: (userMd5: string) => Promise<{
        roomId: string
        memberCount: number
        members: { wxid: string; nickname: string; avatar: string }[]
      } | null>
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
        sessionId?: string,
        options?: { force?: boolean }
      ) => Promise<{ success: boolean; data?: string; error?: string; isThumb?: boolean; filePath?: string }>
      getSticker: (
        cdnUrl?: string,
        md5?: string
      ) => Promise<{ success: boolean; data?: string; error?: string }>
      exportGroupReport: (request: GroupReportExportRequest) => Promise<GroupReportExportResult>
      listGeneratedReports: () => Promise<ReportHistoryResult>
      saveGeneratedReport: (
        request: SaveGeneratedReportRequest
      ) => Promise<SaveGeneratedReportResult>
      deleteGeneratedReport: (reportId: string) => Promise<DeleteGeneratedReportResult>
      revealGroupReport: (filePath: string) => Promise<{ success: boolean; error?: string }>
      getSavedDbKey: () => Promise<{ success: boolean; key?: string; error?: string }>
      autoGetDbKey: () => Promise<{
        success: boolean
        key?: string
        error?: string
        code?: string
        saved?: boolean
        warning?: string
      }>
      autoGetImageKey: () => Promise<{
        success: boolean
        xorKey?: number
        aesKey?: string
        verified?: boolean
        error?: string
        imageXorKey?: string
        imageAesKey?: string
        settings?: {
          dbRoot: string
          apiEnabled: boolean
          apiHost: string
          apiPort: number
          imageKeyRoot: string
          imageXorKey: string
          imageAesKey: string
        }
      }>
      pasteAndSaveDbKey: () => Promise<{ success: boolean; key?: string; error?: string }>
      saveDbKey: (key: string) => Promise<{ success: boolean; key?: string; error?: string }>
      clearSavedDbKey: () => Promise<{ success: boolean; error?: string }>
      onWcdbChange: (callback: (payload: { type: string; json: string }) => void) => () => void
      onDbKeyStatus: (callback: (payload: { message: string }) => void) => () => void
      onImageKeyStatus: (callback: (payload: { message: string }) => void) => () => void
      getSettings: () => Promise<{
        settings: {
          dbRoot: string
          apiEnabled: boolean
          apiHost: string
          apiPort: number
          imageKeyRoot: string
          imageXorKey: string
          imageAesKey: string
        }
        settingsPath: string
      }>
      setSettings: (patch: Partial<{
        dbRoot: string
        apiEnabled: boolean
        apiHost: string
        apiPort: number
        imageKeyRoot: string
        imageXorKey: string
        imageAesKey: string
      }>) => Promise<{
        settings: {
          dbRoot: string
          apiEnabled: boolean
          apiHost: string
          apiPort: number
          imageKeyRoot: string
          imageXorKey: string
          imageAesKey: string
        }
        settingsPath: string
      }>
      getSelf: () => Promise<
        | {
            ready: true
            info: { wxid: string; nickname: string; avatar?: string; accountRoot: string }
          }
        | { ready: false }
      >
      testConnection: (
        key: string,
        accountRoot?: string
      ) => Promise<{
        success: boolean
        error?: string
        accountRoot?: string
        wxid?: string
      }>
      reopenWithRoot: (accountRoot: string) => Promise<{
        success: boolean
        error?: string
        info?: { wxid: string; nickname: string; avatar?: string; accountRoot: string }
      }>
      apiStatus: () => Promise<{
        running: boolean
        host: string
        port: number
        error?: string
      }>
      apiStart: (
        host?: string,
        port?: number
      ) => Promise<{ running: boolean; host: string; port: number; error?: string }>
      apiStop: () => Promise<{ running: boolean; host: string; port: number; error?: string }>
      apiToggle: (enabled: boolean) => Promise<{
        running: boolean
        host: string
        port: number
        error?: string
      }>
    }
  }
}
