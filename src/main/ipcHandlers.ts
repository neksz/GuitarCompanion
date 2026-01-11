import { ipcMain, app, shell, dialog } from 'electron';
import path from 'path';
import { megaService } from './megaService';
import { ILoginCredentials } from '../shared/types';

export function setupHandlers() {
  ipcMain.handle('auth:login', async (_, { email, password, mfaCode }: ILoginCredentials) => {
    try {
      await megaService.login(email, password, mfaCode);
      return { success: true };
    } catch (e: any) {
      console.error(e);
      // Check for MFA error
      if (e.message.includes('Multi-Factor Authentication Required') || e === -26 || e.code === -26) {
         return { success: false, error: 'MFA_REQUIRED' };
      }
      return { success: false, error: e.message || 'Login failed' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    await megaService.logout();
    return true;
  });

  ipcMain.handle('auth:check', async () => {
    return await megaService.init();
  });

  ipcMain.handle('mega:files', async () => {
    return megaService.getFiles();
  });

  ipcMain.handle('mega:upload', async (_, { path: tabPath, name, attributes }) => {
     try {
         console.log('IPC mega:upload received:', { tabPath, name, attributes });
         if (typeof tabPath !== 'string') {
             console.error('IPC mega:upload ERROR: path is not a string!', typeof tabPath, tabPath);
         }
         await megaService.uploadFile(tabPath, name, attributes || {});
         return { success: true };
     } catch (e: any) {
         console.error('IPC mega:upload Exception:', e);
         return { success: false, error: e.message };
     }
  });

  ipcMain.handle('mega:open', async (_, { nodeId, name }) => {
      try {
          const cacheDir = path.join(app.getPath('userData'), 'cache');
          if (!require('fs').existsSync(cacheDir)) {
              require('fs').mkdirSync(cacheDir);
          }
          
          const destPath = path.join(cacheDir, name);
          
          // Check if file exists, if not download
          // For now, always download to ensure latest version or unique name logic could be added
          await megaService.downloadFile(nodeId, destPath);
          
          await shell.openPath(destPath);
          return { success: true };
      } catch (e: any) {
          console.error('Open error:', e);
          return { success: false, error: e.message };
      }
  });

  ipcMain.handle('mega:download', async (_, { nodeId, name }) => {
      try {
          const { filePath } = await dialog.showSaveDialog({
              defaultPath: name,
              title: 'Save Tab'
          });
          
          if (filePath) {
              await megaService.downloadFile(nodeId, filePath);
              return { success: true };
          }
          return { success: false, canceled: true };
      } catch (e: any) {
          console.error('Download error:', e);
          return { success: false, error: e.message };
      }
  });

  ipcMain.handle('mega:delete', async (_, { nodeId }) => {
      try {
          await megaService.deleteFile(nodeId);
          return { success: true };
      } catch (e: any) {
          console.error(e);
          return { success: false, error: e.message };
      }
  });

  ipcMain.handle('mega:updateAttributes', async (_, { nodeId, attributes }) => {
      try {
          await megaService.updateAttributes(nodeId, attributes);
          return { success: true };
      } catch (e: any) {
          console.error(e);
          return { success: false, error: e.message };
      }
  });

  ipcMain.handle('pdf:analyze', async (_, { filePath }) => {
      try {
          const { analyzePdf } = await import('./pdfAnalyzer');
          const result = await analyzePdf(filePath);
          return { success: true, data: result };
      } catch (e: any) {
          console.error('PDF analysis error:', e);
          return { success: false, error: e.message };
      }
  });
}
