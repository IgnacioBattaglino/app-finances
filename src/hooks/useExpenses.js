import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getExpenses } from '../lib/transactions.js'
import { lastMonths, monthKey, countMonthsWithData, monthlyUsdTotals } from '../lib/expensesSummary.js'
import { todayISO } from '../lib/format.js'

// El bloque de gastos de Inicio: los últimos 12 meses de gastos, más su serie
// en dólares (aparte, con su propio error -- un gráfico secundario no puede
// llevarse puesto el total del mes, ver ExpensesBlock).
//
// Sobre la caché compartida: ya no hace falta un `reloadToken` que suba cada
// vez que se guarda un movimiento -- toda escritura invalida esta consulta
// sola (ver queryClient.js), así que un gasto cargado desde el FAB de Inicio
// la refresca sin que nadie se lo pida.
export function useExpenses() {
  const today = todayISO()
  const months = useMemo(() => lastMonths(today, 12), [today])
  const from = `${monthKey(months[0])}-01`

  const expensesQuery = useQuery({
    queryKey: ['expenses', from, today],
    queryFn: () => getExpenses({ from, to: today }),
  })
  const expenses = expensesQuery.data ?? []

  // Con menos de dos meses de datos no hay serie que dibujar (un solo punto
  // no es una tendencia) y no se pide ninguna cotización: la consulta ni
  // arranca (`enabled`).
  const enoughMonths = expensesQuery.isSuccess && countMonthsWithData(expenses, months) >= 2
  const usdQuery = useQuery({
    queryKey: ['expenses', 'usdSeries', from, today],
    queryFn: () => monthlyUsdTotals(expenses, months),
    enabled: enoughMonths,
  })

  return {
    expenses,
    months,
    loading: expensesQuery.isLoading,
    error: expensesQuery.error
      ? { message: 'No se pudieron cargar los gastos.', detail: expensesQuery.error }
      : null,
    reload: expensesQuery.refetch,
    usdSeries: enoughMonths ? (usdQuery.data ?? null) : null,
    usdError: enoughMonths && Boolean(usdQuery.error),
    reloadUsd: usdQuery.refetch,
  }
}
