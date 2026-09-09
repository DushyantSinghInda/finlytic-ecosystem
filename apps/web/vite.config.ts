import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    }
  },
  server: {
    port: 3003,
    // The gateway is the only backend this app knows about. Proxying in dev
    // reproduces production, where the gateway serves the built assets and
    // the API from one origin — so there is no CORS in either environment,
    // and SameSite=Strict cookies behave the same in both.
    proxy: {
      '/api': 'http://localhost:3000',
      '/oauth': 'http://localhost:3000',
    },
  },
  test: {
    // No DOM needed: these cover module state and fetch, not components.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true
  }
})
