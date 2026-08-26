import React, { useEffect, useState } from 'react'
import { IGuitarTab, ITabAttributes } from '../../../shared/types'
import { UploadModal } from './UploadModal'
import { ConfirmationModal } from './ConfirmationModal'
import { PdfViewer } from './PdfViewer'
import { GpViewer } from './GpViewer'
import { Icons } from '../components/Icons'
import { api } from '../services/api'
import { playSessionService } from '../services/PlaySessionService'
import { analyzePdfInBrowser } from '../utils/browserPdfAnalyzer'
import { analyzeGpFile } from '../utils/guitarProAnalyzer'

interface FileBrowserProps {
  searchQuery?: string
  activeCategory: string
  onOpenSidebar?: () => void
  onSearch?: (query: string) => void
  refreshTrigger?: number
}

const getFileType = (filename: string): 'pdf' | 'gp' | 'txt' | 'other' => {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (
    lower.endsWith('.gp3') ||
    lower.endsWith('.gp4') ||
    lower.endsWith('.gp5') ||
    lower.endsWith('.gpx') ||
    lower.endsWith('.gp')
  )
    return 'gp'
  if (lower.endsWith('.txt')) return 'txt'
  return 'other'
}

const getFileIcon = (filename: string): React.JSX.Element => {
  const type = getFileType(filename)
  switch (type) {
    case 'pdf':
      return <Icons.FileText size={20} />
    case 'gp':
      // Use FileAudio or Music as a proxy for Guitar Pro files
      return <Icons.FileAudio size={20} />
    case 'txt':
      return <Icons.FileText size={20} /> // Or maybe a different icon if we had one, but FileText is fine
    default:
      return <Icons.File size={20} />
  }
}

