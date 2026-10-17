import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Keep game icons as separate files so only the ones on screen get loaded,
    // instead of inlining hundreds of them into the JS bundle
    assetsInlineLimit: (file) => (file.endsWith('.svg') ? false : undefined),
  },
})
