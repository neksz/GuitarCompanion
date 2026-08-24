import { Storage, MutableFile } from 'megajs'
import {
  IGuitarTab,
  ITabAttributes,
  ISettings,
  IPlaySession,
  IPlaySessionLog
} from '../shared/types'
import { SecureStorage } from './secureStorage'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'

class MegaService {
  private storage: Storage | null = null
  private readonly SESSION_KEY = 'mega_session'
  private readonly FOLDER_NAME = app.isPackaged ? 'GuitarCompanionTabs' : 'GuitarCompanionDev'
  private rootFolder: MutableFile | null = null

  async init(): Promise<boolean> {
    const session = SecureStorage.get(this.SESSION_KEY)
    console.log('Init: Checking for stored session...', !!session)
    if (session) {
      try {
        // Attempt to restore session
        this.storage = await new Promise<Storage>((resolve, reject) => {
          try {
            // Parse the stored JSON session data
            const sessionData = JSON.parse(session)

            // Restore storage from the JSON data
            const s = Storage.fromJSON(sessionData)

            s.ready
              .then(async () => {
                console.log('Init: Session restored successfully')

                // Check if root is missing and attempt reload
                if (!s.root) {
                  console.log('Init: root is missing, attempting to reload files...')
                  try {
                    await s.reload()
                    console.log('Init: Reload successful')
                  } catch (reloadErr) {
                    console.error('Init: Reload failed', reloadErr)
                    return reject(reloadErr)
                  }
                }

                resolve(s)
              })
              .catch((err) => {
                console.error('Init: Session restore failed (s.ready)', err)
                reject(err)
              })
          } catch (e) {
            console.error('Init: Exception during restore', e)
            reject(e)
          }
        })
        await this.ensureFolder()
        return true
      } catch (e) {
        console.error('Failed to restore session', e)
        // If session restoration fails, clear the invalid session
        SecureStorage.clear(this.SESSION_KEY)
      }
    }
    return false
  }

  async login(email: string, pass: string, keepLoggedIn: boolean, mfaCode?: string): Promise<void> {
    this.storage = await new Promise<Storage>((resolve, reject) => {
      const options = {
        email,
        password: pass,
        secondFactorCode: mfaCode,
        userAgent: 'GuitarCompanion/1.0'
      }

      try {
        const s = new Storage(options)
        s.ready
          .then(() => {
            resolve(s)
          })
          .catch(reject)
      } catch (err) {
        reject(err)
      }
    })

    if (this.storage) {
      // Save session state only if keepLoggedIn is true
      if (keepLoggedIn) {
        // s.toJSON() returns the session data required for Storage.fromJSON()
        const sessionData = this.storage.toJSON()
        console.log('Login: Saving session data:', JSON.stringify(sessionData, null, 2))
        SecureStorage.save(this.SESSION_KEY, JSON.stringify(sessionData))
      } else {
        console.log('Login: Session not saved (keepLoggedIn=false)')
      }

      await this.ensureFolder()
    }
  }

  async logout(): Promise<void> {
    this.storage = null
    SecureStorage.clear(this.SESSION_KEY)
  }

  private async ensureFolder(): Promise<void> {
    if (!this.storage) return

    // Check if root exists
    if (!this.storage.root) {
      throw new Error('Storage root is not ready')
    }

    // Find or create folder
    const files = this.storage.root.children
    this.rootFolder = files?.find((f) => f.name === this.FOLDER_NAME && f.directory) || null

    if (!this.rootFolder) {
      this.rootFolder = await this.storage.mkdir(this.FOLDER_NAME)
    }
  }

  getFiles(): IGuitarTab[] {
    if (!this.rootFolder || !this.rootFolder.children) return []

    return this.rootFolder.children
      .filter((f) => f.name !== 'settings.json' && f.name !== 'play_sessions.json')
      .map((f) => {
        const attrs = (f.attributes as ITabAttributes) || {}
        const ext = (f.name || '').split('.').pop()?.toLowerCase()
        const type: IGuitarTab['type'] =
          ext === 'pdf'
            ? 'pdf'
            : ext === 'gp5' || ext === 'gp' || ext === 'gpx' || ext === 'gp3' || ext === 'gp4'
              ? 'gp5'
              : ext === 'txt'
                ? 'txt'
                : 'other'

        return {
          id: f.nodeId || '',
          name: f.name || 'Unknown',
          size: f.size || 0,
          type,
          attributes: attrs,
          downloadUrl: ''
        }
      })
  }

