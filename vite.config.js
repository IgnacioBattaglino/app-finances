import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // La versión de package.json se inyecta en build como __APP_VERSION__
  // (ver src/version.js) para mostrarla en Inicio y confirmar deploys a ojo.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
