import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 渲染器的自定义 API
const api = {
  initDb: (key: string) => ipcRenderer.invoke('db:init', key),
  getContacts: (filter?: string) => ipcRenderer.invoke('db:getContacts', filter),
  getMessages: (userMd5: string, startTime?: number, endTime?: number) =>
    ipcRenderer.invoke('db:getMessages', userMd5, startTime, endTime),
  search: (keyword: string) => ipcRenderer.invoke('db:search', keyword),
  aiChat: (
    messages: { role: string; content: string }[],
    options?: { apiKey?: string; model?: string }
  ) => ipcRenderer.invoke('ai:chat', messages, options),
  copyImage: (base64String) => ipcRenderer.invoke('copy-image', base64String)
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
