import { Storage, File as MegaFile } from 'megajs'
import {
  IGuitarTab,
  ILoginCredentials,
  ITabAttributes,
  IGlobalApi,
  ISettings,
  IPlaySession,
  IPlaySessionLog
} from '../../../shared/types'

interface IMegaNode {
  nodeId?: string
  name?: string
  size?: number
  directory?: boolean
  children?: IMegaNode[]
  root?: IMegaNode
  reload?: (cb: (err?: Error | null) => void) => void
  setAttributes?: (attrs: Record<string, unknown>, cb: (err?: Error | null) => void) => void
  upload?: (options: { name: string; size: number }, data: Uint8Array) => IMegaUploadStream
  delete?: (cb?: (err?: Error | null) => void) => Promise<void>
  rename?: (newName: string, cb: (err?: Error | null) => void) => void
  download?: (options?: Record<string, unknown>) => NodeJS.ReadableStream
  attributes?: ITabAttributes
}

interface IMegaUploadStream {
  on(event: 'complete', listener: (file?: IMegaNode) => void): this
  on(event: 'error', listener: (err: Error) => void): this
}

interface IWindowFileSystem {
  showSaveFilePicker?: (options: {
    suggestedName?: string
    types?: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

export class WebMegaService implements IGlobalApi {
  private storage: Storage | null = null
  private rootFolder: IMegaNode | null = null
  private readonly FOLDER_NAME = import.meta.env.DEV ? 'GuitarCompanionDev' : 'GuitarCompanionTabs'

  constructor() {
    // Try to restore session from saved JSON data
    const savedSession = localStorage.getItem('mega_session')
    if (savedSession) {
      console.log('[WebMegaService] Found saved session, attempting auto-login')
      try {
        const sessionData = JSON.parse(savedSession)
        this.storage = Storage.fromJSON(sessionData)

        this.storage.ready
          .then(async () => {
            console.log('[WebMegaService] Auto-login successful')

            // Check if root is missing and reload (same as Electron version)
            const extendedStorage = this.storage as unknown as IMegaNode | null
            if (extendedStorage && !extendedStorage.root) {
              console.log('[WebMegaService] Root is missing, reloading files...')
              try {
                await new Promise<void>((res, rej) => {
                  if (extendedStorage.reload) {
                    extendedStorage.reload((err) => (err ? rej(err) : res()))
                  } else {
                    res()
                  }
                })
                console.log('[WebMegaService] Reload successful, root now available')
              } catch (reloadErr) {
                console.error('[WebMegaService] Reload failed', reloadErr)
              }
            }

            // Ensure GuitarCompanionTabs folder exists
            try {
              await this.ensureFolder()
              console.log('[WebMegaService] GuitarCompanionTabs folder ready')
            } catch (err) {
              console.error('[WebMegaService] Failed to ensure folder', err)
              // If folder creation fails (e.g. storage not ready), clear session to force re-login
              localStorage.removeItem('mega_session')
              this.storage = null
              this.rootFolder = null
            }
          })
          .catch((err) => {
            console.error('[WebMegaService] Auto-login failed, clearing saved session', err)
            localStorage.removeItem('mega_session')
            this.storage = null
          })
      } catch (e) {
        console.error('[WebMegaService] Exception during auto-login', e)
        localStorage.removeItem('mega_session')
      }
    }
  }

  private async ensureFolder(): Promise<void> {
    if (!this.storage) return

    // Check if root exists
    if (!this.storage.root) {
      throw new Error('Storage root is not ready')
    }

    // Find or create folder
    const files = (this.storage.root as unknown as IMegaNode).children
    this.rootFolder = files?.find((f) => f.name === this.FOLDER_NAME && f.directory) || null

    if (!this.rootFolder) {
      console.log('[WebMegaService] Creating GuitarCompanionTabs folder...')
      const newFolder = await this.storage.mkdir(this.FOLDER_NAME)
      this.rootFolder = newFolder as unknown as IMegaNode
    } else {
      console.log('[WebMegaService] GuitarCompanionTabs folder found')
    }
  }

  async checkAuth(): Promise<boolean> {
    return !!this.storage && !!this.storage.key
  }

  async login(creds: ILoginCredentials): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      try {
        // Close any existing storage instance first
        if (this.storage) {
          console.log('[WebMegaService] Closing existing storage before retry')
          this.storage.close()
          this.storage = null
          this.rootFolder = null
        }

        const storageOpts = {
          email: creds.email,
          password: creds.password,
          keepalive: true,
          userAgent: 'GuitarCompanionWeb/1.0',
          ...(creds.mfaCode ? { secondFactorCode: creds.mfaCode.trim() } : {})
        }

        console.log('[WebMegaService] Creating new Storage instance')
        this.storage = new Storage(storageOpts)

        this.storage.ready
          .then(async () => {
            console.log('[WebMegaService] Login successful')

            // Ensure GuitarCompanionTabs folder exists
            try {
              await this.ensureFolder()
            } catch (err) {
              console.error('[WebMegaService] Failed to create/find folder', err)
              this.storage = null
              this.rootFolder = null
              resolve({ success: false, error: 'Failed to setup folder' })
              return
            }

            // Save session using toJSON() if keepLoggedIn is true
            if (creds.keepLoggedIn && this.storage) {
              console.log('[WebMegaService] Saving session data to localStorage')
              const sessionData = this.storage.toJSON()
              localStorage.setItem('mega_session', JSON.stringify(sessionData))
            }

            resolve({ success: true })
          })
          .catch((err) => {
            console.error('[WebMegaService] Mega Login Error', err)
            this.storage = null
            resolve({ success: false, error: err.message })
          })
      } catch (error: unknown) {
        console.error('[WebMegaService] Exception during login', error)
        this.storage = null
        const msg = error instanceof Error ? error.message : 'Unknown login error'
        resolve({ success: false, error: msg })
      }
    })
  }

