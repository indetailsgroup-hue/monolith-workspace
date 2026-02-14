import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/factory': 'http://localhost:3001',
    },
  },
  // T018: Code Splitting - Manual chunks for vendor bundles
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Three.js and R3F bundle (~800KB+ minified)
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          // State management bundle (~30KB minified)
          'vendor-zustand': ['zustand', 'immer'],
          // Animation bundle (~50KB minified)
          'vendor-motion': ['motion/react'],
        },
      },
    },
    // Report chunk sizes
    chunkSizeWarningLimit: 600,
  },
})
