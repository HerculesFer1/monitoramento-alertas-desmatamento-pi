/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'

// Hash do commit para Sentry release tracking.
const GIT_SHA = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() }
  catch { return 'unknown' }
})()

export default defineConfig({
  define: {
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(GIT_SHA),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Permite importar pipeline/constants.json como '@pipeline/constants'
      '@pipeline': path.resolve(__dirname, '../pipeline'),
    },
  },
  build: {
    // maplibre-gl tem ~1 MB minificado — limite elevado para suprimir falso-positivo
    chunkSizeWarningLimit: 1_200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-dom') || id.includes('/react/'))  return 'vendor-react'
          if (id.includes('maplibre') || id.includes('react-map-gl')) return 'vendor-map'
          if (id.includes('recharts'))         return 'vendor-charts'
          if (id.includes('@tanstack'))         return 'vendor-query'
          if (id.includes('zustand'))           return 'vendor-state'
          if (id.includes('@supabase'))         return 'vendor-supabase'
          if (id.includes('lucide-react'))      return 'vendor-icons'
        },
      },
    },
  },
})
