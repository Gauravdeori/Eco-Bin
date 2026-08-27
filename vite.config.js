import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Charting and mapping are the two heavy dependencies. Splitting them out
        // means editing app code does not invalidate their cached chunks.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('leaflet')) return 'maps'
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory'))
            return 'charts'
          if (id.includes('react')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
