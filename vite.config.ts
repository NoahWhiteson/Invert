import { defineConfig } from 'vite'

/** Set in deploy env for Twitter/OG absolute image URLs, e.g. https://your-game.pages.dev */
const SITE_ORIGIN = process.env.VITE_SITE_ORIGIN?.replace(/\/$/, '') ?? ''

export default defineConfig({
  assetsInclude: ['**/*.obj'],
  plugins: [
    {
      name: 'inject-social-meta-placeholders',
      transformIndexHtml(html) {
        const imageAbs = SITE_ORIGIN ? `${SITE_ORIGIN}/thumbnailforundersphere.PNG` : ''
        return html
          .replace(/__TWITTER_IMAGE__/g, imageAbs || '/thumbnailforundersphere.PNG')
          .replace(/__OG_IMAGE__/g, imageAbs || '/thumbnailforundersphere.PNG')
      },
    },
  ],
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
