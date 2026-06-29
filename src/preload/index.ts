import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { GroupReportExportRequest } from '../shared/group-report'

// 渲染器的自定义 API
const api = {
  initDb: (key: string) => ipcRenderer.invoke('db:init', key),
  getContacts: (filter?: string) => ipcRenderer.invoke('db:getContacts', filter),
  getMessages: (userMd5: string, startTime?: number, endTime?: number) =>
    ipcRenderer.invoke('db:getMessages', userMd5, startTime, endTime),
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
  revealGroupReport: (filePath: string) => ipcRenderer.invoke('report:reveal', filePath)
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
