import { IGlobalApi } from '../../../shared/types'
import { WebMegaService } from '@renderer/services/WebMegaService'
import { MockMegaService } from '@renderer/services/MockMegaService'

function createApi(): IGlobalApi {
  const windowApi = (window as unknown as { api?: IGlobalApi }).api
  if (windowApi) {
    return windowApi
  }

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const mockParam = params.get('mock')

    if (mockParam === '0' || mockParam === 'false') {
      sessionStorage.removeItem('gc_mock')
    } else if (mockParam === 'login') {
      sessionStorage.setItem('gc_mock', 'login')
      return new MockMegaService(false)
    } else if (mockParam === '1' || mockParam === 'true') {
      sessionStorage.setItem('gc_mock', '1')
      return new MockMegaService(true)
    } else {
      const savedMock = sessionStorage.getItem('gc_mock') || localStorage.getItem('gc_mock')
      if (savedMock === 'login') {
        return new MockMegaService(false)
      }
      if (savedMock === '1' || savedMock === 'true') {
        return new MockMegaService(true)
      }
    }
  }

  return new WebMegaService()
}

export const api: IGlobalApi = createApi()
