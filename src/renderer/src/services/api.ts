import { IGlobalApi } from '../../../shared/types';
import { WebMegaService } from '@renderer/services/WebMegaService';

const windowApi = (window as any).api as IGlobalApi | undefined;

// If window.api exists (Electron), use it. Otherwise use the Web Service.
export const api: IGlobalApi = windowApi || new WebMegaService();
