import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Freeze the approved 1A browser floor instead of inheriting a future Vite default.
  build: {
    target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
  },
})
