import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  define: {
    global: 'globalThis',
  },
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'app.html'),
      },
    },
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
      'node:buffer': 'buffer/',
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
});
