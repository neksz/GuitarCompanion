import { MetronomeSound } from '../services/metronomeAudio'

export function getTempoName(bpm: number): string {
  if (bpm < 40) return 'Larghissimo (Very Slow)'
  if (bpm < 60) return 'Largo (Slow & Broad)'
  if (bpm < 66) return 'Larghetto (Rather Slow)'
  if (bpm < 76) return 'Adagio (Slow & Stately)'
  if (bpm < 108) return 'Andante (Walking Pace)'
  if (bpm < 120) return 'Moderato (Moderate)'
  if (bpm < 156) return 'Allegro (Fast & Bright)'
  if (bpm < 176) return 'Vivace (Lively & Fast)'
  if (bpm < 200) return 'Presto (Very Fast)'
  return 'Prestissimo (Extremely Fast)'
}

export const TIME_SIGNATURE_PRESETS = [
  { beats: 2, label: '2/4' },
  { beats: 3, label: '3/4' },
  { beats: 4, label: '4/4' },
  { beats: 5, label: '5/4' },
  { beats: 6, label: '6/4' },
  { beats: 7, label: '7/4' }
]

export const SOUND_OPTIONS: { id: MetronomeSound; label: string }[] = [
  { id: 'woodblock', label: 'Woodblock' },
  { id: 'digital', label: 'Digital' },
  { id: 'mechanical', label: 'Mechanical' }
]
