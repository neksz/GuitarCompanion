import React, { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Save, Check, Loader2 } from 'lucide-react'
import { Icons } from '../components/Icons'
import { useMetronomeStore } from '../utils/useMetronomeStore'
import { getTempoName, SOUND_OPTIONS } from '../utils/metronomeHelpers'

export const MetronomeModal: React.FC = () => {
  const {
    isOpen,
    close,
    isPlaying,
    togglePlay,
    currentBeat,
    bpm,
    setBpm,
    adjustBpm,
    beatsPerMeasure,
    setBeatsPerMeasure,
    accentFirstBeat,
    setAccentFirstBeat,
    sound,
    setSound,
    volume,
    setVolume,
    tapTempo,
    playTestClick,
    activeTabId,
    activeTabName,
    activeTabAttributes,
    saveTempoToActiveTab
  } = useMetronomeStore()

  const [isEditingBpm, setIsEditingBpm] = useState(false)
  const [bpmInputVal, setBpmInputVal] = useState(bpm.toString())
  const [isTapping, setIsTapping] = useState(false)
  const [isSoundCollapsed, setIsSoundCollapsed] = useState(true)
  const [isSavingTempo, setIsSavingTempo] = useState(false)
  const [saveTempoSuccess, setSaveTempoSuccess] = useState(false)
  const [portalTarget, setPortalTarget] = useState<Element | null>(() =>
    typeof document !== 'undefined' ? document.fullscreenElement || document.body : null
  )
  const tapTimeoutRef = useRef<number | null>(null)

  const handleSaveTempoToTab = async (): Promise<void> => {
    if (isSavingTempo || !activeTabId) return
    setIsSavingTempo(true)
    const success = await saveTempoToActiveTab()
    setIsSavingTempo(false)
    if (success) {
      setSaveTempoSuccess(true)
      setTimeout(() => setSaveTempoSuccess(false), 2200)
    }
  }

  // Listen for fullscreen change so modal portals into the fullscreen container (e.g. PDF viewer)
  useEffect(() => {
    const updateTarget = (): void => {
      setPortalTarget(document.fullscreenElement || document.body)
    }
    updateTarget()
    document.addEventListener('fullscreenchange', updateTarget)
    return () => document.removeEventListener('fullscreenchange', updateTarget)
  }, [isOpen])

  const triggerTap = useCallback((): void => {
    tapTempo()
    setIsTapping(true)
    if (tapTimeoutRef.current !== null) {
      window.clearTimeout(tapTimeoutRef.current)
    }
    tapTimeoutRef.current = window.setTimeout(() => {
      setIsTapping(false)
    }, 180)
  }, [tapTempo])

  // Mouse wheel scroll handler for BPM area
  const handleBpmWheel = (e: React.WheelEvent): void => {
    e.preventDefault()
    // Scroll up (negative deltaY) increases BPM, scroll down decreases BPM
    if (e.deltaY < 0) {
      adjustBpm(1)
    } else if (e.deltaY > 0) {
      adjustBpm(-1)
    }
  }

  // Keyboard shortcut handler for modal
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (
        document.activeElement?.tagName === 'INPUT' &&
        (document.activeElement as HTMLInputElement).type === 'text'
      ) {
        if (e.key === 'Escape') {
          setIsEditingBpm(false)
          ;(document.activeElement as HTMLElement).blur()
        }
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault()
        adjustBpm(e.shiftKey ? 5 : 1)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault()
        adjustBpm(e.shiftKey ? -5 : -1)
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault()
        triggerTap()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, togglePlay, close, adjustBpm, triggerTap])

  if (!isOpen || !portalTarget) return null

  const handleBpmSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const parsed = parseInt(bpmInputVal, 10)
    if (!isNaN(parsed)) {
      setBpm(parsed)
    }
    setIsEditingBpm(false)
  }

  return createPortal(
    <div className="metronome-modal-overlay" onClick={close}>
      <div
        className="metronome-modal-container compact-layout"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Metronome"
      >
        {/* Header */}
        <div className="metronome-header">
          <div className="metronome-title-wrap">
            <div className={`metronome-icon-badge ${isPlaying ? 'pulse' : ''}`}>
              <Icons.Metronome size={20} color="#bb86fc" />
            </div>
            <div>
              <h2 className="metronome-title">Metronome</h2>
              <span className="metronome-subtitle">
                {isPlaying ? (
                  <span className="metronome-live-status">
                    <span className="live-dot" /> Playing • {bpm} BPM
                  </span>
                ) : (
                  'Ready • Space to start'
                )}
              </span>
            </div>
          </div>

          <button
            className="metronome-close-btn"
            onClick={close}
            title="Close Metronome (Esc)"
            aria-label="Close"
          >
            <Icons.X size={18} />
          </button>
        </div>

        {/* Row 1: Unified BPM Input + Beat Visualizer Region */}
        <div
          className="metronome-unified-hero-card"
          onWheel={handleBpmWheel}
          title="Hover and scroll mouse wheel to adjust BPM (±1)"
        >
          {/* Left Column: BPM & Slider */}
          <div className="unified-bpm-col">
            <div className="bpm-scroll-hint">Scroll to adjust</div>
            {isEditingBpm ? (
              <form onSubmit={handleBpmSubmit} className="bpm-edit-form">
                <input
                  type="number"
                  min={30}
                  max={300}
                  autoFocus
                  className="bpm-number-input inline-input no-spin"
                  value={bpmInputVal}
                  onChange={(e) => setBpmInputVal(e.target.value)}
                  onBlur={handleBpmSubmit}
                />
              </form>
            ) : (
              <div
                className="metronome-bpm-value inline-val"
                onClick={() => {
                  setBpmInputVal(bpm.toString())
                  setIsEditingBpm(true)
                }}
                title="Click to type exact BPM or scroll wheel"
              >
                <span className="bpm-number compact-bpm">{bpm}</span>
                <span className="bpm-unit">BPM</span>
              </div>
            )}
            <div className="metronome-tempo-name compact-tempo">{getTempoName(bpm)}</div>

            {/* Compact Slider */}
            <input
              type="range"
              min={30}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="metronome-range-slider compact-slider"
              aria-label="Tempo BPM Slider"
            />
          </div>

          {/* Center Divider Line */}
          <div className="unified-card-divider" />

          {/* Right Column: Beat Indicator */}
          <div className="unified-visualizer-col">
            <div className="visualizer-header-label">
              <span>Beat Indicator</span>
              <span className="beat-progress-text">
                {isPlaying
                  ? `${(currentBeat >= 0 ? currentBeat : 0) + 1} / ${beatsPerMeasure}`
                  : `${beatsPerMeasure} Beats`}
              </span>
            </div>

            <div className="metronome-beat-dots-container compact-dots">
              {Array.from({ length: beatsPerMeasure }).map((_, index) => {
                const isFirst = index === 0
                const isActive = isPlaying && currentBeat === index
                const isAccent = isFirst && accentFirstBeat

                return (
                  <div
                    key={index}
                    className={`metronome-beat-dot compact-dot ${
                      isAccent ? 'accent-dot' : ''
                    } ${isActive ? 'active-beat' : ''}`}
                    title={`Beat ${index + 1}${isAccent ? ' (Accented)' : ''}`}
                  >
                    <span className="beat-dot-number">{index + 1}</span>
                    {isActive && <div className="beat-ripple" />}
                  </div>
                )
              })}
            </div>

            {/* Pendulum Track */}
            <div className="metronome-pendulum-track">
              <div
                className={`metronome-pendulum-bob ${isPlaying ? 'swinging' : ''}`}
                style={{
                  left: isPlaying
                    ? `${Math.max(8, Math.min(92, ((currentBeat + 0.5) / beatsPerMeasure) * 100))}%`
                    : '50%'
                }}
              />
            </div>
          </div>
        </div>

        {/* Row 2: Full-Width Tap Tempo Button */}
        <button
          type="button"
          className={`metronome-tap-btn full-row-tap ${isTapping ? 'active-tap' : ''}`}
          onClick={triggerTap}
        >
          <Icons.Sparkles size={16} />
          <span>TAP TEMPO (T)</span>
        </button>

        {/* Row 3: Beats / Bar */}
        <div className="metronome-section compact-section beats-bar-card">
          <div className="beats-bar-inner">
            <span className="metronome-section-label">Beats / Bar</span>
            <div className="sig-stepper">
              <button
                className="sig-btn"
                onClick={() => setBeatsPerMeasure(beatsPerMeasure - 1)}
                disabled={beatsPerMeasure <= 1}
                aria-label="Decrease beats per bar"
              >
                <Icons.Minus size={14} />
              </button>
              <span className="sig-value">{beatsPerMeasure}</span>
              <button
                className="sig-btn"
                onClick={() => setBeatsPerMeasure(beatsPerMeasure + 1)}
                disabled={beatsPerMeasure >= 16}
                aria-label="Increase beats per bar"
              >
                <Icons.Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Row 4: Accent & Sound (Collapsed by default) */}
        <div className="metronome-section compact-section collapsible-section">
          <div
            className="metronome-collapsible-header"
            onClick={() => setIsSoundCollapsed(!isSoundCollapsed)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setIsSoundCollapsed(!isSoundCollapsed)
              }
            }}
          >
            <div className="collapsible-title-wrap">
              <span className="metronome-section-label">Accent & Sound</span>
              {isSoundCollapsed && (
                <span className="collapsible-summary-badge">
                  {accentFirstBeat ? 'Accent Beat 1' : 'No Accent'} • {sound} •{' '}
                  {Math.round(volume * 100)}%
                </span>
              )}
            </div>
            <button
              type="button"
              className="collapsible-chevron-btn"
              aria-label={isSoundCollapsed ? 'Expand sound options' : 'Collapse sound options'}
            >
              {isSoundCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>

          {!isSoundCollapsed && (
            <div className="collapsible-body-content">
              {/* Accent First Beat Toggle */}
              <div
                className={`metronome-toggle-card ${accentFirstBeat ? 'active' : ''}`}
                onClick={() => setAccentFirstBeat(!accentFirstBeat)}
                role="checkbox"
                aria-checked={accentFirstBeat}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setAccentFirstBeat(!accentFirstBeat)
                  }
                }}
              >
                <div className="toggle-card-info">
                  <div className="toggle-card-title">Accent Beat 1</div>
                  <div className="toggle-card-desc">
                    {accentFirstBeat
                      ? 'Plays high-pitch distinctive click on 1st beat'
                      : 'All beats play standard pitch (no accent)'}
                  </div>
                </div>

                <div className="toggle-switch-wrapper">
                  <div className={`custom-switch ${accentFirstBeat ? 'checked' : ''}`}>
                    <div className="switch-thumb" />
                  </div>
                </div>
              </div>

              {/* Sound Presets & Audition Button */}
              <div className="metronome-sound-row">
                <div className="metronome-sound-segmented">
                  {SOUND_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      className={`sound-segmented-btn ${sound === opt.id ? 'active' : ''}`}
                      onClick={() => {
                        setSound(opt.id)
                        playTestClick(accentFirstBeat)
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="metronome-audition-btn"
                  onClick={() => playTestClick(accentFirstBeat)}
                  title="Audition Click Sound"
                >
                  <Icons.PlayCircle size={14} />
                  <span>Test Click</span>
                </button>
              </div>

              {/* Volume Control */}
              <div className="metronome-volume-row">
                <button
                  className="vol-icon-btn"
                  onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
                  title={volume === 0 ? 'Unmute' : 'Mute'}
                >
                  {volume === 0 ? (
                    <Icons.VolumeX size={15} color="#cf6679" />
                  ) : (
                    <Icons.Volume2 size={15} color="#aaa" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="metronome-volume-slider"
                  aria-label="Metronome Volume Slider"
                />
                <span className="vol-percent-text">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Row 4.5: Tab Tempo Save Bar (Only rendered when viewing a tab) */}
        {activeTabId && (
          <div className="metronome-tab-save-bar">
            <div className="tab-save-info">
              <span className="tab-save-badge">TAB</span>
              <span className="tab-save-name" title={activeTabName || 'Active Tab'}>
                {activeTabName || 'Active Tab'}
              </span>
            </div>
            <button
              type="button"
              className={`metronome-save-tab-btn ${saveTempoSuccess || activeTabAttributes?.tempo === bpm ? 'success' : ''}`}
              onClick={handleSaveTempoToTab}
              disabled={isSavingTempo}
              title={`Save ${bpm} BPM to ${activeTabName || 'tab'} metadata`}
            >
              {isSavingTempo ? (
                <>
                  <Loader2 size={13} className="spin-icon" />
                  <span>Saving...</span>
                </>
              ) : saveTempoSuccess || activeTabAttributes?.tempo === bpm ? (
                <>
                  <Check size={13} />
                  <span>Saved ({bpm} BPM)</span>
                </>
              ) : (
                <>
                  <Save size={13} />
                  <span>Save {bpm} BPM to Tab</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Row 5: Primary Action Button (Play / Stop) */}
        <div className="metronome-footer-actions">
          <button
            type="button"
            className={`metronome-main-action-btn ${isPlaying ? 'playing' : 'stopped'}`}
            onClick={togglePlay}
          >
            {isPlaying ? (
              <>
                <Icons.Square size={18} />
                <span>STOP METRONOME</span>
              </>
            ) : (
              <>
                <Icons.Play size={18} />
                <span>START METRONOME</span>
              </>
            )}
            <span className="action-key-hint">Space</span>
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  )
}
