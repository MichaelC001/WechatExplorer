import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { GroupReportExportRequest } from '../shared/group-report'

// 渲染器的自定义 API
const api = {
  initDb: (key: string) => ipcRenderer.invoke('db:init', key),
  getBootstrapCache: () => ipcRenderer.invoke('db:getBootstrapCache'),
  getContacts: (filter?: string) => ipcRenderer.invoke('db:getContacts', filter),
  getContactAvatars: (usernames: string[]) => ipcRenderer.invoke('db:getContactAvatars', usernames),
  getCachedMessages: (userMd5: string, startTime?: number, endTime?: number) =>
    ipcRenderer.invoke('db:getCachedMessages', userMd5, startTime, endTime),
  getMessages: (
    userMd5: string,
    startTime?: number,
    endTime?: number,
    options?: { limit?: number }
  ) => ipcRenderer.invoke('db:getMessages', userMd5, startTime, endTime, options),
  getGroupSnapshot: (userMd5: string) => ipcRenderer.invoke('db:getGroupSnapshot', userMd5),
  search: (keyword: string) => ipcRenderer.invoke('db:search', keyword),
  aiChat: (
    messages: { role: string; content: string }[],
    options?: { apiKey?: string; model?: string; baseURL?: string }
  ) => ipcRenderer.invoke('ai:chat', messages, options),
  copyImage: (base64String) => ipcRenderer.invoke('copy-image', base64String),
  getVoiceData: (sessionId: string, localId: number, createTime: number, svrId?: string | number) =>
    ipcRenderer.invoke('db:getVoiceData', sessionId, localId, createTime, svrId),
  parseMessage: (content: string, messageType: number) =>
    ipcRenderer.invoke('db:parseMessage', content, messageType),
  getImage: (imageMd5?: string, imageDatNameOrThumb?: string | boolean, sessionId?: string) =>
    ipcRenderer.invoke('db:getImage', imageMd5, imageDatNameOrThumb, sessionId),
  getSticker: (cdnUrl?: string, md5?: string) => ipcRenderer.invoke('db:getSticker', cdnUrl, md5),
  exportGroupReport: (request: GroupReportExportRequest) =>
    ipcRenderer.invoke('report:export', request),
  revealGroupReport: (filePath: string) => ipcRenderer.invoke('report:reveal', filePath),
  getSavedDbKey: () => ipcRenderer.invoke('key:getSavedDbKey'),
  autoGetDbKey: () => ipcRenderer.invoke('key:autoGetDbKey'),
  autoGetImageKey: () => ipcRenderer.invoke('key:autoGetImageKey'),
  pasteAndSaveDbKey: () => ipcRenderer.invoke('key:pasteAndSaveDbKey'),
  saveDbKey: (key: string) => ipcRenderer.invoke('key:saveDbKey', key),
  clearSavedDbKey: () => ipcRenderer.invoke('key:clearSavedDbKey'),
  onWcdbChange: (callback: (payload: { type: string; json: string }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { type: string; json: string }
    ): void => callback(payload)
    ipcRenderer.on('wcdb-change', listener)
    return () => ipcRenderer.removeListener('wcdb-change', listener)
  },
  onDbKeyStatus: (callback: (payload: { message: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { message: string }): void =>
      callback(payload)
    ipcRenderer.on('key:dbKeyStatus', listener)
    return () => ipcRenderer.removeListener('key:dbKeyStatus', listener)
  },
  onImageKeyStatus: (callback: (payload: { message: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { message: string }): void =>
      callback(payload)
    ipcRenderer.on('key:imageKeyStatus', listener)
    return () => ipcRenderer.removeListener('key:imageKeyStatus', listener)
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getSelf: () => ipcRenderer.invoke('settings:getSelf'),
  testConnection: (key: string, accountRoot?: string) =>
    ipcRenderer.invoke('db:testConnection', key, accountRoot),
  reopenWithRoot: (accountRoot: string) => ipcRenderer.invoke('db:reopenWithRoot', accountRoot),
  apiStatus: () => ipcRenderer.invoke('api:getStatus'),
  apiStart: (host?: string, port?: number) => ipcRenderer.invoke('api:start', host, port),
  apiStop: () => ipcRenderer.invoke('api:stop'),
  apiToggle: (enabled: boolean) => ipcRenderer.invoke('api:toggle', enabled)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
