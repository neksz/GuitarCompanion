import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage } from 'canvas'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function generateIcons() {
  const sourcePath = path.resolve(__dirname, '../resources/guitar-svgrepo-com.png')
  const outDir = path.resolve(__dirname, '../src/renderer/public/icons')

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const img = await loadImage(sourcePath)

  // Helper to render standard icon (transparent background)
  function createStandardIcon(size) {
    const canvas = createCanvas(size, size)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, size, size)
    return canvas.toBuffer('image/png')
  }

  // Helper to render maskable / padded icon with background color #1b1b1f
  // Safe zone for maskable icon is the inner 80% (10% padding on each side)
  function createMaskableIcon(size) {
    const canvas = createCanvas(size, size)
    const ctx = canvas.getContext('2d')

    // Fill background
    ctx.fillStyle = '#1b1b1f'
    ctx.fillRect(0, 0, size, size)

    // Draw image centered in the 80% safe zone
    const innerSize = Math.round(size * 0.8)
    const offset = Math.round((size - innerSize) / 2)
    ctx.drawImage(img, offset, offset, innerSize, innerSize)

    return canvas.toBuffer('image/png')
  }

  // Generate icons
  fs.writeFileSync(path.join(outDir, 'icon-192.png'), createStandardIcon(192))
  console.log('Created icon-192.png')

  fs.writeFileSync(path.join(outDir, 'icon-512.png'), createStandardIcon(512))
  console.log('Created icon-512.png')

  fs.writeFileSync(path.join(outDir, 'icon-maskable-192.png'), createMaskableIcon(192))
  console.log('Created icon-maskable-192.png')

  fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), createMaskableIcon(512))
  console.log('Created icon-maskable-512.png')

  fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), createMaskableIcon(180))
  console.log('Created apple-touch-icon.png')
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err)
  process.exit(1)
})
