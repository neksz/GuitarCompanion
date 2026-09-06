import React, { useState, useEffect } from 'react'
import { ITabAttributes } from '../../../shared/types'
import { Icons } from '../components/Icons'
import { TagInfo, getTagColor, PREDEFINED_TAG_COLORS } from '../utils/tagUtils'
import { DarkCreatableSelect } from '../components/DarkSelect'
import { getDarkSelectStyles } from '../components/darkSelectStyles'

interface UploadModalProps {
  fileName: string
  initialAttributes?: ITabAttributes
  onConfirm: (attributes: ITabAttributes, newFileName?: string) => Promise<void> | void
  onCancel: () => void
  isEditMode?: boolean
  batchProgress?: { current: number; total: number }
  pdfPreview?: string | null
  suggestedAttributes?: { tuning?: string; capo?: number; tempo?: number }
  existingFileNames?: string[]
  existingTags?: TagInfo[]
  onSkip?: () => void
}

export const UploadModal: React.FC<UploadModalProps> = ({
  fileName,
  initialAttributes,
  onConfirm,
  onCancel,
  isEditMode = false,
  batchProgress,
  pdfPreview,
  suggestedAttributes,
  existingFileNames = [],
  existingTags = [],
  onSkip
}) => {
  const [tuning, setTuning] = useState('')
  const [capo, setCapo] = useState<number | ''>('')
  const [tempo, setTempo] = useState<number | ''>('')
  const [status, setStatus] = useState<'To Learn' | 'Learning' | 'Learned' | 'None'>('None')
  const [isFavorite, setIsFavorite] = useState(false)
  const [resetPlaytime, setResetPlaytime] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [tagColors, setTagColors] = useState<Record<string, string>>({})
  const [activeTagColor, setActiveTagColor] = useState<string>('blue')
  const [tagSearchInput, setTagSearchInput] = useState('')
  const [currentFileName, setCurrentFileName] = useState(() => {
    const lastDotIndex = fileName.lastIndexOf('.')
    if (lastDotIndex !== -1) {
      return fileName.substring(0, lastDotIndex)
    }
    return fileName
  })

  // Derived extension
  const fileExtension = React.useMemo(() => {
    const lastDotIndex = fileName.lastIndexOf('.')
    if (lastDotIndex !== -1) {
      return fileName.substring(lastDotIndex)
    }
    return ''
  }, [fileName])

  const isGpFile = React.useMemo(() => {
    const ext = fileExtension.toLowerCase()
    return ext === '.gp3' || ext === '.gp4' || ext === '.gp5' || ext === '.gpx' || ext === '.gp'
  }, [fileExtension])

  const [displayName, setDisplayName] = useState('')

  // Sync fileName when prop changes (for batch uploads)
  useEffect(() => {
    const lastDotIndex = fileName.lastIndexOf('.')
    if (lastDotIndex !== -1) {
      setCurrentFileName(fileName.substring(0, lastDotIndex))
    } else {
      setCurrentFileName(fileName)
    }
    if (!initialAttributes) {
      setDisplayName('')
    }
  }, [fileName, initialAttributes])

  useEffect(() => {
    const normalizeTuning = (t?: string): string => {
      if (!t) return 'Standard'
      const trimmed = t.trim()
      if (/^standard(?:\s+tuning)?$/i.test(trimmed) || /^stamdadd(?:\s+tuning)?$/i.test(trimmed)) {
        return 'Standard'
      }
      return trimmed
    }

    if (initialAttributes) {
      setTuning(normalizeTuning(initialAttributes.tuning))
      setCapo(initialAttributes.capo !== undefined ? initialAttributes.capo : '')
      setTempo(initialAttributes.tempo !== undefined ? initialAttributes.tempo : '')
      setStatus(
        (initialAttributes.status as 'To Learn' | 'Learning' | 'Learned' | 'None') || 'None'
      )
      setIsFavorite(!!initialAttributes.isFavorite)
      setDisplayName(initialAttributes.displayName || '')
      setTags(Array.isArray(initialAttributes.tags) ? [...initialAttributes.tags] : [])
      setTagColors(initialAttributes.tagColors ? { ...initialAttributes.tagColors } : {})
    } else if (suggestedAttributes) {
      // Use suggested attributes from PDF/GP analysis
      if (suggestedAttributes.tuning) {
        setTuning(normalizeTuning(suggestedAttributes.tuning))
      }
      if (suggestedAttributes.capo !== undefined) {
        setCapo(suggestedAttributes.capo)
      }
      if (suggestedAttributes.tempo !== undefined) {
        setTempo(suggestedAttributes.tempo)
      }
    }
  }, [initialAttributes, suggestedAttributes])

  // Check for duplicates based on currentFileName
  // If IS EDIT MODE, we exclude the original fileName from duplicate check (case insensitive check usually good but let's stick to exact for now)
  // Actually if we rename to same name it's fine.
  // Check for duplicates based on currentFileName + extension
  const fullCurrentFileName = currentFileName + fileExtension
  const isDuplicate =
    existingFileNames.includes(fullCurrentFileName) && fullCurrentFileName !== fileName

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      const trimmedTuning = (tuning || '').trim()
      const normalizedTuning =
        !trimmedTuning ||
        /^standard(?:\s+tuning)?$/i.test(trimmedTuning) ||
        /^stamdadd(?:\s+tuning)?$/i.test(trimmedTuning)
          ? 'Standard'
          : trimmedTuning

      const finalAttributes: ITabAttributes = {
        ...initialAttributes,
        tuning: normalizedTuning,
        capo: capo === '' ? 0 : Number(capo),
        tempo: tempo === '' ? undefined : Number(tempo),
        status,
        isFavorite,
        displayName: displayName || undefined,
        tags: tags.length > 0 ? tags : undefined,
        tagColors: Object.keys(tagColors).length > 0 ? tagColors : undefined
      }

      if (resetPlaytime) {
        finalAttributes.secondsPlayed = 0
        finalAttributes.timesPlayed = 0
      }

      await onConfirm(
        finalAttributes,
        fullCurrentFileName !== fileName ? fullCurrentFileName : undefined
      )
    } finally {
      // Note: If onConfirm closes the modal, this component will unmount
      setIsSubmitting(false)
    }
  }

  const hasPdfPreview = !!pdfPreview

  return (
    <>
      {/* Fullscreen Preview Overlay */}
      {isPreviewFullscreen && pdfPreview && (
        <div
          onClick={() => setIsPreviewFullscreen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            cursor: 'zoom-out',
            padding: 40
          }}
        >
          <img
            src={pdfPreview}
            alt="PDF Preview Fullscreen"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)'
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              color: '#fff',
              fontSize: 14,
              opacity: 0.7
            }}
          >
            Click anywhere to close
          </div>
        </div>
      )}

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
      >
        <div
          style={{
            backgroundColor: '#1e1e24',
            padding: 24,
            borderRadius: 8,
            width: hasPdfPreview ? 700 : 400,
            maxWidth: '95vw',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            border: '1px solid #333',
            display: 'flex',
            gap: 24
          }}
        >
          {/* PDF Preview Panel */}
          {hasPdfPreview && (
            <div
              style={{
                flex: '0 0 280px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              <span
                style={{
                  color: '#888',
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                PDF Preview
              </span>
              <div
                onClick={() => setIsPreviewFullscreen(true)}
                style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid #333',
                  background: '#fff',
                  cursor: 'zoom-in'
                }}
              >
                <img
                  src={pdfPreview}
                  alt="PDF Preview"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block'
                  }}
                />
              </div>
              <span style={{ color: '#aaa', fontSize: 11, fontStyle: 'italic' }}>
                Click to enlarge
              </span>
            </div>
          )}

          {/* Form Panel */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16
              }}
            >
              <h3
                style={{
                  margin: 0,
                  color: '#fff',
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {isEditMode ? (
                  <Icons.Edit size={20} color="#bb86fc" />
                ) : (
                  <Icons.Upload size={20} color="#bb86fc" />
                )}
                {isEditMode ? 'Edit Tab Details' : 'Upload Details'}
              </h3>
              {batchProgress && (
                <div
                  style={{
                    background: 'rgba(187, 134, 252, 0.2)',
                    color: '#bb86fc',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {batchProgress.current} / {batchProgress.total}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: '#aaa', marginBottom: 6, fontSize: 14 }}>
                File Name
              </label>
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <input
                  type="text"
                  value={currentFileName}
                  onChange={(e) => setCurrentFileName(e.target.value)}
                  placeholder="Enter file name"
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#2b2b36',
                    border: '1px solid ' + (isDuplicate ? '#f44336' : '#444'),
                    borderRight: 'none',
                    borderTopLeftRadius: 4,
                    borderBottomLeftRadius: 4,
                    color: '#fff',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: '#2b2b36',
                    border: '1px solid ' + (isDuplicate ? '#f44336' : '#444'),
                    borderLeft: '1px dashed #444',
                    borderTopRightRadius: 4,
                    borderBottomRightRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    color: '#888',
                    fontSize: 14,
                    userSelect: 'none'
                  }}
                >
                  {fileExtension}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: '#aaa', marginBottom: 6, fontSize: 14 }}>
                Display Name (Optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name (shown in list)"
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#2b2b36',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#fff',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                This name will be shown in the UI instead of the file name.
              </div>
            </div>

            {isDuplicate && (
              <div
                style={{
                  background: 'rgba(244, 67, 54, 0.15)',
                  border: '1px solid #f44336',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <span style={{ color: '#f44336', fontSize: 16 }}>⚠️</span>
                <span style={{ color: '#f44336', fontSize: 13 }}>
                  A file with this name already exists. Please rename it or choose a different file.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ color: '#aaa', fontSize: 14 }}>Tuning</label>
                  {isGpFile && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#bb86fc',
                        marginLeft: 8,
                        background: 'rgba(187, 134, 252, 0.12)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 500
                      }}
                    >
                      ⚡ Auto-detected from GP
                    </span>
                  )}
                </div>
                <select
                  value={tuning}
                  onChange={(e) => setTuning(e.target.value)}
                  disabled={isGpFile}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: isGpFile ? '#22222c' : '#2b2b36',
                    border: '1px solid #444',
                    borderRadius: 4,
                    color: isGpFile ? '#bb86fc' : '#fff',
                    boxSizing: 'border-box',
                    cursor: isGpFile ? 'not-allowed' : 'pointer',
                    opacity: isGpFile ? 0.9 : 1
                  }}
                >
                  <option value="">Select Tuning...</option>
                  <option value="Standard">Standard (E A D G B E)</option>
                  <option value="Drop D">Drop D (D A D G B E)</option>
                  <option value="Eb Standard">Eb Standard (Eb Ab Db Gb Bb Eb)</option>
                  <option value="D Standard">D Standard (D G C F A D)</option>
                  <option value="Drop C">Drop C (C G C F A D)</option>
                  <option value="Open D">Open D (D A D F# A D)</option>
                  <option value="Open G">Open G (D G D G B D)</option>
                  <option value="DADGAD">DADGAD</option>
                  <option value="FADGBE">FADGBE</option>
                  {tuning &&
                    ![
                      '',
                      'Standard',
                      'Drop D',
                      'Eb Standard',
                      'D Standard',
                      'Drop C',
                      'Open D',
                      'Open G',
                      'DADGAD',
                      'FADGBE',
                      'Custom'
                    ].includes(tuning) && <option value={tuning}>{tuning}</option>}
                  <option value="Custom">Custom</option>
                </select>
                {!isGpFile && tuning === 'Custom' && (
                  <input
                    type="text"
                    placeholder="Enter custom tuning"
                    onChange={(e) => setTuning(e.target.value)}
                    style={{
                      marginTop: 8,
                      width: '100%',
                      padding: '10px',
                      backgroundColor: '#2b2b36',
                      border: '1px solid #444',
                      borderRadius: 4,
                      color: '#fff',
                      boxSizing: 'border-box'
                    }}
                  />
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ color: '#aaa', fontSize: 14 }}>Capo Position</label>
                  {isGpFile && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#bb86fc',
                        marginLeft: 8,
                        background: 'rgba(187, 134, 252, 0.12)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 500
                      }}
                    >
                      ⚡ Auto-detected from GP
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  max="12"
                  value={capo}
                  onChange={(e) => setCapo(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={isGpFile}
                  placeholder="0 (No Capo)"
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: isGpFile ? '#22222c' : '#2b2b36',
                    border: '1px solid #444',
                    borderRadius: 4,
                    color: isGpFile ? '#bb86fc' : '#fff',
                    boxSizing: 'border-box',
                    cursor: isGpFile ? 'not-allowed' : 'text',
                    opacity: isGpFile ? 0.9 : 1
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ color: '#aaa', fontSize: 14 }}>Tempo (BPM)</label>
                  {isGpFile && suggestedAttributes?.tempo !== undefined && !initialAttributes && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#bb86fc',
                        marginLeft: 8,
                        background: 'rgba(187, 134, 252, 0.12)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 500
                      }}
                    >
                      ⚡ Auto-detected from GP
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="30"
                  max="300"
                  value={tempo}
                  onChange={(e) => setTempo(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Optional (e.g. 120)"
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#2b2b36',
                    border: '1px solid #444',
                    borderRadius: 4,
                    color: '#fff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: '#aaa', marginBottom: 6, fontSize: 14 }}>
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as 'To Learn' | 'Learning' | 'Learned' | 'None')
                  }
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#2b2b36',
                    border: '1px solid #444',
                    borderRadius: 4,
                    color: '#fff',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="None">None</option>
                  <option value="To Learn">To Learn</option>
                  <option value="Learning">Learning</option>
                  <option value="Learned">Learned</option>
                </select>
              </div>

              {/* Tags Section */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icons.Tag size={15} style={{ color: '#bb86fc' }} />
                    <label style={{ color: '#aaa', fontSize: 14, fontWeight: 500 }}>Tags</label>
                  </div>
                  {tags.length > 0 && (
                    <span style={{ fontSize: 11, color: '#888' }}>
                      {tags.length} {tags.length === 1 ? 'tag' : 'tags'} assigned
                    </span>
                  )}
                </div>

                {/* Assigned tags list */}
                {tags.length > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 10,
                      padding: '8px 10px',
                      backgroundColor: '#22222c',
                      borderRadius: 6,
                      border: '1px solid #3b3b48'
                    }}
                  >
                    {tags.map((tagName) => {
                      const tagColorObj = getTagColor(tagName, tagColors[tagName])
                      return (
                        <div
                          key={tagName}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 8px 3px 10px',
                            borderRadius: 14,
                            backgroundColor: tagColorObj.bg,
                            border: `1px solid ${tagColorObj.border}`,
                            color: tagColorObj.color,
                            fontSize: 12,
                            fontWeight: 500
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              backgroundColor: tagColorObj.color,
                              display: 'inline-block'
                            }}
                          />
                          <span>{tagName}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setTags((prev) => prev.filter((t) => t !== tagName))
                              setTagColors((prev) => {
                                const copy = { ...prev }
                                delete copy[tagName]
                                return copy
                              })
                            }}
                            title={`Remove tag "${tagName}"`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: tagColorObj.color,
                              cursor: 'pointer',
                              padding: '0 2px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: 0.75,
                              transition: 'opacity 0.15s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.75')}
                          >
                            <Icons.X size={13} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#777',
                      fontStyle: 'italic',
                      marginBottom: 10
                    }}
                  >
                    No tags assigned. Search existing tags or create a new one below.
                  </div>
                )}

                {/* Creatable React Select search input */}
                <div style={{ marginBottom: 10 }}>
                  <DarkCreatableSelect
                    inputValue={tagSearchInput}
                    onInputChange={(val) => setTagSearchInput(val)}
                    value={null}
                    onChange={(option) => {
                      if (!option) return
                      const opt = option as {
                        value: string
                        label: string
                        count?: number
                        color?: string
                      }
                      const name = opt.value.trim()
                      if (!name || tags.includes(name)) return
                      setTags((prev) => [...prev, name])
                      if (opt.color) {
                        setTagColors((prev) => ({ ...prev, [name]: opt.color! }))
                      }
                      setTagSearchInput('')
                    }}
                    onCreateOption={(inputValue) => {
                      const name = inputValue.trim()
                      if (!name || tags.includes(name)) return
                      setTags((prev) => [...prev, name])
                      setTagColors((prev) => ({ ...prev, [name]: activeTagColor }))
                      setTagSearchInput('')
                    }}
                    options={(existingTags || [])
                      .filter((t) => !tags.includes(t.name))
                      .map((t) => ({
                        value: t.name,
                        label: t.name,
                        count: t.count,
                        color: t.color
                      }))}
                    placeholder="Search existing tags or type to create..."
                    isClearable={false}
                    formatCreateLabel={(input) => `+ Create tag: "${input}"`}
                    formatOptionLabel={(option) => {
                      const opt = option as {
                        value: string
                        label: string
                        count?: number
                        color?: string
                      }
                      const optColor = getTagColor(opt.label, opt.color)
                      return (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: optColor.color,
                                display: 'inline-block'
                              }}
                            />
                            <span style={{ fontWeight: 500, color: '#eee' }}>{opt.label}</span>
                          </div>
                          {opt.count !== undefined && (
                            <span
                              style={{
                                fontSize: 11,
                                color: '#888',
                                background: 'rgba(255,255,255,0.06)',
                                padding: '2px 6px',
                                borderRadius: 4
                              }}
                            >
                              {opt.count} {opt.count === 1 ? 'tab' : 'tabs'}
                            </span>
                          )}
                        </div>
                      )
                    }}
                    styles={getDarkSelectStyles({
                      accentColor: '#bb86fc'
                    })}
                    noOptionsMessage={() =>
                      tagSearchInput
                        ? `Press Enter to create "${tagSearchInput}"`
                        : 'No matching tags found'
                    }
                  />
                </div>

                {/* Color swatches for creating new tags */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: 6,
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
                    New tag color:
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {PREDEFINED_TAG_COLORS.map((c) => {
                      const isSelected = activeTagColor === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setActiveTagColor(c.id)}
                          title={c.name}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            backgroundColor: c.color,
                            border: isSelected ? '2px solid #fff' : '2px solid transparent',
                            boxShadow: isSelected ? `0 0 6px ${c.color}` : 'none',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'all 0.15s ease',
                            transform: isSelected ? 'scale(1.2)' : 'scale(1)'
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginBottom: 24,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="fav"
                    checked={isFavorite}
                    onChange={(e) => setIsFavorite(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  <label htmlFor="fav" style={{ color: '#fff', cursor: 'pointer' }}>
                    Mark as Favorite
                  </label>
                </div>

                {isEditMode && initialAttributes && (initialAttributes.secondsPlayed || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setResetPlaytime(true)}
                    disabled={resetPlaytime}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: resetPlaytime ? '#2b2b36' : 'transparent',
                      border: '1px solid ' + (resetPlaytime ? '#444' : '#555'),
                      borderRadius: 4,
                      color: resetPlaytime ? '#888' : '#ccc',
                      fontSize: 12,
                      cursor: resetPlaytime ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Icons.RefreshCw size={12} className={resetPlaytime ? '' : 'hover-spin'} />
                    {resetPlaytime ? 'Playtime will be reset' : 'Reset Playtime'}
                  </button>
                )}
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: 'transparent',
                    border: '1px solid #555',
                    borderRadius: 4,
                    color: '#ccc',
                    cursor: 'pointer'
                  }}
                >
                  {batchProgress && batchProgress.total > 1 ? 'Cancel All' : 'Cancel'}
                </button>

                <div style={{ display: 'flex', gap: 12 }}>
                  {onSkip && batchProgress && batchProgress.total > 1 && (
                    <button
                      type="button"
                      onClick={onSkip}
                      style={{
                        padding: '10px 16px',
                        backgroundColor: 'transparent',
                        border: '1px solid #555',
                        borderRadius: 4,
                        color: '#ccc',
                        cursor: 'pointer'
                      }}
                    >
                      Skip
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting || isDuplicate || !currentFileName.trim()}
                    style={{
                      padding: '10px 20px',
                      backgroundColor:
                        isSubmitting || isDuplicate || !currentFileName.trim() ? '#555' : '#bb86fc',
                      border: 'none',
                      borderRadius: 4,
                      color: isDuplicate ? '#888' : '#000',
                      fontWeight: 'bold',
                      cursor:
                        isSubmitting || isDuplicate || !currentFileName.trim()
                          ? 'not-allowed'
                          : 'pointer',
                      opacity: isSubmitting || isDuplicate || !currentFileName.trim() ? 0.7 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    {isSubmitting && <Icons.RefreshCw size={16} className="animate-spin" />}
                    {isSubmitting
                      ? isEditMode
                        ? 'Saving...'
                        : 'Uploading...'
                      : isEditMode
                        ? 'Save Changes'
                        : 'Upload'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
