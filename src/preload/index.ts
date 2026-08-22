import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ILoginCredentials, ITabAttributes, ISettings } from '../shared/types'

// Custom APIs for renderer
const api = {
  login: (creds: ILoginCredentials): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('auth:login', creds),
  logout: (): Promise<boolean> => ipcRenderer.invoke('auth:logout'),
  checkAuth: (): Promise<boolean> => ipcRenderer.invoke('auth:check'),
  getFiles: (): Promise<unknown> => ipcRenderer.invoke('mega:files'),
  uploadFile: (
    _file: File,
    path: string,
    name: string,
    attributes?: ITabAttributes
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('mega:upload', { path, name, attributes }),
  openFile: (
    nodeId: string,
    name: string
  ): Promise<{ success: boolean; data?: string; mimeType?: string; error?: string }> =>
    ipcRenderer.invoke('mega:open', { nodeId, name }),
  downloadFile: (
    nodeId: string,
    name: string
  ): Promise<{ success: boolean; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('mega:download', { nodeId, name }),
  deleteFile: (nodeId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('mega:delete', { nodeId }),
  renameFile: (nodeId: string, newName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('mega:rename', { nodeId, newName }),
  updateAttributes: (
    nodeId: string,
    attributes: ITabAttributes
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('mega:updateAttributes', { nodeId, attributes }),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  analyzePdf: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke('pdf:analyze', { filePath }),
  getSettings: (): Promise<ISettings> => ipcRenderer.invoke('mega:getSettings'),
  saveSettings: (settings: ISettings): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('mega:saveSettings', { settings })
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
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
