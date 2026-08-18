import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react'
import {
  ACCENTS,
  applyAccent,
  getAccent,
  readStoredAccentId,
  storeAccentId,
} from '../lib/theme.js'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [accentId, setAccentId] = useState(readStoredAccentId)
  const accent = useMemo(() => getAccent(accentId), [accentId])

  // useLayoutEffect y no useEffect: corre antes del primer pintado, así el
  // que eligió otro color no ve un destello verde al abrir la app.
  useLayoutEffect(() => {
    applyAccent(accent)
  }, [accent])

  const value = useMemo(
    () => ({
      accent,
      accents: ACCENTS,
      chooseAccent(id) {
        setAccentId(id)
        storeAccentId(id)
      },
    }),
    [accent],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// `accent.color` es el hex resuelto: lo necesitan los gráficos, que pintan en
// SVG y no entienden clases de Tailwind (ver PortfolioEvolutionChart).
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  }
  return context
}
