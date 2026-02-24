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
  test: {
    setupFiles: ['./vitest.setup.ts'],
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
        manualChunks(id) {
          // Normalize path separators for Windows compatibility
          const normalId = id.replace(/\\/g, '/');
          // React core - rarely changes, highly cacheable
          if (normalId.includes('node_modules/react-dom/') || normalId.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          // Three.js and R3F - largest vendor bundle
          if (normalId.includes('node_modules/three/') || normalId.includes('node_modules/@react-three/')) {
            return 'vendor-three';
          }
          // State management
          if (normalId.includes('node_modules/zustand/') || normalId.includes('node_modules/immer/')) {
            return 'vendor-zustand';
          }
          // Animation
          if (normalId.includes('node_modules/motion/') || normalId.includes('node_modules/framer-motion/')) {
            return 'vendor-motion';
          }
          // Icons
          if (normalId.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
        },
      },
    },
    // Report chunk sizes above 600KB
    chunkSizeWarningLimit: 600,
  },
})
