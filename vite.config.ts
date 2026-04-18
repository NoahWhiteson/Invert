import { defineConfig } from 'vite'

export default defineConfig({
  assetsInclude: ['**/*.obj'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
})
