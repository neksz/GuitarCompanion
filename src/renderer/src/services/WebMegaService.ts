import { Storage, File as MegaFile } from 'megajs';
import { IGuitarTab, ILoginCredentials, ITabAttributes, IGlobalApi, ISettings } from '../../../shared/types';

export class WebMegaService implements IGlobalApi {
    private storage: Storage | null = null;
    private rootFolder: MegaFile | null = null;
    private readonly FOLDER_NAME = import.meta.env.DEV ? 'GuitarCompanionDev' : 'GuitarCompanionTabs';

    constructor() {
        // Try to restore session from saved JSON data
        const savedSession = localStorage.getItem('mega_session');
        if (savedSession) {
            console.log('[WebMegaService] Found saved session, attempting auto-login');
            try {
                const sessionData = JSON.parse(savedSession);
                this.storage = Storage.fromJSON(sessionData);

                this.storage.ready.then(async () => {
                    console.log('[WebMegaService] Auto-login successful');
                    
                    // Check if root is missing and reload (same as Electron version)
                    if (this.storage && !(this.storage as any).root) {
                        console.log('[WebMegaService] Root is missing, reloading files...');
                        try {
                            await new Promise<void>((res, rej) => {
                                (this.storage as any).reload((err: any) => err ? rej(err) : res());
                            });
                            console.log('[WebMegaService] Reload successful, root now available');
                        } catch (reloadErr) {
                            console.error('[WebMegaService] Reload failed', reloadErr);
                        }
                    }
                    
                    // Ensure GuitarCompanionTabs folder exists
                    try {
                        await this.ensureFolder();
                        console.log('[WebMegaService] GuitarCompanionTabs folder ready');
                    } catch (err) {
                        console.error('[WebMegaService] Failed to ensure folder', err);
                        // If folder creation fails (e.g. storage not ready), clear session to force re-login
                        localStorage.removeItem('mega_session');
                        this.storage = null;
                        this.rootFolder = null;
                    }
                }).catch((err) => {
                    console.error('[WebMegaService] Auto-login failed, clearing saved session', err);
                    localStorage.removeItem('mega_session');
                    this.storage = null;
                });
            } catch (e) {
                console.error('[WebMegaService] Exception during auto-login', e);
                localStorage.removeItem('mega_session');
            }
        }
    }

    private async ensureFolder(): Promise<void> {
        if (!this.storage) return;
        
        // Check if root exists
        if (!this.storage.root) {
            throw new Error('Storage root is not ready');
        }
        
        // Find or create folder
        const files = this.storage.root.children;
        this.rootFolder = files?.find(f => f.name === this.FOLDER_NAME && f.directory) || null;

        if (!this.rootFolder) {
            console.log('[WebMegaService] Creating GuitarCompanionTabs folder...');
            this.rootFolder = await this.storage.mkdir(this.FOLDER_NAME);
        } else {
            console.log('[WebMegaService] GuitarCompanionTabs folder found');
        }
    }

    async checkAuth(): Promise<boolean> {
        return !!this.storage && !!this.storage.key;
    }

