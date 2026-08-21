import { Storage, File } from 'megajs'
import { IGuitarTab, ITabAttributes, ISettings } from '../shared/types'
import { SecureStorage } from './secureStorage'

import { app } from 'electron'

class MegaService {
  private storage: Storage | null = null
  private readonly SESSION_KEY = 'mega_session'
  private readonly FOLDER_NAME = app.isPackaged ? 'GuitarCompanionTabs' : 'GuitarCompanionDev'
  private rootFolder: File | null = null

  async init(): Promise<boolean> {
    const session = SecureStorage.get(this.SESSION_KEY)
    console.log('Init: Checking for stored session...', !!session)
    if (session) {
      try {
        // Attempt to restore session
        this.storage = await new Promise((resolve, reject) => {
          try {
            // Parse the stored JSON session data
            const sessionData = JSON.parse(session)
            // console.log('Init: Restoring from session data:', JSON.stringify(sessionData, null, 2));

            // Restore storage from the JSON data
            const s = Storage.fromJSON(sessionData)

            s.ready
              .then(async () => {
                console.log('Init: Session restored successfully')

                // Check if root is missing and attempt reload
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (!(s as any).root) {
                  console.log('Init: root is missing, attempting to reload files...')
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await new Promise<void>((res, rej) =>
                      (s as any).reload((err: any) => (err ? rej(err) : res()))
                    )
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
    this.storage = await new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options: any = {
        email,
        password: pass,
        userAgent: 'GuitarCompanion/1.0'
      }
      if (mfaCode) {
        options.secondFactorCode = mfaCode
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

  async logout() {
    this.storage = null
    SecureStorage.clear(this.SESSION_KEY)
  }

  private async ensureFolder() {
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

    return this.rootFolder.children.map((f) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawAttrs = (f as any).attributes

      // Expect attributes to be directly properly or merged
      const attrs = rawAttrs || {}

      return {
        id: f.nodeId || '',
        name: f.name || 'Unknown',
        size: f.size || 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: (f.name || '').split('.').pop() as any,
        attributes: attrs,
        downloadUrl: ''
      }
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async uploadFile(path: string, name: string, _attributes: ITabAttributes) {
    if (!this.rootFolder) {
      console.error('Upload Error: No root folder')
      throw new Error('No folder')
    }

    console.log('Starting MEGA upload:', { name, path })

    // megajs upload
    return new Promise<void>((resolve, reject) => {
      if (!this.rootFolder) return reject('No folder')

      let size = 0
      try {
        size = require('fs').statSync(path).size
      } catch (e) {
        console.error('Error reading file size:', e)
        return reject(e)
      }

      // Create read stream
      let stream: any // Readable stream
      try {
        const fs = require('fs')
        stream = fs.createReadStream(path)
      } catch (e) {
        console.error('Error creating read stream:', e)
        return reject(e)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upload = (this.rootFolder as any).upload({ name, size }, stream, (err: any) => {
        if (err) {
          console.error('MEGA Upload Callback Error:', err)
          reject(err)
        }
      })

      upload.on('complete', async () => {
        console.log('MEGA Upload Complete')

        // Find the uploaded file to set attributes
        // We need to wait a bit or reload? usually upload returns the file instance if we used the Promise API,
        // but here we used the stream API with events.
        // The 'complete' event might pass the file object or we might need to find it.
        // Actually, `upload` itself is a MutableFile which becomes the File.

        if (_attributes && Object.keys(_attributes).length > 0) {
          try {
            // Check if upload object has referencing file or is the file
            // In megajs v1, the upload object emits complete.
            // Let's try to reload the folder to get the new file
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((this.rootFolder as any).reload) {
              console.log('Reloading folder to find new file...')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await new Promise<void>((res) => (this.rootFolder as any).reload(res))
            }

            // Retry logic to find the file
            let attempts = 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let uploadedFile: any = null

            while (attempts < 3 && !uploadedFile) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              uploadedFile = (this.rootFolder?.children || []).find((f: any) => f.name === name)
              if (!uploadedFile) {
                console.log(`File not found, retrying (${attempts + 1}/3)...`)
                await new Promise((r) => setTimeout(r, 1000))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((this.rootFolder as any).reload)
                  await new Promise<void>((res) => (this.rootFolder as any).reload(res))
              }
              attempts++
            }

            if (uploadedFile) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const f = uploadedFile as any

              console.log('File found, setting attributes:', _attributes)
              if (f.setAttributes) {
                try {
                  await new Promise<void>((resolve, reject) => {
                    f.setAttributes(_attributes, (err: any) => {
                      if (err) reject(err)
                      else resolve()
                    })
                  })
                  console.log('Attributes set successfully')

                  // Force reload to ensure attributes are visible in getFiles
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  if ((this.rootFolder as any).reload) {
                    console.log('Reloading folder to refresh attributes...')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await new Promise<void>((res) => (this.rootFolder as any).reload(res))
                  }
                } catch (err) {
                  console.error('Error setting attributes:', err)
                }
              } else {
                console.warn('File does not support setAttributes')
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

      upload.on('error', (err: any) => {
        console.error('MEGA Upload Event Error:', err)
        reject(err)
      })

      upload.on('progress', (stats: any) => {
        console.log('Upload Progress:', stats)
      })
    })
  }
  async downloadFile(nodeId: string, destPath: string): Promise<void> {
    if (!this.rootFolder || !this.rootFolder.children) throw new Error('No folder')

    // Find file
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = this.rootFolder.children.find((f) => f.nodeId === nodeId)
    if (!file) throw new Error('File not found')

    const { pipeline } = require('stream/promises')
    const fs = require('fs')
    console.log('[MegaService] downloadFile: starting stream for', nodeId, 'to', destPath)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = (file as any).download({})
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

    await new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(file as any).delete((err: any) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // Verification Loop: Ensure file is gone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((this.rootFolder as any).reload) {
      console.log('Delete: Verifying removal...')
      for (let i = 0; i < 5; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await new Promise<void>((res) => (this.rootFolder as any).reload(res))

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

    return new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(file as any).rename(newName, (err: any) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async updateAttributes(nodeId: string, attributes: ITabAttributes): Promise<void> {
    if (!this.rootFolder || !this.rootFolder.children) throw new Error('No folder')

    const file = this.rootFolder.children.find((f) => f.nodeId === nodeId)
    if (!file) throw new Error('File not found')

    return new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const f = file as any
      if (f.setAttributes) {
        f.setAttributes(attributes, (err: any) => {
          if (err) reject(err)
          else {
            // Reload folder to refresh cache
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((this.rootFolder as any).reload) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(this.rootFolder as any).reload(() => resolve())
              } catch (reloadErr) {
                console.error('Reload error after update:', reloadErr)
                resolve() // Resolve anyway
              }
            } else {
              resolve()
            }
          }
        })
      } else {
        reject(new Error('File does not support attributes'))
      }
    })
  }

  async getSettings(): Promise<ISettings> {
    const defaultSettings: ISettings = {
      defaultSortMode: 'alpha'
    }

    if (!this.rootFolder || !this.rootFolder.children) return defaultSettings

    const settingsFile = this.rootFolder.children.find((f) => f.name === 'settings.json')
    if (!settingsFile || !settingsFile.nodeId) return defaultSettings

    try {
      const fs = require('fs')
      const path = require('path')
      const os = require('os')
      const crypto = require('crypto')
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

      // Clean up
      try {
        fs.unlinkSync(tempPath)
      } catch (e) {}

      return { ...defaultSettings, ...JSON.parse(content) }
    } catch (e) {
      console.error('[MegaService] Error loading settings:', e)
      return defaultSettings
    }
  }

  async saveSettings(settings: ISettings): Promise<void> {
    if (!this.rootFolder) throw new Error('No folder')

    console.log('Saving settings:', settings)
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const tempPath = path.join(os.tmpdir(), 'guitar-companion-settings-upload.json')

    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2))

    try {
      // Delete existing if any
      const existing = this.rootFolder.children?.find((f) => f.name === 'settings.json')
      if (existing && existing.nodeId) {
        await this.deleteFile(existing.nodeId)
      }

      await this.uploadFile(tempPath, 'settings.json', {})
    } finally {
      try {
        fs.unlinkSync(tempPath)
      } catch (e) {}
    }
  }
}

export const megaService = new MegaService()
