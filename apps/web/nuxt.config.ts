import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  // Local-first: there is no CDN, no analytics, no font fetch. Everything the
  // dashboard needs is served from this process.
  app: {
    head: {
      title: 'nomnomtokens',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'dark light' },
      ],
    },
  },

  nitro: {
    // better-sqlite3 is a native module; Nitro must not try to bundle it
    externals: { inline: [], external: ['better-sqlite3'] },
    esbuild: { options: { target: 'node20' } },
  },

  typescript: { strict: true },

  future: { compatibilityVersion: 4 },
})