  async uploadFile(filePath: string, name: string, attributes: ITabAttributes): Promise<void> {
    if (!this.rootFolder) {
      console.error('Upload Error: No root folder')
      throw new Error('No folder')
    }

    console.log('Starting MEGA upload:', { name, filePath })

    return new Promise<void>((resolve, reject) => {
      if (!this.rootFolder) return reject(new Error('No folder'))

      let size = 0
      try {
        size = fs.statSync(filePath).size
      } catch (e) {
        console.error('Error reading file size:', e)
        return reject(e)
      }

      let stream: fs.ReadStream
      try {
        stream = fs.createReadStream(filePath)
      } catch (e) {
        console.error('Error creating read stream:', e)
        return reject(e)
      }

      const upload = this.rootFolder.upload({ name, size }, undefined, (err) => {
        if (err) {
          console.error('MEGA Upload Callback Error:', err)
          reject(err)
        }
      })
      stream.pipe(upload)

      upload.on('complete', async () => {
        console.log('MEGA Upload Complete')

        if (attributes && Object.keys(attributes).length > 0) {
          try {
            if (this.storage) {
              console.log('Reloading storage to find new file...')
              await this.storage.reload()
            }

            let attempts = 0
            let uploadedFile: MutableFile | undefined

            while (attempts < 3 && !uploadedFile) {
              uploadedFile = (this.rootFolder?.children || []).find((f) => f.name === name)
              if (!uploadedFile) {
                console.log(`File not found, retrying (${attempts + 1}/3)...`)
                await new Promise((r) => setTimeout(r, 1000))
                if (this.storage) {
                  await this.storage.reload()
                }
              }
              attempts++
            }

            if (uploadedFile) {
              console.log('File found, setting attributes:', attributes)
              try {
                await uploadedFile.setAttributes(attributes as unknown as JSON)
                console.log('Attributes set successfully')

                if (this.storage) {
                  console.log('Reloading storage to refresh attributes...')
                  await this.storage.reload()
                }
              } catch (err) {
                console.error('Error setting attributes:', err)
              }
            } else {
              console.error('Could not find uploaded file to set attributes')
            }
          } catch (attrErr) {
            console.error('Failed to set attributes:', attrErr)
          }
        }

        resolve()
      })

      upload.on('error', (err: unknown) => {
        console.error('MEGA Upload Event Error:', err)
        reject(err)
      })

      upload.on('progress', (stats: unknown) => {
        console.log('Upload Progress:', stats)
      })
    })
  }

  async downloadFile(nodeId: string, destPath: string): Promise<void> {
    if (!this.rootFolder || !this.rootFolder.children) throw new Error('No folder')

    const file = this.rootFolder.children.find((f) => f.nodeId === nodeId)
    if (!file) throw new Error('File not found')

    console.log('[MegaService] downloadFile: starting stream for', nodeId, 'to', destPath)

    const stream = file.download({})
    const writeStream = fs.createWriteStream(destPath)

    try {
      await pipeline(stream, writeStream)
      console.log('[MegaService] downloadFile: pipeline completed')
    } catch (err) {
      console.error('[MegaService] downloadFile: pipeline error', err)
      throw err
    }
  }

