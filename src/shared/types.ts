export interface ITabAttributes {
  tuning?: string
  isFavorite?: boolean
  isLearned?: boolean
  isLearning?: boolean
  capo?: number
  artist?: string
  title?: string
  timesPlayed?: number
  secondsPlayed?: number
  displayName?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface IGuitarTab {
  id: string // mega file handle or path
  name: string
  size: number
  type: 'pdf' | 'gp5' | 'txt' | 'other'
  attributes: ITabAttributes
  downloadUrl?: string // Signed URL or local path
  parentId?: string
}

export interface ILoginCredentials {
  email: string
  password: string
  keepLoggedIn: boolean
  mfaCode?: string
}

export interface IStorageStatus {
  total: number
  used: number
}

export interface ISettings {
  defaultSortMode: 'alpha' | 'created' | 'recent' | 'played' | 'time'
  defaultSortDirection?: 'asc' | 'desc'
  defaultTuning?: string
  defaultStatusFilter?: string[]
  defaultCapo?: number
  defaultFileType?: 'all' | 'pdf' | 'gp' | 'txt'
  pdfAlwaysFullscreen?: boolean
}

export interface IPlaySession {
  id?: string
  ts: string // ISO 8601 string
  fid: string // MEGA file id
  fn: string // File name / display name
  dur: number // Duration in seconds
}

export interface IPlaySessionLog {
  version: number
  sessions: IPlaySession[]
}

export interface IGlobalApi {
  checkAuth: () => Promise<boolean>
  login: (creds: ILoginCredentials) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  getFiles: () => Promise<IGuitarTab[]>
  uploadFile: (
    file: File,
    filePath: string,
    fileName: string,
    attributes: ITabAttributes
  ) => Promise<{ success: boolean; error?: string }>
  deleteFile: (id: string) => Promise<{ success: boolean; error?: string }>
  renameFile: (id: string, newName: string) => Promise<{ success: boolean; error?: string }>
  updateAttributes: (
    id: string,
    attributes: ITabAttributes
  ) => Promise<{ success: boolean; error?: string }>
  getFilePath: (file: File) => string
  openFile: (
    id: string,
    name: string
  ) => Promise<{ success: boolean; data?: string; mimeType?: string; error?: string }>
  downloadFile: (
    id: string,
    name: string
  ) => Promise<{ success: boolean; canceled?: boolean; error?: string }>
  analyzePdf?: (filePath: string) => Promise<{
    success: boolean
    error?: string
    data?: { tuning: string; capo: number; previewBase64: string | null }
  }>
  getSettings: () => Promise<ISettings>
  saveSettings: (settings: ISettings) => Promise<{ success: boolean; error?: string }>
  savePdfFromHtml?: (
    html: string,
    defaultName: string
  ) => Promise<{ success: boolean; canceled?: boolean; error?: string; filePath?: string }>
  getPlaySessions?: () => Promise<IPlaySession[]>
  savePlaySessions?: (sessions: IPlaySession[]) => Promise<{ success: boolean; error?: string }>
}
