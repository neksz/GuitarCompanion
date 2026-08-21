import * as alphaTab from '@coderline/alphatab'

export interface GpAnalysisResult {
  tuning: string
  capo: number
  title?: string
  artist?: string
}

/**
 * Parses Guitar Pro files (.gp3, .gp4, .gp5, .gpx, .gp) in the browser
 * and extracts the tuning, capo, title, and artist information.
 */
export async function analyzeGpFile(file: File): Promise<GpAnalysisResult> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes)

    let tuning = 'Standard'
    let capo = 0
    const title = score.title || ''
    const artist = score.artist || ''

    // Find the primary guitar / stringed track (default to track 0 if none explicitly stringed)
    const guitarTrack =
      score.tracks.find((t) => t.staves && t.staves.length > 0 && !t.staves[0].isPercussion) ||
      score.tracks[0]

    if (guitarTrack && guitarTrack.staves && guitarTrack.staves.length > 0) {
      const staff = guitarTrack.staves[0]
      capo = staff.capo || 0

      if (staff.tuning && staff.tuning.length > 0) {
        try {
          const noteNames = staff.tuning.map((midiNote) =>
            alphaTab.model.Tuning.getTextForTuning(midiNote, false)
          )
          const notesStr = noteNames.join(' ')

          // Check standard patterns
          if (notesStr === 'E A D G B E') {
            tuning = 'Standard'
          } else if (notesStr === 'D A D G B E') {
            tuning = 'Drop D'
          } else if (
            notesStr === 'Eb Ab Db Gb Bb Eb' ||
            notesStr === 'D# G# C# F# A# D#' ||
            notesStr === 'Eb Bb Gb Db Ab Eb'
          ) {
            tuning = 'Eb Standard'
          } else if (notesStr === 'D G C F A D') {
            tuning = 'D Standard'
          } else if (notesStr === 'C G C F A D') {
            tuning = 'Drop C'
          } else if (notesStr === 'D A D F# A D') {
            tuning = 'Open D'
          } else if (notesStr === 'D G D G B D') {
            tuning = 'Open G'
          } else if (notesStr === 'D A D G A D') {
            tuning = 'DADGAD'
          } else {
            let rawName = staff.tuningName || staff.stringTuning?.name || ''
            rawName = rawName
              .replace(/^Guitar\s+/i, '')
              .replace(/Tune down\s+½\s+step/i, 'Eb Standard')
            if (
              rawName &&
              rawName.toLowerCase() !== 'standard' &&
              rawName.toLowerCase() !== 'custom'
            ) {
              tuning = rawName
            } else {
              tuning = notesStr
            }
          }
        } catch {
          tuning = staff.tuningName || 'Standard'
        }
      } else if (staff.tuningName) {
        tuning = staff.tuningName.replace(/^Guitar\s+/i, '')
      }
    }

    return { tuning, capo, title, artist }
  } catch (err) {
    console.error('[guitarProAnalyzer] Failed to analyze GP file:', err)
    return { tuning: 'Standard', capo: 0 }
  }
}
