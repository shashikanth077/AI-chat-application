import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Set VITE_BASE=/repo-name/ when hosting under a sub-path (GitHub Pages).
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false, // styles don't affect behaviour tests
  },
})
