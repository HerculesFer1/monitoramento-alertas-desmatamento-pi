import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Configuração dedicada ao Vitest — mantida separada do vite.config.ts
// para evitar que vitest/config (Vite 8 + rolldown) seja carregado durante o build.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
