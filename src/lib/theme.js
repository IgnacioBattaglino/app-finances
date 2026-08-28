// Apariencia de la app: el color de marca y el modo claro/oscuro. Las dos son
// preferencias de DISPOSITIVO, no del usuario: viven en localStorage y no en la
// tabla settings, porque no hace falta que viajen entre dispositivos ni
// justifican una migración. Si algún día tienen que sincronizarse, el lugar es
// una columna en settings y este módulo pasa a leerla.

// ---------------------------------------------------------------------------
// COLOR DE MARCA
// ---------------------------------------------------------------------------
// Cada acento tiene tres valores porque un mismo color no puede hacer los tres
// trabajos:
//
// - `fill`: el relleno de un botón, que SIEMPRE lleva texto blanco encima.
//   Todos están elegidos para que ese blanco pase contraste AA (>= 4.5:1), y
//   por eso son oscuros. Es el mismo en claro y en oscuro: un botón lleno se
//   lee igual sobre cualquier fondo.
// - `deep`: el mismo color presionado.
// - `inkDark`: el acento como TEXTO (links, tab activa, "Guardar") cuando el
//   fondo es casi negro. Ahí el `fill` no alcanza —un verde oscuro sobre negro
//   no se lee— así que en modo oscuro el texto usa esta versión clara, que
//   pasa AA contra el fondo oscuro. En modo claro el texto usa `fill`.
export const ACCENTS = [
  { id: 'pino', name: 'Pino', fill: '#0a7a55', deep: '#075f42', inkDark: '#3ed598' },
  { id: 'oceano', name: 'Océano', fill: '#0f6e8c', deep: '#0b566e', inkDark: '#4fc3e8' },
  { id: 'indigo', name: 'Índigo', fill: '#4650c4', deep: '#373fa0', inkDark: '#98a0ff' },
  { id: 'ciruela', name: 'Ciruela', fill: '#7e3b92', deep: '#642e74', inkDark: '#d89aeb' },
  { id: 'vino', name: 'Vino', fill: '#a62f55', deep: '#832343', inkDark: '#ff8fb0' },
  { id: 'grafito', name: 'Grafito', fill: '#3d434e', deep: '#2a2f38', inkDark: '#b8bec9' },
]

export const DEFAULT_ACCENT_ID = 'pino'

const ACCENT_KEY = 'finanzas:accent'

// Un id desconocido (guardado por una versión anterior, o tocado a mano) cae
// al default en vez de dejar la app sin color.
export function getAccent(id) {
  return ACCENTS.find((accent) => accent.id === id) ?? ACCENTS[0]
}

// localStorage tira en modo privado de Safari y con cookies bloqueadas: si
// falla, la app sigue andando con el color por default.
export function readStoredAccentId() {
  try {
    return localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT_ID
  } catch {
    return DEFAULT_ACCENT_ID
  }
}

export function storeAccentId(id) {
  try {
    localStorage.setItem(ACCENT_KEY, id)
  } catch {
    // Sin persistencia el color vale para esta sesión y listo.
  }
}

// ---------------------------------------------------------------------------
// MODO CLARO / OSCURO
// ---------------------------------------------------------------------------
// 'auto' sigue al sistema (lo resuelve el @media de index.css) y es el default;
// 'light' y 'oscuro' lo fuerzan con el atributo data-theme en <html>, que en
// index.css gana sobre el @media.
export const THEMES = [
  { id: 'auto', name: 'Automático' },
  { id: 'light', name: 'Claro' },
  { id: 'dark', name: 'Oscuro' },
]

export const DEFAULT_THEME_ID = 'auto'

const THEME_KEY = 'finanzas:theme'

export function getTheme(id) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function readStoredThemeId() {
  try {
    return localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function storeThemeId(id) {
  try {
    localStorage.setItem(THEME_KEY, id)
  } catch {
    // Ídem el acento: sin persistencia vale para esta sesión.
  }
}

export function prefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Si la pantalla termina oscura o no. Lo necesita quien pinta fuera de CSS
// (los gráficos, que dibujan en SVG) y la elección del tono del acento.
export function resolveDark(themeId) {
  if (themeId === 'dark') return true
  if (themeId === 'light') return false
  return prefersDark()
}

// En 'auto' no se toca el atributo: manda el @media de index.css.
export function applyTheme(themeId) {
  const root = document.documentElement
  if (themeId === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', themeId)
}

// Pisa las variables que `@theme` define en :root. Como Tailwind v4 compila
// `bg-accent` a `var(--color-accent)`, con estas tres líneas cambia toda la app
// de una — no hay que tocar ninguna clase.
export function applyAccent(accent, isDark) {
  const root = document.documentElement
  root.style.setProperty('--color-accent', accent.fill)
  root.style.setProperty('--color-accent-deep', accent.deep)
  root.style.setProperty('--color-accent-ink', isDark ? accent.inkDark : accent.fill)
}
