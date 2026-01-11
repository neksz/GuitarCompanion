import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Import the worker as a URL that Vite can bundle
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;

interface BrowserPdfAnalysisResult {
    tuning: string;
    capo: number;
    previewBase64: string | null;
}

// Common tuning patterns - more flexible matching
const TUNING_PATTERNS = [
    // Named tunings with optional "tuning" suffix
    /\b(Standard|Drop(?:ped)?\s?D|Drop(?:ped)?\s?C|Open\s?G|Open\s?D|Open\s?E|Open\s?A|DADGAD|Half\s?Step\s?Down|Whole\s?Step\s?Down)\s*(?:tuning)?\b/i,
    // Explicit tuning label
    /(?:tuning|tune)[:\s]+([A-G][#b]?\s*[A-G][#b]?\s*[A-G][#b]?\s*[A-G][#b]?\s*[A-G][#b]?\s*[A-G][#b]?)/i,
];

// Capo detection - very flexible, matches "capo" followed by a number anywhere
const CAPO_PATTERN = /capo[^\d]{0,20}(\d+)/i;

function detectTuning(text: string): string {
    for (const pattern of TUNING_PATTERNS) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const tuning = match[1].trim().toLowerCase();
            if (/standard/i.test(tuning)) return 'Standard';
            if (/drop(?:ped)?\s?d/i.test(tuning)) return 'Drop D';
            if (/drop(?:ped)?\s?c/i.test(tuning)) return 'Drop C';
            if (/open\s?g/i.test(tuning)) return 'Open G';
            if (/open\s?d/i.test(tuning)) return 'Open D';
            if (/dadgad/i.test(tuning)) return 'DADGAD';
            if (/half\s?step/i.test(tuning)) return 'Half Step Down';
            return match[1].trim();
        }
    }
    return 'Standard';
}

function detectCapo(text: string): number {
    const match = text.match(CAPO_PATTERN);
    if (match && match[1]) {
        const capoNum = parseInt(match[1], 10);
        if (capoNum >= 0 && capoNum <= 12) {
            return capoNum;
        }
    }
    return 0;
}

export async function analyzePdfInBrowser(file: File): Promise<BrowserPdfAnalysisResult> {
    const result: BrowserPdfAnalysisResult = {
        tuning: 'Standard',
        capo: 0,
        previewBase64: null
    };

    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Load PDF document
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        // Extract text from first page
        const page = await pdf.getPage(1);
        const textContent = await page.getTextContent();
        const text = textContent.items
            .map((item: any) => item.str)
            .join(' ')
            .substring(0, 1000);
        
        // Detect tuning and capo
        result.tuning = detectTuning(text);
        result.capo = detectCapo(text);
        
        // Generate preview by rendering first page to canvas
        const scale = 1.0;
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        if (context) {
            await page.render({
                canvasContext: context,
                viewport: viewport,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                canvas: canvas as any
            }).promise;
            
            result.previewBase64 = canvas.toDataURL('image/png');
        }
        
        console.log('[Browser PDF Analyzer]', file.name, '→ Tuning:', result.tuning, '| Capo:', result.capo, '| Preview:', result.previewBase64 ? 'yes' : 'no');
        
    } catch (error) {
        console.error('[Browser PDF Analyzer] Error:', error);
    }

    return result;
}
