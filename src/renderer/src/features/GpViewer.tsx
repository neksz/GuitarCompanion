import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as alphaTab from '@coderline/alphatab'
import { jsPDF } from 'jspdf'
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  Flame,
  X,
  Clock,
  SlidersHorizontal,
  Layers,
  Gauge,
  Music,
  Hash,
  Repeat,
  Timer,
  Download,
  Loader2
} from 'lucide-react'
import { useWakeLock } from '../utils/useWakeLock'
import { api as globalApi } from '../services/api'
import { useMetronomeStore } from '../utils/useMetronomeStore'

interface GpViewerProps {
  data: ArrayBuffer | Uint8Array | string
  name: string
  tab?: {
    id: string
    name?: string
    attributes?: { tempo?: number; [key: string]: unknown }
  } | null
  initialSecondsPlayed?: number
  onClose: (elapsedSeconds?: number) => void
}

function formatSessionTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatTotalTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatPlaybackTime(millis: number): string {
  const totalSecs = Math.max(0, Math.floor(millis / 1000))
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

type ColorMode = 'default' | 'dark' | 'sepia'
type StaveProfileMode = 'tab' | 'scoretab' | 'score'

function getAlphaTabStaveProfile(mode: StaveProfileMode): alphaTab.StaveProfile {
  switch (mode) {
    case 'scoretab':
      return alphaTab.StaveProfile.ScoreTab
    case 'score':
      return alphaTab.StaveProfile.Score
    case 'tab':
    default:
      return alphaTab.StaveProfile.Tab
  }
}

function getRecognizedTuningName(notesStr: string, staffTuningName?: string): string {
  const normalized = notesStr.toUpperCase().replace(/\s+/g, ' ').trim()

  const knownTunings: Record<string, string> = {
    // 6-string guitar
    'E A D G B E': 'Standard',
    'D A D G B E': 'Drop D',
    'D A D G A D': 'DADGAD',
    'EB AB DB GB BB EB': 'Half-Step Down',
    'D# G# C# F# A# D#': 'Half-Step Down',
    'D G C F A D': 'D Standard',
    'C G C F A D': 'Drop C',
    'C# F# B E G# C#': 'C# Standard',
    'DB GB B E AB DB': 'Db Standard',
    'B F# B E G# C#': 'Drop B',
    'B GB B E AB DB': 'Drop B',
    'A# D# G# C# F A#': 'Bb Standard',
    'BB EB AB DB F BB': 'Bb Standard',
    'A# F A# D# G C': 'Drop A#',
    'BB F BB EB G C': 'Drop Bb',
    'A E A D F# B': 'Drop A',
    'A E A D GB B': 'Drop A',
    'D A D F# A D': 'Open D',
    'D A D GB A D': 'Open D',
    'E B E G# B E': 'Open E',
    'E B E AB B E': 'Open E',
    'D G D G B D': 'Open G',
    'E A E A C# E': 'Open A',
    'E A E A DB E': 'Open A',
    'C G C G C E': 'Open C',
    'D A D F A D': 'D Minor Tuning',

    // 7-string guitar
    'B E A D G B E': '7-String Standard',
    'A E A D G B E': 'Drop A',

    // 8-string guitar
    'F# B E A D G B E': '8-String Standard',
    'GB B E A D G B E': '8-String Standard',
    'E B E A D G B E': 'Drop E',

    // 4-string bass
    'E A D G': 'Bass Standard',
    'D A D G': 'Bass Drop D',

    // 5-string bass
    'B E A D G': '5-String Bass Standard'
  }

  const name = knownTunings[normalized]
  if (name) {
    return `${name} (${notesStr})`
  }

  if (
    staffTuningName &&
    !staffTuningName.toLowerCase().includes('standard') &&
    staffTuningName.toLowerCase() !== 'custom'
  ) {
    return `${staffTuningName} (${notesStr})`
  }

  return notesStr
}

interface TrackOption {
  index: number
  name: string
  instrument?: string
}

interface PendingLoopRange {
  startBeat: alphaTab.model.Beat
  endBeat: alphaTab.model.Beat
  label: string
}

export const GpViewer: React.FC<GpViewerProps> = ({
  data,
  name,
  tab,
  initialSecondsPlayed = 0,
  onClose
}) => {
  // Prevent mobile & desktop screen from sleeping / dimming while viewing / playing Guitar Pro score
  useWakeLock(true)

  const tabRef = useRef(tab)
  useEffect(() => {
    tabRef.current = tab
  }, [tab])

  const sessionSecondsRef = useRef<number>(0)
  const [sessionSeconds, setSessionSeconds] = useState<number>(0)

  // Live session timer (only counts when app is active & visible)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        sessionSecondsRef.current += 1
        setSessionSeconds(sessionSecondsRef.current)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerContainerRef = useRef<HTMLDivElement | null>(null)
  const viewerBodyRef = useRef<HTMLElement | null>(null)
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null)
  const targetScrollTopRef = useRef<number>(0)
  const userInteractingUntilRef = useRef<number>(0)

  // Section Looping State & Refs
  const [isLooping, setIsLooping] = useState<boolean>(false)
  const [loopRangeLabel, setLoopRangeLabel] = useState<string>('')
  const [showLoopPopup, setShowLoopPopup] = useState<boolean>(false)
  const [loopPopupPosition, setLoopPopupPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0
  })
  const [pendingLoopRange, setPendingLoopRange] = useState<PendingLoopRange | null>(null)

  const selectionStartBeatRef = useRef<alphaTab.model.Beat | null>(null)
  const selectionEndBeatRef = useRef<alphaTab.model.Beat | null>(null)
  const isDraggingRef = useRef<boolean>(false)
  const lastMousePosRef = useRef<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 400,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 300
  })
  const seekToBeatRef = useRef<(beat: alphaTab.model.Beat) => void>(() => {})

  // Mobile long-press selection refs
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressActiveRef = useRef<boolean>(false)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)

  // Track global mouse position for positioning the loop popup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [scoreTitle, setScoreTitle] = useState<string>('')
  const [scoreArtist, setScoreArtist] = useState<string>('')
  const [tracks, setTracks] = useState<TrackOption[]>([])
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(0)
  const [currentTuning, setCurrentTuning] = useState<string>('')
  const [currentCapo, setCurrentCapo] = useState<number>(0)

  // Helper to extract tuning and capo from a track
  const updateTrackMeta = useCallback((track: alphaTab.model.Track | undefined): void => {
    if (!track || !track.staves || track.staves.length === 0) {
      setCurrentTuning('')
      setCurrentCapo(0)
      return
    }

    // Check all staves on the track for capo setting
    let detectedCapo = 0
    for (const s of track.staves) {
      if (typeof s.capo === 'number' && s.capo > 0) {
        detectedCapo = s.capo
        break
      }
    }

    // Fallback: check track/score annotations for text like "Capo 3" or "Capo on fret 2"
    if (detectedCapo === 0 && track.score) {
      const combinedText = `${track.name || ''} ${track.score.subTitle || ''} ${track.score.notices || ''}`
      const match = combinedText.match(/capo\s*(?:fret|on|at|:)?\s*([0-9]+)/i)
      if (match) {
        const val = parseInt(match[1], 10)
        if (!isNaN(val) && val > 0 && val <= 24) {
          detectedCapo = val
        }
      }
    }

    setCurrentCapo(detectedCapo)

    const staff = track.staves[0]
    if (staff.isPercussion) {
      setCurrentTuning('Drums')
    } else if (staff.tuning && staff.tuning.length > 0) {
      try {
        // alphaTab stores tuning from highest string (1) to lowest string (N).
        // Reverse so tuning is displayed in standard musical order: lowest string to highest string (e.g. E A D G B E)
        const lowToHighTuning = [...staff.tuning].reverse()
        const noteNames = lowToHighTuning.map((midiNote) =>
          alphaTab.model.Tuning.getTextForTuning(midiNote, false)
        )
        const notesStr = noteNames.join(' ')
        const tuningName = staff.tuningName || staff.stringTuning?.name
        setCurrentTuning(getRecognizedTuningName(notesStr, tuningName))
      } catch {
        setCurrentTuning(staff.tuningName || 'Standard (E A D G B E)')
      }
    } else {
      setCurrentTuning(staff.tuningName || 'Standard (E A D G B E)')
    }
  }, [])

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0)
  const [totalTimeMs, setTotalTimeMs] = useState<number>(0)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0)
  const [volume, setVolume] = useState<number>(1.0)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const volumeRef = useRef<number>(1.0)
  const isMutedRef = useRef<boolean>(false)
  const [isSoundFontLoaded, setIsSoundFontLoaded] = useState<boolean>(false)

  // Metronome State with persistent preference
  const [isMetronomeActive, setIsMetronomeActiveState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('guitar_gp_metronome')
      return saved === 'true'
    } catch {
      return false
    }
  })
  const isMetronomeActiveRef = useRef<boolean>(isMetronomeActive)

  const toggleMetronome = useCallback(() => {
    const nextState = !isMetronomeActiveRef.current
    isMetronomeActiveRef.current = nextState
    setIsMetronomeActiveState(nextState)
    try {
      localStorage.setItem('guitar_gp_metronome', String(nextState))
    } catch {
      // ignore
    }
    const api = apiRef.current
    if (api) {
      api.metronomeVolume = nextState ? 1 : 0
    }
  }, [])

  // Display state
  const [zoom, setZoom] = useState<number>(1.0)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState<boolean>(false)

  // Stave / Notation Profile (defaults to 'tab' to disable pitch / standard notation staff)
  const [staveProfile, setStaveProfileState] = useState<StaveProfileMode>(() => {
    try {
      const saved = localStorage.getItem('guitar_gp_stave_profile')
      if (saved === 'tab' || saved === 'scoretab' || saved === 'score') {
        return saved
      }
    } catch {
      // ignore
    }
    return 'tab'
  })
  const staveProfileRef = useRef<StaveProfileMode>(staveProfile)

  const handleStaveProfileChange = useCallback((mode: StaveProfileMode) => {
    staveProfileRef.current = mode
    setStaveProfileState(mode)
    try {
      localStorage.setItem('guitar_gp_stave_profile', mode)
    } catch {
      // ignore
    }
    const api = apiRef.current
    if (api) {
      api.settings.display.staveProfile = getAlphaTabStaveProfile(mode)
      if (api.score) {
        api.score.tracks.forEach((t) => {
          t.staves?.forEach((s) => {
            if (mode === 'scoretab') {
              s.showStandardNotation = true
              s.showTablature = true
            } else if (mode === 'score') {
              s.showStandardNotation = true
              s.showTablature = false
            } else {
              s.showStandardNotation = false
              s.showTablature = true
            }
          })
        })
      }
      api.updateSettings()
      api.render()
    }
  }, [])

  // PDF Export Modal State & Handlers
  const [showExportModal, setShowExportModal] = useState<boolean>(false)
  const [exportStaveProfile, setExportStaveProfile] = useState<StaveProfileMode>('tab')
  const [isExporting, setIsExporting] = useState<boolean>(false)

  const handleOpenExportModal = useCallback(() => {
    setExportStaveProfile(staveProfileRef.current)
    setShowExportModal(true)
    setIsMobileToolsOpen(false)
  }, [])

  const handleExportPdf = useCallback(async () => {
    const currentAlphaTab = apiRef.current
    if (!currentAlphaTab || !currentAlphaTab.score) return

    setIsExporting(true)
    let container: HTMLDivElement | null = null
    let offscreenApi: alphaTab.AlphaTabApi | null = null
    try {
      const activeTitle = scoreTitle || name.replace(/\.(gp[345x]?|gp)$/i, '')
      const activeTracks =
        currentAlphaTab.tracks.length > 0
          ? currentAlphaTab.tracks
          : [currentAlphaTab.score.tracks[0]]

      // Create an offscreen container for clean A4 engraving
      container = document.createElement('div')
      container.style.width = '210mm'
      container.style.position = 'fixed'
      container.style.left = '-99999px'
      container.style.top = '-99999px'
      container.style.opacity = '0'
      container.style.pointerEvents = 'none'

      // CRITICAL FIX: Force black text color so the canvas engine doesn't inherit dark mode colors
      container.style.color = '#000000'

      document.body.appendChild(container)

      const settings = new alphaTab.Settings()
      settings.core.engine = 'svg'
      settings.core.fontDirectory = './font/'
      settings.core.useWorkers = false
      settings.core.enableLazyLoading = false
      settings.display.layoutMode = alphaTab.LayoutMode.Page
      settings.display.scale = 0.8
      settings.display.stretchForce = 0.8
      settings.display.staveProfile = getAlphaTabStaveProfile(exportStaveProfile)
      settings.notation.elements.set(alphaTab.NotationElement.ScoreTitle, true)
      settings.notation.elements.set(alphaTab.NotationElement.ScoreSubTitle, true)
      settings.notation.elements.set(alphaTab.NotationElement.ScoreArtist, true)
      settings.notation.elements.set(alphaTab.NotationElement.ScoreAlbum, true)
      settings.notation.elements.set(alphaTab.NotationElement.ScoreMusic, true)
      settings.notation.elements.set(alphaTab.NotationElement.ScoreWords, true)
      settings.notation.elements.set(alphaTab.NotationElement.GuitarTuning, true)
      settings.notation.elements.set(alphaTab.NotationElement.EffectCapo, true)
      settings.player.enablePlayer = false
      settings.player.enableCursor = false
      settings.player.enableElementHighlighting = false
      settings.player.enableUserInteraction = false
      settings.player.soundFont = null

      // CRITICAL FIX:
      // If we are in Electron (globalApi.savePdfFromHtml exists), use the 'svg' engine because
      // Chromium's native printToPDF handles SVGs perfectly and produces searchable vector PDFs.
      // If we are on the Web, use the 'html5' engine! This bypasses all of Chrome's aggressive
      // Image-sandbox font blocking issues by drawing the symbols natively in the DOM to <canvas>.
      const isElectron = typeof globalApi !== 'undefined' && !!globalApi.savePdfFromHtml
      settings.core.engine = isElectron ? 'svg' : 'html5'

      // Configure staff flags for the chosen export notation style
      activeTracks.forEach((t) => {
        t.staves?.forEach((s) => {
          if (exportStaveProfile === 'scoretab') {
            s.showStandardNotation = true
            s.showTablature = true
          } else if (exportStaveProfile === 'score') {
            s.showStandardNotation = true
            s.showTablature = false
          } else {
            s.showStandardNotation = false
            s.showTablature = true
          }
        })
      })

      const apiInstance = new alphaTab.AlphaTabApi(container, settings)
      offscreenApi = apiInstance

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve()
        }, 8000)

        apiInstance.renderer.postRenderFinished.on(() => {
          clearTimeout(timeout)
          setTimeout(resolve, 150) // Give the canvas an extra moment to ensure fonts are fully painted
        })

        apiInstance.error.on((err) => {
          clearTimeout(timeout)
          reject(err)
        })

        apiInstance.renderTracks(activeTracks)
      })

      // Capture alphaTab's dynamically injected style rules BEFORE destroying the offscreen API
      const alphaTabStyleEls = Array.from(
        document.querySelectorAll('head style[id^="alphaTabStyle"]')
      )
      const alphaTabStyles = alphaTabStyleEls.map((s) => s.innerHTML).join('\n')

      const renderedScoreHtml = container.innerHTML

      // Restore active viewport staff flags
      activeTracks.forEach((t) => {
        t.staves?.forEach((s) => {
          if (staveProfileRef.current === 'scoretab') {
            s.showStandardNotation = true
            s.showTablature = true
          } else if (staveProfileRef.current === 'score') {
            s.showStandardNotation = true
            s.showTablature = false
          } else {
            s.showStandardNotation = false
            s.showTablature = true
          }
        })
      })

      if (isElectron) {
        // Generate tuning and capo metadata badge for the top of page 1
        const metaItems: string[] = []
        metaItems.push(
          `<span><strong>Tuning:</strong> ${currentTuning || 'Standard (E A D G B E)'}</span>`
        )
        metaItems.push(
          `<span><strong>Capo:</strong> ${currentCapo > 0 ? `Fret ${currentCapo}` : 'None'}</span>`
        )
        const metaBadgeHtml = `<div class="pdf-meta-badge">${metaItems.join('')}</div>`

        const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeTitle}${scoreArtist ? ` - ${scoreArtist}` : ''}</title>
  <style>
    ${alphaTabStyles}
    @font-face {
      font-display: block;
      font-family: 'alphaTab';
      src: url('./font/Bravura.woff2') format('woff2');
    }
    @page {
      size: A4 portrait;
      margin: 8mm 0 8mm 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      height: auto !important;
      min-height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .pdf-meta-badge {
      position: relative;
      margin: 0 0 3px 6mm;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 8.5pt;
      color: #555555;
      line-height: 1.3;
      z-index: 10;
    }
    .pdf-meta-badge span {
      display: inline-block;
      margin-right: 14px;
    }
    .pdf-meta-badge strong {
      color: #333333;
      font-weight: 600;
    }
    .at-surface {
      width: 210mm !important;
      height: auto !important;
      min-height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      margin: 0 auto !important;
      padding: 0 !important;
    }
    .at-surface > div {
      position: relative !important;
      left: auto !important;
      top: auto !important;
      display: block !important;
      width: 100% !important;
      height: auto !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      margin-bottom: 6px !important;
    }
    svg {
      display: block !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
  </style>
</head>
<body>
  <div style="width: 210mm; margin: 0 auto; padding: 0;">
    ${metaBadgeHtml}
    ${renderedScoreHtml}
  </div>
</body>
</html>`

        if (globalApi && globalApi.savePdfFromHtml) {
          const res = await globalApi.savePdfFromHtml(fullHtml, activeTitle)
          if (res.success) {
            setShowExportModal(false)
          }
        }
      } else {
        // Web / PWA Direct PDF Generation using native Canvas Engine + jsPDF
        const canvases = Array.from(container.querySelectorAll('canvas'))

        if (canvases.length > 0) {
          const doc = new jsPDF({
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
          })

          // Page 1 header with tuning and capo metadata
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8.5)
          doc.setTextColor(60, 60, 60)
          let metaX = 10
          doc.text(`Tuning: ${currentTuning || 'Standard (E A D G B E)'}`, metaX, 9)
          metaX += 65
          doc.text(`Capo: ${currentCapo > 0 ? `Fret ${currentCapo}` : 'None'}`, metaX, 9)

          let currentY = 13
          const maxPageY = 285
          const printWidthMm = 190

          for (let i = 0; i < canvases.length; i++) {
            const canvas = canvases[i]

            // Calculate exact aspect ratio to fit the A4 page gracefully
            const canvasAspect = canvas.height / (canvas.width || 1)
            const printHeightMm = printWidthMm * canvasAspect

            if (currentY + printHeightMm > maxPageY && i > 0) {
              doc.addPage('a4', 'p')
              currentY = 10
            }

            try {
              // Create a temporary canvas to apply a solid white background
              // because the alphaTab canvas is transparent and JPEG defaults to pitch black!
              const whiteCanvas = document.createElement('canvas')
              whiteCanvas.width = canvas.width
              whiteCanvas.height = canvas.height
              const ctx = whiteCanvas.getContext('2d')

              if (ctx) {
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(0, 0, whiteCanvas.width, whiteCanvas.height)
                ctx.drawImage(canvas, 0, 0)

                // Convert native canvas directly to a high-quality JPEG
                const imgData = whiteCanvas.toDataURL('image/jpeg', 0.95)
                doc.addImage(imgData, 'JPEG', 10, currentY, printWidthMm, printHeightMm)
              }
            } catch (renderErr) {
              console.warn('[GpViewer] Native canvas conversion failed on stave:', renderErr)
            }

            currentY += printHeightMm + 2
          }

          const sanitizedName = (activeTitle || 'tab').replace(/[/\\?%*:|"<>]/g, '_').trim()
          const fileName = `${sanitizedName}.pdf`

          const pdfBlob = doc.output('blob')

          // Determine if running as an installed PWA (standalone/fullscreen display mode)
          const isPwa =
            window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches ||
            (window.navigator as { standalone?: boolean }).standalone === true

          // Determine if running on Android
          const isAndroid = /android/i.test(window.navigator.userAgent)

          let downloaded = false

          // On Android PWA, anchor-click downloads and window.open are both blocked.
          // The Web Share API with files is the proper way to offer a file to the user.
          if (isPwa && isAndroid && navigator.canShare) {
            try {
              const file = new File([pdfBlob], fileName, { type: 'application/pdf' })
              if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: fileName })
                downloaded = true
              }
            } catch (shareErr: unknown) {
              // AbortError = user cancelled the share sheet, which is fine
              if (
                shareErr &&
                typeof shareErr === 'object' &&
                'name' in shareErr &&
                (shareErr as { name: string }).name === 'AbortError'
              ) {
                downloaded = true
              } else {
                console.warn('[GpViewer] Web Share API failed, falling back to download:', shareErr)
              }
            }
          }

          // Standard anchor-click download — works on desktop, Electron, and non-PWA browsers
          if (!downloaded) {
            const blobUrl = URL.createObjectURL(pdfBlob)
            const link = document.createElement('a')
            link.href = blobUrl
            link.download = fileName
            link.style.display = 'none'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
          }

          setShowExportModal(false)
        } else {
          console.warn('[GpViewer] No SVGs found in rendered score')
          setShowExportModal(false)
        }
      }
    } catch (err) {
      console.error('[GpViewer] Direct PDF export failed:', err)
      setShowExportModal(false)
    } finally {
      try {
        offscreenApi?.destroy()
      } catch {
        // ignore
      }
      try {
        container?.remove()
      } catch {
        // ignore
      }
      setIsExporting(false)
    }
  }, [name, scoreTitle, scoreArtist, exportStaveProfile, currentTuning, currentCapo])

  // Color Mode (Stage / Night Theme) with persistent preference
  const [colorMode, setColorModeState] = useState<ColorMode>(() => {
    try {
      const saved = localStorage.getItem('guitar_gp_color_mode')
      if (saved === 'default' || saved === 'dark' || saved === 'sepia') {
        return saved
      }
    } catch {
      // ignore
    }
    return 'dark'
  })

  const setColorMode = useCallback((mode: ColorMode | ((prev: ColorMode) => ColorMode)) => {
    setColorModeState((prev) => {
      const next = typeof mode === 'function' ? mode(prev) : mode
      try {
        localStorage.setItem('guitar_gp_color_mode', next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  // Listen for user manual scroll interaction to temporarily yield auto-scroll
  useEffect(() => {
    const body = viewerBodyRef.current
    if (!body) return

    const handleUserInteraction = (): void => {
      userInteractingUntilRef.current = Date.now() + 2000
    }

    body.addEventListener('wheel', handleUserInteraction, { passive: true })
    body.addEventListener('touchstart', handleUserInteraction, { passive: true })

    return () => {
      body.removeEventListener('wheel', handleUserInteraction)
      body.removeEventListener('touchstart', handleUserInteraction)
    }
  }, [])

  // Helper to align score scroll position to the active cursor
  const alignScrollToCursor = useCallback((smooth: boolean = false): void => {
    const scrollContainer = viewerBodyRef.current
    if (!scrollContainer) return

    const cursor = scrollContainer.querySelector(
      '.at-cursor-beat, .at-cursor-bar'
    ) as HTMLElement | null

    if (cursor) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const cursorRect = cursor.getBoundingClientRect()
      const cursorTopRelativeToContent =
        scrollContainer.scrollTop + (cursorRect.top - containerRect.top)

      // Measure bottom player bar height dynamically
      const playerBar = document.querySelector('.gp-player-bar') as HTMLElement | null
      const playerBarHeight = playerBar ? playerBar.offsetHeight : 80

      // Safe visible height between container top and top edge of bottom player bar
      const safeVisibleHeight = Math.max(100, containerRect.height - playerBarHeight)

      // Center the active cursor in the upper-middle of the safe visible zone
      let target = Math.max(0, cursorTopRelativeToContent - safeVisibleHeight * 0.35)

      // HARD CLEARANCE: Ensure the full cursor height (including tablature numbers)
      // is strictly kept above the bottom player bar with at least 32px of clearance
      const currentCursorBottomRelativeToContainer = cursorRect.bottom - containerRect.top
      const maxAllowedBottom = containerRect.height - playerBarHeight - 32
      if (currentCursorBottomRelativeToContainer > maxAllowedBottom) {
        const overflow = currentCursorBottomRelativeToContainer - maxAllowedBottom
        target = Math.max(target, scrollContainer.scrollTop + overflow)
      }

      targetScrollTopRef.current = target
      if (smooth) {
        scrollContainer.scrollTo({ top: target, behavior: 'smooth' })
      } else {
        scrollContainer.scrollTop = target
      }
    }
  }, [])

  // Auto re-render on window resize to ensure full width utilization & cursor visibility
  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>
    const handleResize = (): void => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const api = apiRef.current
        if (api) {
          api.render()
        }
        alignScrollToCursor(true)
      }, 150)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimer)
    }
  }, [alignScrollToCursor])

  // Gradual continuous auto-scroll animation loop
  useEffect(() => {
    if (!isPlaying) return

    let animId: number
    const animateScroll = (): void => {
      const scrollContainer = viewerBodyRef.current
      if (scrollContainer && Date.now() > userInteractingUntilRef.current) {
        // Locate the active cursor beat or bar
        const cursor = scrollContainer.querySelector(
          '.at-cursor-beat, .at-cursor-bar'
        ) as HTMLElement | null

        if (cursor) {
          const containerRect = scrollContainer.getBoundingClientRect()
          const cursorRect = cursor.getBoundingClientRect()
          const cursorTopRelativeToContent =
            scrollContainer.scrollTop + (cursorRect.top - containerRect.top)

          // Measure bottom player bar height dynamically
          const playerBar = document.querySelector('.gp-player-bar') as HTMLElement | null
          const playerBarHeight = playerBar ? playerBar.offsetHeight : 80

          // Safe visible height between container top and top edge of bottom player bar
          const safeVisibleHeight = Math.max(100, containerRect.height - playerBarHeight)

          // Measure horizontal progress across the current stave line (0.0 to 1.0)
          const surface = scrollContainer.querySelector(
            '.at-surface, .at-viewport'
          ) as HTMLElement | null
          const surfaceRect = surface ? surface.getBoundingClientRect() : containerRect
          const scoreLeft = surfaceRect.left + 24
          const scoreRight = surfaceRect.right - 28
          const scoreWidth = Math.max(200, scoreRight - scoreLeft)
          const cursorX = cursorRect.left + cursorRect.width * 0.5
          const lineProgress = Math.max(0, Math.min(1, (cursorX - scoreLeft) / scoreWidth))

          // PREDICTIVE SCROLLING:
          // When the cursor is >= 80% done with the current line, start smoothly gliding down
          // to bring the next line into comfortable reading view before the cursor wraps.
          let predictiveOffset = 0
          if (lineProgress >= 0.78) {
            const transitionRatio = (lineProgress - 0.78) / 0.22 // 0.0 at 78% -> 1.0 at 100%
            const nextLineDistance = cursorRect.height > 50 ? cursorRect.height + 40 : 160
            predictiveOffset = transitionRatio * nextLineDistance
          }

          // Base target centered in the upper-middle of the safe visible zone + predictive offset
          let target = Math.max(
            0,
            cursorTopRelativeToContent - safeVisibleHeight * 0.35 + predictiveOffset
          )

          // HARD CLEARANCE: Ensure the full cursor height (including tablature numbers)
          // is strictly kept above the bottom player bar with at least 32px of clearance
          const currentCursorBottomRelativeToContainer = cursorRect.bottom - containerRect.top
          const maxAllowedBottom = containerRect.height - playerBarHeight - 32
          if (currentCursorBottomRelativeToContainer > maxAllowedBottom) {
            const overflow = currentCursorBottomRelativeToContainer - maxAllowedBottom
            target = Math.max(target, scrollContainer.scrollTop + overflow)
          }

          targetScrollTopRef.current = target
        }

        const current = scrollContainer.scrollTop
        const diff = targetScrollTopRef.current - current

        // Only scroll if there is a meaningful difference (avoids micro-jitter on same line)
        if (Math.abs(diff) > 1.0) {
          // Soft lerp with a responsive speed clamp
          const rawStep = diff * 0.03
          const maxStep = Math.max(1.8, 2.5 * playbackSpeed)
          const clampedStep = Math.sign(rawStep) * Math.min(Math.abs(rawStep), maxStep)

          scrollContainer.scrollTop = current + clampedStep
        }
      }
      animId = requestAnimationFrame(animateScroll)
    }

    animId = requestAnimationFrame(animateScroll)
    return () => cancelAnimationFrame(animId)
  }, [isPlaying, playbackSpeed])

  // Edge-scrolling during drag selection (both mouse and touch)
  useEffect(() => {
    let animId: number
    const checkEdgeScroll = (): void => {
      // If user is actively holding down on a beat (selecting/dragging)
      if (selectionStartBeatRef.current !== null) {
        const scrollContainer = viewerBodyRef.current
        if (scrollContainer) {
          const my = lastMousePosRef.current.y

          // Edge zone threshold
          const edgeThreshold = 80
          const maxSpeed = 15

          // Bottom player bar height offset
          const playerBar = document.querySelector('.gp-player-bar') as HTMLElement | null
          const playerBarHeight = playerBar ? playerBar.offsetHeight : 80

          // Use fixed viewport coordinates for extreme stability on mobile
          const visibleTop = 0
          const visibleBottom = window.innerHeight - playerBarHeight

          let scrolled = false

          if (my < visibleTop + edgeThreshold) {
            // Scroll up
            const intensity = Math.max(0.1, 1 - Math.max(0, my - visibleTop) / edgeThreshold)
            scrollContainer.scrollTop -= maxSpeed * intensity
            scrolled = true
          } else if (my > visibleBottom - edgeThreshold) {
            // Scroll down
            const intensity = Math.max(0.1, 1 - Math.max(0, visibleBottom - my) / edgeThreshold)
            scrollContainer.scrollTop += maxSpeed * intensity
            scrolled = true
          }

          if (scrolled) {
            // Because the container scrolled, the element under the physical pointer has changed.
            // We must trigger a mousemove so alphaTab re-evaluates the beat under the pointer.
            const mx = lastMousePosRef.current.x
            const target = document.elementFromPoint(mx, my) || containerRef.current
            if (target) {
              const mouseEvent = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: mx,
                clientY: my,
                buttons: 1
              })
              target.dispatchEvent(mouseEvent)
            }
          }
        }
      }
      animId = requestAnimationFrame(checkEdgeScroll)
    }
    animId = requestAnimationFrame(checkEdgeScroll)
    return () => cancelAnimationFrame(animId)
  }, [])

  // Initialize alphaTab
  useEffect(() => {
    let isMounted = true
    const element = containerRef.current
    if (!element) return

    const handleGlobalMouseUp = (e: MouseEvent | TouchEvent): void => {
      if (!isMounted) return

      try {
        const startBeat = selectionStartBeatRef.current
        if (!startBeat) return // Handled by beatMouseUp or not dragging

        const endBeat = selectionEndBeatRef.current || startBeat

        if (isDraggingRef.current && startBeat !== endBeat) {
          // Range selected globally because they released outside the beat
          const sBar = Math.min(startBeat.voice.bar.index + 1, endBeat.voice.bar.index + 1)
          const eBar = Math.max(startBeat.voice.bar.index + 1, endBeat.voice.bar.index + 1)
          const label = sBar === eBar ? `Bar ${sBar}` : `Bars ${sBar}–${eBar}`

          let popupX = lastMousePosRef.current.x
          let popupY = lastMousePosRef.current.y
          if ('changedTouches' in e && (e as TouchEvent).changedTouches?.length > 0) {
            popupX = (e as TouchEvent).changedTouches[0].clientX
            popupY = (e as TouchEvent).changedTouches[0].clientY
          } else if ('clientX' in e) {
            popupX = (e as MouseEvent).clientX
            popupY = (e as MouseEvent).clientY
          }

          popupX = Math.max(120, Math.min(window.innerWidth - 120, popupX))
          popupY = Math.max(100, Math.min(window.innerHeight - 100, popupY))

          setLoopPopupPosition({ x: popupX, y: popupY })
          setPendingLoopRange({ startBeat, endBeat, label })
          setShowLoopPopup(true)
        } else if (startBeat && !isDraggingRef.current) {
          seekToBeatRef.current(startBeat)
        }
      } finally {
        selectionStartBeatRef.current = null
        selectionEndBeatRef.current = null
        isDraggingRef.current = false
        touchStartPosRef.current = null
      }
    }

    window.addEventListener('mouseup', handleGlobalMouseUp, { capture: true })
    window.addEventListener('touchend', handleGlobalMouseUp, { capture: true })
    window.addEventListener('touchcancel', handleGlobalMouseUp, { capture: true })

    const initPlayer = async (): Promise<void> => {
      try {
        setLoading(true)
        setError(null)

        // Clean up previous instance if any
        if (apiRef.current) {
          try {
            apiRef.current.destroy()
          } catch {
            // ignore
          }
          apiRef.current = null
        }

        // Initialize alphaTab API
        const settings = new alphaTab.Settings()
        settings.core.engine = 'svg'
        settings.core.fontDirectory = './font/'
        settings.core.useWorkers = false
        settings.core.logLevel = alphaTab.LogLevel.Info
        settings.display.scale = 1.0
        settings.display.stretchForce = 1.0
        settings.display.layoutMode = alphaTab.LayoutMode.Page
        settings.display.padding = [24, 20, 28, 40] // [left, top, right, bottom] padding in px
        settings.display.staveProfile = getAlphaTabStaveProfile(staveProfileRef.current)
        settings.notation.elements.set(alphaTab.NotationElement.ScoreTitle, true)
        settings.notation.elements.set(alphaTab.NotationElement.ScoreSubTitle, true)
        settings.notation.elements.set(alphaTab.NotationElement.ScoreArtist, true)
        settings.notation.elements.set(alphaTab.NotationElement.ScoreAlbum, true)
        settings.notation.elements.set(alphaTab.NotationElement.ScoreMusic, true)
        settings.notation.elements.set(alphaTab.NotationElement.ScoreWords, true)
        settings.notation.elements.set(alphaTab.NotationElement.GuitarTuning, true)
        settings.player.enablePlayer = true
        settings.player.enableUserInteraction = false
        settings.player.soundFont = './soundfont/sonivox.sf2'
        // Use our custom RAF gradual smoother instead of default jumpy scrolling
        settings.player.scrollMode = alphaTab.ScrollMode.Off

        const api = new alphaTab.AlphaTabApi(element, settings)
        apiRef.current = api

        // Subscribe to events
        api.scoreLoaded.on((score) => {
          if (!isMounted) return
          setLoading(false)

          const title = score.title || name.replace(/\.(gp[345x]?|gp)$/i, '')
          const artist = score.artist || ''
          setScoreTitle(title)
          setScoreArtist(artist)

          // Apply track volume independently of master so metronome can be heard alone
          const activeVol = isMutedRef.current ? 0 : volumeRef.current
          api.changeTrackVolume(score.tracks, activeVol)
          // Set initial metronome state
          api.metronomeVolume = isMetronomeActiveRef.current ? 1 : 0

          const trackOptions: TrackOption[] = score.tracks.map((t, idx) => ({
            index: idx,
            name: t.name || `Track ${idx + 1}`,
            instrument: t.staves?.[0]?.isPercussion ? 'Drums' : undefined
          }))

          setTracks(trackOptions)
          // Apply initial stave flags according to active profile preference
          score.tracks.forEach((t) => {
            t.staves?.forEach((s) => {
              if (staveProfileRef.current === 'scoretab') {
                s.showStandardNotation = true
                s.showTablature = true
              } else if (staveProfileRef.current === 'score') {
                s.showStandardNotation = true
                s.showTablature = false
              } else {
                s.showStandardNotation = false
                s.showTablature = true
              }
            })
          })

          // Explicitly render the first track and update tuning & capo metadata
          if (score.tracks.length > 0) {
            updateTrackMeta(score.tracks[0])
            api.renderTracks([score.tracks[0]])
          }

          // Auto-save initial tempo from GP score if not already saved in tab metadata
          const currentTab = tabRef.current
          if (currentTab && !currentTab.attributes?.tempo && score.tempo && score.tempo > 0) {
            const initialTempo = Math.round(score.tempo)
            const updatedAttrs = {
              ...(currentTab.attributes || {}),
              tempo: initialTempo
            }
            globalApi
              .updateAttributes(currentTab.id, updatedAttrs)
              .then((res) => {
                if (res?.success) {
                  window.dispatchEvent(
                    new CustomEvent('guitar-companion:tempo-saved', {
                      detail: {
                        tabId: currentTab.id,
                        tempo: initialTempo,
                        attributes: updatedAttrs
                      }
                    })
                  )
                }
              })
              .catch((err) => {
                console.error('[GpViewer] Failed to auto-save initial tempo:', err)
              })
          }
        })

        api.soundFontLoaded.on(() => {
          if (!isMounted) return
          setIsSoundFontLoaded(true)
        })

        api.playerStateChanged.on((args) => {
          if (!isMounted) return
          setIsPlaying(args.state === alphaTab.synth.PlayerState.Playing)
        })

        api.playerPositionChanged.on((args) => {
          if (!isMounted) return
          setCurrentTimeMs(args.currentTime)
          setTotalTimeMs(args.endTime)
        })

        // Beat interaction for click-to-seek and drag-to-loop
        api.beatMouseDown.on((beat) => {
          if (!isMounted) return
          selectionStartBeatRef.current = beat
          selectionEndBeatRef.current = beat
          isDraggingRef.current = false
        })

        api.beatMouseMove.on((beat) => {
          if (!isMounted) return
          const startBeat = selectionStartBeatRef.current
          if (startBeat) {
            if (beat !== startBeat) {
              isDraggingRef.current = true
              selectionEndBeatRef.current = beat
              api.highlightPlaybackRange(startBeat, beat)
            }
          }
        })

        api.beatMouseUp.on((beat) => {
          if (!isMounted) return
          const startBeat = selectionStartBeatRef.current
          const endBeat = selectionEndBeatRef.current || beat

          if (isDraggingRef.current && startBeat && endBeat && startBeat !== endBeat) {
            // Range selected
            const sBar = Math.min(startBeat.voice.bar.index + 1, endBeat.voice.bar.index + 1)
            const eBar = Math.max(startBeat.voice.bar.index + 1, endBeat.voice.bar.index + 1)
            const label = sBar === eBar ? `Bar ${sBar}` : `Bars ${sBar}–${eBar}`

            const popupX = Math.max(
              120,
              Math.min(window.innerWidth - 120, lastMousePosRef.current.x)
            )
            const popupY = Math.max(
              100,
              Math.min(window.innerHeight - 100, lastMousePosRef.current.y)
            )

            setLoopPopupPosition({ x: popupX, y: popupY })
            setPendingLoopRange({ startBeat, endBeat, label })
            setShowLoopPopup(true)
          } else if (startBeat) {
            // Single click - seek to beat
            seekToBeatRef.current(startBeat)
          }

          selectionStartBeatRef.current = null
          selectionEndBeatRef.current = null
          isDraggingRef.current = false
        })

        api.renderFinished.on(() => {
          if (!isMounted) return
          setLoading(false)

          // Ensure the container background expands to cover the entire score length
          const surface = element.querySelector('.at-surface, .at-viewport') as HTMLElement | null
          if (surface) {
            const totalHeight = Math.max(surface.scrollHeight, surface.offsetHeight)
            if (totalHeight > 0) {
              element.style.minHeight = `${totalHeight + 80}px`
            }
          }

          // Align scroll position to cursor immediately upon initial render or re-render
          setTimeout(() => {
            if (isMounted) {
              alignScrollToCursor(false)
            }
          }, 60)
        })

        api.error.on((err) => {
          console.error('[GpViewer] alphaTab error:', err)
          if (!isMounted) return
          setError(err.message || 'Error parsing Guitar Pro file')
          setLoading(false)
        })

        // Load score binary data
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
          api.load(data)
        } else if (typeof data === 'string') {
          if (data.startsWith('blob:') || data.startsWith('http')) {
            const res = await fetch(data)
            const arrayBuf = await res.arrayBuffer()
            api.load(arrayBuf)
          } else {
            // Base64 string
            const binary = atob(data)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i)
            }
            api.load(bytes)
          }
        }
      } catch (err: unknown) {
        console.error('[GpViewer] Init error:', err)
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to initialize notation player'
          setError(msg)
          setLoading(false)
        }
      }
    }

    initPlayer()

    return () => {
      isMounted = false
      window.removeEventListener('mouseup', handleGlobalMouseUp, { capture: true })
      window.removeEventListener('touchend', handleGlobalMouseUp, { capture: true })
      window.removeEventListener('touchcancel', handleGlobalMouseUp, { capture: true })
      if (apiRef.current) {
        try {
          apiRef.current.destroy()
        } catch {
          // ignore
        }
        apiRef.current = null
      }
    }
  }, [data, name, updateTrackMeta, alignScrollToCursor])

  // Track selection
  const handleSelectTrack = useCallback(
    (index: number) => {
      setSelectedTrackIndex(index)
      const api = apiRef.current
      if (api && api.score && api.score.tracks[index]) {
        const track = api.score.tracks[index]
        updateTrackMeta(track)
        api.renderTracks([track])
      }
    },
    [updateTrackMeta]
  )

  // Playback control functions
  const handlePlayPause = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    api.playPause()
  }, [])

  const handleStop = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    api.stop()
    targetScrollTopRef.current = 0
    if (viewerBodyRef.current) {
      viewerBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const handleSpeedChange = useCallback((newSpeed: number) => {
    const speed = Math.max(0.25, Math.min(2.0, Number(newSpeed.toFixed(2))))
    setPlaybackSpeed(speed)
    const api = apiRef.current
    if (api) {
      api.playbackSpeed = speed
    }
  }, [])

  const handleVolumeChange = useCallback((newVol: number) => {
    setVolume(newVol)
    volumeRef.current = newVol
    const muted = newVol === 0
    setIsMuted(muted)
    isMutedRef.current = muted

    const api = apiRef.current
    if (api && api.score) {
      api.changeTrackVolume(api.score.tracks, newVol)
    }
  }, [])

  const handleToggleMute = useCallback(() => {
    const api = apiRef.current
    if (!api || !api.score) return
    if (isMuted) {
      const restored = volume > 0 ? volume : 0.8
      setIsMuted(false)
      isMutedRef.current = false
      api.changeTrackVolume(api.score.tracks, restored)
    } else {
      setIsMuted(true)
      isMutedRef.current = true
      api.changeTrackVolume(api.score.tracks, 0)
    }
  }, [isMuted, volume])

  const seekToBeat = useCallback((beat: alphaTab.model.Beat) => {
    const api = apiRef.current
    if (!api) return
    if (api.tickCache) {
      const tickCache = api.tickCache
      const realStartMasterBarStart = tickCache.getMasterBarStart(beat.voice.bar.masterBar)
      const startBeatPlaybackStart =
        tickCache.getRelativeBeatPlaybackRange(beat)?.startTick ?? beat.playbackStart
      const targetTick = realStartMasterBarStart + startBeatPlaybackStart
      api.tickPosition = targetTick
    } else {
      api.tickPosition = beat.absolutePlaybackStart
    }
    api.clearPlaybackRangeHighlight()
    api.playbackRange = null
    api.isLooping = false
    setIsLooping(false)
    setLoopRangeLabel('')
    setShowLoopPopup(false)
    setPendingLoopRange(null)
  }, [])

  useEffect(() => {
    seekToBeatRef.current = seekToBeat
  }, [seekToBeat])

  const handleApplyLoop = useCallback(() => {
    const api = apiRef.current
    if (!api || !pendingLoopRange) return
    api.applyPlaybackRangeFromHighlight()
    api.isLooping = true
    setIsLooping(true)
    setLoopRangeLabel(pendingLoopRange.label)
    setShowLoopPopup(false)
  }, [pendingLoopRange])

  const handleCancelLoopPopup = useCallback(() => {
    const api = apiRef.current
    if (api) {
      api.clearPlaybackRangeHighlight()
    }
    setShowLoopPopup(false)
    setPendingLoopRange(null)
  }, [])

  const handleClearLoop = useCallback(() => {
    const api = apiRef.current
    if (api) {
      api.playbackRange = null
      api.isLooping = false
      api.clearPlaybackRangeHighlight()
    }
    setIsLooping(false)
    setLoopRangeLabel('')
    setShowLoopPopup(false)
    setPendingLoopRange(null)
  }, [])

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const api = apiRef.current
      if (!api || totalTimeMs <= 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const ratio = Math.max(0, Math.min(1, clickX / rect.width))
      const targetTime = ratio * totalTimeMs
      api.timePosition = targetTime
      api.clearPlaybackRangeHighlight()
      api.playbackRange = null
      api.isLooping = false
      setIsLooping(false)
      setLoopRangeLabel('')
      setShowLoopPopup(false)
      setPendingLoopRange(null)

      // Give a moment for cursor position to update, then update target
      setTimeout(() => {
        const scrollContainer = viewerBodyRef.current
        if (scrollContainer) {
          const cursor = scrollContainer.querySelector(
            '.at-cursor-beat, .at-cursor-bar'
          ) as HTMLElement | null
          if (cursor) {
            const containerRect = scrollContainer.getBoundingClientRect()
            const cursorRect = cursor.getBoundingClientRect()
            const cursorTopRelativeToContent =
              scrollContainer.scrollTop + (cursorRect.top - containerRect.top)
            targetScrollTopRef.current = Math.max(
              0,
              cursorTopRelativeToContent - containerRect.height * 0.35
            )
          }
        }
      }, 50)
    },
    [totalTimeMs]
  )

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      const next = Math.min(+(prev + 0.15).toFixed(2), 2.5)
      const api = apiRef.current
      if (api) {
        api.settings.display.scale = next
        api.updateSettings()
        api.render()
      }
      return next
    })
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = Math.max(+(prev - 0.15).toFixed(2), 0.5)
      const api = apiRef.current
      if (api) {
        api.settings.display.scale = next
        api.updateSettings()
        api.render()
      }
      return next
    })
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1.0)
    const api = apiRef.current
    if (api) {
      api.settings.display.scale = 1.0
      api.updateSettings()
      api.render()
    }
  }, [])

  // Auto-enter fullscreen if enabled in settings
  useEffect(() => {
    const checkAutoFullscreen = (): void => {
      try {
        const alwaysFs = localStorage.getItem('guitar_pdf_always_fullscreen') === 'true'
        if (alwaysFs && !document.fullscreenElement) {
          viewerContainerRef.current?.requestFullscreen?.().catch(() => {})
        }
      } catch {
        // ignore
      }
    }

    checkAutoFullscreen()

    return () => {
      // Exit fullscreen on unmount if we entered it
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [])

  // Stop metronome when opening viewer or closing/unmounting viewer
  useEffect(() => {
    useMetronomeStore.getState().stop()
    return () => {
      useMetronomeStore.getState().stop()
    }
  }, [])

  // Toggle Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      viewerContainerRef.current?.requestFullscreen?.().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(() => {})
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const handleFsChange = (): void => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  const handleClose = useCallback((): void => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
    if (apiRef.current) {
      try {
        apiRef.current.stop()
      } catch {
        // ignore
      }
    }
    useMetronomeStore.getState().stop()
    const elapsed = Math.max(1, sessionSecondsRef.current)
    onClose(elapsed)
  }, [onClose])

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'Escape':
          if (showExportModal) {
            setShowExportModal(false)
          } else if (showLoopPopup) {
            handleCancelLoopPopup()
          } else if (isMobileToolsOpen) {
            setIsMobileToolsOpen(false)
          } else {
            handleClose()
          }
          break
        case ' ':
          e.preventDefault()
          handlePlayPause()
          break
        case 'l':
        case 'L':
          if (isLooping) {
            handleClearLoop()
          } else if (showLoopPopup && pendingLoopRange) {
            handleApplyLoop()
          }
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case '+':
        case '=':
          handleZoomIn()
          break
        case '-':
        case '_':
          handleZoomOut()
          break
        case '0':
          handleZoomReset()
          break
        case '[':
          handleSpeedChange(playbackSpeed - 0.1)
          break
        case ']':
          handleSpeedChange(playbackSpeed + 0.1)
          break
        case 'i':
        case 'I':
          setColorMode((prev) => (prev === 'dark' ? 'default' : 'dark'))
          break
        case 'n':
        case 'N':
          handleStaveProfileChange(
            staveProfile === 'tab' ? 'scoretab' : staveProfile === 'scoretab' ? 'score' : 'tab'
          )
          break
        case 'm':
        case 'M':
          toggleMetronome()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    handleClose,
    handlePlayPause,
    toggleFullscreen,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleSpeedChange,
    playbackSpeed,
    isMobileToolsOpen,
    setColorMode,
    staveProfile,
    handleStaveProfileChange,
    isLooping,
    showLoopPopup,
    pendingLoopRange,
    handleApplyLoop,
    handleCancelLoopPopup,
    handleClearLoop,
    toggleMetronome,
    showExportModal
  ])

  // Mobile Long-Press for Loop Selection
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleTouchStart = (e: TouchEvent): void => {
      if (e.touches.length !== 1) return

      const touch = e.touches[0]
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
      lastMousePosRef.current = { x: touch.clientX, y: touch.clientY }
      isLongPressActiveRef.current = false

      if (touchTimerRef.current) clearTimeout(touchTimerRef.current)

      touchTimerRef.current = setTimeout(() => {
        isLongPressActiveRef.current = true

        // Vibrate to notify user of long press success
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50)
        }

        // Simulate mousedown to start selection
        const target = document.elementFromPoint(touch.clientX, touch.clientY) || container
        const mouseEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: touch.clientX,
          clientY: touch.clientY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          buttons: 1
        })
        target.dispatchEvent(mouseEvent)
      }, 500) // 500ms for long press threshold
    }

    const handleTouchMove = (e: TouchEvent): void => {
      // NOTE: In Chrome DevTools Mobile Simulator, if alphaTab scrolls the initial beat
      // out of view and culls its SVG node, Chrome will silently drop all subsequent
      // touchmove events because the original touch target was detached. This causes the
      // cursor to freeze and the edge-scroll to run infinitely. This is a simulator-only
      // bug; real iOS/Android devices continue streaming touchmove to the window.
      if (e.touches.length > 0) {
        lastMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }

      if (!touchStartPosRef.current) return

      const touch = e.touches[0]

      if (!isLongPressActiveRef.current) {
        // If user moves before timer triggers, cancel long press
        const dx = touch.clientX - touchStartPosRef.current.x
        const dy = touch.clientY - touchStartPosRef.current.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance > 10) {
          if (touchTimerRef.current) {
            clearTimeout(touchTimerRef.current)
            touchTimerRef.current = null
          }
        }
      } else {
        // Long press is active, prevent default scrolling
        if (e.cancelable) {
          e.preventDefault()
        }

        // Simulate mousemove for alphaTab to update range highlight
        const target = document.elementFromPoint(touch.clientX, touch.clientY) || container
        const mouseEvent = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: touch.clientX,
          clientY: touch.clientY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          buttons: 1
        })
        target.dispatchEvent(mouseEvent)
      }
    }

    const handleTouchEnd = (e: TouchEvent): void => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current)
        touchTimerRef.current = null
      }

      if (isLongPressActiveRef.current) {
        const touch = e.changedTouches[0]
        const target = document.elementFromPoint(touch.clientX, touch.clientY) || container
        const mouseEvent = new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: touch.clientX,
          clientY: touch.clientY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          buttons: 0
        })
        target.dispatchEvent(mouseEvent)
      }

      isLongPressActiveRef.current = false
      touchStartPosRef.current = null
    }
    const handleTouchCancel = (e: TouchEvent): void => {
      handleTouchEnd(e)
    }

    // Attach touchstart to container, but move/end to window to survive target detachment
    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true })
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true, capture: true })

    // Aggressive fallback for Chrome Mobile Simulator which drops touchmove when dragging out of bounds
    const handlePointerMove = (e: PointerEvent): void => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointermove', handlePointerMove, { capture: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove, { capture: true })
      window.removeEventListener('touchend', handleTouchEnd, { capture: true })
      window.removeEventListener('touchcancel', handleTouchCancel, { capture: true })
      window.removeEventListener('pointermove', handlePointerMove, { capture: true })
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current)
      }
    }
  }, [])

  const cleanTitle = scoreTitle || name.replace(/\.(gp[345x]?|gp)$/i, '')
  const progressRatio = totalTimeMs > 0 ? (currentTimeMs / totalTimeMs) * 100 : 0

  return (
    <div ref={viewerContainerRef} className={`pdf-viewer-overlay gp-viewer-overlay ${colorMode}`}>
      {/* Top Header Navigation Bar */}
      <header className="pdf-viewer-header">
        {/* Left Section: Title & Practice Timer */}
        <div className="pdf-header-left">
          <div
            className="pdf-timer-badge"
            title={`Session Practice: ${formatSessionTimer(sessionSeconds)}${
              initialSecondsPlayed
                ? ` | Total Playtime: ${formatTotalTime(initialSecondsPlayed + sessionSeconds)}`
                : ''
            }`}
          >
            <Clock size={12} />
            <span>{formatSessionTimer(sessionSeconds)}</span>
          </div>
          {currentTuning && (
            <div className="gp-meta-pill" title={`Tuning: ${currentTuning}`}>
              <span className="gp-meta-label">Tuning:</span>
              <span className="gp-meta-value">{currentTuning}</span>
            </div>
          )}
          {currentCapo > 0 ? (
            <div className="gp-meta-pill capo-active" title={`Capo on Fret ${currentCapo}`}>
              <span className="gp-meta-label">Capo:</span>
              <span className="gp-meta-value">{currentCapo}</span>
            </div>
          ) : (
            <div className="gp-meta-pill" title="No Capo">
              <span className="gp-meta-label">Capo:</span>
              <span className="gp-meta-value">None</span>
            </div>
          )}
          <div className="gp-title-wrap">
            <h2 className="pdf-doc-title" title={cleanTitle}>
              {cleanTitle}
            </h2>
            {scoreArtist && <span className="gp-artist-name">{scoreArtist}</span>}
          </div>
        </div>

        {/* Center Section: Track Selector (Desktop) */}
        {!loading && !error && tracks.length > 0 && (
          <div className="gp-header-center desktop-only">
            <div className="gp-track-selector-pill">
              <Layers size={15} className="gp-pill-icon" />
              <select
                className="gp-track-dropdown"
                value={selectedTrackIndex}
                onChange={(e) => handleSelectTrack(Number(e.target.value))}
                title="Select Instrument Track"
              >
                {tracks.map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.name} {t.instrument ? `(${t.instrument})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Right Section: Tools & Controls */}
        <div className="pdf-header-right">
          {!loading && !error && (
            <>
              {/* Desktop Full Tool Controls */}
              <div className="pdf-desktop-tools">
                {/* Notation / Stave Profile Selector (Pitch vs Tab) */}
                <div className="pdf-tool-group" title="Notation View">
                  <button
                    className={`pdf-tool-btn ${staveProfile === 'tab' ? 'active' : ''}`}
                    onClick={() => handleStaveProfileChange('tab')}
                    title="Tablature Only (Pitch Notation Disabled)"
                  >
                    <Hash size={15} />
                    <span className="btn-text">Tab</span>
                  </button>
                  <button
                    className={`pdf-tool-btn ${staveProfile === 'scoretab' ? 'active' : ''}`}
                    onClick={() => handleStaveProfileChange('scoretab')}
                    title="Standard Pitch Notation + Tablature"
                  >
                    <Music size={15} />
                    <span className="btn-text">Standard + Tab</span>
                  </button>
                  <button
                    className={`pdf-tool-btn ${staveProfile === 'score' ? 'active' : ''}`}
                    onClick={() => handleStaveProfileChange('score')}
                    title="Standard Pitch Notation Only"
                  >
                    <Music size={15} />
                    <span className="btn-text">Standard</span>
                  </button>
                </div>

                {/* Reading Theme Selector */}
                <div className="pdf-tool-group" title="Reading Theme">
                  <button
                    className={`pdf-tool-btn ${colorMode === 'default' ? 'active' : ''}`}
                    onClick={() => setColorMode('default')}
                    title="Standard White Paper"
                  >
                    <Sun size={15} />
                  </button>
                  <button
                    className={`pdf-tool-btn ${colorMode === 'dark' ? 'active' : ''}`}
                    onClick={() => setColorMode('dark')}
                    title="Dark Stage Theme"
                  >
                    <Moon size={15} />
                  </button>
                  <button
                    className={`pdf-tool-btn ${colorMode === 'sepia' ? 'active' : ''}`}
                    onClick={() => setColorMode('sepia')}
                    title="Warm Sepia Paper"
                  >
                    <Flame size={15} />
                  </button>
                </div>

                {/* Zoom Controls */}
                <div className="pdf-tool-group zoom-group">
                  <button
                    className="pdf-tool-btn icon-only"
                    onClick={handleZoomOut}
                    disabled={zoom <= 0.5}
                    title="Zoom Out (-)"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <button
                    className="pdf-tool-btn zoom-indicator"
                    onClick={handleZoomReset}
                    title="Reset Zoom to 100% (0)"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    className="pdf-tool-btn icon-only"
                    onClick={handleZoomIn}
                    disabled={zoom >= 2.5}
                    title="Zoom In (+)"
                  >
                    <ZoomIn size={16} />
                  </button>
                </div>

                {/* Export PDF */}
                <button
                  className="pdf-tool-btn icon-only single-btn"
                  onClick={handleOpenExportModal}
                  title="Export Tab to PDF"
                  aria-label="Export Tab to PDF"
                >
                  <Download size={16} />
                </button>

                {/* Fullscreen Toggle */}
                <button
                  className="pdf-tool-btn icon-only single-btn"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>

              {/* Mobile Quick Tools Toggle Button */}
              <button
                className={`pdf-mobile-tools-btn ${isMobileToolsOpen ? 'active' : ''}`}
                onClick={() => setIsMobileToolsOpen((prev) => !prev)}
                title="Display & Track Options"
                aria-label="Display Controls"
              >
                <SlidersHorizontal size={18} />
              </button>
            </>
          )}

          {/* Close Button */}
          <button
            className="pdf-close-btn"
            onClick={handleClose}
            title="Close Viewer (Esc)"
            aria-label="Close Guitar Pro Viewer"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Mobile Display Options Sheet Modal */}
      {isMobileToolsOpen && !loading && !error && (
        <>
          <div className="pdf-mobile-tools-backdrop" onClick={() => setIsMobileToolsOpen(false)} />
          <div className="pdf-mobile-tools-sheet">
            <div className="pdf-mobile-sheet-header">
              <div className="pdf-mobile-sheet-title-wrap">
                <SlidersHorizontal size={16} className="pdf-sheet-icon" />
                <h3 className="pdf-mobile-sheet-title">Track & Display</h3>
              </div>
              <button
                className="pdf-mobile-sheet-close"
                onClick={() => setIsMobileToolsOpen(false)}
                aria-label="Close display settings"
              >
                <X size={18} />
              </button>
            </div>

            {/* Track Selector */}
            {tracks.length > 0 && (
              <div className="pdf-mobile-tools-section">
                <div className="pdf-mobile-section-label">Instrument Track</div>
                <select
                  className="gp-mobile-track-select"
                  value={selectedTrackIndex}
                  onChange={(e) => {
                    handleSelectTrack(Number(e.target.value))
                    setIsMobileToolsOpen(false)
                  }}
                >
                  {tracks.map((t) => (
                    <option key={t.index} value={t.index}>
                      {t.name} {t.instrument ? `(${t.instrument})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Notation View Mode */}
            <div className="pdf-mobile-tools-section">
              <div className="pdf-mobile-section-label">Notation View</div>
              <div className="pdf-mobile-segmented">
                <button
                  className={`pdf-mobile-segmented-btn ${staveProfile === 'tab' ? 'active' : ''}`}
                  onClick={() => {
                    handleStaveProfileChange('tab')
                    setIsMobileToolsOpen(false)
                  }}
                >
                  <Hash size={15} />
                  <span>Tab Only</span>
                </button>
                <button
                  className={`pdf-mobile-segmented-btn ${staveProfile === 'scoretab' ? 'active' : ''}`}
                  onClick={() => {
                    handleStaveProfileChange('scoretab')
                    setIsMobileToolsOpen(false)
                  }}
                >
                  <Music size={15} />
                  <span>Std + Tab</span>
                </button>
                <button
                  className={`pdf-mobile-segmented-btn ${staveProfile === 'score' ? 'active' : ''}`}
                  onClick={() => {
                    handleStaveProfileChange('score')
                    setIsMobileToolsOpen(false)
                  }}
                >
                  <Music size={15} />
                  <span>Standard</span>
                </button>
              </div>
            </div>

            {/* Theme Mode Selection */}
            <div className="pdf-mobile-tools-section">
              <div className="pdf-mobile-section-label">Reading Theme</div>
              <div className="pdf-mobile-segmented">
                <button
                  className={`pdf-mobile-segmented-btn ${colorMode === 'default' ? 'active' : ''}`}
                  onClick={() => setColorMode('default')}
                >
                  <Sun size={16} />
                  <span>White Paper</span>
                </button>
                <button
                  className={`pdf-mobile-segmented-btn ${colorMode === 'dark' ? 'active' : ''}`}
                  onClick={() => setColorMode('dark')}
                >
                  <Moon size={16} />
                  <span>Dark Stage</span>
                </button>
                <button
                  className={`pdf-mobile-segmented-btn ${colorMode === 'sepia' ? 'active' : ''}`}
                  onClick={() => setColorMode('sepia')}
                >
                  <Flame size={16} />
                  <span>Warm Sepia</span>
                </button>
              </div>
            </div>

            {/* Zoom & View Actions */}
            <div className="pdf-mobile-tools-section">
              <div className="pdf-mobile-section-label">Zoom & View</div>
              <div className="pdf-mobile-actions-row">
                <div className="pdf-mobile-zoom-pill">
                  <button
                    className="pdf-mobile-action-btn"
                    onClick={handleZoomOut}
                    disabled={zoom <= 0.5}
                    aria-label="Zoom Out"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <button
                    className="pdf-mobile-action-btn zoom-text"
                    onClick={handleZoomReset}
                    title="Reset Zoom"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    className="pdf-mobile-action-btn"
                    onClick={handleZoomIn}
                    disabled={zoom >= 2.5}
                    aria-label="Zoom In"
                  >
                    <ZoomIn size={16} />
                  </button>
                </div>
                <button
                  className="pdf-mobile-action-btn fs-btn"
                  onClick={toggleFullscreen}
                  title="Toggle Fullscreen"
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  <span>{isFullscreen ? 'Exit' : 'Full'}</span>
                </button>
              </div>
            </div>

            {/* Metronome Control on Mobile */}
            <div className="pdf-mobile-tools-section">
              <div className="pdf-mobile-section-label">Metronome</div>
              <div className="pdf-mobile-segmented">
                <button
                  className={`pdf-mobile-segmented-btn ${!isMetronomeActive ? 'active' : ''}`}
                  onClick={() => isMetronomeActive && toggleMetronome()}
                >
                  <Timer size={15} />
                  <span>Off</span>
                </button>
                <button
                  className={`pdf-mobile-segmented-btn ${isMetronomeActive ? 'active' : ''}`}
                  onClick={() => !isMetronomeActive && toggleMetronome()}
                >
                  <Timer size={15} />
                  <span>On (Audible)</span>
                </button>
              </div>
            </div>

            {/* Active Loop Controls on Mobile */}
            {isLooping && (
              <div className="pdf-mobile-tools-section">
                <div className="pdf-mobile-section-label">Active Loop</div>
                <div className="gp-mobile-loop-row">
                  <div className="gp-loop-badge">
                    <Repeat size={13} className="gp-loop-badge-icon" />
                    <span className="gp-loop-badge-text">
                      {loopRangeLabel ? `Loop: ${loopRangeLabel}` : 'Looping'}
                    </span>
                  </div>
                  <button
                    className="pdf-mobile-segmented-btn"
                    onClick={() => {
                      handleClearLoop()
                      setIsMobileToolsOpen(false)
                    }}
                  >
                    <X size={14} />
                    <span>Clear Loop</span>
                  </button>
                </div>
              </div>
            )}

            {/* Export Section on Mobile */}
            <div className="pdf-mobile-tools-section">
              <div className="pdf-mobile-section-label">Export</div>
              <button className="gp-mobile-export-btn" onClick={handleOpenExportModal}>
                <Download size={15} />
                <span>Export Tab as PDF</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main Score Body Viewport */}
      <main ref={viewerBodyRef} className="gp-viewer-body">
        {/* Loading State */}
        {loading && (
          <div className="pdf-state-container">
            <div className="pdf-loading-spinner" />
            <h3 className="pdf-state-title">Opening Guitar Pro Tab</h3>
            <p className="pdf-state-subtitle">Engraving score and loading synthesizer...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="pdf-state-container error">
            <div className="pdf-error-icon">✕</div>
            <h3 className="pdf-state-title">Unable to Open Tab</h3>
            <p className="pdf-state-subtitle">{error}</p>
            <button className="pdf-btn-primary" onClick={handleClose}>
              Back to Library
            </button>
          </div>
        )}

        {/* alphaTab Render Target */}
        <div
          ref={containerRef}
          className={`gp-alphatab-container ${colorMode} ${loading ? 'hidden' : ''}`}
        />
      </main>

      {/* Playback Controls Toolbar (Pinned at Bottom) */}
      {!loading && !error && (
        <footer className="gp-player-bar">
          {/* Progress / Timeline Bar */}
          <div
            className="gp-timeline-container"
            onClick={handleSeek}
            title="Click to seek playback"
          >
            <div className="gp-timeline-rail">
              <div className="gp-timeline-progress" style={{ width: `${progressRatio}%` }} />
            </div>
          </div>

          <div className="gp-player-inner">
            {/* Left: Play / Pause / Stop & Time */}
            <div className="gp-player-left">
              <button
                className="gp-btn-play-primary"
                onClick={handlePlayPause}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="play-icon-offset" />}
              </button>

              <button
                className="gp-btn-player-icon"
                onClick={handleStop}
                title="Stop & Rewind"
                aria-label="Stop"
              >
                <Square size={16} />
              </button>

              <div className="gp-time-display">
                <span className="gp-time-current">{formatPlaybackTime(currentTimeMs)}</span>
                <span className="gp-time-divider">/</span>
                <span className="gp-time-total">{formatPlaybackTime(totalTimeMs)}</span>
              </div>

              {isLooping && (
                <div className="gp-loop-badge" title="Loop active. Click ✕ to clear loop.">
                  <Repeat size={13} className="gp-loop-badge-icon" />
                  <span className="gp-loop-badge-text">
                    {loopRangeLabel ? `Loop: ${loopRangeLabel}` : 'Looping'}
                  </span>
                  <button
                    className="gp-loop-badge-clear"
                    onClick={handleClearLoop}
                    title="Clear Loop (L)"
                    aria-label="Clear Loop"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Center: Tempo / Playback Speed Slider & Presets */}
            <div className="gp-player-center">
              <div className="gp-speed-control-wrap">
                <Gauge size={16} className="gp-speed-icon" />
                <span className="gp-speed-label">{Math.round(playbackSpeed * 100)}%</span>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={playbackSpeed}
                  onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                  className="gp-speed-slider"
                  title="Playback Tempo Speed"
                />
                <div className="gp-speed-presets">
                  {[0.75, 1.0, 1.25].map((speed) => (
                    <button
                      key={speed}
                      className={`gp-preset-btn ${playbackSpeed === speed ? 'active' : ''}`}
                      onClick={() => handleSpeedChange(speed)}
                    >
                      {speed * 100}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Volume, Metronome & SoundFont indicator */}
            <div className="gp-player-right">
              <button
                className={`gp-btn-player-icon ${isMetronomeActive ? 'active' : ''}`}
                onClick={toggleMetronome}
                title={`Metronome: ${isMetronomeActive ? 'On' : 'Off'} (M)`}
                aria-label="Toggle Metronome"
              >
                <Timer size={16} />
              </button>

              <div className="gp-volume-wrap">
                <button
                  className="gp-btn-player-icon"
                  onClick={handleToggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="gp-volume-slider"
                  title="Volume"
                />
              </div>

              {isSoundFontLoaded && (
                <div className="gp-synth-badge" title="MIDI Synthesizer Ready">
                  <span className="synth-dot" />
                  <span className="synth-text">MIDI Ready</span>
                </div>
              )}
            </div>
          </div>
        </footer>
      )}

      {/* Floating Loop Selection Popup */}
      {showLoopPopup && pendingLoopRange && (
        <>
          <div className="gp-loop-popup-backdrop" onClick={handleCancelLoopPopup} />
          <div
            className="gp-loop-popup"
            style={{
              left: `${loopPopupPosition.x}px`,
              top: `${loopPopupPosition.y}px`
            }}
          >
            <div className="gp-loop-popup-header">
              <div className="gp-loop-popup-title-wrap">
                <Repeat size={14} className="gp-loop-popup-icon" />
                <span>Loop {pendingLoopRange.label}?</span>
              </div>
              <button
                className="gp-loop-popup-close"
                onClick={handleCancelLoopPopup}
                title="Cancel"
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </div>
            <div className="gp-loop-popup-actions">
              <button
                className="gp-loop-popup-btn-primary"
                onClick={handleApplyLoop}
                title="Loop this section"
              >
                <Repeat size={13} />
                <span>Loop Section</span>
              </button>
              <button
                className="gp-loop-popup-btn-secondary"
                onClick={handleCancelLoopPopup}
                title="Cancel selection"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* PDF Export Modal */}
      {showExportModal && (
        <>
          <div className="gp-export-modal-backdrop" onClick={() => setShowExportModal(false)} />
          <div
            className="gp-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gp-export-title"
          >
            <div className="gp-export-modal-header">
              <div className="gp-export-modal-title-wrap">
                <Download size={18} className="gp-export-modal-icon" />
                <h3 id="gp-export-title" className="gp-export-modal-title">
                  Export Tab to PDF
                </h3>
              </div>
              <button
                className="gp-export-modal-close"
                onClick={() => setShowExportModal(false)}
                title="Close"
                aria-label="Close export dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="gp-export-modal-body">
              <label className="gp-export-label">Notation Style</label>
              <div className="gp-export-options">
                <button
                  type="button"
                  className={`gp-export-option-btn ${exportStaveProfile === 'tab' ? 'active' : ''}`}
                  onClick={() => setExportStaveProfile('tab')}
                >
                  <Hash size={16} className="gp-export-option-icon" />
                  <div className="gp-export-option-text">
                    <span className="gp-export-option-title">Tab Only</span>
                    <span className="gp-export-option-desc">Guitar tablature only</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`gp-export-option-btn ${exportStaveProfile === 'scoretab' ? 'active' : ''}`}
                  onClick={() => setExportStaveProfile('scoretab')}
                >
                  <Music size={16} className="gp-export-option-icon" />
                  <div className="gp-export-option-text">
                    <span className="gp-export-option-title">Standard + Tab</span>
                    <span className="gp-export-option-desc">Music notation & tablature</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`gp-export-option-btn ${exportStaveProfile === 'score' ? 'active' : ''}`}
                  onClick={() => setExportStaveProfile('score')}
                >
                  <Music size={16} className="gp-export-option-icon" />
                  <div className="gp-export-option-text">
                    <span className="gp-export-option-title">Standard Only</span>
                    <span className="gp-export-option-desc">Standard music notation</span>
                  </div>
                </button>
              </div>

              <p className="gp-export-hint">
                Generates a clean A4 PDF score in your selected notation style and saves it directly
                to your computer.
              </p>
            </div>

            <div className="gp-export-modal-actions">
              <button
                type="button"
                className="gp-export-btn-secondary"
                onClick={() => setShowExportModal(false)}
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gp-export-btn-primary"
                onClick={handleExportPdf}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <Loader2 size={15} className="gp-export-spin" />
                    <span>Exporting PDF...</span>
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    <span>Save PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
