/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { [key: string]: string }
  export default classes
}

import { electronAPI } from '@electron-toolkit/preload'
import { ILoginCredentials, IGuitarTab } from './shared/types'

declare global {
  interface Window {
    electron: typeof electronAPI
    api: {
      login: (creds: ILoginCredentials) => Promise<{ success: boolean; error?: string }>
      logout: () => Promise<boolean>
      checkAuth: () => Promise<boolean>
      getFiles: () => Promise<IGuitarTab[]>
      uploadFile: (
        path: string,
        name: string,
        attributes?: ITabAttributes
      ) => Promise<{ success: boolean; error?: string }>
      openFile: (
        nodeId: string,
        name: string
      ) => Promise<{ success: boolean; data?: string; mimeType?: string; error?: string }>
      downloadFile: (
        nodeId: string,
        name: string
      ) => Promise<{ success: boolean; error?: string; canceled?: boolean }>
      deleteFile: (nodeId: string) => Promise<{ success: boolean; error?: string }>
      updateAttributes: (
        nodeId: string,
        attributes: ITabAttributes
      ) => Promise<{ success: boolean; error?: string }>
      getFilePath: (file: File) => string
    }
  }
}