  async logout(): Promise<void> {
    if (this.storage) {
      this.storage.close()
      this.storage = null
    }
    this.rootFolder = null
    localStorage.removeItem('mega_session')
  }

  async getFiles(): Promise<IGuitarTab[]> {
    if (!this.rootFolder || !this.rootFolder.children) {
      console.log('[WebMegaService] getFiles: No rootFolder or children')
      return []
    }

    return this.rootFolder.children
      .map((f) => {
        const attrs = f.attributes || {}
        const ext = (f.name || '').split('.').pop()?.toLowerCase() || 'other'
        const tabType: IGuitarTab['type'] =
          ext === 'pdf' || ext === 'gp5' || ext === 'txt' ? ext : 'other'

        return {
          id: f.nodeId || '',
          name: f.name || 'Unknown',
          size: f.size || 0,
          type: tabType,
          attributes: attrs,
          downloadUrl: ''
        }
      })
      .filter((t) => t.name !== 'settings.json' && t.name !== 'play_sessions.json')
  }

  async uploadFile(
    file: File,
    _filePath: string,
    fileName: string,
    attributes: ITabAttributes
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.rootFolder) return { success: false, error: 'Not logged in' }

    try {
      console.log('[WebMegaService] Starting upload...', fileName)
      const arrayBuffer = await file.arrayBuffer()
      const buffer = new Uint8Array(arrayBuffer)
      const folderNode = this.rootFolder

      return new Promise((resolve) => {
        if (!folderNode.upload) {
          resolve({ success: false, error: 'Folder upload method unavailable' })
          return
        }

        const upload = folderNode.upload(
          {
            name: fileName,
            size: file.size
          },
          buffer
        )

        upload.on('complete', async (uploadedFile?: IMegaNode) => {
          console.log('[WebMegaService] Upload complete')

          // Set attributes if provided
          if (attributes && Object.keys(attributes).length > 0) {
            try {
              // Find the file if not provided in event
              let f = uploadedFile
              if (!f) {
                // Reload folder to find the new file
                if (folderNode.reload) {
                  await new Promise<void>((res) => folderNode.reload?.(() => res()))
                }
                f = this.rootFolder?.children?.find((child) => child.name === fileName)
              }

              if (f && f.setAttributes) {
                console.log('[WebMegaService] Setting attributes...', attributes)
                await new Promise<void>((res, rej) => {
                  f?.setAttributes?.(attributes as Record<string, unknown>, (err) =>
                    err ? rej(err) : res()
                  )
                })

                // One final reload to ensure UI sees the attributes
                if (folderNode.reload) {
                  await new Promise<void>((res) => folderNode.reload?.(() => res()))
                }
                console.log('[WebMegaService] Attributes set successfully')
              }
            } catch (attrErr) {
              console.error('[WebMegaService] Failed to set attributes:', attrErr)
            }
          }

          resolve({ success: true })
        })

        upload.on('error', (err: Error) => {
          console.error('[WebMegaService] Upload error:', err)
          resolve({ success: false, error: err.message })
        })
      })
    } catch (e: unknown) {
      console.error('[WebMegaService] Upload exception:', e)
      const msg = e instanceof Error ? e.message : 'Unknown upload error'
      return { success: false, error: msg }
    }
  }

  async deleteFile(id: string): Promise<{ success: boolean; error?: string }> {
    if (!this.rootFolder) return { success: false, error: 'Not logged in' }

    const node = this.rootFolder.children?.find((f) => f.nodeId === id)
    if (node && node.delete) {
      await node.delete()
      return { success: true }
    }
    return { success: false, error: 'File not found' }
  }

  async renameFile(id: string, newName: string): Promise<{ success: boolean; error?: string }> {
    if (!this.rootFolder || !this.rootFolder.children) {
      return { success: false, error: 'Not logged in' }
    }

    const node = this.rootFolder.children.find((f) => f.nodeId === id)
    if (!node || !node.rename) {
      return { success: false, error: 'File not found' }
    }

    return new Promise((resolve) => {
      node.rename?.(newName, (err) => {
        if (err) {
          resolve({ success: false, error: err.message })
        } else {
          resolve({ success: true })
        }
      })
    })
  }

  async updateAttributes(
    id: string,
    attributes: ITabAttributes
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.rootFolder || !this.rootFolder.children) {
      return { success: false, error: 'Not logged in' }
    }

    const node = this.rootFolder.children.find((f) => f.nodeId === id)
    if (!node) {
      return { success: false, error: 'File not found' }
    }

    const folderNode = this.rootFolder

    return new Promise((resolve) => {
      if (node.setAttributes) {
        node.setAttributes(attributes as Record<string, unknown>, (err) => {
          if (err) {
            console.error('[WebMegaService] Error setting attributes:', err)
            resolve({ success: false, error: err.message })
          } else {
            console.log('[WebMegaService] Attributes updated successfully')
            // Reload folder to refresh cache (like Electron version)
            if (folderNode.reload) {
              try {
                folderNode.reload(() => {
                  resolve({ success: true })
                })
              } catch (reloadErr) {
                console.error('[WebMegaService] Reload error after update:', reloadErr)
                resolve({ success: true }) // Still resolve as success since attributes were set
              }
            } else {
              resolve({ success: true })
            }
          }
        })
      } else {
        resolve({ success: false, error: 'File does not support attributes' })
      }
    })
  }

  getFilePath(file?: File): string {
    if (file && 'path' in file && typeof (file as unknown as { path: string }).path === 'string') {
      return (file as unknown as { path: string }).path
    }
    return '' // Web doesn't have true filesystem paths
  }

  async openFile(
    id: string,
    name: string
  ): Promise<{ success: boolean; data?: string; mimeType?: string; error?: string }> {
    if (!this.rootFolder) return { success: false, error: 'Not logged in' }
    const node = this.rootFolder.children?.find((f) => f.nodeId === id)
    if (!node) return { success: false, error: 'File not found' }

    // Determine MIME type based on file extension
    const lower = name.toLowerCase()
    const isPdf = lower.endsWith('.pdf')
    const isGuitarPro =
      lower.endsWith('.gp3') ||
      lower.endsWith('.gp4') ||
      lower.endsWith('.gp5') ||
      lower.endsWith('.gpx') ||
      lower.endsWith('.gp')

    let mimeType = 'text/plain'
    if (isPdf) mimeType = 'application/pdf'
    else if (isGuitarPro) mimeType = 'application/x-guitar-pro'

    // Download the file as a blob
    const blob = await this.downloadToBlob(node, mimeType)

    // For PDFs and Guitar Pro files, return a blob URL for in-app viewing
    if (isPdf) {
      const url = URL.createObjectURL(blob)
      return { success: true, data: url, mimeType: 'application/pdf' }
    }

    if (isGuitarPro) {
      const url = URL.createObjectURL(blob)
      return { success: true, data: url, mimeType: 'application/x-guitar-pro' }
    }

    // For other non-PDF/GP files, open in new tab as before
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    return { success: true }
  }

  async downloadFile(
    id: string,
    name: string
  ): Promise<{ success: boolean; canceled?: boolean; error?: string }> {
    try {
      console.log('[WebMegaService] downloadFile called:', { id, name })
      if (!this.rootFolder) {
        console.error('[WebMegaService] downloadFile: No rootFolder')
        return { success: false, error: 'Not logged in' }
      }

      const node = this.rootFolder.children?.find((f) => f.nodeId === id)
      if (!node) {
        console.error('[WebMegaService] downloadFile: File not found', id)
        return { success: false, error: 'File not found' }
      }

      console.log('[WebMegaService] Downloading file:', name)

      // Determine MIME type
      const ext = name.split('.').pop()?.toLowerCase()
      let mimeType = 'application/octet-stream'
      if (ext === 'pdf') mimeType = 'application/pdf'
      else if (ext === 'txt') mimeType = 'text/plain'
      else if (ext === 'gp' || ext === 'gp3' || ext === 'gp4' || ext === 'gp5' || ext === 'gpx')
        mimeType = 'application/octet-stream'

      const blob = await this.downloadToBlob(node, mimeType)
      console.log('[WebMegaService] Blob created, size:', blob.size, 'type:', blob.type)

      // Try File System Access API first (Chrome/Edge)
      const win = window as unknown as IWindowFileSystem
      if (typeof win.showSaveFilePicker === 'function') {
        try {
          console.log('[WebMegaService] Using File System Access API')
          const handle = await win.showSaveFilePicker({
            suggestedName: name,
            types: [
              {
                description: 'File',
                accept: { [mimeType]: [`.${ext}`] }
              }
            ]
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          console.log('[WebMegaService] Download via File System Access API successful')
          return { success: true }
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'name' in err &&
            (err as { name: string }).name === 'AbortError'
          ) {
            console.log('[WebMegaService] User canceled save dialog')
            return { success: false, canceled: true }
          }
          console.warn('[WebMegaService] File System Access API failed, falling back:', err)
        }
      }

      // Fallback: traditional download
      console.log('[WebMegaService] Using traditional download method')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.setAttribute('download', name) // Set explicitly
      a.style.display = 'none'

      document.body.appendChild(a)
      a.click()

      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        console.log('[WebMegaService] Cleaned up download resources')
      }, 1000)

      console.log('[WebMegaService] Download triggered successfully')
      return { success: true }
    } catch (e: unknown) {
      console.error('[WebMegaService] downloadFile error:', e)
      const msg = e instanceof Error ? e.message : 'Unknown download error'
      return { success: false, error: msg }
    }
  }

  private async downloadToBlob(node: IMegaNode | MegaFile, mimeType?: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const chunks: BlobPart[] = []
      const megaNode = node as unknown as IMegaNode
      if (!megaNode.download) {
        reject(new Error('Download method not available on node'))
        return
      }

      const stream = megaNode.download()

      stream.on('data', (chunk: Uint8Array) => {
        chunks.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength) as BlobPart)
      })

      stream.on('end', () => {
        const blob = new Blob(chunks, mimeType ? { type: mimeType } : undefined)
        resolve(blob)
      })

      stream.on('error', (err: Error) => {
        reject(err)
      })
    })
  }

  async getSettings(): Promise<ISettings> {
    const defaultSettings: ISettings = {
      defaultSortMode: 'alpha'
    }

    if (!this.rootFolder || !this.rootFolder.children) {
      return defaultSettings
    }

    const settingsFile = this.rootFolder.children.find((f) => f.name === 'settings.json')
    if (!settingsFile) {
      return defaultSettings
    }

    try {
      console.log('[WebMegaService] Downloading settings.json')
      const blob = await this.downloadToBlob(settingsFile, 'application/json')
      const text = await blob.text()
      const settings = JSON.parse(text)
      return { ...defaultSettings, ...settings }
    } catch (e) {
      console.error('[WebMegaService] Error loading settings:', e)
      return defaultSettings
    }
  }

  async saveSettings(settings: ISettings): Promise<{ success: boolean; error?: string }> {
    if (!this.rootFolder) return { success: false, error: 'Not logged in' }

    try {
      console.log('[WebMegaService] Saving settings...', settings)
      const jsonString = JSON.stringify(settings, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      // Convert to file for upload
      const file = new File([blob], 'settings.json', { type: 'application/json' })

      const existing = this.rootFolder.children?.find((f) => f.name === 'settings.json')
      if (existing && existing.delete) {
        console.log('[WebMegaService] Deleting old settings file...')
        await new Promise<void>((resolve) => {
          existing.delete?.((err) => {
            if (err) console.error('Error deleting old settings:', err)
            resolve()
          })
        })
      }

      return this.uploadFile(file, '', 'settings.json', {})
    } catch (e: unknown) {
      console.error('[WebMegaService] Save settings error:', e)
      const msg = e instanceof Error ? e.message : 'Unknown error saving settings'
      return { success: false, error: msg }
    }
  }

  async getPlaySessions(): Promise<IPlaySession[]> {
    if (!this.rootFolder || !this.rootFolder.children) {
      return []
    }

    const sessionFile = this.rootFolder.children.find((f) => f.name === 'play_sessions.json')
    if (!sessionFile) {
      return []
    }

    try {
      console.log('[WebMegaService] Downloading play_sessions.json')
      const blob = await this.downloadToBlob(sessionFile, 'application/json')
      const text = await blob.text()
      const data: IPlaySessionLog | IPlaySession[] = JSON.parse(text)
      if (Array.isArray(data)) {
        return data
      }
      return data?.sessions || []
    } catch (e) {
      console.error('[WebMegaService] Error loading play sessions:', e)
      return []
    }
  }

  async savePlaySessions(sessions: IPlaySession[]): Promise<{ success: boolean; error?: string }> {
    if (!this.rootFolder) return { success: false, error: 'Not logged in' }

    try {
      console.log('[WebMegaService] Saving play sessions...', sessions.length)
      const logData: IPlaySessionLog = {
        version: 1,
        sessions
      }
      const jsonString = JSON.stringify(logData)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const file = new File([blob], 'play_sessions.json', { type: 'application/json' })

      const existing = this.rootFolder.children?.find((f) => f.name === 'play_sessions.json')
      if (existing && existing.delete) {
        console.log('[WebMegaService] Deleting old play_sessions file...')
        await new Promise<void>((resolve) => {
          existing.delete?.((err) => {
            if (err) console.error('Error deleting old play_sessions:', err)
            resolve()
          })
        })
      }

      return this.uploadFile(file, '', 'play_sessions.json', {})
    } catch (e: unknown) {
      console.error('[WebMegaService] Save play sessions error:', e)
      const msg = e instanceof Error ? e.message : 'Unknown error saving play sessions'
      return { success: false, error: msg }
    }
  }
}
