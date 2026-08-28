// Recharts pinta en SVG: necesita colores resueltos, no clases de Tailwind.
// En vez de repetir los hex acá (que fue lo que pasó: tres archivos con la
// misma paleta copiada, que se desincronizaba sola y encima ignoraba el modo
// oscuro), se leen del DOM las mismas variables que usa el resto de la app.
//
// Se lee en el momento del render, no al importar el módulo: las variables
// cambian cuando el usuario elige otro acento o el sistema pasa a oscuro. Por
// eso quien lo llama lo memoriza contra `isDark` y el acento (ver useTheme).
export function readChartColors() {
  const styles = getComputedStyle(document.documentElement)
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback

  return {
    accent: read('--color-accent-ink', '#0a7a55'),
    gain: read('--color-gain', '#0e7a4e'),
    clay: read('--color-clay', '#c3372b'),
    inkSoft: read('--color-ink-soft', '#6b7180'),
    inkFaint: read('--color-ink-faint', '#99a0ad'),
    line: read('--color-line', '#e3e5ec'),
  }
}
