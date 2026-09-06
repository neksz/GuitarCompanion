import React, { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { ChevronRight, Check, Play, Square, Plus, X } from 'lucide-react'
import { IGuitarTab, ITabAttributes } from '../../../shared/types'
import { TagInfo, getTagColor } from '../utils/tagUtils'
import { useMetronomeStore } from '../utils/useMetronomeStore'
import { Icons } from './Icons'
import styles from './TabContextMenu.module.css'

interface TabContextMenuProps {
  targetTab: IGuitarTab
  position: { x: number; y: number }
  allTags: TagInfo[]
  onClose: () => void
  onUpdateAttributes: (id: string, attributes: ITabAttributes) => Promise<void>
  onToggleFavorite?: (tab: IGuitarTab) => void
  onDownload?: (tab: IGuitarTab) => void
  onEdit?: (tab: IGuitarTab) => void
  onDelete?: (tab: IGuitarTab) => void
}

const STATUS_OPTIONS: Array<{
  id: 'Learned' | 'Learning' | 'To Learn' | 'None'
  label: string
  color: string
  bg: string
}> = [
  { id: 'Learned', label: 'Learned', color: '#4caf50', bg: 'rgba(76, 175, 80, 0.18)' },
  { id: 'Learning', label: 'Learning', color: '#ffc107', bg: 'rgba(255, 193, 7, 0.18)' },
  { id: 'To Learn', label: 'To Learn', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.18)' },
  { id: 'None', label: 'None (Clear)', color: '#aaa', bg: 'rgba(255, 255, 255, 0.08)' }
]

const TEMPO_PRESETS = [70, 85, 100, 120, 140, 160]

export const TabContextMenu: React.FC<TabContextMenuProps> = ({
  targetTab,
  position,
  allTags,
  onClose,
  onUpdateAttributes,
  onToggleFavorite,
  onDownload,
  onEdit,
  onDelete
}) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const tagSearchInputRef = useRef<HTMLInputElement>(null)
  const isTouchDevice =
    typeof window !== 'undefined' &&
    (window.matchMedia('(hover: none)').matches ||
      window.matchMedia('(pointer: coarse)').matches ||
      window.innerWidth <= 768)
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800
  const initialLeft = Math.min(Math.max(10, position.x), viewportWidth - 250)
  const initialTop = Math.min(Math.max(10, position.y), viewportHeight - 350)
  const openSubmenuOnLeft = initialLeft + 240 + 250 > viewportWidth
  const [activeSubmenu, setActiveSubmenu] = useState<'tags' | 'status' | 'tempo' | null>(null)
  const [tagSearch, setTagSearch] = useState('')
  const [inlineBpm, setInlineBpm] = useState<string>(
    targetTab.attributes?.tempo ? String(targetTab.attributes.tempo) : ''
  )
  const [submenuBpm, setSubmenuBpm] = useState<string>(
    targetTab.attributes?.tempo ? String(targetTab.attributes.tempo) : ''
  )

  const isMetronomePlaying = useMetronomeStore((s) => s.isPlaying)
  const metronomeBpm = useMetronomeStore((s) => s.bpm)
  const startMetronome = useMetronomeStore((s) => s.start)
  const stopMetronome = useMetronomeStore((s) => s.stop)
  const openMetronomeModal = useMetronomeStore((s) => s.open)

  const currentTabTempo = targetTab.attributes?.tempo
  const currentStatus = targetTab.attributes?.status || 'None'
  const tabTags: string[] = targetTab.attributes?.tags || []
  const tabTagColors: Record<string, string> = targetTab.attributes?.tagColors || {}

  // Smart Viewport Collision Detection: adjust DOM directly to avoid cascading renders
  useLayoutEffect(() => {
    if (!menuRef.current) return
    if (window.innerWidth <= 600) return

    const rect = menuRef.current.getBoundingClientRect()
    if (rect.right > window.innerWidth - 10) {
      menuRef.current.style.left = `${Math.max(10, window.innerWidth - rect.width - 10)}px`
    }
    if (rect.bottom > window.innerHeight - 10) {
      menuRef.current.style.top = `${Math.max(10, window.innerHeight - rect.height - 10)}px`
    }
  }, [])

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const submenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleOpenSubmenu = (menu: 'tags' | 'status' | 'tempo'): void => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current)
      submenuTimeoutRef.current = null
    }
    setActiveSubmenu(menu)
  }

  const handleCloseSubmenu = (): void => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current)
    }
    submenuTimeoutRef.current = setTimeout(() => {
      setActiveSubmenu(null)
    }, 280)
  }

  useEffect(() => {
    return () => {
      if (submenuTimeoutRef.current) {
        clearTimeout(submenuTimeoutRef.current)
      }
    }
  }, [])

  // Handle Status Selection
  const handleSelectStatus = async (
    newStatus: 'Learned' | 'Learning' | 'To Learn' | 'None'
  ): Promise<void> => {
    const updatedAttrs: ITabAttributes = {
      ...targetTab.attributes,
      status: newStatus
    }
    await onUpdateAttributes(targetTab.id, updatedAttrs)
    onClose()
  }

  // Handle Tag Toggle
  const handleToggleTag = async (tagName: string): Promise<void> => {
    const exists = tabTags.includes(tagName)
    const newTags = exists ? tabTags.filter((t) => t !== tagName) : [...tabTags, tagName]

    const newColors = { ...tabTagColors }
    if (!exists && !newColors[tagName]) {
      // Find matching tag color if available, otherwise compute it
      const existingInfo = allTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
      const colorObj = getTagColor(tagName, existingInfo?.color)
      newColors[tagName] = colorObj.id
    }

    const updatedAttrs: ITabAttributes = {
      ...targetTab.attributes,
      tags: newTags,
      tagColors: newColors
    }
    await onUpdateAttributes(targetTab.id, updatedAttrs)
  }

  // Handle Create New Tag
  const handleCreateNewTag = async (): Promise<void> => {
    const cleanName = tagSearch.trim()
    if (!cleanName) return

    const exists = tabTags.some((t) => t.toLowerCase() === cleanName.toLowerCase())
    if (exists) {
      setTagSearch('')
      return
    }

    const colorObj = getTagColor(cleanName)
    const updatedAttrs: ITabAttributes = {
      ...targetTab.attributes,
      tags: [...tabTags, cleanName],
      tagColors: {
        ...tabTagColors,
        [cleanName]: colorObj.id
      }
    }

    await onUpdateAttributes(targetTab.id, updatedAttrs)
    setTagSearch('')
  }

  // Handle Metronome Play/Stop
  const handleToggleMetronome = async (): Promise<void> => {
    if (isMetronomePlaying) {
      stopMetronome()
    } else {
      const bpmToPlay = currentTabTempo && currentTabTempo > 0 ? currentTabTempo : metronomeBpm
      await startMetronome(bpmToPlay)
    }
    onClose()
  }

  // Handle Save BPM to Tab
  const handleSaveTempo = async (bpmVal: number, startPlayback: boolean = false): Promise<void> => {
    const validBpm = Math.min(300, Math.max(30, Math.round(bpmVal)))
    const updatedAttrs: ITabAttributes = {
      ...targetTab.attributes,
      tempo: validBpm
    }
    await onUpdateAttributes(targetTab.id, updatedAttrs)

    if (startPlayback) {
      await startMetronome(validBpm)
    }
    onClose()
  }

  // Handle Clear Tempo
  const handleClearTempo = async (): Promise<void> => {
    const updatedAttrs: ITabAttributes = {
      ...targetTab.attributes,
      tempo: undefined
    }
    await onUpdateAttributes(targetTab.id, updatedAttrs)
    onClose()
  }

  // Filtered tags for submenu
  const filteredTags = allTags.filter((t) =>
    t.name.toLowerCase().includes(tagSearch.toLowerCase().trim())
  )

  const canCreateTag =
    tagSearch.trim().length > 0 &&
    !allTags.some((t) => t.name.toLowerCase() === tagSearch.trim().toLowerCase())

  const activeStatusObj = STATUS_OPTIONS.find((s) => s.id === currentStatus)

  return (
    <>
      <div
        className={styles.contextMenuOverlay}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
        onTouchEnd={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        className={styles.contextMenu}
        style={isTouchDevice ? undefined : { top: initialTop, left: initialLeft }}
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Mobile Bottom Sheet Drag Handle */}
        <div className={styles.bottomSheetHandle} />

        {/* Header with Tab Name */}
        <div
          className={styles.menuHeader}
          title={targetTab.attributes?.displayName || targetTab.name}
        >
          <div className={styles.menuHeaderIcon}>
            <Icons.Music size={14} />
          </div>
          <span className={styles.menuHeaderTitle}>
            {targetTab.attributes?.displayName || targetTab.name}
          </span>
        </div>

        {/* Mobile / Small Screen Row Actions */}
        <div
          className={`${styles.menuItem} ${styles.smallScreenAction}`}
          onClick={() => {
            onToggleFavorite?.(targetTab)
            onClose()
          }}
        >
          <div className={styles.menuItemContent}>
            <div
              className={styles.menuItemIcon}
              style={{ color: targetTab.attributes?.isFavorite ? '#ffb74d' : undefined }}
            >
              <Icons.Star
                size={15}
                fill={targetTab.attributes?.isFavorite ? '#ffb74d' : 'transparent'}
              />
            </div>
            <span className={styles.menuItemText}>
              {targetTab.attributes?.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            </span>
          </div>
        </div>

        <div
          className={`${styles.menuItem} ${styles.smallScreenAction}`}
          onClick={() => {
            onDownload?.(targetTab)
            onClose()
          }}
        >
          <div className={styles.menuItemContent}>
            <div className={styles.menuItemIcon}>
              <Icons.Download size={15} />
            </div>
            <span className={styles.menuItemText}>Download Tab</span>
          </div>
        </div>

        <div
          className={`${styles.menuItem} ${styles.smallScreenAction}`}
          onClick={() => {
            onEdit?.(targetTab)
            onClose()
          }}
        >
          <div className={styles.menuItemContent}>
            <div className={styles.menuItemIcon}>
              <Icons.Edit size={15} />
            </div>
            <span className={styles.menuItemText}>Edit Details</span>
          </div>
        </div>

        <div
          className={`${styles.menuItem} ${styles.smallScreenAction} ${styles.destructiveAction}`}
          onClick={() => {
            onDelete?.(targetTab)
            onClose()
          }}
        >
          <div className={styles.menuItemContent}>
            <div className={styles.menuItemIcon} style={{ color: '#ff6b6b' }}>
              <Icons.Trash2 size={15} />
            </div>
            <span className={styles.menuItemText} style={{ color: '#ff6b6b' }}>
              Delete Tab
            </span>
          </div>
        </div>

        <div className={`${styles.menuDivider} ${styles.smallScreenAction}`} />

        {/* 1. TAGS SUBMENU ITEM */}
        <div
          className={styles.submenuWrapper}
          onMouseEnter={() => handleOpenSubmenu('tags')}
          onMouseLeave={handleCloseSubmenu}
        >
          <div
            className={`${styles.menuItem} ${activeSubmenu === 'tags' ? styles.menuItemActive : ''}`}
            onClick={() => setActiveSubmenu(activeSubmenu === 'tags' ? null : 'tags')}
          >
            <div className={styles.menuItemContent}>
              <div className={styles.menuItemIcon}>
                <Icons.Tag size={15} />
              </div>
              <span className={styles.menuItemText}>Assign Tags</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {tabTags.length > 0 && (
                <span
                  className={styles.menuItemBadge}
                  style={{
                    background: 'rgba(187, 134, 252, 0.2)',
                    color: '#bb86fc',
                    border: '1px solid rgba(187, 134, 252, 0.3)'
                  }}
                >
                  {tabTags.length}
                </span>
              )}
              <div
                className={`${styles.chevronIcon} ${
                  activeSubmenu === 'tags' ? styles.chevronIconOpen : ''
                }`}
              >
                <ChevronRight size={14} />
              </div>
            </div>
          </div>

          {/* Tags Submenu Flyout */}
          {activeSubmenu === 'tags' && (
            <div
              className={`${styles.submenu} ${
                openSubmenuOnLeft ? styles.submenuLeft : styles.submenuRight
              }`}
              onMouseEnter={() => handleOpenSubmenu('tags')}
              onMouseLeave={handleCloseSubmenu}
            >
              <div className={styles.submenuSearchBox}>
                <input
                  ref={tagSearchInputRef}
                  type="text"
                  placeholder="Search or add tag..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateNewTag()
                    }
                  }}
                  autoFocus={!isTouchDevice}
                  className={styles.submenuSearchInput}
                />
              </div>

              <div className={styles.submenuList}>
                {filteredTags.map((tag) => {
                  const isSelected = tabTags.includes(tag.name)
                  const tagColor = getTagColor(tag.name, tabTagColors[tag.name] || tag.color)
                  return (
                    <div
                      key={tag.name}
                      className={`${styles.tagOption} ${
                        isSelected ? styles.tagOptionSelected : ''
                      }`}
                      onClick={() => handleToggleTag(tag.name)}
                    >
                      <div className={styles.tagOptionMain}>
                        <span
                          className={styles.colorDot}
                          style={{ backgroundColor: tagColor.color }}
                        />
                        <span className={styles.tagName}>{tag.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={styles.tagCount}>({tag.count})</span>
                        {isSelected && (
                          <div className={styles.checkIndicator}>
                            <Check size={14} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {filteredTags.length === 0 && !canCreateTag && (
                  <div
                    style={{
                      padding: '10px 8px',
                      color: '#777',
                      fontSize: 12,
                      textAlign: 'center'
                    }}
                  >
                    No tags available
                  </div>
                )}

                {canCreateTag && (
                  <div className={styles.createTagItem} onClick={handleCreateNewTag}>
                    <Plus size={14} />
                    <span>Create &quot;{tagSearch.trim()}&quot;</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. STATUS SUBMENU ITEM */}
        <div
          className={styles.submenuWrapper}
          onMouseEnter={() => handleOpenSubmenu('status')}
          onMouseLeave={handleCloseSubmenu}
        >
          <div
            className={`${styles.menuItem} ${
              activeSubmenu === 'status' ? styles.menuItemActive : ''
            }`}
            onClick={() => setActiveSubmenu(activeSubmenu === 'status' ? null : 'status')}
          >
            <div className={styles.menuItemContent}>
              <div className={styles.menuItemIcon}>
                <Icons.CheckCircle size={15} />
              </div>
              <span className={styles.menuItemText}>Change Status</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {activeStatusObj && activeStatusObj.id !== 'None' && (
                <span
                  className={styles.menuItemBadge}
                  style={{
                    backgroundColor: activeStatusObj.bg,
                    color: activeStatusObj.color
                  }}
                >
                  {activeStatusObj.label}
                </span>
              )}
              <div
                className={`${styles.chevronIcon} ${
                  activeSubmenu === 'status' ? styles.chevronIconOpen : ''
                }`}
              >
                <ChevronRight size={14} />
              </div>
            </div>
          </div>

          {/* Status Submenu Flyout */}
          {activeSubmenu === 'status' && (
            <div
              className={`${styles.submenu} ${
                openSubmenuOnLeft ? styles.submenuLeft : styles.submenuRight
              }`}
              onMouseEnter={() => handleOpenSubmenu('status')}
              onMouseLeave={handleCloseSubmenu}
            >
              {STATUS_OPTIONS.map((opt) => {
                const isActive = currentStatus === opt.id
                return (
                  <div
                    key={opt.id}
                    className={`${styles.statusOption} ${
                      isActive ? styles.statusOptionActive : ''
                    }`}
                    onClick={() => handleSelectStatus(opt.id)}
                  >
                    <div className={styles.statusBadgeItem}>
                      <span className={styles.colorDot} style={{ backgroundColor: opt.color }} />
                      <span style={{ color: opt.color }}>{opt.label}</span>
                    </div>
                    {isActive && (
                      <div className={styles.checkIndicator}>
                        <Check size={14} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className={styles.menuDivider} />

        {/* 3. METRONOME & TEMPO SECTION */}
        {currentTabTempo && currentTabTempo > 0 ? (
          /* Case A: Tempo is already set on tab */
          <>
            <div className={styles.menuItem} onClick={handleToggleMetronome}>
              <div className={styles.menuItemContent}>
                <div
                  className={styles.menuItemIcon}
                  style={{ color: isMetronomePlaying ? '#ff6b6b' : '#34d399' }}
                >
                  {isMetronomePlaying ? <Square size={15} /> : <Play size={15} />}
                </div>
                <span className={styles.menuItemText}>
                  {isMetronomePlaying
                    ? 'Stop Metronome'
                    : `Start Metronome (${currentTabTempo} BPM)`}
                </span>
              </div>
            </div>

            {/* Tempo adjustment and settings submenu */}
            <div
              className={styles.submenuWrapper}
              onMouseEnter={() => handleOpenSubmenu('tempo')}
              onMouseLeave={handleCloseSubmenu}
            >
              <div
                className={`${styles.menuItem} ${
                  activeSubmenu === 'tempo' ? styles.menuItemActive : ''
                }`}
                onClick={() => setActiveSubmenu(activeSubmenu === 'tempo' ? null : 'tempo')}
              >
                <div className={styles.menuItemContent}>
                  <div className={styles.menuItemIcon}>
                    <Icons.Metronome size={15} />
                  </div>
                  <span className={styles.menuItemText}>Tempo Options</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#8e8ea0' }}>{currentTabTempo} BPM</span>
                  <div
                    className={`${styles.chevronIcon} ${
                      activeSubmenu === 'tempo' ? styles.chevronIconOpen : ''
                    }`}
                  >
                    <ChevronRight size={14} />
                  </div>
                </div>
              </div>

              {activeSubmenu === 'tempo' && (
                <div
                  className={`${styles.submenu} ${
                    openSubmenuOnLeft ? styles.submenuLeft : styles.submenuRight
                  }`}
                  onMouseEnter={() => handleOpenSubmenu('tempo')}
                  onMouseLeave={handleCloseSubmenu}
                >
                  <div
                    style={{
                      padding: '4px 6px 8px 6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>
                      Adjust Tab BPM
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className={styles.inlineTempoSecondaryBtn}
                        onClick={() => {
                          const val = Math.max(30, (Number(submenuBpm) || currentTabTempo) - 5)
                          setSubmenuBpm(String(val))
                        }}
                      >
                        -5
                      </button>
                      <input
                        type="number"
                        min="30"
                        max="300"
                        value={submenuBpm}
                        onChange={(e) => setSubmenuBpm(e.target.value)}
                        className={`${styles.inlineTempoInput} no-spin`}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className={styles.inlineTempoSecondaryBtn}
                        onClick={() => {
                          const val = Math.min(300, (Number(submenuBpm) || currentTabTempo) + 5)
                          setSubmenuBpm(String(val))
                        }}
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        className={styles.inlineTempoBtn}
                        onClick={() => {
                          const val = Number(submenuBpm) || currentTabTempo
                          handleSaveTempo(val)
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className={styles.menuDivider} />

                  <div
                    className={styles.menuItem}
                    onClick={() => {
                      openMetronomeModal()
                      onClose()
                    }}
                  >
                    <div className={styles.menuItemContent}>
                      <div className={styles.menuItemIcon}>
                        <Icons.Metronome size={14} />
                      </div>
                      <span className={styles.menuItemText}>Open Metronome Panel</span>
                    </div>
                  </div>

                  <div
                    className={styles.menuItem}
                    style={{ color: '#ff6b6b' }}
                    onClick={handleClearTempo}
                  >
                    <div className={styles.menuItemContent}>
                      <div className={styles.menuItemIcon} style={{ color: '#ff6b6b' }}>
                        <X size={14} />
                      </div>
                      <span className={styles.menuItemText}>Clear Tab Tempo</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Case B: Tempo is NOT set on tab */
          <>
            {/* Inline BPM row (as requested: "provide both") */}
            <div className={styles.inlineTempoRow}>
              <div className={styles.inlineTempoLabel}>
                <span style={{ color: '#bb86fc', fontSize: 13, lineHeight: 1 }}>♩</span>
                <span>BPM:</span>
              </div>
              <input
                type="number"
                min="30"
                max="300"
                placeholder="120"
                value={inlineBpm}
                onChange={(e) => setInlineBpm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const bpm = Number(inlineBpm) || 120
                    handleSaveTempo(bpm)
                  }
                }}
                className={`${styles.inlineTempoInput} no-spin`}
              />
              <button
                type="button"
                className={styles.inlineTempoBtn}
                title="Save tempo to tab"
                onClick={() => {
                  const bpm = Number(inlineBpm) || 120
                  handleSaveTempo(bpm)
                }}
              >
                Set
              </button>
              <button
                type="button"
                className={styles.inlineTempoSecondaryBtn}
                title="Save tempo and start metronome immediately"
                onClick={() => {
                  const bpm = Number(inlineBpm) || 120
                  handleSaveTempo(bpm, true)
                }}
              >
                <Play size={12} fill="currentColor" />
              </button>
            </div>

            {/* Submenu for Presets / Metronome Quick Launch */}
            <div
              className={styles.submenuWrapper}
              onMouseEnter={() => handleOpenSubmenu('tempo')}
              onMouseLeave={handleCloseSubmenu}
            >
              <div
                className={`${styles.menuItem} ${
                  activeSubmenu === 'tempo' ? styles.menuItemActive : ''
                }`}
                onClick={() => setActiveSubmenu(activeSubmenu === 'tempo' ? null : 'tempo')}
              >
                <div className={styles.menuItemContent}>
                  <div className={styles.menuItemIcon}>
                    <Icons.Metronome size={15} />
                  </div>
                  <span className={styles.menuItemText}>Metronome & Presets</span>
                </div>
                <div
                  className={`${styles.chevronIcon} ${
                    activeSubmenu === 'tempo' ? styles.chevronIconOpen : ''
                  }`}
                >
                  <ChevronRight size={14} />
                </div>
              </div>

              {activeSubmenu === 'tempo' && (
                <div
                  className={`${styles.submenu} ${
                    openSubmenuOnLeft ? styles.submenuLeft : styles.submenuRight
                  }`}
                  onMouseEnter={() => handleOpenSubmenu('tempo')}
                  onMouseLeave={handleCloseSubmenu}
                >
                  <div style={{ padding: '4px 6px', fontSize: 11, color: '#aaa', fontWeight: 500 }}>
                    Quick Tempo Presets
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 4,
                      padding: '4px 6px 8px 6px'
                    }}
                  >
                    {TEMPO_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={styles.inlineTempoSecondaryBtn}
                        style={{ padding: '6px 4px', fontSize: 12 }}
                        onClick={() => handleSaveTempo(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <div className={styles.menuDivider} />

                  <div
                    className={styles.menuItem}
                    onClick={() => {
                      startMetronome(metronomeBpm)
                      onClose()
                    }}
                  >
                    <div className={styles.menuItemContent}>
                      <div className={styles.menuItemIcon} style={{ color: '#34d399' }}>
                        <Play size={14} />
                      </div>
                      <span className={styles.menuItemText}>
                        Start Metronome ({metronomeBpm} BPM)
                      </span>
                    </div>
                  </div>

                  <div
                    className={styles.menuItem}
                    onClick={() => {
                      openMetronomeModal()
                      onClose()
                    }}
                  >
                    <div className={styles.menuItemContent}>
                      <div className={styles.menuItemIcon}>
                        <Icons.Metronome size={14} />
                      </div>
                      <span className={styles.menuItemText}>Open Metronome Panel</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
