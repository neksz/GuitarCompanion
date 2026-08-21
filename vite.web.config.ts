import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { alphaTab } from '@coderline/alphatab-vite'

export default defineConfig({
  base: '/GuitarCompanion/',
  root: 'src/renderer',
  publicDir: 'public',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  plugins: [react(), alphaTab()]
})
