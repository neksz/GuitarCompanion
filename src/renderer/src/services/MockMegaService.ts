import {
  IGuitarTab,
  ILoginCredentials,
  ITabAttributes,
  IGlobalApi,
  ISettings,
  IPlaySession
} from '../../../shared/types'

function createSamplePdfBase64(): string {
  const page1Stream = [
    'BT',
    '/F1 18 Tf',
    '50 730 Td',
    '(Hotel California - Eagles (Acoustic Tab)) Tj',
    '/F1 11 Tf',
    '0 -28 Td',
    '(Tuning: Standard (E A D G B E)   Capo: 7th Fret   Tempo: 75 BPM) Tj',
    '0 -32 Td',
    '(e|-------2-------2-|-------0-------0-|-------2-------2-|-------0-------0-|) Tj',
    '0 -16 Td',
    '(B|-----3---3---3---|-----0---0---0---|-----1---1---1---|-----3---3---3---|) Tj',
    '0 -16 Td',
    '(G|---4-------4-----|---2-------2-----|---2-------2-----|---0-------0-----|) Tj',
    '0 -16 Td',
    '(D|-4---------------|-4---------------|-0---------------|-2---------------|) Tj',
    '0 -16 Td',
    '(A|-2---------------|-0---------------|-----------------|-2---------------|) Tj',
    '0 -16 Td',
    '(E|-----------------|-----------------|-----------------|-0---------------|) Tj',
    'ET'
  ].join('\n')

  const page2Stream = [
    'BT',
    '/F1 16 Tf',
    '50 730 Td',
    '(Hotel California - Page 2 (Chorus & Solo)) Tj',
    '/F1 11 Tf',
    '0 -30 Td',
    '(e|-------3-------3-|-------2-------2-|-------0-------0-|-------2-------2-|) Tj',
    '0 -16 Td',
    '(B|-----0---0---0---|-----3---3---3---|-----0---0---0---|-----2---2---2---|) Tj',
    '0 -16 Td',
    '(G|---0-------0-----|---2-------2-----|---0-------0-----|---3-------3-----|) Tj',
    '0 -16 Td',
    '(D|-0---------------|-0---------------|-2---------------|-4---------------|) Tj',
    '0 -16 Td',
    '(A|-2---------------|-----------------|-2---------------|-4---------------|) Tj',
    '0 -16 Td',
    '(E|-3---------------|-----------------|-0---------------|-2---------------|) Tj',
    'ET'
  ].join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    `5 0 obj\n<< /Length ${page1Stream.length} >>\nstream\n${page1Stream}\nendstream\nendobj\n`,
    '6 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>\nendobj\n',
    `7 0 obj\n<< /Length ${page2Stream.length} >>\nstream\n${page2Stream}\nendstream\nendobj\n`
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const obj of objects) {
    offsets.push(pdf.length)
    pdf += obj
  }
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return btoa(pdf)
}

function createSampleGpBase64(): string {
  const alphaTex = [
    '\\title "Master of Puppets"',
    '\\artist "Metallica"',
    '\\album "Master of Puppets (1986)"',
    '\\tempo 212',
    '\\track "James Hetfield - Rhythm"',
    '\\staff {score tabs}',
    '\\tuning E4 B3 G3 D3 A2 E2',
    '.',
    '0.6.8 0.6.8 12.5.8 0.6.8 0.6.8 11.5.8 0.6.8 0.6.8 |',
    '10.5.4 9.5.4 8.5.4 7.5.4 |',
    '0.6.8 0.6.8 7.5.8 0.6.8 0.6.8 6.5.8 0.6.8 0.6.8 |',
    '5.5.8 0.6.8 4.5.8 0.6.8 3.5.8 0.6.8 2.5.8 0.6.8',
    '\\track "Kirk Hammett - Lead"',
    '\\staff {score tabs}',
    '\\tuning E4 B3 G3 D3 A2 E2',
    '.',
    '12.1.4 15.2.4 14.3.4 12.3.4 |',
    '15.1.2 17.1.2 |',
    '19.1.4 17.1.4 15.1.4 14.1.4 |',
    '12.1.1'
  ].join('\n')
  return btoa(alphaTex)
}

const DAY_MS = 86_400_000

