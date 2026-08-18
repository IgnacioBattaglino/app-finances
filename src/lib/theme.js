// Color de marca de la app (el token `accent` de index.css). Es preferencia
// de DISPOSITIVO, no del usuario: vive en localStorage y no en la tabla
// settings, porque no hace falta que viaje entre dispositivos ni justifica
// una migración. Si algún día tiene que sincronizarse, el lugar es una
// columna en settings y este módulo pasa a leerla.
//
// `deep` es el tono del estado presionado (bg-accent-deep). Todos los colores
// están elegidos para que el blanco encima pase contraste AA (>= 4.5:1), que
// es como se usan: texto blanco sobre botón lleno.

export const ACCENTS = [
  { id: 'pino', name: 'Pino', color: '#1e6b4c', deep: '#14503a' },
  { id: 'oceano', name: 'Océano', color: '#12617a', deep: '#0d4a5e' },
  { id: 'indigo', name: 'Índigo', color: '#3f4fa8', deep: '#303c86' },
  { id: 'ciruela', name: 'Ciruela', color: '#7a3d86', deep: '#5f2f68' },
  { id: 'vino', name: 'Vino', color: '#9b3352', deep: '#7a2540' },
  { id: 'grafito', name: 'Grafito', color: '#3b423d', deep: '#262b28' },
]

export const DEFAULT_ACCENT_ID = 'pino'

const STORAGE_KEY = 'finanzas:accent'

// Un id desconocido (guardado por una versión anterior, o tocado a mano) cae
// al default en vez de dejar la app sin color.
export function getAccent(id) {
  return ACCENTS.find((accent) => accent.id === id) ?? ACCENTS[0]
}

// localStorage tira en modo privado de Safari y con cookies bloqueadas: si
// falla, la app sigue andando con el color por default.
export function readStoredAccentId() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_ACCENT_ID
  } catch {
    return DEFAULT_ACCENT_ID
  }
}

export function storeAccentId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Sin persistencia el color vale para esta sesión y listo.
  }
}

// Pisa las variables que `@theme` define en :root. Como Tailwind v4 compila
// `bg-accent` a `var(--color-accent)`, con estas dos líneas cambia toda la
// app de una — no hay que tocar ninguna clase.
export function applyAccent(accent) {
  const root = document.documentElement
  root.style.setProperty('--color-accent', accent.color)
  root.style.setProperty('--color-accent-deep', accent.deep)
}
