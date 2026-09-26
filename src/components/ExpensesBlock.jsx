import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '../hooks/useTheme.jsx'
import { readChartColors } from '../lib/chartColors.js'
import FormError from './form/FormError.jsx'
import MoneyStack from './MoneyStack.jsx'
import { getPeriodTotals, getExpensesByCategory, getMonthlyExpensesUsd } from '../lib/transactions.js'
import {
  lastMonths,
  monthKey,
  monthLabel,
  fullMonthName,
  localAmount,
  monthOverMonthPct,
  breakdownFromRows,
  previousMonthToDateRange,
} from '../lib/expensesSummary.js'
import { periodLines } from '../lib/movements.js'
import { formatByCurrency, formatUSD, formatPercent, formatCompactNumber, todayISO } from '../lib/format.js'

// Los colores del gráfico salen de las variables CSS del tema, igual que en
// la curva del portafolio (ver lib/chartColors.js).

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="surface px-3 py-2.5 text-[13px] shadow-[var(--shadow-raised)]">
      <p className="mb-1 font-semibold">
        {fullMonthName(point)[0].toUpperCase() + fullMonthName(point).slice(1)} {point.year}
      </p>
      <span className="font-money font-semibold text-clay">{formatUSD(point.total)}</span>
    </div>
  )
}

