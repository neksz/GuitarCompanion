import fs from 'fs'
import { PDFParse } from 'pdf-parse'

interface PdfAnalysisResult {
  tuning: string
  capo: number
  previewBase64: string | null
}

// Common tuning patterns - more flexible matching
const TUNING_PATTERNS = [
  // Named tunings with optional "tuning" suffix
  /\b(Standard|Drop(?:ped)?\s?D|Drop(?:ped)?\s?C|Open\s?G|Open\s?D|Open\s?E|Open\s?A|DADGAD|Half\s?Step\s?Down|Whole\s?Step\s?Down)\s*(?:tuning)?\b/i,
  // Explicit tuning label
  /(?:tuning|tune)[:\s]+([A-G][#b]?\s*[A-G][#b]?\s*[A-G][#b]?\s*[A-G][#b]?\s*[A-G][#b]?\s*[A-G][#b]?)/i
]

// Capo detection - very flexible, matches "capo" followed by a number anywhere
// Handles: Capo 5, Capo. fret 5, Capo: 3, Capo on fret 2, Capo on the 5th fret, etc.
const CAPO_PATTERN = /capo[^\d]{0,20}(\d+)/i

function detectTuning(text: string): string {
  for (const pattern of TUNING_PATTERNS) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const tuning = match[1].trim().toLowerCase()
      // Normalize common tuning names
      if (/standard/i.test(tuning)) return 'Standard'
      if (/drop(?:ped)?\s?d/i.test(tuning)) return 'Drop D'
      if (/drop(?:ped)?\s?c/i.test(tuning)) return 'Drop C'
      if (/open\s?g/i.test(tuning)) return 'Open G'
      if (/open\s?d/i.test(tuning)) return 'Open D'
      if (/dadgad/i.test(tuning)) return 'DADGAD'
      if (/half\s?step/i.test(tuning)) return 'Half Step Down'
      return match[1].trim() // Return as-is if not normalized
    }
  }
  return 'Standard' // Default
}

function detectCapo(text: string): number {
  const match = text.match(CAPO_PATTERN)
  if (match && match[1]) {
    const capoNum = parseInt(match[1], 10)
    if (capoNum >= 0 && capoNum <= 12) {
      return capoNum
    }
  }
  return 0 // Default: no capo
}

export async function analyzePdf(filePath: string): Promise<PdfAnalysisResult> {
  const result: PdfAnalysisResult = {
    tuning: 'Standard',
    capo: 0,
    previewBase64: null
  }

  try {
    // Read PDF file
    const dataBuffer = fs.readFileSync(filePath)

    // Extract text using PDFParse class (v2 API)
    const parser = new PDFParse({ data: dataBuffer })
    const textResult = await parser.getText()

    // Get first portion of text (title area)
    const firstText = textResult.text.substring(0, 1000)

    // Detect tuning and capo
    result.tuning = detectTuning(firstText)
    result.capo = detectCapo(firstText)

    // Generate preview using pdf-parse's built-in screenshot method
    try {
      const screenshotResult = await parser.getScreenshot({ scale: 1.0 })
      if (screenshotResult.pages.length > 0) {
        result.previewBase64 = screenshotResult.pages[0].dataUrl
      }
    } catch (previewError) {
      console.error('[PDF Analyzer] Preview generation failed:', previewError)
      // Continue without preview
    }
  } catch (error) {
    console.error('[PDF Analyzer] Error:', error)
  }

  console.log(
    '[PDF Analyzer]',
    filePath.split(/[/\\]/).pop(),
    '→ Tuning:',
    result.tuning,
    '| Capo:',
    result.capo,
    '| Preview:',
    result.previewBase64 ? 'yes' : 'no'
  )
  return result
}
