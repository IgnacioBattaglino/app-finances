import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import FormError from './form/FormError.jsx'
import { getExpenses } from '../lib/transactions.js'
import {
  lastMonths,
  monthKey,
  monthLabel,
  fullMonthName,
  sumAmount,
  expensesInMonth,
  previousMonthToDate,
  monthOverMonthPct,
  groupByCategory,
  countMonthsWithData,
  monthlyUsdTotals,
} from '../lib/expensesSummary.js'
import { formatARS, formatUSD, formatPercent, formatCompactNumber, todayISO } from '../lib/format.js'

const CLAY = '#b5472e'
const INK_SOFT = '#66716a'
const LINE = '#e2e6e1'

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">
        {fullMonthName(point)[0].toUpperCase() + fullMonthName(point).slice(1)} {point.year}
      </p>
      <span className="font-money font-semibold text-clay">{formatUSD(point.total)}</span>
    </div>
  )
}

// Bloque de gastos de Inicio: total del mes + comparación, desglose por
// categoría y serie de 12 meses en USD. Todo sale de transactions, kind
// 'expense', sin categorías de sistema (getExpenses ya las excluye) — ninguna
// operación del portafolio escribe ahí, así que no hace falta más filtro.
function ExpensesBlock() {
  const [expenses, setExpenses] = useState([])
  const [usdSeries, setUsdSeries] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const today = todayISO()
  const months = useMemo(() => lastMonths(today, 12), [today])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const from = `${monthKey(months[0])}-01`
      const data = await getExpenses({ from, to: today })
      setExpenses(data)
      setUsdSeries(countMonthsWithData(data, months) >= 2 ? await monthlyUsdTotals(data, months) : null)
    } catch (e) {
      setError({ message: 'No se pudieron cargar los gastos.', detail: e.message })
    } finally {
      setLoading(false)
    }
  }, [months, today])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex h-[140px] items-center justify-center rounded-2xl border border-line bg-card px-4 py-4 text-sm text-ink-soft">
        Calculando…
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-4">
        <FormError message={error.message} detail={error.detail} />
        <button type="button" onClick={load} className="text-sm font-semibold text-clay underline">
          Reintentar
        </button>
      </div>
    )
  }

  if (expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-card px-4 py-6 text-center">
        <p className="text-sm text-ink-soft">
          Todavía no cargaste ningún gasto. Cuando registres el primero, acá vas a ver en qué se te va
          la plata.
        </p>
      </div>
    )
  }

  const currentMonth = months.at(-1)
  const previousMonth = months.at(-2)
  const currentMonthExpenses = expensesInMonth(expenses, currentMonth)
  const currentTotal = sumAmount(currentMonthExpenses)
  const previousTotal = sumAmount(previousMonthToDate(expenses, today))
  const pct = monthOverMonthPct(currentTotal, previousTotal)
  const breakdown = groupByCategory(currentMonthExpenses)
  const maxCategoryTotal = breakdown[0]?.total ?? 0

  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        Gastos del mes
      </span>
      <p className="font-money mt-1 text-3xl tracking-tight text-clay">{formatARS(currentTotal)}</p>
      {pct !== null && (
        <p className="mt-1 text-xs text-ink-soft">
          {formatPercent(Math.abs(pct), 0)} {pct >= 0 ? 'más' : 'menos'} que en{' '}
          {fullMonthName(previousMonth)} a esta altura
        </p>
      )}

      {/* Desglose por categoría */}
      {breakdown.length === 0 ? (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-soft">Sin gastos este mes.</p>
      ) : (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {breakdown.map((cat) => (
            <div key={cat.name}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-ink-soft">{cat.name}</span>
                <span className="font-money shrink-0 text-ink">{formatARS(cat.total)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-clay/15">
                <div
                  className="h-1.5 rounded-full bg-clay"
                  style={{ width: `${(cat.total / maxCategoryTotal) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Serie de 12 meses en dólares */}
      {usdSeries && (
        <div className="mt-3 border-t border-line pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            Últimos 12 meses (USD)
          </span>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={usdSeries} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={LINE} strokeWidth={1} />
              <XAxis
                dataKey={(m) => monthLabel(m)}
                tick={{ fontSize: 10, fill: INK_SOFT }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatCompactNumber}
                tick={{ fontSize: 11, fill: INK_SOFT }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: CLAY, fillOpacity: 0.06 }} />
              <Bar dataKey="total" fill={CLAY} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default ExpensesBlock
