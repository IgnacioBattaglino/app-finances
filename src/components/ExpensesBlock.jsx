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
// `reloadToken` cambia cada vez que se guarda un movimiento desde Inicio. Sin
// eso, el bloque solo se cargaba al montarse: cargabas un gasto con el botón
// "+" de esta misma pantalla, el "Dinero disponible" de arriba se actualizaba
// y acá abajo seguía diciendo "$ 0 · Sin gastos este mes" hasta recargar la
// app entera. Es un token y no los gastos ya cargados a propósito: quien
// guarda no tiene por qué saber qué consulta hace este bloque.
function ExpensesBlock({ reloadToken = 0 }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // La serie en dólares se carga aparte, con su propio estado y su propio
  // error. Antes iba dentro del mismo try que los gastos: si fallaba la
  // conversión a dólares (que necesita la serie de cotizaciones) se caía el
  // bloque ENTERO y desaparecían el total del mes y el desglose por
  // categoría, que ya estaban cargados y son lo que se mira todos los días.
  // Un gráfico secundario no puede llevarse puesto el número principal.
  const [usdSeries, setUsdSeries] = useState(null)
  const [usdError, setUsdError] = useState(false)

  const today = todayISO()
  const months = useMemo(() => lastMonths(today, 12), [today])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const from = `${monthKey(months[0])}-01`
      setExpenses(await getExpenses({ from, to: today }))
    } catch (e) {
      setError({ message: 'No se pudieron cargar los gastos.', detail: e.message })
    } finally {
      setLoading(false)
    }
    // reloadToken entra en las deps para que un movimiento nuevo vuelva a
    // pedir los gastos; no se usa adentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, today, reloadToken])

  // Con menos de dos meses de datos no hay serie que dibujar (un solo punto no
  // es una tendencia) y no se pide ninguna cotización.
  const loadUsd = useCallback(async () => {
    if (countMonthsWithData(expenses, months) < 2) {
      setUsdSeries(null)
      setUsdError(false)
      return
    }
    setUsdError(false)
    try {
      setUsdSeries(await monthlyUsdTotals(expenses, months))
    } catch {
      // Sin detalle técnico a la vista: es un gráfico de apoyo, no una
      // operación que el usuario haya pedido. El detalle no le sirve para
      // decidir nada; el botón de reintentar, sí.
      setUsdSeries(null)
      setUsdError(true)
    }
  }, [expenses, months])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadUsd()
  }, [loadUsd])

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

      {/* Serie de 12 meses en dólares. Falla sola: el total del mes y el
          desglose de arriba ya se vieron y se quedan donde están. */}
      {usdError && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-xs text-ink-soft">
            No se pudo convertir tus gastos a dólares.
          </span>
          <button
            type="button"
            onClick={loadUsd}
            className="shrink-0 text-xs font-semibold text-accent underline"
          >
            Reintentar
          </button>
        </div>
      )}
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
