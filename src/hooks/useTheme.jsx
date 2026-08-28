import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import {
  ACCENTS,
  THEMES,
  applyAccent,
  applyTheme,
  getAccent,
  getTheme,
  readStoredAccentId,
  readStoredThemeId,
  resolveDark,
  storeAccentId,
  storeThemeId,
} from '../lib/theme.js'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [accentId, setAccentId] = useState(readStoredAccentId)
  const [themeId, setThemeId] = useState(readStoredThemeId)
  // Con el tema en 'auto', quién manda es el sistema: hay que volver a
  // calcular el tono del acento cuando el teléfono pasa a oscuro (atardecer,
  // modo de bajo consumo), no solo al abrir la app.
  const [systemDark, setSystemDark] = useState(() => resolveDark('auto'))

  const accent = useMemo(() => getAccent(accentId), [accentId])
  const theme = useMemo(() => getTheme(themeId), [themeId])
  const isDark = themeId === 'auto' ? systemDark : themeId === 'dark'

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setSystemDark(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // useLayoutEffect y no useEffect: corre antes del primer pintado, así el que
  // eligió otro color (o el modo oscuro) no ve un destello con el default.
  useLayoutEffect(() => {
    applyTheme(themeId)
    applyAccent(accent, isDark)
  }, [accent, themeId, isDark])

  const value = useMemo(
    () => ({
      accent,
      accents: ACCENTS,
      theme,
      themes: THEMES,
      isDark,
      chooseAccent(id) {
        setAccentId(id)
        storeAccentId(id)
      },
      chooseTheme(id) {
        setThemeId(id)
        storeThemeId(id)
      },
    }),
    [accent, theme, isDark],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// `isDark` lo necesitan los gráficos, que pintan en SVG y no entienden clases
// de Tailwind: con él vuelven a leer los colores del tema cuando cambia (ver
// lib/chartColors.js).
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  }
  return context
}
