import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as alphaTab from '@coderline/alphatab'
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
  Repeat
} from 'lucide-react'
import { useWakeLock } from '../utils/useWakeLock'

interface GpViewerProps {
  data: ArrayBuffer | Uint8Array | string
  name: string
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
  initialSecondsPlayed = 0,
  onClose
}) => {
  // Prevent mobile & desktop screen from sleeping / dimming while viewing / playing Guitar Pro score
  useWakeLock(true)

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
    const staff = track.staves[0]
    setCurrentCapo(staff.capo || 0)

    if (staff.isPercussion) {
      setCurrentTuning('Drums')
    } else if (staff.tuning && staff.tuning.length > 0) {
      try {
        const noteNames = staff.tuning.map((midiNote) =>
          alphaTab.model.Tuning.getTextForTuning(midiNote, false)
        )
        const notesStr = noteNames.join(' ')
        const tuningName = staff.tuningName || staff.stringTuning?.name
        if (
          tuningName &&
          tuningName.toLowerCase() !== 'standard' &&
          tuningName.toLowerCase() !== 'custom'
        ) {
          setCurrentTuning(`${tuningName} (${notesStr})`)
        } else {
          setCurrentTuning(notesStr)
        }
      } catch {
        setCurrentTuning(staff.tuningName || 'Standard')
      }
    } else {
      setCurrentTuning(staff.tuningName || 'Standard')
    }
  }, [])

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0)
  const [totalTimeMs, setTotalTimeMs] = useState<number>(0)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0)
  const [volume, setVolume] = useState<number>(1.0)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [isSoundFontLoaded, setIsSoundFontLoaded] = useState<boolean>(false)

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
      api.updateSettings()
      api.render()
    }
  }, [])

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

  // Initialize alphaTab
  useEffect(() => {
    let isMounted = true
    const element = containerRef.current
    if (!element) return

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

          const trackOptions: TrackOption[] = score.tracks.map((t, idx) => ({
            index: idx,
            name: t.name || `Track ${idx + 1}`,
            instrument: t.staves?.[0]?.isPercussion ? 'Drums' : undefined
          }))

          setTracks(trackOptions)
          setSelectedTrackIndex(0)

          // Explicitly render the first track and update tuning & capo metadata
          if (score.tracks.length > 0) {
            updateTrackMeta(score.tracks[0])
            api.renderTracks([score.tracks[0]])
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
    setIsMuted(newVol === 0)
    const api = apiRef.current
    if (api) {
      api.masterVolume = newVol
    }
  }, [])

  const handleToggleMute = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    if (isMuted) {
      const restored = volume > 0 ? volume : 0.8
      setIsMuted(false)
      api.masterVolume = restored
    } else {
      setIsMuted(true)
      api.masterVolume = 0
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
          if (showLoopPopup) {
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
    handleClearLoop
  ])

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

            {/* Right: Volume & SoundFont indicator */}
            <div className="gp-player-right">
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
    </div>
  )
}