// La parte que dibuja, sin cargar nada: recibe lo ya calculado. Separada de
// ExpensesBlock para poder probarla sin Supabase (ver ExpensesBlock.test.jsx).
// La comparación con el mes anterior se hace en la moneda del día a día: un
// solo porcentaje no puede describir dos monedas; cuando además hubo gastos en
// otra moneda, la frase lo aclara.
export function ExpensesCard({ totalLines, pct, previousMonth, breakdown, usdSeries, usdError, onRetryUsd, colors }) {
  const mixed = totalLines.length > 1
  return (
    <div className="surface px-5 py-4">
      <span className="eyebrow">Gastos del mes</span>
      <MoneyStack lines={totalLines} className="mt-2 text-clay" />
      {pct !== null && (
        <p className="mt-2 text-[13px] text-ink-soft">
          {formatPercent(Math.abs(pct), 0)} {pct >= 0 ? 'más' : 'menos'} que en{' '}
          {fullMonthName(previousMonth)} a esta altura{mixed ? ', en pesos' : ''}
        </p>
      )}

      {/* Desglose por categoría */}
      {/* Una lista por moneda (ver breakdownFromRows). La barra de cada categoría
          se mide contra la más grande DE SU MONEDA: una barra que compara pesos
          con dólares no dice nada. Con gastos en una sola moneda es exactamente
          el desglose de siempre, sin encabezado que lo anuncie. */}
      {breakdown.length === 0 ? (
        <p className="mt-4 border-t border-line pt-3.5 text-[15px] text-ink-soft">
          Sin gastos este mes.
        </p>
      ) : (
        breakdown.map((group) => (
          <div key={group.currency} className="mt-4 space-y-2.5 border-t border-line pt-3.5">
            {breakdown.length > 1 && (
              <p className="text-[13px] text-ink-faint">
                {group.currency === 'ARS' ? 'En pesos' : 'En dólares'}
              </p>
            )}
            {group.categories.map((cat) => (
              <div key={cat.name}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate text-ink-soft">{cat.name}</span>
                  <span className="font-money shrink-0 font-medium">
                    {formatByCurrency(group.currency, cat.total)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-clay/15">
                  <div
                    className="h-full rounded-full bg-clay"
                    style={{ width: `${(cat.total / group.categories[0].total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      {/* Serie de 12 meses en dólares. Falla sola: el total del mes y el
          desglose de arriba ya se vieron y se quedan donde están. */}
      {usdError && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
          <span className="text-[13px] text-ink-soft">
            No se pudo convertir tus gastos a dólares.
          </span>
          <button
            type="button"
            onClick={onRetryUsd}
            className="shrink-0 text-[13px] font-semibold text-accent-ink underline"
          >
            Reintentar
          </button>
        </div>
      )}
      {usdSeries && (
        <div className="mt-4 border-t border-line pt-3.5">
          <span className="eyebrow">Últimos 12 meses (USD)</span>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={usdSeries} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={colors.line} strokeWidth={1} />
              <XAxis
                dataKey={(m) => monthLabel(m)}
                tick={{ fontSize: 10, fill: colors.inkFaint }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatCompactNumber}
                tick={{ fontSize: 11, fill: colors.inkFaint }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: colors.clay, fillOpacity: 0.06 }} />
              <Bar
                dataKey="total"
                fill={colors.clay}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// Bloque de gastos de Inicio: total del mes + comparación, desglose por
// categoría y serie de 12 meses en USD. Todo lo suma la base (migraciones
// 0055 y 0056): los gastos reales, con la misma regla que Movimientos.
// `reloadToken` cambia cada vez que se guarda un movimiento desde Inicio: sin
// eso, el bloque solo se cargaba al montarse y seguía mostrando lo viejo.
function ExpensesBlock({ reloadToken = 0 }) {
  const { accent, isDark } = useTheme()
  // accent e isDark no se usan adentro a propósito: son la SEÑAL de que las
  // variables CSS cambiaron, y readChartColors las lee del DOM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => readChartColors(), [accent, isDark])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [usdSeries, setUsdSeries] = useState(null)
  const [usdError, setUsdError] = useState(false)

  const today = todayISO()
  const months = useMemo(() => lastMonths(today, 12), [today])
  const monthStart = `${monthKey(months.at(-1))}-01`
  const windowStart = `${monthKey(months[0])}-01`

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [current, previous, byCategory, lastYear] = await Promise.all([
        getPeriodTotals({ from: monthStart, to: today }),
        getPeriodTotals(previousMonthToDateRange(today)),
        getExpensesByCategory({ from: monthStart, to: today }),
        getPeriodTotals({ from: windowStart, to: today }),
      ])
      setData({
        current: periodLines(current).expenses,
        previous: periodLines(previous).expenses,
        breakdown: breakdownFromRows(byCategory),
        // Sin ningún gasto en los 12 meses, el bloque invita a cargar el
        // primero en vez de mostrar ceros.
        hasAny: lastYear.some((r) => Number(r.expenses) > 0),
      })
    } catch (e) {
      setError({ message: 'No se pudieron cargar los gastos.', detail: e })
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, windowStart, today, reloadToken])

  // La serie falla sola: el total del mes y el desglose ya se vieron. Se
  // muestra solo con al menos dos meses con gastos — un mes solo no es una
  // comparación.
  const loadUsd = useCallback(async () => {
    setUsdError(false)
    try {
      const rows = await getMonthlyExpensesUsd({ from: windowStart, to: today })
      const withData = rows.filter((r) => Number(r.expense_count) > 0).length
      setUsdSeries(
        withData < 2
          ? null
          : rows.map((r) => ({
              year: Number(r.month.slice(0, 4)),
              month: Number(r.month.slice(5, 7)),
              total: Number(r.total_usd),
            })),
      )
    } catch {
      setUsdSeries(null)
      setUsdError(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowStart, today, reloadToken])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadUsd()
  }, [loadUsd])

  if (loading) {
    return (
      <div className="surface flex h-[140px] items-center justify-center text-[15px] text-ink-soft">
        Calculando…
      </div>
    )
  }

  if (error) {
    return (
      <div className="notice space-y-2">
        <FormError message={error.message} detail={error.detail} />
        <button type="button" onClick={load} className="text-[15px] font-semibold text-clay underline">
          Reintentar
        </button>
      </div>
    )
  }

  if (!data.hasAny) {
    return (
      <div className="surface px-5 py-8 text-center">
        <p className="text-[15px] text-ink-soft">
          Todavía no cargaste ningún gasto. Cuando registres el primero, acá vas a ver en qué se te va
          la plata.
        </p>
      </div>
    )
  }

  const local = (lines) => localAmount(new Map(lines.map((l) => [l.currency, l.amount])))
  return (
    <ExpensesCard
      totalLines={data.current}
      pct={monthOverMonthPct(local(data.current), local(data.previous))}
      previousMonth={months.at(-2)}
      breakdown={data.breakdown}
      usdSeries={usdSeries}
      usdError={usdError}
      onRetryUsd={loadUsd}
      colors={colors}
    />
  )
}

export default ExpensesBlock
