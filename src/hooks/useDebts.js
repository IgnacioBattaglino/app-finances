import { useQuery } from '@tanstack/react-query'
import { getDebts } from '../lib/debts.js'

// Las deudas con sus pagos, sobre la caché compartida: la usan Inicio
// ("Deudas"), A pagar (el link de resumen) y Deudas misma.
export function useDebts() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['debts'], queryFn: getDebts })
  return {
    debts: data ?? [],
    loading: isLoading,
    error: error ? { message: 'No se pudieron cargar las deudas.', detail: error } : null,
    reload: refetch,
  }
}
