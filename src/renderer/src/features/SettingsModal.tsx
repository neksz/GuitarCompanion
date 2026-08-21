import React, { useEffect, useState } from 'react'
import { Icons } from '../components/Icons'
import { api } from '../services/api'
import { ISettings } from '../../../shared/types'

interface SettingsModalProps {
  onClose: () => void
  onSave: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave }) => {
  const [settings, setSettings] = useState<ISettings>({
    defaultSortMode: 'alpha',
    defaultSortDirection: 'asc',
    defaultTuning: '',
    defaultCapo: undefined
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const s = await api.getSettings()
        if (s) {
          setSettings(s)
        }
      } catch (err) {
        console.error('Failed to load settings', err)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.saveSettings(settings)
      onSave() // Notify parent to refresh
      onClose()
    } catch (err) {
      console.error('Failed to save settings', err)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="modal-overlay" style={overlayStyle}>
        <div className="modal-content" style={modalStyle}>
          <div style={{ padding: 20, textAlign: 'center', color: '#fff' }}>Loading settings...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" style={overlayStyle}>
      <div className="modal-content" style={modalStyle}>
        <div style={headerStyle}>
          <h3>Settings</h3>
          <button onClick={onClose} style={closeButtonStyle}>
            <Icons.X size={20} />
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Default Sort Mode</label>
            <select
              value={settings.defaultSortMode}
              onChange={(e) => setSettings({ ...settings, defaultSortMode: e.target.value as any })}
              style={inputStyle}
            >
              <option value="alpha">Alphabetical (A-Z)</option>
              <option value="time">Practice Time (Most Time)</option>
              <option value="played">Most Played (Times Opened)</option>
              <option value="recent">Recently Accessed</option>
              <option value="created">Recently Added</option>
            </select>
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Default Tuning Filter</label>
            <input
              type="text"
              placeholder="e.g. Standard"
              value={settings.defaultTuning || ''}
              onChange={(e) => setSettings({ ...settings, defaultTuning: e.target.value })}
              style={inputStyle}
            />
            <small style={{ color: '#888', fontSize: 11, marginTop: 4, display: 'block' }}>
              Leave empty for no default filter
            </small>
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Default Capo Filter</label>
            <input
              type="number"
              min="0"
              max="12"
              placeholder="e.g. 0"
              value={settings.defaultCapo === undefined ? '' : settings.defaultCapo}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Number(e.target.value)
                setSettings({ ...settings, defaultCapo: val })
              }}
              style={inputStyle}
            />
            <small style={{ color: '#888', fontSize: 11, marginTop: 4, display: 'block' }}>
              Leave empty for no default filter
            </small>
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Default File Type</label>
            <select
              value={settings.defaultFileType || 'all'}
              onChange={(e) => setSettings({ ...settings, defaultFileType: e.target.value as any })}
              style={inputStyle}
            >
              <option value="all">All Files</option>
              <option value="pdf">PDF</option>
              <option value="gp">Guitar Pro</option>
              <option value="txt">Text</option>
            </select>
          </div>

          <div style={{ ...formGroupStyle, marginTop: 4 }}>
            <label
              style={{
                ...labelStyle,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={!!settings.pdfAlwaysFullscreen}
                onChange={(e) => {
                  const checked = e.target.checked
                  setSettings({ ...settings, pdfAlwaysFullscreen: checked })
                  try {
                    localStorage.setItem('guitar_pdf_always_fullscreen', String(checked))
                  } catch {
                    // ignore
                  }
                }}
                style={{ width: '16px', height: '16px', accentColor: '#bb86fc', cursor: 'pointer' }}
              />
              <span>Always open PDF tabs in fullscreen</span>
            </label>
            <small style={{ color: '#888', fontSize: 11, marginLeft: 26, display: 'block' }}>
              Automatically expands PDF viewer to fullscreen when opening a tab
            </small>
          </div>
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} style={cancelButtonStyle}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={saveButtonStyle}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Styles
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
}

const modalStyle: React.CSSProperties = {
  background: '#1e1e24',
  width: '400px',
  maxWidth: '90%',
  borderRadius: '12px',
  border: '1px solid #333',
  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column'
}

const headerStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #333',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: '#fff'
}

const bodyStyle: React.CSSProperties = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
}

const footerStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderTop: '1px solid #333',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px'
}

const formGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
}

const labelStyle: React.CSSProperties = {
  color: '#ccc',
  fontSize: '13px',
  fontWeight: 500
}

const inputStyle: React.CSSProperties = {
  background: '#2b2b36',
  border: '1px solid #444',
  borderRadius: '6px',
  padding: '8px 12px',
  color: '#fff',
  fontSize: '14px',
  outline: 'none'
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  padding: 4
}

const cancelButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #444',
  color: '#ccc',
  padding: '8px 16px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px'
}

const saveButtonStyle: React.CSSProperties = {
  background: '#bb86fc',
  border: 'none',
  color: '#121212',
  padding: '8px 16px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '13px'
}
