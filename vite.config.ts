import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Split three.js into its own chunk for better caching
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three')) {
              return 'three';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  optimizeDeps: {
    exclude: ['three'],
  },
  server: {
    fs: {
      allow: ['..']
    },
    // JARVIS-Fernbedienung (QR-Code im Chat) braucht Erreichbarkeit vom
    // Handy im selben WLAN — ohne host:true bindet Vite nur an localhost,
    // das vom Handy aus nie erreichbar ist ("Webseite nicht erreichbar").
    host: true,
  }
});
