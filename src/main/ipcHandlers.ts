import { ipcMain, app, shell, dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { megaService } from './megaService'
import { ILoginCredentials } from '../shared/types'

export function setupHandlers(): void {
  ipcMain.handle(
    'auth:login',
    async (_, { email, password, keepLoggedIn, mfaCode }: ILoginCredentials) => {
      try {
        await megaService.login(email, password, keepLoggedIn, mfaCode)
        return { success: true }
      } catch (e: unknown) {
        console.error(e)
        const errorObj = e as { message?: string; code?: number }
        const msg = errorObj?.message || String(e)
        // Check for MFA error
        if (
          msg.includes('Multi-Factor Authentication Required') ||
          e === -26 ||
          errorObj?.code === -26
        ) {
          return { success: false, error: 'MFA_REQUIRED' }
        }
        return { success: false, error: msg || 'Login failed' }
      }
    }
  )

  ipcMain.handle('auth:logout', async () => {
    await megaService.logout()
    return true
  })

  ipcMain.handle('auth:check', async () => {
    return await megaService.init()
  })

  ipcMain.handle('mega:files', async () => {
    return megaService.getFiles()
  })

  ipcMain.handle('mega:upload', async (_, { path: tabPath, name, attributes }) => {
    try {
      console.log('IPC mega:upload received:', { tabPath, name, attributes })
      if (typeof tabPath !== 'string') {
        console.error('IPC mega:upload ERROR: path is not a string!', typeof tabPath, tabPath)
      }
      await megaService.uploadFile(tabPath, name, attributes || {})
      return { success: true }
    } catch (e: unknown) {
      console.error('IPC mega:upload Exception:', e)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('mega:open', async (_, { nodeId, name }) => {
    try {
      const cacheDir = path.join(app.getPath('userData'), 'cache')
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir)
      }

      const destPath = path.join(cacheDir, name)
      await megaService.downloadFile(nodeId, destPath)

      // For PDFs, return file data as base64 for in-app viewing
      const isPdf = name.toLowerCase().endsWith('.pdf')
      if (isPdf) {
        const fileData = fs.readFileSync(destPath)
        const base64 = fileData.toString('base64')
        return { success: true, data: base64, mimeType: 'application/pdf' }
      }

      // For Guitar Pro files, return file data as base64 for in-app viewing
      const lower = name.toLowerCase()
      const isGuitarPro =
        lower.endsWith('.gp3') ||
        lower.endsWith('.gp4') ||
        lower.endsWith('.gp5') ||
        lower.endsWith('.gpx') ||
        lower.endsWith('.gp')
      if (isGuitarPro) {
        const fileData = fs.readFileSync(destPath)
        const base64 = fileData.toString('base64')
        return { success: true, data: base64, mimeType: 'application/x-guitar-pro' }
      }

      // For non-PDF/GP files, open externally as before
      await shell.openPath(destPath)
      return { success: true }
    } catch (e: unknown) {
      console.error('Open error:', e)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('mega:download', async (_, { nodeId, name }) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: name,
        title: 'Save Tab'
      })

      if (filePath) {
        await megaService.downloadFile(nodeId, filePath)
        return { success: true }
      }
      return { success: false, canceled: true }
    } catch (e: unknown) {
      console.error('Download error:', e)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('mega:delete', async (_, { nodeId }) => {
    try {
      await megaService.deleteFile(nodeId)
      return { success: true }
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('mega:rename', async (_, { nodeId, newName }) => {
    try {
      await megaService.renameFile(nodeId, newName)
      return { success: true }
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('mega:updateAttributes', async (_, { nodeId, attributes }) => {
    try {
      await megaService.updateAttributes(nodeId, attributes)
      return { success: true }
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('pdf:analyze', async (_, { filePath }) => {
    try {
      const { analyzePdf } = await import('./pdfAnalyzer')
      const result = await analyzePdf(filePath)
      return { success: true, data: result }
    } catch (e: unknown) {
      console.error('PDF analysis error:', e)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('mega:getSettings', async () => {
    return megaService.getSettings()
  })

  ipcMain.handle('mega:saveSettings', async (_, { settings }) => {
    try {
      await megaService.saveSettings(settings)
      return { success: true }
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('mega:getPlaySessions', async () => {
    return megaService.getPlaySessions()
  })

  ipcMain.handle('mega:savePlaySessions', async (_, { sessions }) => {
    try {
      await megaService.savePlaySessions(sessions)
      return { success: true }
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle(
    'pdf:savePdfFromHtml',
    async (_, { html, defaultName }: { html: string; defaultName: string }) => {
      let win: BrowserWindow | null = null
      let tempFile: string | null = null
      try {
        win = new BrowserWindow({
          show: false,
          width: 1000,
          height: 1400,
          webPreferences: {
            sandbox: false
          }
        })

        // Write HTML to temporary file to support arbitrarily large scores without URL length limits
        tempFile = path.join(app.getPath('temp'), `score_export_${Date.now()}.html`)
        fs.writeFileSync(tempFile, html, 'utf-8')

        await win.loadFile(tempFile)

        // Wait for all fonts (including embedded Bravura font) to be ready
        try {
          await win.webContents.executeJavaScript('document.fonts.ready')
        } catch {
          // ignore
        }

        // Allow layout and glyph positioning to settle
        await new Promise((resolve) => setTimeout(resolve, 300))

        const pdfBuffer = await win.webContents.printToPDF({
          pageSize: 'A4',
          printBackground: true,
          margins: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0
          }
        })

        win.destroy()
        win = null

        const sanitizedName = (defaultName || 'tab').replace(/[/\\?%*:|"<>]/g, '_').trim()

        const { filePath, canceled } = await dialog.showSaveDialog({
          title: 'Save PDF',
          defaultPath: `${sanitizedName}.pdf`,
          filters: [{ name: 'PDF Documents (*.pdf)', extensions: ['pdf'] }]
        })

        if (canceled || !filePath) {
          return { success: false, canceled: true }
        }

        fs.writeFileSync(filePath, pdfBuffer)
        return { success: true, filePath }
      } catch (e: unknown) {
        console.error('PDF export error:', e)
        if (win) {
          try {
            win.destroy()
          } catch {
            // ignore
          }
        }
        const msg = e instanceof Error ? e.message : String(e)
        return { success: false, error: msg }
      } finally {
        if (tempFile) {
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile)
            }
          } catch {
            // ignore
          }
        }
      }
    }
  )
}
