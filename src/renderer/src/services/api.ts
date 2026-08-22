import { IGlobalApi } from '../../../shared/types'
import { WebMegaService } from '@renderer/services/WebMegaService'

const windowApi = (window as unknown as { api?: IGlobalApi }).api

// If window.api exists (Electron), use it. Otherwise use the Web Service.
export const api: IGlobalApi = windowApi || new WebMegaService()
