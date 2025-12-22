import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ILoginCredentials } from '../shared/types'

// Custom APIs for renderer
const api = {
  login: (creds: ILoginCredentials) => ipcRenderer.invoke('auth:login', creds),
  logout: () => ipcRenderer.invoke('auth:logout'),
  checkAuth: () => ipcRenderer.invoke('auth:check'),
  getFiles: () => ipcRenderer.invoke('mega:files'),
  uploadFile: (_file: File, path: string, name: string, attributes?: any) => ipcRenderer.invoke('mega:upload', { path, name, attributes }),
  openFile: (nodeId: string, name: string) => ipcRenderer.invoke('mega:open', { nodeId, name }),
  downloadFile: (nodeId: string, name: string) => ipcRenderer.invoke('mega:download', { nodeId, name }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteFile: (nodeId: string) => ipcRenderer.invoke('mega:delete', { nodeId }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateAttributes: (nodeId: string, attributes: any) => ipcRenderer.invoke('mega:updateAttributes', { nodeId, attributes }),
  getFilePath: (file: File) => webUtils.getPathForFile(file)
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
