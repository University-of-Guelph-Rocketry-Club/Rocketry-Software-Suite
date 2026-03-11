import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three':    ['three', '@react-three/fiber', '@react-three/drei'],
          'leaflet':  ['leaflet', 'react-leaflet'],
          'recharts': ['recharts'],
          'vendor':   ['react', 'react-dom', 'zustand', 'date-fns'],
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 1421 }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