function createInitialTabs(): IGuitarTab[] {
  const now = Date.now()
  return [
    {
      id: 'tab-gp-1',
      name: 'Metallica - Master of Puppets.gp5',
      size: 68420,
      type: 'gp5',
      attributes: {
        displayName: 'Metallica - Master of Puppets',
        artist: 'Metallica',
        title: 'Master of Puppets',
        tuning: 'Standard',
        capo: 0,
        tempo: 212,
        isFavorite: true,
        isLearning: true,
        isLearned: false,
        timesPlayed: 24,
        secondsPlayed: 5420,
        tags: ['Thrash Metal', 'Downpicking', 'Lead Solo'],
        tagColors: {
          'Thrash Metal': '#ef4444',
          Downpicking: '#f59e0b',
          'Lead Solo': '#8b5cf6'
        },
        createdAt: new Date(now - 25 * DAY_MS).toISOString(),
        lastAccessed: new Date(now - 3_600_000).toISOString()
      }
    },
    {
      id: 'tab-pdf-1',
      name: 'Eagles - Hotel California.pdf',
      size: 245120,
      type: 'pdf',
      attributes: {
        displayName: 'Eagles - Hotel California',
        artist: 'Eagles',
        title: 'Hotel California',
        tuning: 'Standard',
        capo: 7,
        tempo: 75,
        isFavorite: true,
        isLearning: false,
        isLearned: true,
        timesPlayed: 18,
        secondsPlayed: 4120,
        tags: ['Classic Rock', 'Acoustic', 'Arpeggios'],
        tagColors: {
          'Classic Rock': '#3b82f6',
          Acoustic: '#10b981',
          Arpeggios: '#06b6d4'
        },
        createdAt: new Date(now - 40 * DAY_MS).toISOString(),
        lastAccessed: new Date(now - 1 * DAY_MS).toISOString()
      }
    },
    {
      id: 'tab-gp-2',
      name: 'Tool - Schism.gp5',
      size: 51200,
      type: 'gp5',
      attributes: {
        displayName: 'Tool - Schism',
        artist: 'Tool',
        title: 'Schism',
        tuning: 'Drop D',
        capo: 0,
        tempo: 108,
        isFavorite: false,
        isLearning: true,
        isLearned: false,
        timesPlayed: 14,
        secondsPlayed: 3180,
        tags: ['Prog Metal', 'Odd Time'],
        tagColors: {
          'Prog Metal': '#6366f1',
          'Odd Time': '#ec4899'
        },
        createdAt: new Date(now - 18 * DAY_MS).toISOString(),
        lastAccessed: new Date(now - 2 * DAY_MS).toISOString()
      }
    },
    {
      id: 'tab-pdf-2',
      name: 'Alice in Chains - Nutshell.pdf',
      size: 184300,
      type: 'pdf',
      attributes: {
        displayName: 'Alice in Chains - Nutshell',
        artist: 'Alice in Chains',
        title: 'Nutshell',
        tuning: 'Half-Step Down',
        capo: 0,
        tempo: 66,
        isFavorite: true,
        isLearning: false,
        isLearned: true,
        timesPlayed: 31,
        secondsPlayed: 6840,
        tags: ['Grunge', 'Acoustic'],
        tagColors: {
          Grunge: '#f97316',
          Acoustic: '#10b981'
        },
        createdAt: new Date(now - 60 * DAY_MS).toISOString(),
        lastAccessed: new Date(now - 3 * DAY_MS).toISOString()
      }
    },
    {
      id: 'tab-gp-3',
      name: 'Led Zeppelin - Kashmir.gp5',
      size: 44900,
      type: 'gp5',
      attributes: {
        displayName: 'Led Zeppelin - Kashmir',
        artist: 'Led Zeppelin',
        title: 'Kashmir',
        tuning: 'DADGAD',
        capo: 0,
        tempo: 80,
        isFavorite: false,
        isLearning: false,
        isLearned: false,
        timesPlayed: 7,
        secondsPlayed: 1520,
        tags: ['Classic Rock'],
        tagColors: {
          'Classic Rock': '#3b82f6'
        },
        createdAt: new Date(now - 12 * DAY_MS).toISOString(),
        lastAccessed: new Date(now - 5 * DAY_MS).toISOString()
      }
    },
    {
      id: 'tab-txt-1',
      name: 'Polyphia - Playing God Notes.txt',
      size: 4120,
      type: 'txt',
      attributes: {
        displayName: 'Polyphia - Playing God Notes',
        artist: 'Polyphia',
        title: 'Playing God',
        tuning: 'Standard',
        capo: 0,
        tempo: 137,
        isFavorite: false,
        isLearning: true,
        isLearned: false,
        timesPlayed: 9,
        secondsPlayed: 1940,
        tags: ['Hybrid Picking'],
        tagColors: {
          'Hybrid Picking': '#14b8a6'
        },
        createdAt: new Date(now - 7 * DAY_MS).toISOString(),
        lastAccessed: new Date(now - 4 * DAY_MS).toISOString()
      }
    }
  ]
}

