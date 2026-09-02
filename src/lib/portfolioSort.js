// Cómo se ordena la lista del Portafolio, recordado por DISPOSITIVO — el mismo
// criterio que el color de acento y el modo claro/oscuro (ver lib/theme.js):
// vive en localStorage y no en la tabla settings, porque no hace falta que
// viaje entre dispositivos ni justifica una migración.
//
// La lógica de ordenamiento en sí (PORTFOLIO_SORTS y sortPortfolioEntries) es
// pura y vive en lib/portfolio.js. Acá está solo la persistencia, que es lo
// único impuro de la feature.
import { PORTFOLIO_SORTS } from './portfolio.js'

export const DEFAULT_PORTFOLIO_SORT_ID = 'manual'

const SORT_KEY = 'finanzas:portfolio-sort'

// localStorage tira en modo privado de Safari y con cookies bloqueadas: si
// falla, la lista se muestra en el orden manual y la app sigue andando. Un id
// desconocido (guardado por una versión anterior, o tocado a mano) también cae
// al default, en vez de dejar la pantalla sin ningún orden aplicado.
export function readStoredPortfolioSortId() {
  try {
    const stored = localStorage.getItem(SORT_KEY)
    return PORTFOLIO_SORTS.some((sort) => sort.id === stored) ? stored : DEFAULT_PORTFOLIO_SORT_ID
  } catch {
    return DEFAULT_PORTFOLIO_SORT_ID
  }
}

export function storePortfolioSortId(id) {
  try {
    localStorage.setItem(SORT_KEY, id)
  } catch {
    // Sin persistencia el orden vale para esta sesión y listo.
  }
}