  async deleteFile(nodeId: string): Promise<void> {
    if (!this.rootFolder || !this.rootFolder.children) throw new Error('No folder')

    const file = this.rootFolder.children.find((f) => f.nodeId === nodeId)
    if (!file) throw new Error('File not found')

    await file.delete()

    if (this.storage) {
      console.log('Delete: Verifying removal...')
      for (let i = 0; i < 5; i++) {
        await this.storage.reload()
        const stillExists = this.rootFolder.children.some((f) => f.nodeId === nodeId)
        if (!stillExists) {
          console.log('Delete: File removed successfully')
          return
        }
        console.log(`Delete: File still exists, retrying verification (${i + 1}/5)...`)
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  }

  async renameFile(nodeId: string, newName: string): Promise<void> {
    if (!this.rootFolder || !this.rootFolder.children) throw new Error('No folder')

    const file = this.rootFolder.children.find((f) => f.nodeId === nodeId)
    if (!file) throw new Error('File not found')

    await file.rename(newName)
  }

  async updateAttributes(nodeId: string, attributes: ITabAttributes): Promise<void> {
    if (!this.rootFolder || !this.rootFolder.children) throw new Error('No folder')

    const file = this.rootFolder.children.find((f) => f.nodeId === nodeId)
    if (!file) throw new Error('File not found')

    await file.setAttributes(attributes as unknown as JSON)
    if (this.storage) {
      try {
        await this.storage.reload()
      } catch (reloadErr) {
        console.error('Reload error after update:', reloadErr)
      }
    }
  }

  async getSettings(): Promise<ISettings> {
    const defaultSettings: ISettings = {
      defaultSortMode: 'alpha'
    }

    if (!this.rootFolder || !this.rootFolder.children) return defaultSettings

    const settingsFile = this.rootFolder.children.find((f) => f.name === 'settings.json')
    if (!settingsFile || !settingsFile.nodeId) return defaultSettings

    try {
      const uniqueId = crypto.randomBytes(4).toString('hex')
      const tempPath = path.join(os.tmpdir(), `guitar-companion-settings-${uniqueId}.json`)

      console.log('[MegaService] getSettings: Downloading to', tempPath)
      await this.downloadFile(settingsFile.nodeId, tempPath)

      if (!fs.existsSync(tempPath)) {
        console.error('[MegaService] getSettings: File does not exist after download!', tempPath)
        return defaultSettings
      }

      const content = fs.readFileSync(tempPath, 'utf-8')
      console.log('[MegaService] getSettings: Read content length', content.length)

      try {
        fs.unlinkSync(tempPath)
      } catch {
        // ignore
      }

      return { ...defaultSettings, ...JSON.parse(content) }
    } catch (e) {
      console.error('[MegaService] Error loading settings:', e)
      return defaultSettings
    }
  }

  async saveSettings(settings: ISettings): Promise<void> {
    if (!this.rootFolder) throw new Error('No folder')

    console.log('Saving settings:', settings)
    const tempPath = path.join(os.tmpdir(), 'guitar-companion-settings-upload.json')

    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2))

    try {
      const existing = this.rootFolder.children?.find((f) => f.name === 'settings.json')
      if (existing && existing.nodeId) {
        await this.deleteFile(existing.nodeId)
      }

      await this.uploadFile(tempPath, 'settings.json', {})
    } finally {
      try {
        fs.unlinkSync(tempPath)
      } catch {
        // ignore
      }
    }
  }

  async getPlaySessions(): Promise<IPlaySession[]> {
    if (!this.rootFolder || !this.rootFolder.children) return []

    const sessionFile = this.rootFolder.children.find((f) => f.name === 'play_sessions.json')
    if (!sessionFile || !sessionFile.nodeId) return []

    try {
      const uniqueId = crypto.randomBytes(4).toString('hex')
      const tempPath = path.join(os.tmpdir(), `guitar-companion-sessions-${uniqueId}.json`)

      console.log('[MegaService] getPlaySessions: Downloading to', tempPath)
      await this.downloadFile(sessionFile.nodeId, tempPath)

      if (!fs.existsSync(tempPath)) {
        console.error(
          '[MegaService] getPlaySessions: File does not exist after download!',
          tempPath
        )
        return []
      }

      const content = fs.readFileSync(tempPath, 'utf-8')
      try {
        fs.unlinkSync(tempPath)
      } catch {
        // ignore
      }

      const data: IPlaySessionLog | IPlaySession[] = JSON.parse(content)
      if (Array.isArray(data)) {
        return data
      }
      return data?.sessions || []
    } catch (e) {
      console.error('[MegaService] Error loading play sessions:', e)
      return []
    }
  }

  async savePlaySessions(sessions: IPlaySession[]): Promise<void> {
    if (!this.rootFolder) throw new Error('No folder')

    console.log('[MegaService] Saving play sessions count:', sessions.length)
    const tempPath = path.join(os.tmpdir(), 'guitar-companion-sessions-upload.json')

    const logData: IPlaySessionLog = {
      version: 1,
      sessions
    }

    fs.writeFileSync(tempPath, JSON.stringify(logData))

    try {
      const existing = this.rootFolder.children?.find((f) => f.name === 'play_sessions.json')
      if (existing && existing.nodeId) {
        await this.deleteFile(existing.nodeId)
      }

      await this.uploadFile(tempPath, 'play_sessions.json', {})
    } finally {
      try {
        fs.unlinkSync(tempPath)
      } catch {
        // ignore
      }
    }
  }
}

export const megaService = new MegaService()
