import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },

  resolve: {
    alias: {
      // If a build ever fails on mammoth reaching for Node's `fs`, uncomment
      // this. Vite normally resolves mammoth's `browser` field to its browser
      // bundle, so the plain specifier is preferred — but this is the fix if a
      // future version changes that field.
      // mammoth: 'mammoth/mammoth.browser.min.js',
    },
  },

  optimizeDeps: {
    // Both parsers are reached only through dynamic import(), so they stay
    // code-split. Pre-bundling them stops the first upload from stalling in dev
    // while Vite optimises a megabyte of PDF.js on demand.
    include: ['pdfjs-dist', 'mammoth'],
  },

  build: {
    // PDF.js is large but lazily loaded, so it lands in its own chunk rather
    // than the main bundle. Raise the warning threshold rather than pretend the
    // total is small.
    chunkSizeWarningLimit: 1600,
  },

  // PDF.js ships an ES-module worker.
  worker: { format: 'es' },
})
