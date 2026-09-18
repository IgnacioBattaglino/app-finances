import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  // Mismo define que vite.config.js: src/version.js lo necesita para
  // resolver, y algún módulo bajo test lo importa (ver src/lib/queryClient.js).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: { environment: 'node' },
})
