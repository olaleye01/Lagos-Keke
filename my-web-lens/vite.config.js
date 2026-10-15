// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    minify: 'terser',
    cssMinify: true,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      format: {
        comments: false,
      },
      mangle: {
        toplevel: true,
      },
    },
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: 'assets/game.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/index.css';
          }
          if (assetInfo.names && assetInfo.names.some(n => n.endsWith('.css'))) {
            return 'assets/index.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
});