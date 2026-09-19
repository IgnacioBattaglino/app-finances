import { useQuery } from '@tanstack/react-query'
import { computeCurrentLiquid } from '../lib/liquid.js'

// El disponible completo (totales por moneda, desglose por cuenta, ahorro,
// última reconciliación): lo que Inicio muestra en "Dinero disponible" y
// "Dinero ahorrado". Sobre la caché compartida (bloque 05): volver a Inicio
// no vuelve a mostrar "Calculando…" con los números ya conocidos en pantalla.
export function useLiquid() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['liquid'],
    queryFn: computeCurrentLiquid,
  })
  return {
    liquid: data ?? null,
    loading: isLoading,
    error: error ? { message: 'No se pudo calcular el disponible.', detail: error } : null,
    reload: refetch,
  }
}
