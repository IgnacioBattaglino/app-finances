import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '../hooks/useTheme.jsx'
import { readChartColors } from '../lib/chartColors.js'
import { useExpenses } from '../hooks/useExpenses.js'
import { monthLabel, fullMonthName } from '../lib/expensesSummary.js'
import { formatUSD, formatCompactNumber } from '../lib/format.js'

// Los colores del gráfico salen de las variables CSS del tema, igual que en
// la curva del portafolio (ver lib/chartColors.js).

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="surface px-3 py-2.5 text-footnote shadow-[var(--shadow-raised)]">
      <p className="mb-1 font-semibold">
        {fullMonthName(point)[0].toUpperCase() + fullMonthName(point).slice(1)} {point.year}
      </p>
      <span className="font-money font-semibold text-clay">{formatUSD(point.total)}</span>
    </div>
  )
}

// Serie de gastos de los últimos 12 meses en dólares. Vive en Movimientos
// (se mudó de Inicio, bloque 07): mismo dato, y falla sola -- un gráfico
// secundario no puede llevarse puesto nada más de la pantalla. Con menos de
// dos meses de datos no hay nada que graficar y no se muestra nada (ver
// useExpenses: la consulta ni arranca).
function ExpensesYearChart() {
  const { accent, isDark } = useTheme()
  // accent e isDark no se usan adentro a propósito: son la SEÑAL de que las
  // variables CSS cambiaron, y readChartColors las lee del DOM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => readChartColors(), [accent, isDark])
  const { usdSeries, usdError, reloadUsd: loadUsd } = useExpenses()

  if (!usdSeries && !usdError) return null

  return (
    <div className="space-y-3">
      <h2 className="eyebrow px-1">Últimos 12 meses (USD)</h2>
      <div className="surface px-5 py-4">
        {usdError ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote text-ink-soft">No se pudo convertir tus gastos a dólares.</span>
            <button
              type="button"
              onClick={loadUsd}
              className="btn-text shrink-0 text-footnote text-accent-ink underline"
            >
              Reintentar
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  )
}

export default ExpensesYearChart
