import { create } from 'zustand'
import { createMetronomeEngine, MetronomeSound, MetronomeState } from '../services/metronomeAudio'
import { api } from '../services/api'

const STORAGE_KEY = 'guitar_companion_metronome_config'

interface StoredMetronomeConfig {
  bpm?: number
  beatsPerMeasure?: number
  beatUnit?: number
  accentFirstBeat?: boolean
  sound?: MetronomeSound
  volume?: number
}

function loadSavedConfig(): StoredMetronomeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw) as StoredMetronomeConfig
    }
  } catch {
    // Ignore error
  }
  return {}
}

function saveConfig(config: StoredMetronomeConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore error
  }
}

export interface MetronomeStore extends MetronomeState {
  isOpen: boolean
  isPlaying: boolean
  currentBeat: number
  tapHistory: number[]
  overrideBpm: number | null

  // Active tab context (set when a viewer is open)
  activeTabId: string | null
  activeTabName: string | null
  activeTabAttributes: Record<string, unknown> | null
  setActiveTab: (
    id: string | null,
    name: string | null,
    attributes?: Record<string, unknown> | null
  ) => void
  saveTempoToActiveTab: () => Promise<boolean>

  // Modal actions
  open: () => void
  close: () => void
  toggleOpen: () => void

  // Playback actions
  start: (customBpm?: number) => Promise<void>
  stop: () => void
  togglePlay: () => Promise<void>
  setOverrideBpm: (bpm: number | null) => void

  // Parameter actions
  setBpm: (bpm: number) => void
  adjustBpm: (delta: number) => void
  setBeatsPerMeasure: (beats: number) => void
  setBeatUnit: (unit: number) => void
  setTimeSignature: (beats: number, unit: number) => void
  setAccentFirstBeat: (accent: boolean) => void
  setSound: (sound: MetronomeSound) => void
  setVolume: (volume: number) => void
  tapTempo: () => void
  playTestClick: (isAccent?: boolean) => void
}

const saved = loadSavedConfig()