function createInitialSessions(): IPlaySession[] {
  const now = Date.now()
  return [
    {
      id: 's-1',
      ts: new Date(now - 3_600_000).toISOString(),
      fid: 'tab-gp-1',
      fn: 'Metallica - Master of Puppets',
      dur: 1420
    },
    {
      id: 's-2',
      ts: new Date(now - 7_200_000).toISOString(),
      fid: 'tab-pdf-1',
      fn: 'Eagles - Hotel California',
      dur: 940
    },
    {
      id: 's-3',
      ts: new Date(now - 1 * DAY_MS).toISOString(),
      fid: 'tab-gp-2',
      fn: 'Tool - Schism',
      dur: 1680
    },
    {
      id: 's-4',
      ts: new Date(now - 2 * DAY_MS).toISOString(),
      fid: 'tab-pdf-2',
      fn: 'Alice in Chains - Nutshell',
      dur: 2100
    },
    {
      id: 's-5',
      ts: new Date(now - 3 * DAY_MS).toISOString(),
      fid: 'tab-gp-1',
      fn: 'Metallica - Master of Puppets',
      dur: 1850
    },
    {
      id: 's-6',
      ts: new Date(now - 4 * DAY_MS).toISOString(),
      fid: 'tab-gp-3',
      fn: 'Led Zeppelin - Kashmir',
      dur: 1120
    },
    {
      id: 's-7',
      ts: new Date(now - 6 * DAY_MS).toISOString(),
      fid: 'tab-pdf-1',
      fn: 'Eagles - Hotel California',
      dur: 1540
    },
    {
      id: 's-8',
      ts: new Date(now - 8 * DAY_MS).toISOString(),
      fid: 'tab-txt-1',
      fn: 'Polyphia - Playing God Notes',
      dur: 890
    },
    {
      id: 's-9',
      ts: new Date(now - 10 * DAY_MS).toISOString(),
      fid: 'tab-gp-1',
      fn: 'Metallica - Master of Puppets',
      dur: 2150
    }
  ]
}

export class MockMegaService implements IGlobalApi {
  private authenticated: boolean
  private tabs: IGuitarTab[] = createInitialTabs()
  private settings: ISettings = {
    defaultSortMode: 'alpha',
    defaultSortDirection: 'asc',
    pdfAlwaysFullscreen: false
  }
  private sessions: IPlaySession[] = createInitialSessions()

  constructor(initialAuthenticated = true) {
    this.authenticated = initialAuthenticated
    ;(window as unknown as Record<string, unknown>).__DEBUG__ = {
      getMockTabs: () => this.tabs,
      getMockSettings: () => this.settings,
      getMockSessions: () => this.sessions,
      mockService: this
    }
  }

  async checkAuth(): Promise<boolean> {
    return this.authenticated
  }

  async login(_creds: ILoginCredentials): Promise<{ success: boolean; error?: string }> {
    void _creds
    this.authenticated = true
    return { success: true }
  }

  async logout(): Promise<void> {
    this.authenticated = false
  }

  async getFiles(): Promise<IGuitarTab[]> {
    return this.tabs.map((t) => ({ ...t, attributes: { ...t.attributes } }))
  }

  async uploadFile(
    file: File,
    _filePath: string,
    fileName: string,
    attributes: ITabAttributes
  ): Promise<{ success: boolean; error?: string }> {
    const ext = (fileName || '').split('.').pop()?.toLowerCase() || 'other'
    const type: IGuitarTab['type'] = ext === 'pdf' || ext === 'gp5' || ext === 'txt' ? ext : 'other'
    this.tabs.push({
      id: `tab-mock-${Date.now()}`,
      name: fileName,
      size: file?.size || 1024,
      type,
      attributes: { ...attributes }
    })
    return { success: true }
  }

  async deleteFile(id: string): Promise<{ success: boolean; error?: string }> {
    this.tabs = this.tabs.filter((t) => t.id !== id)
    return { success: true }
  }

  async renameFile(id: string, newName: string): Promise<{ success: boolean; error?: string }> {
    const found = this.tabs.find((t) => t.id === id)
    if (!found) return { success: false, error: 'File not found' }
    found.name = newName
    return { success: true }
  }

  async updateAttributes(
    id: string,
    attributes: ITabAttributes
  ): Promise<{ success: boolean; error?: string }> {
    const found = this.tabs.find((t) => t.id === id)
    if (!found) return { success: false, error: 'File not found' }
    found.attributes = { ...found.attributes, ...attributes }
    return { success: true }
  }

  getFilePath(): string {
    return ''
  }

  async openFile(
    _id: string,
    name: string
  ): Promise<{ success: boolean; data?: string; mimeType?: string; error?: string }> {
    const lower = (name || '').toLowerCase()
    if (lower.endsWith('.pdf')) {
      return {
        success: true,
        data: createSamplePdfBase64(),
        mimeType: 'application/pdf'
      }
    }
    if (
      lower.endsWith('.gp3') ||
      lower.endsWith('.gp4') ||
      lower.endsWith('.gp5') ||
      lower.endsWith('.gpx') ||
      lower.endsWith('.gp')
    ) {
      return {
        success: true,
        data: createSampleGpBase64(),
        mimeType: 'application/x-guitar-pro'
      }
    }
    return { success: true }
  }

  async downloadFile(): Promise<{ success: boolean; canceled?: boolean; error?: string }> {
    return { success: true }
  }

  async getSettings(): Promise<ISettings> {
    return { ...this.settings }
  }

  async saveSettings(settings: ISettings): Promise<{ success: boolean; error?: string }> {
    this.settings = { ...this.settings, ...settings }
    return { success: true }
  }

  async getPlaySessions(): Promise<IPlaySession[]> {
    return [...this.sessions]
  }

  async savePlaySessions(sessions: IPlaySession[]): Promise<{ success: boolean; error?: string }> {
    this.sessions = [...sessions]
    return { success: true }
  }
}
