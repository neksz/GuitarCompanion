import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  BookOpen,
  FileText,
  ListFilter,
  Sun,
  Moon,
  Flame,
  RotateCw,
  X,
  Clock,
  SlidersHorizontal
} from 'lucide-react'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

import { useWakeLock } from '../utils/useWakeLock'
import { Icons } from '../components/Icons'
import { useMetronomeStore } from '../utils/useMetronomeStore'

interface PdfViewerProps {
  url: string
  name: string
  tab?: { id: string; name: string; attributes?: { tempo?: number; [key: string]: unknown } } | null
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

type LayoutMode = 'double' | 'single' | 'scroll'
type ColorMode = 'default' | 'dark' | 'sepia'

interface PdfPageProps {
  pdf: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  zoom: number
  rotation: number
  containerHeight: number
  containerWidth: number
  layout: LayoutMode
  colorMode: ColorMode
  onRenderSuccess?: (pageNumber: number, width: number, height: number) => void
}

const PdfPage: React.FC<PdfPageProps> = ({
  pdf,
  pageNumber,
  zoom,
  rotation,
  containerHeight,
  containerWidth,
  layout,
  colorMode,
  onRenderSuccess
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(
    null
  )
  const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy['render']> | null>(null)

  useEffect(() => {
    let isMounted = true

    const renderPage = async (): Promise<void> => {
      try {
        setLoading(true)
        const page = await pdf.getPage(pageNumber)
        if (!isMounted) return

        // Determine base unscaled viewport at 1.0
        const unscaledViewport = page.getViewport({ scale: 1.0, rotation })

        // Compute optimal fit scale based on viewport size and layout
        let autoScale = 1.0
        const isNarrow = containerWidth < 900
        // Padding inside .pdf-viewer-body: 16px top/bottom (32px total), 20px left/right (40px total)
        // Include safety margin for card borders, box-shadow and sub-pixel rounding
        const padV = isNarrow ? 28 : 36
        const padH = isNarrow ? 28 : 48
        const availableH = Math.max(containerHeight - padV - 16, 200)
        const availableW = Math.max(containerWidth - padH - 16, 200)

        if (layout === 'double') {
          // On narrow screens (< 900px), double layout behaves like stacked or single fit width
          if (isNarrow) {
            const scaleW = (availableW - 12) / unscaledViewport.width
            const scaleH = (availableH - 12) / unscaledViewport.height
            autoScale = Math.min(scaleW, scaleH)
          } else {
            // Two pages side-by-side on desktop (with 18px gap between them)
            const targetWidth = (availableW - 20) / 2
            const scaleH = availableH / unscaledViewport.height
            const scaleW = targetWidth / unscaledViewport.width
            autoScale = Math.min(scaleH, scaleW)
          }
        } else if (layout === 'single') {
          const scaleH = availableH / unscaledViewport.height
          const scaleW = availableW / unscaledViewport.width
          autoScale = Math.min(scaleH, scaleW)
        } else {
          // Scroll layout: fit width
          autoScale = (availableW - (isNarrow ? 12 : 32)) / unscaledViewport.width
        }

        // Minimum readable scale
        autoScale = Math.max(autoScale, 0.35)

        // Multiply by user-controlled zoom
        const finalScale = autoScale * zoom

        // Sharp rendering using device pixel ratio
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
        const viewport = page.getViewport({ scale: finalScale * dpr, rotation })
        const displayWidth = Math.round(viewport.width / dpr)
        const displayHeight = Math.round(viewport.height / dpr)

        setPageDimensions({ width: displayWidth, height: displayHeight })

        const canvas = canvasRef.current
        if (!canvas) return

        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${displayWidth}px`
        canvas.style.height = `${displayHeight}px`

        const context = canvas.getContext('2d', { alpha: false })
        if (!context) return

        // Fill clean background before drawing
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)

        // Cancel any previous task
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel()
          } catch {
            // ignore
          }
        }

        renderTaskRef.current = page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas as unknown as HTMLCanvasElement
        })

        await renderTaskRef.current.promise

        if (isMounted) {
          setLoading(false)
          onRenderSuccess?.(pageNumber, displayWidth, displayHeight)
        }
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as { name: string }).name !== 'RenderingCancelledException'
        ) {
          console.error(`[PdfViewer] Error rendering page ${pageNumber}:`, err)
        }
      }
    }

    renderPage()

    return () => {
      isMounted = false
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch {
          // ignore
        }
      }
    }
  }, [pdf, pageNumber, zoom, rotation, containerHeight, containerWidth, layout, onRenderSuccess])

  return (
    <div
      className={`pdf-page-card ${colorMode}`}
      style={{
        width: pageDimensions ? `${pageDimensions.width}px` : 'auto',
        minHeight: pageDimensions ? `${pageDimensions.height}px` : '320px'
      }}
    >
      {loading && (
        <div
          className="pdf-page-skeleton"
          style={{ width: pageDimensions?.width || 340, height: pageDimensions?.height || 480 }}
        >
          <div className="pdf-page-spinner">
            <div className="spinner-glow" />
            <span>Rendering Page {pageNumber}...</span>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className={`pdf-page-canvas ${loading ? 'rendering' : 'rendered'}`} />
      <div className="pdf-page-badge">Page {pageNumber}</div>
    </div>
  )
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  url,
  name,
  tab,
  initialSecondsPlayed = 0,
  onClose
}) => {
  // Prevent mobile & desktop screen from sleeping / dimming while reading PDF
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

  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Mobile Tools Sheet Open State
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState<boolean>(false)

  // Metronome State from global store
  const isMetronomePlaying = useMetronomeStore((s) => s.isPlaying)
  const metronomeBpm = useMetronomeStore((s) => s.overrideBpm ?? s.bpm)

  // Touch Swipe Navigation State
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  // Navigation & Layout State
  const [layout, setLayoutState] = useState<LayoutMode>(() => {
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 900
    try {
      const saved = localStorage.getItem('guitar_pdf_layout_mode')
      if (saved === 'single' || saved === 'scroll') {
        return saved
      }
      if (saved === 'double') {
        // If viewport is below 900px, default to 1-page
        return isNarrow ? 'single' : 'double'
      }
    } catch {
      // ignore
    }
    // Below 900px viewport defaults to 1-page ('single')
    return isNarrow ? 'single' : 'double'
  })

  const [currentPage, setCurrentPage] = useState<number>(1)
  const [zoom, setZoom] = useState<number>(1.0)
  const [rotation, setRotation] = useState<number>(0)

  // Color Mode (Stage / Night Theme) with persistent preference
  const [colorMode, setColorModeState] = useState<ColorMode>(() => {
    try {
      const saved = localStorage.getItem('guitar_pdf_color_mode')
      if (saved === 'default' || saved === 'dark' || saved === 'sepia') {
        return saved
      }
    } catch {
      // ignore
    }
    return 'default'
  })

  const setLayout = useCallback((mode: LayoutMode | ((prev: LayoutMode) => LayoutMode)) => {
    setLayoutState((prev) => {
      const next = typeof mode === 'function' ? mode(prev) : mode
      try {
        localStorage.setItem('guitar_pdf_layout_mode', next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const setColorMode = useCallback((mode: ColorMode | ((prev: ColorMode) => ColorMode)) => {
    setColorModeState((prev) => {
      const next = typeof mode === 'function' ? mode(prev) : mode
      try {
        localStorage.setItem('guitar_pdf_color_mode', next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [pageInputOverride, setPageInputOverride] = useState<string | null>(null)
  const defaultPageInput =
    layout === 'double' && currentPage + 1 <= numPages
      ? `${currentPage}-${currentPage + 1}`
      : `${currentPage}`
  const pageInputValue = pageInputOverride ?? defaultPageInput

  // Viewport dimensions for responsive layout calculation
  const viewerBodyRef = useRef<HTMLDivElement | null>(null)
  const viewerContainerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight - 110 : 700
  })

  // Update container size on resize
  useEffect(() => {
    const updateSize = (): void => {
      if (viewerBodyRef.current) {
        const rect = viewerBodyRef.current.getBoundingClientRect()
        setContainerSize({
          width: rect.width || window.innerWidth,
          height: rect.height || window.innerHeight - 110
        })
      } else {
        setContainerSize({
          width: window.innerWidth,
          height: window.innerHeight - 110
        })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Ensure scrolling starts from the top on page change
  useEffect(() => {
    if (viewerBodyRef.current) {
      viewerBodyRef.current.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [currentPage, layout])

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
  }, [])

  // Sync active tab context and stop metronome on open/close
  useEffect(() => {
    useMetronomeStore.getState().stop()
    if (tab) {
      useMetronomeStore.getState().setActiveTab(tab.id, tab.name, tab.attributes)
    }
    return () => {
      useMetronomeStore.getState().stop()
      useMetronomeStore.getState().setActiveTab(null, null, null)
    }
  }, [tab])

  const handleClose = useCallback((): void => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
    useMetronomeStore.getState().stop()
    const elapsed = Math.max(1, sessionSecondsRef.current)
    onClose(elapsed)
  }, [onClose])

  const handleToggleSavedTempoMetronome = useCallback(async (): Promise<void> => {
    if (!tab?.attributes?.tempo) return
    const tempo = tab.attributes.tempo
    const store = useMetronomeStore.getState()
    const activePlaybackBpm = store.overrideBpm ?? store.bpm

    if (store.isPlaying) {
      if (activePlaybackBpm === tempo) {
        store.stop()
      } else {
        store.setOverrideBpm(tempo)
      }
    } else {
      await store.start(tempo)
    }
  }, [tab])

  // Load PDF Document
  useEffect(() => {
    let isMounted = true

    const loadPdf = async (): Promise<void> => {
      setLoading(true)
      setError(null)
      try {
        const loadingTask = pdfjsLib.getDocument({
          url,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/cmaps/',
          cMapPacked: true
        })
        const loadedPdf = await loadingTask.promise

        if (isMounted) {
          setPdf(loadedPdf)
          setNumPages(loadedPdf.numPages)
          setCurrentPage(1)
          setLoading(false)
        }
      } catch (err: unknown) {
        console.error('[PdfViewer] Failed to load PDF:', err)
        if (isMounted) {
          setError(
            'Could not load this PDF document. The file format or content might be corrupted.'
          )
          setLoading(false)
        }
      }
    }

    loadPdf()

    return () => {
      isMounted = false
    }
  }, [url])

  // Page navigation functions
  const canPrev = currentPage > 1
  const canNext =
    layout === 'double'
      ? currentPage + 2 <= numPages || (currentPage === 1 && numPages > 2)
      : currentPage < numPages

  const handlePrev = useCallback((): void => {
    if (layout === 'double') {
      setCurrentPage((prev) => Math.max(1, prev - 2))
    } else {
      setCurrentPage((prev) => Math.max(1, prev - 1))
    }
  }, [layout])

  const handleNext = useCallback((): void => {
    if (layout === 'double') {
      setCurrentPage((prev) => {
        if (prev + 2 <= numPages) return prev + 2
        if (prev + 1 <= numPages) return prev + 1
        return prev
      })
    } else {
      setCurrentPage((prev) => Math.min(numPages, prev + 1))
    }
  }, [layout, numPages])

  const handleFirstPage = useCallback((): void => {
    setCurrentPage(1)
  }, [])

  const handleLastPage = useCallback((): void => {
    if (layout === 'double') {
      const lastOdd = numPages % 2 === 0 ? numPages - 1 : numPages
      setCurrentPage(Math.max(1, lastOdd))
    } else {
      setCurrentPage(numPages)
    }
  }, [layout, numPages])

  const handlePageInputSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const parsed = parseInt(pageInputValue.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= numPages) {
      if (layout === 'double') {
        const target = parsed % 2 === 0 ? parsed - 1 : parsed
        setCurrentPage(Math.max(1, target))
      } else {
        setCurrentPage(parsed)
      }
    }
    setPageInputOverride(null)
  }

  // Zoom Handlers
  const handleZoomIn = (): void => setZoom((prev) => Math.min(+(prev + 0.15).toFixed(2), 2.5))
  const handleZoomOut = (): void => setZoom((prev) => Math.max(+(prev - 0.15).toFixed(2), 0.5))
  const handleZoomReset = (): void => setZoom(1.0)

  // Rotate Handler
  const handleRotate = (): void => {
    setRotation((prev) => (prev + 90) % 360)
  }

  // Toggle Fullscreen
  const toggleFullscreen = (): void => {
    if (!document.fullscreenElement) {
      viewerContainerRef.current?.requestFullscreen?.().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(() => {})
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleFsChange = (): void => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Full Keyboard Controls (Left/Right, Space, Esc, Fullscreen, Zoom)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Don't intercept if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'Escape':
          if (isMobileToolsOpen) {
            setIsMobileToolsOpen(false)
          } else {
            handleClose()
          }
          break
        case 'ArrowLeft':
        case 'PageUp':
        case 'a':
        case 'A':
        case 'h':
          handlePrev()
          break
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
        case 'd':
        case 'D':
        case 'l':
          e.preventDefault()
          handleNext()
          break
        case 'Home':
          handleFirstPage()
          break
        case 'End':
          handleLastPage()
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
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'r':
        case 'R':
          handleRotate()
          break
        case 'm':
        case 'M':
          useMetronomeStore.getState().toggleOpen()
          break
        case 'i':
        case 'I':
          setColorMode((prev) => (prev === 'dark' ? 'default' : 'dark'))
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    handleClose,
    handlePrev,
    handleNext,
    handleFirstPage,
    handleLastPage,
    isMobileToolsOpen,
    setColorMode,
    setLayout
  ])

  // Touch handlers for swipe page turning
  const handleTouchStart = (e: React.TouchEvent): void => {
    if (layout === 'scroll') return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent): void => {
    if (layout === 'scroll' || touchStartX.current === null || touchStartY.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const deltaY = e.changedTouches[0].clientY - touchStartY.current

    // Ensure swipe was primarily horizontal and long enough
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      if (deltaX < 0 && canNext) {
        handleNext()
      } else if (deltaX > 0 && canPrev) {
        handlePrev()
      }
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  // Calculate active pages to display based on layout mode
  const pagesToRender = useMemo(() => {
    if (!pdf || numPages === 0) return []

    if (layout === 'scroll') {
      return Array.from({ length: numPages }, (_, i) => i + 1)
    }

    if (layout === 'double') {
      const pages = [currentPage]
      if (currentPage + 1 <= numPages) {
        pages.push(currentPage + 1)
      }
      return pages
    }

    // Single page
    return [currentPage]
  }, [pdf, numPages, layout, currentPage])

  const cleanTitle = name.replace(/\.pdf$/i, '')

  return (
    <div ref={viewerContainerRef} className={`pdf-viewer-overlay ${colorMode}`}>
      {/* Top Navigation Bar */}
      <header className="pdf-viewer-header">
        {/* Left Section: Title & Meta */}
        <div className="pdf-header-left">
          <div
            className="pdf-timer-badge"
            title={`Session Practice: ${formatSessionTimer(sessionSeconds)}${initialSecondsPlayed ? ` | Total Playtime: ${formatTotalTime(initialSecondsPlayed + sessionSeconds)}` : ''}`}
          >
            <Clock size={12} />
            <span>{formatSessionTimer(sessionSeconds)}</span>
          </div>
          <h2 className="pdf-doc-title" title={cleanTitle}>
            {cleanTitle}
          </h2>
        </div>

        {/* Center Section: Page Navigation (Desktop only, hidden on mobile via CSS) */}
        {layout !== 'scroll' && !loading && !error && (
          <div className="pdf-header-center">
            <div className="pdf-nav-pill">
              <button
                className="pdf-nav-btn"
                onClick={handleFirstPage}
                disabled={!canPrev}
                title="First Page (Home)"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                className="pdf-nav-btn"
                onClick={handlePrev}
                disabled={!canPrev}
                title="Previous Page (← / PageUp)"
              >
                <ChevronLeft size={18} />
              </button>

              <form onSubmit={handlePageInputSubmit} className="pdf-page-form">
                <span className="pdf-page-label">Page</span>
                <input
                  type="text"
                  className="pdf-page-input"
                  value={pageInputValue}
                  onChange={(e) => setPageInputOverride(e.target.value)}
                  onBlur={() => setPageInputOverride(null)}
                  title="Type page and press Enter"
                />
                <span className="pdf-page-total">/ {numPages}</span>
              </form>

              <button
                className="pdf-nav-btn"
                onClick={handleNext}
                disabled={!canNext}
                title="Next Page (→ / Space / PageDown)"
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="pdf-nav-btn"
                onClick={handleLastPage}
                disabled={!canNext}
                title="Last Page (End)"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Right Section: Tools & Controls */}
        <div className="pdf-header-right">
          {!loading && !error && (
            <>
              {/* Desktop Full Tool Controls */}
              <div className="pdf-desktop-tools">
                {/* Layout Mode Selector */}
                <div className="pdf-tool-group" title="Page Layout">
                  <button
                    className={`pdf-tool-btn ${layout === 'double' ? 'active' : ''}`}
                    onClick={() => setLayout('double')}
                    title="Book View (2 Pages Side-by-Side)"
                  >
                    <BookOpen size={16} />
                    <span className="btn-text">2-Page</span>
                  </button>
                  <button
                    className={`pdf-tool-btn ${layout === 'single' ? 'active' : ''}`}
                    onClick={() => setLayout('single')}
                    title="Single Page View"
                  >
                    <FileText size={16} />
                    <span className="btn-text">1-Page</span>
                  </button>
                  <button
                    className={`pdf-tool-btn ${layout === 'scroll' ? 'active' : ''}`}
                    onClick={() => setLayout('scroll')}
                    title="Continuous Scroll View"
                  >
                    <ListFilter size={16} />
                    <span className="btn-text">Scroll</span>
                  </button>
                </div>

                {/* Color Theme Selector */}
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
                    title="Dark / Stage Theme"
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

                {/* Rotation */}
                <button
                  className="pdf-tool-btn icon-only single-btn"
                  onClick={handleRotate}
                  title="Rotate Clockwise (R)"
                >
                  <RotateCw size={16} />
                </button>

                {/* Metronome & Saved Tempo */}
                <div
                  className={`pdf-metronome-wrap ${tab?.attributes?.tempo ? 'joined' : ''} ${isMetronomePlaying ? 'metronome-active' : ''}`}
                >
                  <button
                    className={
                      tab?.attributes?.tempo
                        ? 'pdf-metronome-btn'
                        : `pdf-tool-btn icon-only single-btn ${isMetronomePlaying ? 'metronome-active' : ''}`
                    }
                    onClick={() => useMetronomeStore.getState().toggleOpen()}
                    title={
                      isMetronomePlaying
                        ? `Metronome Active (${metronomeBpm} BPM) - Click to configure (M)`
                        : tab?.attributes?.tempo
                          ? `Metronome (Saved: ${tab.attributes.tempo} BPM) - Click to configure (M)`
                          : 'Open Metronome (M)'
                    }
                    aria-label="Metronome"
                  >
                    <Icons.Metronome size={16} />
                    {isMetronomePlaying && <span className="metronome-active-indicator" />}
                  </button>
                  {tab?.attributes?.tempo ? (
                    <>
                      <div className="pdf-metronome-divider" />
                      <button
                        className={`pdf-tempo-badge ${isMetronomePlaying && metronomeBpm === tab.attributes.tempo ? 'active' : ''}`}
                        onClick={handleToggleSavedTempoMetronome}
                        title={
                          isMetronomePlaying && metronomeBpm === tab.attributes.tempo
                            ? `Stop Metronome (${tab.attributes.tempo} BPM)`
                            : isMetronomePlaying
                              ? `Set Metronome to ${tab.attributes.tempo} BPM`
                              : `Start Metronome (${tab.attributes.tempo} BPM)`
                        }
                        aria-label={
                          isMetronomePlaying && metronomeBpm === tab.attributes.tempo
                            ? `Stop Metronome (${tab.attributes.tempo} BPM)`
                            : `Start Metronome (${tab.attributes.tempo} BPM)`
                        }
                      >
                        <span className="tempo-note">♩</span>
                        <span className="tempo-bpm">{tab.attributes.tempo}</span>
                      </button>
                    </>
                  ) : null}
                </div>

                {/* Fullscreen */}
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
                title="Display & Layout Options"
                aria-label="Display Controls"
              >
                <SlidersHorizontal size={18} />
              </button>
            </>
          )}

          {/* Close Button - ALWAYS pinned and visible */}
          <button
            className="pdf-close-btn"
            onClick={handleClose}
            title="Close Viewer (Esc)"
            aria-label="Close PDF Viewer"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Mobile Display Options & Tools Sheet Modal */}
      {isMobileToolsOpen && !loading && !error && (
        <>
          <div className="pdf-mobile-tools-backdrop" onClick={() => setIsMobileToolsOpen(false)} />
          <div className="pdf-mobile-tools-sheet">
            <div className="pdf-mobile-sheet-header">
              <div className="pdf-mobile-sheet-title-wrap">
                <SlidersHorizontal size={16} className="pdf-sheet-icon" />
                <h3 className="pdf-mobile-sheet-title">Display & Layout</h3>
              </div>
              <button
                className="pdf-mobile-sheet-close"
                onClick={() => setIsMobileToolsOpen(false)}
                aria-label="Close display settings"
              >
                <X size={18} />
              </button>
            </div>

            {/* Layout Mode Selection */}
            <div className="pdf-mobile-tools-section">
              <div className="pdf-mobile-section-label">Page Layout</div>
              <div className="pdf-mobile-segmented">
                <button
                  className={`pdf-mobile-segmented-btn ${layout === 'single' ? 'active' : ''}`}
                  onClick={() => setLayout('single')}
                >
                  <FileText size={16} />
                  <span>1-Page</span>
                </button>
                <button
                  className={`pdf-mobile-segmented-btn ${layout === 'double' ? 'active' : ''}`}
                  onClick={() => setLayout('double')}
                >
                  <BookOpen size={16} />
                  <span>2-Page</span>
                </button>
                <button
                  className={`pdf-mobile-segmented-btn ${layout === 'scroll' ? 'active' : ''}`}
                  onClick={() => setLayout('scroll')}
                >
                  <ListFilter size={16} />
                  <span>Scroll</span>
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

            {/* Metronome Control on Mobile */}
            <div className="pdf-mobile-tools-section">
              <div className="pdf-mobile-section-label">
                Metronome ({metronomeBpm} BPM)
                {tab?.attributes?.tempo ? (
                  <span className="pdf-mobile-saved-tempo"> • Saved: {tab.attributes.tempo}</span>
                ) : null}
              </div>
              <div className="pdf-mobile-segmented">
                <button
                  className={`pdf-mobile-segmented-btn ${!isMetronomePlaying ? 'active' : ''}`}
                  onClick={() => isMetronomePlaying && useMetronomeStore.getState().stop()}
                >
                  <span>Off</span>
                </button>
                <button
                  className={`pdf-mobile-segmented-btn ${isMetronomePlaying ? 'active' : ''}`}
                  onClick={() => !isMetronomePlaying && useMetronomeStore.getState().start()}
                >
                  <span>Start</span>
                </button>
                <button
                  className="pdf-mobile-segmented-btn"
                  onClick={() => {
                    setIsMobileToolsOpen(false)
                    useMetronomeStore.getState().open()
                  }}
                >
                  <Icons.Metronome size={15} />
                  <span>Configure</span>
                </button>
              </div>
            </div>

            {/* Zoom & Quick Actions */}
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
                  className="pdf-mobile-action-btn rotate-btn"
                  onClick={handleRotate}
                  title="Rotate 90°"
                >
                  <RotateCw size={16} />
                  <span>Rotate</span>
                </button>
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
          </div>
        </>
      )}

      {/* Main PDF Content Canvas Viewport */}
      <main
        ref={viewerBodyRef}
        className={`pdf-viewer-body layout-${layout} ${zoom <= 1.0 && layout !== 'scroll' ? 'no-scroll' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Floating Quick Navigation Edge Buttons (for 2-page & single-page) */}
        {layout !== 'scroll' && !loading && !error && (
          <>
            <button
              className={`pdf-floating-arrow left ${!canPrev ? 'disabled' : ''}`}
              onClick={handlePrev}
              disabled={!canPrev}
              title="Previous Page (←)"
              aria-label="Previous Page"
            >
              <ChevronLeft size={36} />
            </button>
            <button
              className={`pdf-floating-arrow right ${!canNext ? 'disabled' : ''}`}
              onClick={handleNext}
              disabled={!canNext}
              title="Next Page (→ / Space)"
              aria-label="Next Page"
            >
              <ChevronRight size={36} />
            </button>
          </>
        )}

        {/* Loading State */}
        {loading && (
          <div className="pdf-state-container">
            <div className="pdf-loading-spinner" />
            <h3 className="pdf-state-title">Opening PDF Tab</h3>
            <p className="pdf-state-subtitle">Preparing sheet music score...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="pdf-state-container error">
            <div className="pdf-error-icon">✕</div>
            <h3 className="pdf-state-title">Unable to Open PDF</h3>
            <p className="pdf-state-subtitle">{error}</p>
            <button className="pdf-btn-primary" onClick={handleClose}>
              Back to Library
            </button>
          </div>
        )}

        {/* Render Pages */}
        {!loading && !error && pdf && (
          <div className={`pdf-stage ${layout}`}>
            <div className={`pdf-spread-container layout-${layout}`}>
              {pagesToRender.map((pageNum) => (
                <PdfPage
                  key={`${pageNum}-${rotation}-${layout}`}
                  pdf={pdf}
                  pageNumber={pageNum}
                  zoom={zoom}
                  rotation={rotation}
                  containerHeight={containerSize.height}
                  containerWidth={containerSize.width}
                  layout={layout}
                  colorMode={colorMode}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Floating Navigation Bar */}
      {!loading && !error && numPages > 0 && (
        <div className="pdf-mobile-bottom-bar">
          {layout !== 'scroll' ? (
            <div className="pdf-mobile-nav-pill">
              <button
                className="pdf-mobile-nav-arrow"
                onClick={handlePrev}
                disabled={!canPrev}
                aria-label="Previous Page"
              >
                <ChevronLeft size={20} />
              </button>

              <form onSubmit={handlePageInputSubmit} className="pdf-mobile-page-form">
                <input
                  type="text"
                  className="pdf-mobile-page-input"
                  value={pageInputValue}
                  onChange={(e) => setPageInputOverride(e.target.value)}
                  onBlur={() => setPageInputOverride(null)}
                  title="Type page and press Enter"
                />
                <span className="pdf-mobile-page-total">/ {numPages}</span>
              </form>

              <button
                className="pdf-mobile-nav-arrow"
                onClick={handleNext}
                disabled={!canNext}
                aria-label="Next Page"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          ) : (
            <div className="pdf-mobile-scroll-pill">
              <span className="pdf-mobile-scroll-info">Scroll View • {numPages} Pages</span>
            </div>
          )}

          <button
            className={`pdf-mobile-bottom-tools-btn ${isMobileToolsOpen ? 'active' : ''}`}
            onClick={() => setIsMobileToolsOpen((prev) => !prev)}
            aria-label="Display & Zoom Settings"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      )}

      {/* Bottom Quick Bar in Double Mode on Desktop */}
      {layout === 'double' && !loading && !error && numPages > 0 && (
        <footer className="pdf-viewer-footer desktop-only">
          <div className="pdf-footer-hint">
            <span>
              Use <strong>← / →</strong> or <strong>Spacebar</strong> to turn pages
            </span>
            <span className="dot">•</span>
            <span>
              Press <strong>F</strong> for Fullscreen
            </span>
            <span className="dot">•</span>
            <span>
              Press <strong>Esc</strong> to exit
            </span>
          </div>
        </footer>
      )}
    </div>
  )
}