export const useMetronomeStore = create<MetronomeStore>((set, get) => {
  const engine = createMetronomeEngine(() => ({
    bpm: get().overrideBpm ?? get().bpm,
    beatsPerMeasure: get().beatsPerMeasure,
    beatUnit: get().beatUnit,
    accentFirstBeat: get().accentFirstBeat,
    sound: get().sound,
    volume: get().volume
  }))

  engine.setOnBeat((beatIndex) => {
    set({ currentBeat: beatIndex })
  })

  return {
    isOpen: false,
    isPlaying: false,
    currentBeat: -1,
    tapHistory: [],
    overrideBpm: null,

    activeTabId: null,
    activeTabName: null,
    activeTabAttributes: null,
    setActiveTab: (
      id: string | null,
      name: string | null,
      attributes?: Record<string, unknown> | null
    ): void => {
      set({
        activeTabId: id,
        activeTabName: name,
        activeTabAttributes: attributes ?? null
      })
    },
    saveTempoToActiveTab: async (): Promise<boolean> => {
      const { activeTabId, activeTabAttributes, bpm } = get()
      if (!activeTabId) return false
      try {
        const updatedAttrs = {
          ...(activeTabAttributes || {}),
          tempo: bpm
        }
        const res = await api.updateAttributes(activeTabId, updatedAttrs)
        if (res.success) {
          set({ activeTabAttributes: updatedAttrs })
          window.dispatchEvent(
            new CustomEvent('guitar-companion:tempo-saved', {
              detail: { tabId: activeTabId, tempo: bpm, attributes: updatedAttrs }
            })
          )
          return true
        }
        return false
      } catch (err) {
        console.error('Failed to save tempo to tab:', err)
        return false
      }
    },

    bpm: Math.min(300, Math.max(30, saved.bpm ?? 120)),
    beatsPerMeasure: Math.min(16, Math.max(1, saved.beatsPerMeasure ?? 4)),
    beatUnit: saved.beatUnit ?? 4,
    accentFirstBeat: saved.accentFirstBeat ?? true,
    sound: saved.sound ?? 'woodblock',
    volume: Math.min(1, Math.max(0, saved.volume ?? 0.8)),

    open: (): void => set({ isOpen: true }),
    close: (): void => set({ isOpen: false }),
    toggleOpen: (): void => set((s) => ({ isOpen: !s.isOpen })),

    start: async (customBpm?: number): Promise<void> => {
      const override =
        customBpm !== undefined ? Math.min(300, Math.max(30, Math.round(customBpm))) : null
      set({ isPlaying: true, currentBeat: 0, overrideBpm: override })
      await engine.start()
    },

    stop: (): void => {
      engine.stop()
      set({ isPlaying: false, currentBeat: -1, overrideBpm: null })
    },

    togglePlay: async (): Promise<void> => {
      const isCurrentlyPlaying = get().isPlaying
      if (isCurrentlyPlaying) {
        get().stop()
      } else {
        await get().start()
      }
    },

    setOverrideBpm: (bpm: number | null): void => {
      const clamped = bpm !== null ? Math.min(300, Math.max(30, Math.round(bpm))) : null
      set({ overrideBpm: clamped })
    },

    setBpm: (bpm: number): void => {
      const clamped = Math.min(300, Math.max(30, Math.round(bpm)))
      set({ bpm: clamped, overrideBpm: null })
      saveConfig({
        bpm: clamped,
        beatsPerMeasure: get().beatsPerMeasure,
        beatUnit: get().beatUnit,
        accentFirstBeat: get().accentFirstBeat,
        sound: get().sound,
        volume: get().volume
      })
    },

    adjustBpm: (delta: number): void => {
      get().setBpm(get().bpm + delta)
    },

    setBeatsPerMeasure: (beats: number): void => {
      const clamped = Math.min(16, Math.max(1, Math.round(beats)))
      set({ beatsPerMeasure: clamped })
      saveConfig({
        bpm: get().bpm,
        beatsPerMeasure: clamped,
        beatUnit: get().beatUnit,
        accentFirstBeat: get().accentFirstBeat,
        sound: get().sound,
        volume: get().volume
      })
    },

    setBeatUnit: (unit: number): void => {
      const validUnits = [2, 4, 8, 16]
      const validUnit = validUnits.includes(unit) ? unit : 4
      set({ beatUnit: validUnit })
      saveConfig({
        bpm: get().bpm,
        beatsPerMeasure: get().beatsPerMeasure,
        beatUnit: validUnit,
        accentFirstBeat: get().accentFirstBeat,
        sound: get().sound,
        volume: get().volume
      })
    },

    setTimeSignature: (beats: number, unit: number): void => {
      const clampedBeats = Math.min(16, Math.max(1, Math.round(beats)))
      const validUnits = [2, 4, 8, 16]
      const validUnit = validUnits.includes(unit) ? unit : 4
      set({ beatsPerMeasure: clampedBeats, beatUnit: validUnit })
      saveConfig({
        bpm: get().bpm,
        beatsPerMeasure: clampedBeats,
        beatUnit: validUnit,
        accentFirstBeat: get().accentFirstBeat,
        sound: get().sound,
        volume: get().volume
      })
    },

    setAccentFirstBeat: (accent: boolean): void => {
      set({ accentFirstBeat: accent })
      saveConfig({
        bpm: get().bpm,
        beatsPerMeasure: get().beatsPerMeasure,
        beatUnit: get().beatUnit,
        accentFirstBeat: accent,
        sound: get().sound,
        volume: get().volume
      })
    },

    setSound: (sound: MetronomeSound): void => {
      set({ sound })
      saveConfig({
        bpm: get().bpm,
        beatsPerMeasure: get().beatsPerMeasure,
        beatUnit: get().beatUnit,
        accentFirstBeat: get().accentFirstBeat,
        sound,
        volume: get().volume
      })
    },

    setVolume: (volume: number): void => {
      const clamped = Math.min(1, Math.max(0, volume))
      set({ volume: clamped })
      saveConfig({
        bpm: get().bpm,
        beatsPerMeasure: get().beatsPerMeasure,
        beatUnit: get().beatUnit,
        accentFirstBeat: get().accentFirstBeat,
        sound: get().sound,
        volume: clamped
      })
    },

    tapTempo: (): void => {
      const now = performance.now()
      const prevTaps = get().tapHistory
      // If gap since last tap is > 2.5s, reset tap history
      const recentTaps =
        prevTaps.length > 0 && now - prevTaps[prevTaps.length - 1] > 2500 ? [] : prevTaps

      const newTaps = [...recentTaps, now].slice(-5)
      set({ tapHistory: newTaps })

      if (newTaps.length >= 2) {
        let totalDiff = 0
        for (let i = 1; i < newTaps.length; i++) {
          totalDiff += newTaps[i] - newTaps[i - 1]
        }
        const avgInterval = totalDiff / (newTaps.length - 1)
        if (avgInterval > 0) {
          const calculatedBpm = Math.round(60000 / avgInterval)
          get().setBpm(calculatedBpm)
        }
      }
    },

    playTestClick: (isAccent = false): void => {
      engine.playSingleClick(isAccent)
    }
  }
})
