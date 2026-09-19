import { useQuery } from '@tanstack/react-query'
import { getCards } from '../lib/paymentCards.js'

// Las tarjetas, sobre la caché compartida: las usa A pagar. Un fallo cargando
// no se propaga como error DE LA PANTALLA -- A pagar tiene más secciones que
// no dependen de esto -- así que se expone como error propio, no un throw.
export function useCards() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['cards'], queryFn: getCards })
  return {
    cards: data ?? [],
    loading: isLoading,
    error: error ? { message: 'No se pudieron cargar las tarjetas.', detail: error } : null,
    reload: refetch,
  }
}