export const FileBrowser: React.FC<FileBrowserProps> = ({
  searchQuery = '',
  activeCategory = 'all',
  onOpenSidebar,
  onSearch,
  refreshTrigger
}) => {
  const [tabs, setTabs] = useState<IGuitarTab[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedTuning, setSelectedTuning] = useState<string>('')
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: '',
    direction: null
  })
  const [sortMode, setSortMode] = useState<'alpha' | 'created' | 'recent' | 'played' | 'time'>(
    'alpha'
  )
  const [capoFilter, setCapoFilter] = useState('')
  // Store regular File object for Web, and path for Electron
  const [uploadQueue, setUploadQueue] = useState<{ file: File; path: string }[]>([])
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0)
  const [pdfAnalysis, setPdfAnalysis] = useState<{
    tuning: string
    capo: number
    previewBase64: string | null
  } | null>(null)
  const [editTab, setEditTab] = useState<IGuitarTab | null>(null)
  const [deleteTab, setDeleteTab] = useState<IGuitarTab | null>(null) // State for deletion confirmation
  const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'pdf' | 'gp' | 'txt'>('all') // File Type Filter
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null)
  const [pdfViewerName, setPdfViewerName] = useState<string>('')
  const [pdfViewerTab, setPdfViewerTab] = useState<IGuitarTab | null>(null)
  const [gpViewerData, setGpViewerData] = useState<ArrayBuffer | Uint8Array | string | null>(null)
  const [gpViewerName, setGpViewerName] = useState<string>('')
  const [gpViewerTab, setGpViewerTab] = useState<IGuitarTab | null>(null)

  // Extract unique file types from current tabs
  const availableFileTypes = React.useMemo(() => {
    const types = new Set<string>()
    tabs.forEach((t) => {
      types.add(getFileType(t.name))
    })

    const options = [{ id: 'all', label: 'All' }]
    if (types.has('pdf')) options.push({ id: 'pdf', label: 'PDF' })
    if (types.has('gp')) options.push({ id: 'gp', label: 'Guitar Pro' })
    if (types.has('txt')) options.push({ id: 'txt', label: 'Text' })

    return options
  }, [tabs])

  const loadTabs = async (showSpinner = true): Promise<IGuitarTab[]> => {
    try {
      if (showSpinner) setLoading(true)
      const files = await api.getFiles()
      setTabs(files)
      return files
    } catch (e) {
      console.error(e)
      return []
    } finally {
      if (showSpinner) setLoading(false)
    }
  }

  // Load defaults from settings
  const applyDefaults = async (): Promise<void> => {
    try {
      const settings = await api.getSettings()
      if (settings) {
        if (settings.defaultSortMode) setSortMode(settings.defaultSortMode)
        if (settings.defaultTuning) setSelectedTuning(settings.defaultTuning)
        if (settings.defaultCapo !== undefined) setCapoFilter(settings.defaultCapo.toString())
        if (settings.defaultFileType) setFileTypeFilter(settings.defaultFileType)
        if (settings.defaultStatusFilter && Array.isArray(settings.defaultStatusFilter)) {
          setSelectedStatuses(settings.defaultStatusFilter)
        }
      }
    } catch (err) {
      console.error('[FileBrowser] Failed to load default settings', err)
    }
  }

  useEffect(() => {
    if (refreshTrigger !== undefined) {
      applyDefaults()
    }
  }, [refreshTrigger])

  useEffect(() => {
    let isMounted = true

    // Auto-load tabs on mount, then apply defaults from settings once tabs are loaded
    const initialize = async (): Promise<void> => {
      await loadTabs()
      if (isMounted) {
        await applyDefaults()
      }
    }
    initialize()

    // For web version: retry loading if empty (session might still be restoring)
    const retryInterval = setInterval(async () => {
      if (tabs.length === 0) {
        console.log('[FileBrowser] Retrying tab load (session might still be restoring)...')
        const files = await api.getFiles()
        if (files.length > 0) {
          if (isMounted) {
            setTabs(files)
            setLoading(false)
            await applyDefaults()
          }
          clearInterval(retryInterval)
        }
      } else {
        clearInterval(retryInterval)
      }
    }, 1000)

    // Clean up interval after 10 seconds
    const timeoutId = setTimeout(() => clearInterval(retryInterval), 10000)

    return () => {
      isMounted = false
      clearInterval(retryInterval)
      clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newQueue: { file: File; path: string }[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = api.getFilePath(file) || ''
      newQueue.push({ file, path: filePath })
    }

    setUploadQueue(newQueue)
    setCurrentUploadIndex(0)

    // Reset input
    e.target.value = ''
  }

  const handleConfirmUpload = async (
    attributes: ITabAttributes,
    newFileName?: string
  ): Promise<void> => {
    const currentItem = uploadQueue[currentUploadIndex]
    if (!currentItem) return

    try {
      const uploadAttributes = {
        ...attributes,
        createdAt: new Date().toISOString()
      }

      // Use newFileName if provided, otherwise default to file name
      const finalName = newFileName || currentItem.file.name

      const res = await api.uploadFile(
        currentItem.file,
        currentItem.path,
        finalName,
        uploadAttributes
      )

      if (res.success) {
        // Determine if we have more files
        if (currentUploadIndex < uploadQueue.length - 1) {
          // Move to next file
          setCurrentUploadIndex((prev) => prev + 1)
        } else {
          // All done
          await loadTabs()
          setUploadQueue([])
          setCurrentUploadIndex(0)
        }
      } else {
        alert('Upload failed: ' + res.error)
        // On failure we stop? Or skip? Let's stop for now as per plan logic (user can retry)
        // But generally users might want to continue. Let's stick to "stop and show error" for minimal risk.
      }
    } catch (err) {
      console.error('Upload Error:', err)
      alert('Upload failed')
    }
  }

  // Helper to cancel the entire batch
  const handleCancelUpload = (): void => {
    setUploadQueue([])
    setCurrentUploadIndex(0)
    setPdfAnalysis(null)
  }

  // Skip current file
  const handleSkip = async (): Promise<void> => {
    if (currentUploadIndex < uploadQueue.length - 1) {
      setCurrentUploadIndex((prev) => prev + 1)
    } else {
      // If it's the last one, finish up
      setUploadQueue([])
      setCurrentUploadIndex(0)
      setPdfAnalysis(null)
      await loadTabs()
    }
  }

  // Tab File Analysis Effect (PDF & Guitar Pro) - runs when queue changes or index changes
  useEffect(() => {
    const analyzeCurrentFile = async (): Promise<void> => {
      if (uploadQueue.length === 0) {
        setPdfAnalysis(null)
        return
      }

      const currentItem = uploadQueue[currentUploadIndex]
      if (!currentItem) {
        setPdfAnalysis(null)
        return
      }

      const fileName = currentItem.file.name.toLowerCase()
      const isPdf = fileName.endsWith('.pdf')
      const isGp =
        fileName.endsWith('.gp3') ||
        fileName.endsWith('.gp4') ||
        fileName.endsWith('.gp5') ||
        fileName.endsWith('.gpx') ||
        fileName.endsWith('.gp')

      if (isGp) {
        // Guitar Pro analysis - extract exact tuning & capo
        try {
          console.log('[FileBrowser] Analyzing Guitar Pro tab:', currentItem.file.name)
          const result = await analyzeGpFile(currentItem.file)
          setPdfAnalysis({
            tuning: result.tuning,
            capo: result.capo,
            previewBase64: null
          })
        } catch (err) {
          console.error('[FileBrowser] Guitar Pro analysis error:', err)
          setPdfAnalysis(null)
        }
        return
      }

      if (!isPdf) {
        setPdfAnalysis(null)
        return
      }

      // Try Electron API first (for desktop), then fall back to browser analysis
      if (currentItem.path && api.analyzePdf) {
        // Electron path - use IPC
        try {
          console.log('[FileBrowser] Analyzing PDF via Electron:', currentItem.path)
          const result = await api.analyzePdf(currentItem.path)
          if (result.success && result.data) {
            setPdfAnalysis(result.data)
          } else {
            setPdfAnalysis(null)
          }
        } catch (err) {
          console.error('[FileBrowser] Electron PDF Analysis error:', err)
          setPdfAnalysis(null)
        }
      } else {
        // Browser fallback - use File object directly
        try {
          console.log('[FileBrowser] Analyzing PDF in browser:', currentItem.file.name)
          const result = await analyzePdfInBrowser(currentItem.file)
          setPdfAnalysis(result)
        } catch (err) {
          console.error('[FileBrowser] Browser PDF Analysis error:', err)
          setPdfAnalysis(null)
        }
      }
    }

    analyzeCurrentFile()
  }, [uploadQueue, currentUploadIndex])

  // Confirm Edit
  const handleConfirmEdit = async (
    attributes: ITabAttributes,
    newFileName?: string
  ): Promise<void> => {
    if (!editTab) return

    try {
      // 1. If name changed, rename file first
      if (newFileName && newFileName !== editTab.name) {
        const renameRes = await api.renameFile(editTab.id, newFileName)
        if (!renameRes.success) {
          alert('Rename failed: ' + renameRes.error)
          return
        }
      }

      // 2. Update attributes
      const res = await api.updateAttributes(editTab.id, attributes)
      if (res.success) {
        // Optimistically update or reload
        await loadTabs()
      } else {
        alert('Update failed: ' + res.error)
      }
    } catch (err) {
      console.error(err)
      alert('Update failed')
    } finally {
      setEditTab(null)
    }
  }

  // Trigger Delete Logic
  const handleDeleteClick = (e: React.MouseEvent, tab: IGuitarTab): void => {
    e.stopPropagation()
    setDeleteTab(tab)
  }

  // Confirm Delete
  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteTab) return

    const idToDelete = deleteTab.id

    try {
      const res = await api.deleteFile(idToDelete)
      if (res.success) {
        // Optimistic update: Remove immediately from UI
        setTabs((prev) => prev.filter((t) => t.id !== idToDelete))

        // We do NOT reload here to prevent the backend (which might be slow to update)
        // from overwriting our optimistic removal. Next manual refresh will sync.
      } else {
        alert('Delete failed: ' + res.error)
      }
    } catch (err) {
      console.error(err)
      alert('Delete failed')
    } finally {
      setDeleteTab(null)
    }
  }

  const handleOpen = async (tab: IGuitarTab): Promise<void> => {
    try {
      // Update last accessed timestamp
      await api.updateAttributes(tab.id, {
        ...tab.attributes,
        lastAccessed: new Date().toISOString(),
        timesPlayed: (tab.attributes?.timesPlayed || 0) + 1
      })

      loadTabs(false)

      const result = await api.openFile(tab.id, tab.name)

      // If we got PDF data back, show the in-app viewer
      if (result?.data && result?.mimeType === 'application/pdf') {
        let url = result.data
        // Electron returns base64 — convert to blob URL
        if (!url.startsWith('blob:')) {
          const binary = atob(url)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
          }
          const blob = new Blob([bytes], { type: 'application/pdf' })
          url = URL.createObjectURL(blob)
        }
        setPdfViewerTab(tab)
        setPdfViewerUrl(url)
        setPdfViewerName(tab.attributes?.displayName || tab.name)
      } else if (
        result?.data &&
        (result?.mimeType === 'application/x-guitar-pro' || getFileType(tab.name) === 'gp')
      ) {
        setGpViewerTab(tab)
        setGpViewerData(result.data)
        setGpViewerName(tab.attributes?.displayName || tab.name)
      } else {
        // Non-viewer file (e.g. TXT opened externally)
        await playSessionService.recordSession({
          fid: tab.id,
          fn: tab.attributes?.displayName || tab.name,
          dur: 1
        })
      }
    } catch (e) {
      console.error(e)
      alert('Failed to open file')
    }
  }

  const handleClosePdfViewer = async (elapsedSeconds?: number): Promise<void> => {
    const activeTab = pdfViewerTab
    setPdfViewerUrl(null)
    setPdfViewerName('')
    setPdfViewerTab(null)

    if (activeTab && elapsedSeconds && elapsedSeconds > 0) {
      try {
        const currentSeconds = activeTab.attributes?.secondsPlayed || 0
        const updatedSeconds = currentSeconds + elapsedSeconds

        console.log(
          `[Playtime Tracker] Tab "${activeTab.name}" played for ${elapsedSeconds}s. Total: ${updatedSeconds}s`
        )

        await api.updateAttributes(activeTab.id, {
          ...activeTab.attributes,
          secondsPlayed: updatedSeconds,
          lastAccessed: new Date().toISOString()
        })

        await playSessionService.recordSession({
          fid: activeTab.id,
          fn: activeTab.attributes?.displayName || activeTab.name,
          dur: elapsedSeconds
        })

        loadTabs(false)
      } catch (err) {
        console.error('[Playtime Tracker] Failed to save playtime in MEGA:', err)
      }
    }
  }

  const handleCloseGpViewer = async (elapsedSeconds?: number): Promise<void> => {
    const activeTab = gpViewerTab
    setGpViewerData(null)
    setGpViewerName('')
    setGpViewerTab(null)

    if (activeTab && elapsedSeconds && elapsedSeconds > 0) {
      try {
        const currentSeconds = activeTab.attributes?.secondsPlayed || 0
        const updatedSeconds = currentSeconds + elapsedSeconds

        console.log(
          `[Playtime Tracker] GP Tab "${activeTab.name}" played for ${elapsedSeconds}s. Total: ${updatedSeconds}s`
        )

        await api.updateAttributes(activeTab.id, {
          ...activeTab.attributes,
          secondsPlayed: updatedSeconds,
          lastAccessed: new Date().toISOString()
        })

        await playSessionService.recordSession({
          fid: activeTab.id,
          fn: activeTab.attributes?.displayName || activeTab.name,
          dur: elapsedSeconds
        })

        loadTabs(false)
      } catch (err) {
        console.error('[Playtime Tracker] Failed to save playtime in MEGA:', err)
      }
    }
  }

  const handleDownload = async (e: React.MouseEvent, tab: IGuitarTab): Promise<void> => {
    e.stopPropagation() // Prevent opening
    try {
      const res = await api.downloadFile(tab.id, tab.name)
      if (res.success) {
        // In web, download is handled by browser. In electron, it might show success alert.
        // We can just imply success if no error.
      } else if (!res.canceled) {
        alert('Download failed: ' + (res.error || 'Unknown error'))
      }
    } catch (err) {
      console.error(err)
      alert('Download failed')
    }
  }

  // Trigger Edit Modal
  const handleEditClick = (e: React.MouseEvent, tab: IGuitarTab): void => {
    e.stopPropagation()
    setEditTab(tab)
  }

  const handleToggleFavorite = async (e: React.MouseEvent, tab: IGuitarTab): Promise<void> => {
    e.stopPropagation()
    try {
      const res = await api.updateAttributes(tab.id, {
        ...tab.attributes,
        isFavorite: !tab.attributes?.isFavorite
      })
      if (res.success) {
        await loadTabs(false)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Extract unique tunings from current tabs, always ensuring 'Standard' is the first option
  const availableTunings = React.useMemo(() => {
    const tunings = new Set(tabs.map((t) => t.attributes?.tuning).filter(Boolean))
    tunings.delete('Standard') // Remove to control precise position
    const sortedOthers = Array.from(tunings).sort()
    return ['Standard', ...sortedOthers] as string[]
  }, [tabs])

  const handleSort = (key: string): void => {
    setSortMode('alpha') // Reset to default mode when using manual column sorting
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' }
        if (prev.direction === 'desc') return { key: '', direction: null }
      }
      return { key, direction: 'asc' }
    })
  }

  const filteredAndSortedTabs = React.useMemo(() => {
    const result = tabs.filter((tab) => {
      // Exclude JSON files (like settings.json)
      if (tab.name.toLowerCase().endsWith('.json')) return false

      const title = tab.name.toLowerCase()
      const tuning = (tab.attributes?.tuning || '').toLowerCase()
      const status = tab.attributes?.status || 'None'
      const capo = tab.attributes?.capo

      // 1. Text Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const displayName = (tab.attributes?.displayName || '').toLowerCase()
        if (!title.includes(query) && !tuning.includes(query) && !displayName.includes(query))
          return false
      }

      // 2. Capo Filter
      if (capoFilter !== '') {
        if (capo !== Number(capoFilter)) return false
      }

      // 3. Category Filter (Sidebar)
      if (activeCategory === 'favorites' && !tab.attributes?.isFavorite) return false

      if (activeCategory === 'learning') {
        if (status === 'None' || status === 'Learned') return false
      }

      // 4. Multi-select Status Filter
      if (selectedStatuses.length > 0) {
        if (!selectedStatuses.includes(status)) return false
      }

      // 5. Tuning Filter
      if (selectedTuning && tab.attributes?.tuning !== selectedTuning) return false

      // 6. File Type Filter
      if (fileTypeFilter !== 'all') {
        const type = getFileType(tab.name)
        if (type !== fileTypeFilter) return false
      }

      return true
    })

    // Sorting
    if (sortConfig.key && sortConfig.direction) {
      result.sort((a, b) => {
        let aValue: string | number = ''
        let bValue: string | number = ''

        if (sortConfig.key === 'tuning') {
          aValue = a.attributes?.tuning || ''
          bValue = b.attributes?.tuning || ''
        } else if (sortConfig.key === 'name') {
          aValue = (a.attributes?.displayName || a.name).toLowerCase()
          bValue = (b.attributes?.displayName || b.name).toLowerCase()
        } else if (sortConfig.key === 'capo') {
          aValue = a.attributes?.capo || 0
          bValue = b.attributes?.capo || 0
        } else if (sortConfig.key === 'status') {
          aValue = a.attributes?.status || 'None'
          bValue = b.attributes?.status || 'None'
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    } else {
      // Advanced Sort Modes
      result.sort((a, b) => {
        if (sortMode === 'created') {
          const dateA = a.attributes?.createdAt || ''
          const dateB = b.attributes?.createdAt || ''
          if (!dateA && !dateB) return a.name.localeCompare(b.name)
          return dateB.localeCompare(dateA) // Newest first
        } else if (sortMode === 'recent') {
          const accessA = a.attributes?.lastAccessed || a.attributes?.createdAt || ''
          const accessB = b.attributes?.lastAccessed || b.attributes?.createdAt || ''
          if (!accessA && !accessB) return a.name.localeCompare(b.name)
          return accessB.localeCompare(accessA) // Newest first
        } else if (sortMode === 'time') {
          const timeA = a.attributes?.secondsPlayed || 0
          const timeB = b.attributes?.secondsPlayed || 0
          if (timeA === timeB) return a.name.localeCompare(b.name)
          return timeB - timeA // Most practiced time first
        } else if (sortMode === 'played') {
          const playedA = a.attributes?.timesPlayed || 0
          const playedB = b.attributes?.timesPlayed || 0
          if (playedA === playedB) return a.name.localeCompare(b.name)
          return playedB - playedA // Most played first
        } else {
          // Alphabetical fallback
          const nameA = a.attributes?.displayName || a.name
          const nameB = b.attributes?.displayName || b.name
          return nameA.localeCompare(nameB)
        }
      })
    }

    return result
  }, [
    tabs,
    searchQuery,
    activeCategory,
    selectedStatuses,
    selectedTuning,
    capoFilter,
    sortConfig,
    fileTypeFilter,
    sortMode
  ])

  const filteredTabs = filteredAndSortedTabs
  const [isDragging, setIsDragging] = useState(false)

  const formatPlayDuration = (totalSeconds?: number): string | null => {
    if (!totalSeconds || totalSeconds <= 0) return null
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }

  const formatDate = (dateString?: string): string => {
    if (!dateString) return ''
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return ''
    }
  }

  // Global Drag and Drop Handlers
  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      // Disable drag overlay if any modal is open
      if (uploadQueue.length > 0 || editTab || deleteTab) return

      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true)
      }
    }

    const handleWindowDragOver = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
    }

    // We handle drop on the window to prevent browser default behavior everywhere
    const handleWindowDrop = (e: DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
    }

    window.addEventListener('dragenter', handleWindowDragEnter)
    window.addEventListener('dragover', handleWindowDragOver)
    window.addEventListener('drop', handleWindowDrop)

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter)
      window.removeEventListener('dragover', handleWindowDragOver)
      window.removeEventListener('drop', handleWindowDrop)
    }
  }, [uploadQueue.length, editTab, deleteTab])

  const handleOverlayDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    // Only close if we are actually leaving the overlay (not entering a child)
    // If relatedTarget is null, we left the window.
    if (!e.relatedTarget || (e.relatedTarget as HTMLElement).nodeName === 'HTML') {
      setIsDragging(false)
    }
  }

  const handleOverlayDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const newQueue: { file: File; path: string }[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const filePath = api.getFilePath(file) || ''
        newQueue.push({ file, path: filePath })
      }

      setUploadQueue(newQueue)
      setCurrentUploadIndex(0)
    }
  }

  if (loading)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#aaa',
          gap: 10
        }}
      >
        <div className="spinner"></div> Loading Library...
      </div>
    )

  return (
    <div
      className="file-browser"
      style={{ padding: '30px', color: '#fff', flex: 1, overflowY: 'auto', position: 'relative' }}
    >
      <div className="browser-header" style={{ marginBottom: 20 }}>
        <div
          className="header-top-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
            {onOpenSidebar && (
              <button
                className="mobile-only"
                onClick={onOpenSidebar}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '5px',
                  marginLeft: -5,
                  marginRight: -5
                }}
              >
                <Icons.Menu size={24} />
              </button>
            )}
            <div>
              <h2
                className="header-title"
                style={{ margin: 0, fontSize: 20, fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                {activeCategory === 'favorites'
                  ? 'Favorites'
                  : activeCategory === 'learning'
                    ? 'Learning List'
                    : 'My Library'}
              </h2>
              <p
                className="desktop-only"
                style={{ margin: '3px 0 0', color: '#888', fontSize: 13 }}
              >
                {filteredTabs.length} tabs found
              </p>
            </div>
          </div>

          <div
            className="search-container"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flex: '1 1 auto',
              maxWidth: '600px',
              minWidth: '150px'
            }}
          >
            <div style={{ position: 'relative', width: '100%' }}>
              <Icons.Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#aaa'
                }}
              />
              <input
                type="text"
                placeholder={`Search ${activeCategory === 'favorites' ? 'favorites' : activeCategory === 'learning' ? 'learning' : 'library'}...`}
                value={searchQuery}
                onChange={(e) => onSearch?.(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1e1e24',
                  border: '1px solid #333',
                  padding: '8px 30px 8px 32px',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => onSearch?.('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#aaa',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  className="clear-search-btn"
                >
                  <Icons.X size={14} />
                </button>
              )}
            </div>
          </div>

          <div
            className="browser-actions"
            style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}
          >
            <button
              onClick={() => loadTabs(true)}
              title="Refresh List"
              style={{
                background: '#2b2b36',
                border: '1px solid #333',
                color: '#ccc',
                width: 38,
                height: 38,
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#333'
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#2b2b36'
                e.currentTarget.style.color = '#ccc'
              }}
            >
              <Icons.RefreshCw size={18} />
            </button>

            <input
              id="upload-input"
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <label
              htmlFor="upload-input"
              style={{
                background: '#bb86fc',
                border: 'none',
                color: '#121212',
                padding: '10px 20px',
                height: 38,
                borderRadius: 8,
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(187, 134, 252, 0.2)',
                cursor: 'pointer',
                userSelect: 'none',
                boxSizing: 'border-box'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(187, 134, 252, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(187, 134, 252, 0.2)'
              }}
            >
              <Icons.Upload size={18} />
              <span className="desktop-only">Upload Tab</span>
            </label>
          </div>
        </div>

        <div
          className="filter-bar"
          style={{ display: 'flex', gap: '12px 24px', alignItems: 'center', flexWrap: 'wrap' }}
        >
          {/* Status Group */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['To Learn', 'Learning', 'Learned', 'None'].map((s) => (
              <button
                key={s}
                onClick={() =>
                  setSelectedStatuses((prev) =>
                    prev.includes(s) ? prev.filter((st) => st !== s) : [...prev, s]
                  )
                }
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  border: '1px solid ' + (selectedStatuses.includes(s) ? '#bb86fc' : '#444'),
                  background: selectedStatuses.includes(s)
                    ? 'rgba(187, 134, 252, 0.15)'
                    : 'transparent',
                  color: selectedStatuses.includes(s) ? '#bb86fc' : '#888',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="desktop-only" style={{ width: 1, height: 20, background: '#444' }}></div>

          {/* File Type Filter - Only show if we have different types or if filtered */}
          {availableFileTypes.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 11,
                  color: '#aaa',
                  marginRight: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600
                }}
              >
                Type
              </span>
              {availableFileTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFileTypeFilter(t.id as 'all' | 'pdf' | 'gp' | 'txt')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 12,
                    border: '1px solid ' + (fileTypeFilter === t.id ? '#03dac6' : '#444'),
                    background: fileTypeFilter === t.id ? 'rgba(3, 218, 198, 0.15)' : 'transparent',
                    color: fileTypeFilter === t.id ? '#03dac6' : '#888',
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {availableTunings.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
              <div
                className="desktop-only"
                style={{ width: 1, height: 20, background: '#444' }}
              ></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {availableTunings.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTuning((prev) => (prev === t ? '' : t))}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      border: '1px solid ' + (selectedTuning === t ? '#03dac6' : '#444'),
                      background: selectedTuning === t ? 'rgba(3, 218, 198, 0.15)' : 'transparent',
                      color: selectedTuning === t ? '#03dac6' : '#888',
                      fontSize: 12,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div
              className="desktop-only"
              style={{ width: 1, height: 20, background: '#444' }}
            ></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 11,
                  color: '#aaa',
                  marginRight: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600
                }}
              >
                Sort by
              </span>
              {[
                { id: 'recent', label: 'Recent' },
                { id: 'created', label: 'Added' },
                { id: 'time', label: 'Time' },
                { id: 'played', label: 'Plays' },
                { id: 'alpha', label: 'A-Z' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSortMode(m.id as 'alpha' | 'created' | 'recent' | 'played' | 'time')
                    setSortConfig({ key: '', direction: null })
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 12,
                    border: '1px solid ' + (sortMode === m.id ? '#bb86fc' : '#444'),
                    background: sortMode === m.id ? 'rgba(187, 134, 252, 0.15)' : 'transparent',
                    color: sortMode === m.id ? '#bb86fc' : '#888',
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontWeight: sortMode === m.id ? 600 : 400
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div
              className="desktop-only"
              style={{ width: 1, height: 20, background: '#444' }}
            ></div>
            {/* Capo Filter Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#888' }}>Capo:</span>
              <input
                type="number"
                min="0"
                max="12"
                placeholder="#"
                value={capoFilter}
                onChange={(e) => setCapoFilter(e.target.value)}
                className="no-spin"
                style={{
                  width: 30,
                  background: '#2b2b36',
                  border: '1px solid ' + (capoFilter ? '#bb86fc' : '#444'),
                  borderRadius: 4,
                  color: '#fff',
                  padding: '4px 8px',
                  fontSize: 12,
                  textAlign: 'center'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {filteredTabs.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#aaa',
            border: '2px dashed #333',
            borderRadius: 12,
            position: 'relative'
          }}
        >
          <Icons.FileText size={48} style={{ opacity: 0.3, marginBottom: 10 }} />
          <p>No tabs found. Upload some to get started!</p>
        </div>
      ) : (
        <div
          className="table-container"
          style={{
            border: '1px solid #333',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#1e1e24',
            position: 'relative'
          }}
        >
          <table
            className="library-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              tableLayout: 'fixed'
            }}
          >
            <thead className="desktop-only">
              <tr
                style={{
                  background: '#2b2b36',
                  color: '#bbb',
                  fontSize: 13,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                <th
                  onClick={() => handleSort('name')}
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    width: 'auto',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  className="desktop-only"
                  onClick={() => handleSort('tuning')}
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    width: 100,
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Tuning{' '}
                    {sortConfig.key === 'tuning' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  className="desktop-only"
                  onClick={() => handleSort('capo')}
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    width: 80,
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Capo {sortConfig.key === 'capo' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th
                  className="desktop-only"
                  onClick={() => handleSort('status')}
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    width: ['played', 'created', 'recent', 'time'].includes(sortMode) ? 180 : 110,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'width 0.2s ease-in-out'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Status{' '}
                    {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th style={{ padding: '12px 16px', width: 120, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredTabs.map((tab) => (
                <tr
                  key={tab.id}
                  className="tab-row"
                  style={{
                    borderBottom: '1px solid #2b2b36',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => handleOpen(tab)}
                  title="Click to open"
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#25252e')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td
                    className="cell-main"
                    style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'rgba(187, 134, 252, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#bb86fc',
                        flexShrink: 0
                      }}
                    >
                      {getFileIcon(tab.name)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      <span
                        className="tab-name"
                        style={{
                          fontWeight: 500,
                          fontSize: 14,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'block'
                        }}
                      >
                        {tab.attributes?.displayName || tab.name}
                      </span>
                      {tab.attributes?.displayName && (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#aaa',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {tab.name}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={(e) => handleToggleFavorite(e, tab)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: tab.attributes?.isFavorite ? '#ffb74d' : '#333',
                        cursor: 'pointer',
                        padding: '4px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                      onMouseEnter={(e) => {
                        if (!tab.attributes?.isFavorite) e.currentTarget.style.color = '#888'
                      }}
                      onMouseLeave={(e) => {
                        if (!tab.attributes?.isFavorite) e.currentTarget.style.color = '#333'
                      }}
                    >
                      <Icons.Star
                        size={18}
                        fill={tab.attributes?.isFavorite ? '#ffb74d' : 'transparent'}
                      />
                    </button>
                  </td>

                  <td
                    className="desktop-only"
                    title={tab.attributes?.tuning || 'Standard'}
                    style={{
                      padding: '14px 16px',
                      color: '#888',
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 150
                    }}
                  >
                    {tab.attributes?.tuning || 'Standard'}
                  </td>

                  <td
                    className="desktop-only"
                    style={{
                      padding: '14px 16px',
                      color: '#888',
                      fontSize: 13,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {tab.attributes?.capo && tab.attributes.capo > 0
                      ? `Capo ${tab.attributes.capo}`
                      : '-'}
                  </td>

                  <td
                    className="desktop-only"
                    style={{ padding: '10px 16px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        justifyContent: 'center'
                      }}
                    >
                      {/* Tier 1: Status Tag */}
                      {tab.attributes?.status && tab.attributes.status !== 'None' ? (
                        <div>
                          <span
                            className="status-badge"
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                              background:
                                tab.attributes.status === 'Learned'
                                  ? 'rgba(76, 175, 80, 0.18)'
                                  : tab.attributes.status === 'Learning'
                                    ? 'rgba(255, 193, 7, 0.18)'
                                    : 'rgba(255, 255, 255, 0.08)',
                              color:
                                tab.attributes.status === 'Learned'
                                  ? '#4caf50'
                                  : tab.attributes.status === 'Learning'
                                    ? '#ffc107'
                                    : '#aaa'
                            }}
                          >
                            {tab.attributes.status}
                          </span>
                        </div>
                      ) : null}

                      {/* Tier 2: Practice Timer / Play Stats */}
                      {tab.attributes?.secondsPlayed && tab.attributes.secondsPlayed > 0 ? (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 12,
                            color: '#9e9eb0'
                          }}
                          title={`Total practice time: ${formatPlayDuration(tab.attributes.secondsPlayed)}`}
                        >
                          <Icons.Clock size={12} style={{ color: '#bb86fc', flexShrink: 0 }} />
                          <span>{formatPlayDuration(tab.attributes.secondsPlayed)}</span>
                          {sortMode === 'played' && (tab.attributes?.timesPlayed || 0) > 0 && (
                            <span style={{ color: '#666', fontSize: 11 }}>
                              ({tab.attributes.timesPlayed}x)
                            </span>
                          )}
                        </div>
                      ) : sortMode === 'played' && (tab.attributes?.timesPlayed || 0) > 0 ? (
                        <div style={{ fontSize: 12, color: '#888' }}>
                          {tab.attributes.timesPlayed} play
                          {tab.attributes.timesPlayed !== 1 ? 's' : ''}
                        </div>
                      ) : sortMode === 'created' && tab.attributes?.createdAt ? (
                        <div style={{ fontSize: 11, color: '#777' }}>
                          Added {formatDate(tab.attributes.createdAt)}
                        </div>
                      ) : sortMode === 'recent' && tab.attributes?.lastAccessed ? (
                        <div style={{ fontSize: 11, color: '#777' }}>
                          Viewed {formatDate(tab.attributes.lastAccessed)}
                        </div>
                      ) : !tab.attributes?.status || tab.attributes.status === 'None' ? (
                        <span style={{ color: '#555', fontSize: 13 }}>-</span>
                      ) : null}
                    </div>
                  </td>

                  <td
                    className="cell-actions"
                    style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 4
                      }}
                    >
                      <button
                        onClick={(e) => handleDownload(e, tab)}
                        title="Download Tab"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#888',
                          cursor: 'pointer',
                          padding: 8,
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#fff'
                          e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#888'
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <Icons.Download size={18} />
                      </button>
                      <button
                        onClick={(e) => handleEditClick(e, tab)}
                        title="Edit Details"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#888',
                          cursor: 'pointer',
                          padding: 8,
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#fff'
                          e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#888'
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <Icons.Edit size={18} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(e, tab)}
                        title="Delete Tab"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#888',
                          cursor: 'pointer',
                          padding: 8,
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#f44336'
                          e.currentTarget.style.background = 'rgba(244, 67, 54, 0.1)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#888'
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <Icons.Trash2 size={18} />
                      </button>
                    </div>
                  </td>

                  <td className="cell-metadata mobile-only" style={{ padding: '0 16px 14px' }}>
                    <div
                      className="metadata-row"
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        fontSize: 13,
                        color: '#aaa'
                      }}
                    >
                      <span className="mobile-only-inline">
                        {tab.attributes?.tuning || 'Standard'}
                      </span>
                      <span className="mobile-only-inline">
                        {tab.attributes?.capo && tab.attributes.capo > 0
                          ? `Capo ${tab.attributes.capo}`
                          : 'No Capo'}
                      </span>
                      {tab.attributes?.secondsPlayed && tab.attributes.secondsPlayed > 0 && (
                        <span className="mobile-only-inline" style={{ color: '#888' }}>
                          ⏱ {formatPlayDuration(tab.attributes.secondsPlayed)}
                        </span>
                      )}
                      {tab.attributes?.status && tab.attributes.status !== 'None' && (
                        <span
                          className="status-badge"
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            background:
                              tab.attributes.status === 'Learned'
                                ? 'rgba(76, 175, 80, 0.2)'
                                : tab.attributes.status === 'Learning'
                                  ? 'rgba(255, 193, 7, 0.2)'
                                  : 'rgba(255, 255, 255, 0.1)',
                            color:
                              tab.attributes.status === 'Learned'
                                ? '#4caf50'
                                : tab.attributes.status === 'Learning'
                                  ? '#ffc107'
                                  : '#aaa'
                          }}
                        >
                          {tab.attributes.status}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isDragging && (
        <div
          onDragLeave={handleOverlayDragLeave}
          onDrop={handleOverlayDrop}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(187, 134, 252, 0.15)',
            backdropFilter: 'blur(4px)',
            border: '4px dashed #bb86fc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            color: '#bb86fc',
            flexDirection: 'column',
            gap: 20,
            pointerEvents: 'all'
          }}
        >
          <Icons.Upload size={80} />
          <span style={{ fontSize: 28, fontWeight: 600, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            Drop file to upload
          </span>
        </div>
      )}

      {uploadQueue.length > 0 && uploadQueue[currentUploadIndex] && (
        <UploadModal
          key={`upload-${currentUploadIndex}-${uploadQueue[currentUploadIndex].file.name}`}
          fileName={uploadQueue[currentUploadIndex].file.name}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancelUpload}
          batchProgress={{ current: currentUploadIndex + 1, total: uploadQueue.length }}
          pdfPreview={pdfAnalysis?.previewBase64}
          suggestedAttributes={
            pdfAnalysis ? { tuning: pdfAnalysis.tuning, capo: pdfAnalysis.capo } : undefined
          }
          existingFileNames={tabs.map((t) => t.name)}
          onSkip={handleSkip}
        />
      )}

      {editTab && (
        <UploadModal
          fileName={editTab.name}
          initialAttributes={editTab.attributes}
          isEditMode={true}
          existingFileNames={tabs.map((t) => t.name)}
          onConfirm={handleConfirmEdit}
          onCancel={() => setEditTab(null)}
        />
      )}

      {deleteTab && (
        <ConfirmationModal
          title="Delete Tab"
          message={`Are you sure you want to delete "${deleteTab.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          isDestructive={true}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTab(null)}
        />
      )}

      {pdfViewerUrl && (
        <PdfViewer
          url={pdfViewerUrl}
          name={pdfViewerName}
          initialSecondsPlayed={pdfViewerTab?.attributes?.secondsPlayed || 0}
          onClose={handleClosePdfViewer}
        />
      )}

      {gpViewerData && (
        <GpViewer
          data={gpViewerData}
          name={gpViewerName}
          initialSecondsPlayed={gpViewerTab?.attributes?.secondsPlayed || 0}
          onClose={handleCloseGpViewer}
        />
      )}
    </div>
  )
}
