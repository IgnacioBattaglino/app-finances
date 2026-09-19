import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPortfolioSeries, earliestOperationDate, rangeFrom, trimLeadingZeros } from '../lib/portfolioSeries.js'
import { todayISO } from '../lib/format.js'

// La curva de evolución del portafolio (get_portfolio_series), para el rango
// elegido en PortfolioEvolutionChart. Sobre la caché compartida: cambiar de
// rango (3 meses / 1 año / todo) es otra pregunta -- otra llave -- y volver a
// uno ya visto no vuelve a mostrar el esqueleto.
export function usePortfolioSeries(range, contributions) {
  const earliest = useMemo(() => earliestOperationDate(contributions), [contributions])
  const today = todayISO()
  const from = rangeFrom(range, today, earliest)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portfolio', 'series', from, today],
    queryFn: async () => trimLeadingZeros(await getPortfolioSeries(from, today)),
  })

  return {
    series: data ?? null,
    loading: isLoading,
    error: error
      ? { message: 'No se pudo cargar la evolución del portafolio.', detail: error }
      : null,
    reload: refetch,
  }
}