    async login(creds: ILoginCredentials): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            try {
                // Close any existing storage instance first
                if (this.storage) {
                    console.log('[WebMegaService] Closing existing storage before retry');
                    this.storage.close();
                    this.storage = null;
                    this.rootFolder = null;
                }

                const storageOpts: any = {
                    email: creds.email,
                    password: creds.password,
                    keepalive: true,
                    userAgent: 'GuitarCompanionWeb/1.0'
                };

                // Add MFA code if provided
                if (creds.mfaCode) {
                    console.log('[WebMegaService] MFA code provided, adding to login request');
                    storageOpts.secondFactorCode = creds.mfaCode.trim();
                }

                console.log('[WebMegaService] Creating new Storage instance');
                this.storage = new Storage(storageOpts);

                this.storage.ready.then(async () => {
                    console.log('[WebMegaService] Login successful');
                    
                    // Ensure GuitarCompanionTabs folder exists
                    try {
                        await this.ensureFolder();
                    } catch (err) {
                        console.error('[WebMegaService] Failed to create/find folder', err);
                        this.storage = null;
                        this.rootFolder = null;
                        resolve({ success: false, error: 'Failed to setup folder' });
                        return;
                    }
                    
                    // Save session using toJSON() if keepLoggedIn is true
                    if (creds.keepLoggedIn && this.storage) {
                        console.log('[WebMegaService] Saving session data to localStorage');
                        const sessionData = this.storage.toJSON();
                        localStorage.setItem('mega_session', JSON.stringify(sessionData));
                    }
                    
                    resolve({ success: true });
                }).catch((err) => {
                    console.error('[WebMegaService] Mega Login Error', err);
                    this.storage = null;
                    resolve({ success: false, error: err.message });
                });
            } catch (error: any) {
                console.error('[WebMegaService] Exception during login', error);
                this.storage = null;
                resolve({ success: false, error: error.message });
            }
        });
    }

    async logout(): Promise<void> {
        if (this.storage) {
            this.storage.close();
            this.storage = null;
        }
        this.rootFolder = null;
        localStorage.removeItem('mega_session');
    }

    async getFiles(): Promise<IGuitarTab[]> {
        if (!this.rootFolder || !this.rootFolder.children) {
            console.log('[WebMegaService] getFiles: No rootFolder or children');
            return [];
        }
        
        return this.rootFolder.children.map(f => {
            const rawAttrs = (f as any).attributes;
            const attrs = rawAttrs || {};
            
            return {
                id: f.nodeId || '',
                name: f.name || 'Unknown',
                size: f.size || 0,
                type: (f.name || '').split('.').pop() as any,
                attributes: attrs,
                downloadUrl: ''
            };
        }).filter(t => t.name !== 'settings.json');
    }

    async uploadFile(file: File, _filePath: string, fileName: string, attributes: ITabAttributes): Promise<{ success: boolean; error?: string }> {
        if (!this.rootFolder) return { success: false, error: 'Not logged in' };

        try {
            console.log('[WebMegaService] Starting upload...', fileName);
            const arrayBuffer = await file.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);

            return new Promise((resolve) => {
                const upload = (this.rootFolder as any).upload({
                    name: fileName,
                    size: file.size
                }, buffer);

                upload.on('complete', async (uploadedFile: any) => {
                    console.log('[WebMegaService] Upload complete');
                    
                    // Set attributes if provided
                    if (attributes && Object.keys(attributes).length > 0) {
                        try {
                            // Find the file if not provided in event
                            let f = uploadedFile;
                            if (!f) {
                                // Reload folder to find the new file
                                if ((this.rootFolder as any).reload) {
                                    await new Promise<void>(res => (this.rootFolder as any).reload(res));
                                }
                                f = this.rootFolder?.children?.find(child => child.name === fileName);
                            }

                            if (f && f.setAttributes) {
                                console.log('[WebMegaService] Setting attributes...', attributes);
                                await new Promise<void>((res, rej) => {
                                    f.setAttributes(attributes, (err: any) => err ? rej(err) : res());
                                });
                                
                                // One final reload to ensure UI sees the attributes
                                if ((this.rootFolder as any).reload) {
                                    await new Promise<void>(res => (this.rootFolder as any).reload(res));
                                }
                                console.log('[WebMegaService] Attributes set successfully');
                            }
                        } catch (attrErr) {
                            console.error('[WebMegaService] Failed to set attributes:', attrErr);
                        }
                    }
                    
                    resolve({ success: true });
                });

                upload.on('error', (err: any) => {
                    console.error('[WebMegaService] Upload error:', err);
                    resolve({ success: false, error: err.message });
                });
            });
        } catch (e: any) {
            console.error('[WebMegaService] Upload exception:', e);
            return { success: false, error: e.message };
        }
    }

    async deleteFile(id: string): Promise<{ success: boolean; error?: string }> {
        if (!this.rootFolder) return { success: false, error: 'Not logged in' };
        
        const node = this.rootFolder.children?.find(f => f.nodeId === id);
        if (node) {
            await (node as any).delete();
            return { success: true };
        }
        return { success: false, error: 'File not found' };
    }

    async renameFile(id: string, newName: string): Promise<{ success: boolean; error?: string }> {
        if (!this.rootFolder || !this.rootFolder.children) {
            return { success: false, error: 'Not logged in' };
        }

        const node = this.rootFolder.children.find(f => f.nodeId === id);
        if (!node) {
            return { success: false, error: 'File not found' };
        }

        return new Promise((resolve) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (node as any).rename(newName, (err: any) => {
                if (err) {
                    resolve({ success: false, error: err.message });
                } else {
                    resolve({ success: true });
                }
            });
        });
    }

    async updateAttributes(id: string, attributes: ITabAttributes): Promise<{ success: boolean; error?: string }> {
        if (!this.rootFolder || !this.rootFolder.children) {
            return { success: false, error: 'Not logged in' };
        }
        
        const node = this.rootFolder.children.find(f => f.nodeId === id);
        if (!node) {
            return { success: false, error: 'File not found' };
        }

        return new Promise((resolve) => {
            const f = node as any;
            if (f.setAttributes) {
                f.setAttributes(attributes, (err: any) => {
                    if (err) {
                        console.error('[WebMegaService] Error setting attributes:', err);
                        resolve({ success: false, error: err.message });
                    } else {
                        console.log('[WebMegaService] Attributes updated successfully');
                        // Reload folder to refresh cache (like Electron version)
                        if ((this.rootFolder as any).reload) {
                            try {
                                (this.rootFolder as any).reload(() => {
                                    resolve({ success: true });
                                });
                            } catch (reloadErr) {
                                console.error('[WebMegaService] Reload error after update:', reloadErr);
                                resolve({ success: true }); // Still resolve as success since attributes were set
                            }
                        } else {
                            resolve({ success: true });
                        }
                    }
                });
            } else {
                resolve({ success: false, error: 'File does not support attributes' });
            }
        });
    }

    getFilePath(_file: File): string {
        return ''; // Web doesn't have true paths
    }

    async openFile(id: string, name: string): Promise<{ success: boolean; data?: string; mimeType?: string; error?: string }> {
        if (!this.rootFolder) return { success: false, error: 'Not logged in' };
        const node = this.rootFolder.children?.find(f => f.nodeId === id);
        if (!node) return { success: false, error: 'File not found' };
        
        // Determine MIME type based on file extension
        const mimeType = name.endsWith('.pdf') ? 'application/pdf' : 'text/plain';
        
        // Download the file as a blob
        const blob = await this.downloadToBlob(node, mimeType);
        
        // For PDFs, return a blob URL for in-app viewing
        if (name.toLowerCase().endsWith('.pdf')) {
            const url = URL.createObjectURL(blob);
            return { success: true, data: url, mimeType: 'application/pdf' };
        }
        
        // For non-PDF files, open in new tab as before
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        return { success: true };
    }

    async downloadFile(id: string, name: string): Promise<{ success: boolean; canceled?: boolean; error?: string }> {
        try {
            console.log('[WebMegaService] downloadFile called:', { id, name });
            if (!this.rootFolder) {
                console.error('[WebMegaService] downloadFile: No rootFolder');
                return { success: false, error: 'Not logged in' };
            }
            
            const node = this.rootFolder.children?.find(f => f.nodeId === id);
            if (!node) {
                console.error('[WebMegaService] downloadFile: File not found', id);
                return { success: false, error: 'File not found' };
            }

            console.log('[WebMegaService] Downloading file:', name);
            
            // Determine MIME type
            const ext = name.split('.').pop()?.toLowerCase();
            let mimeType = 'application/octet-stream';
            if (ext === 'pdf') mimeType = 'application/pdf';
            else if (ext === 'txt') mimeType = 'text/plain';
            else if (ext === 'gp' || ext === 'gp3' || ext === 'gp4' || ext === 'gp5' || ext === 'gpx') mimeType = 'application/octet-stream';
            
            const blob = await this.downloadToBlob(node, mimeType);
            console.log('[WebMegaService] Blob created, size:', blob.size, 'type:', blob.type);
            
            // Try File System Access API first (Chrome/Edge)
            if ('showSaveFilePicker' in window) {
                try {
                    console.log('[WebMegaService] Using File System Access API');
                    const handle = await (window as any).showSaveFilePicker({
                        suggestedName: name,
                        types: [{
                            description: 'File',
                            accept: { [mimeType]: [`.${ext}`] }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    console.log('[WebMegaService] Download via File System Access API successful');
                    return { success: true };
                } catch (err: any) {
                    if (err.name === 'AbortError') {
                        console.log('[WebMegaService] User canceled save dialog');
                        return { success: false, canceled: true };
                    }
                    console.warn('[WebMegaService] File System Access API failed, falling back:', err);
                }
            }
            
            // Fallback: traditional download
            console.log('[WebMegaService] Using traditional download method');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.setAttribute('download', name); // Set explicitly
            a.style.display = 'none';
            
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                console.log('[WebMegaService] Cleaned up download resources');
            }, 1000);
            
            console.log('[WebMegaService] Download triggered successfully');
            return { success: true };
        } catch (e: any) {
            console.error('[WebMegaService] downloadFile error:', e);
            return { success: false, error: e.message };
        }
    }

    private async downloadToBlob(node: MegaFile, mimeType?: string): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const chunks: Uint8Array[] = [];
            const stream = (node as any).download();
            
            stream.on('data', (chunk: Uint8Array) => {
                chunks.push(chunk);
            });
            
            stream.on('end', () => {
                // Convert Uint8Array chunks to proper format and create blob
                const blob = new Blob(chunks as any, mimeType ? { type: mimeType } : undefined);
                resolve(blob);
            });
            
            stream.on('error', (err: any) => {
                reject(err);
            });
        });
    }

    async getSettings(): Promise<ISettings> {
        const defaultSettings: ISettings = {
            defaultSortMode: 'alpha'
        };

        if (!this.rootFolder || !this.rootFolder.children) {
            return defaultSettings;
        }

        const settingsFile = this.rootFolder.children.find(f => f.name === 'settings.json');
        if (!settingsFile) {
            return defaultSettings;
        }

        try {
            console.log('[WebMegaService] Downloading settings.json');
            const blob = await this.downloadToBlob(settingsFile, 'application/json');
            const text = await blob.text();
            const settings = JSON.parse(text);
            return { ...defaultSettings, ...settings };
        } catch (e) {
            console.error('[WebMegaService] Error loading settings:', e);
            return defaultSettings;
        }
    }

    async saveSettings(settings: ISettings): Promise<{ success: boolean; error?: string }> {
        if (!this.rootFolder) return { success: false, error: 'Not logged in' };

        try {
            console.log('[WebMegaService] Saving settings...', settings);
            const jsonString = JSON.stringify(settings, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            // Convert to file for upload
            const file = new File([blob], 'settings.json', { type: 'application/json' });
            
            const existing = this.rootFolder.children?.find(f => f.name === 'settings.json');
            if (existing) {
                console.log('[WebMegaService] Deleting old settings file...');
                await new Promise<void>((resolve) => {
                    (existing as any).delete((err: any) => {
                        if (err) console.error('Error deleting old settings:', err);
                        resolve();
                    });
                });
            }

            return this.uploadFile(file, '', 'settings.json', {});
        } catch (e: any) {
             console.error('[WebMegaService] Save settings error:', e);
             return { success: false, error: e.message };
        }
    }
}
