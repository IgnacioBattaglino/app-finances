import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'

// Tras un deploy, la app abierta pide un chunk con hash viejo que ya no
// existe y Vercel responde index.html: recargar toma la versión nueva. Una
// sola vez por minuto, para no entrar en bucle si el deploy está roto.
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('preload-reload') ?? 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem('preload-reload', String(Date.now()))
  } catch {
    // sin sessionStorage: se recarga igual, una vez por carga de página
  }
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
