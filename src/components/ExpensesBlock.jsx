import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '../hooks/useTheme.jsx'
import { readChartColors } from '../lib/chartColors.js'
import { ErrorNotice } from './form/FormError.jsx'
import MoneyStack from './MoneyStack.jsx'
import { useExpenses } from '../hooks/useExpenses.js'
import {
  monthLabel,
  fullMonthName,
  sumByCurrency,
  localAmount,
  expensesInMonth,
  previousMonthToDate,
  monthOverMonthPct,
  groupByCategory,
} from '../lib/expensesSummary.js'
import { formatByCurrency, formatUSD, formatPercent, formatCompactNumber, todayISO } from '../lib/format.js'
import { currencyLines } from '../lib/currencyTotals.js'

// Los colores del gráfico salen de las variables CSS del tema, igual que en
// la curva del portafolio (ver lib/chartColors.js).

// El encabezado va FUERA de la tarjeta y a la misma altura que el de la curva
// del portafolio (`min-h-11`, el alto de su segmentado): en desktop los dos
// bloques van lado a lado y las tarjetas tienen que arrancar alineadas.
function Section({ children }) {
  return (
    <section>
      <h2 className="eyebrow flex min-h-11 items-center">Gastos del mes</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

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

// Bloque de gastos de Inicio: total del mes + comparación, desglose por
// categoría y serie de 12 meses en USD. Todo sale de transactions, kind
// 'expense', sin categorías de sistema (getExpenses ya las excluye) — ninguna
// operación del portafolio escribe ahí, así que no hace falta más filtro.
// Sobre la caché compartida (bloque 05): ya no hace falta ningún token que
// alguien suba al guardar -- toda escritura invalida esta consulta sola (ver
// lib/queryClient.js), así que cargar un gasto con el "+" de Inicio actualiza
// este bloque solo, sin que nadie se lo pida.
function ExpensesBlock() {
  const { accent, isDark } = useTheme()
  // accent e isDark no se usan adentro a propósito: son la SEÑAL de que las
  // variables CSS cambiaron, y readChartColors las lee del DOM. Sin ellas en
  // las deps el gráfico se quedaría con los colores del tema anterior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => readChartColors(), [accent, isDark])
  // La serie en dólares llega aparte, con su propio error: si falla la
  // conversión (que necesita la serie de cotizaciones) el bloque no se cae
  // entero -- el total del mes y el desglose por categoría, que ya llegaron,
  // siguen ahí. Un gráfico secundario no puede llevarse puesto el número
  // principal.
  const { expenses, months, loading, error, reload: load, usdSeries, usdError, reloadUsd: loadUsd } =
    useExpenses()
  const today = todayISO()

  if (loading) {
    return (
      <Section>
        <div className="surface h-[140px]" aria-busy="true" aria-label="Calculando" />
      </Section>
    )
  }

  if (error) {
    return (
      <Section>
        <ErrorNotice error={error} onRetry={load} />
      </Section>
    )
  }

  if (expenses.length === 0) {
    return (
      <Section>
        <div className="surface px-5 py-8 text-center">
          <p className="text-subhead text-ink-soft">
            Todavía no cargaste ningún gasto. Cuando registres el primero, acá vas a ver en qué se te va
            la plata.
          </p>
        </div>
      </Section>
    )
  }

  const currentMonth = months.at(-1)
  const previousMonth = months.at(-2)
  const currentMonthExpenses = expensesInMonth(expenses, currentMonth)
  const currentTotals = sumByCurrency(currentMonthExpenses)
  const totalLines = currencyLines(currentTotals)
  // La comparación con el mes anterior se hace en la moneda del día a día: un
  // solo porcentaje no puede describir dos monedas, y dos porcentajes en una
  // línea de 13px no se leen. Cuando además hubo gastos en otra moneda, la
  // frase lo aclara — una palabra de más, y solo en el caso raro.
  const previousTotals = sumByCurrency(previousMonthToDate(expenses, today))
  const pct = monthOverMonthPct(localAmount(currentTotals), localAmount(previousTotals))
  const mixed = totalLines.length > 1
  const breakdown = groupByCategory(currentMonthExpenses)

  return (
    <Section>
    <div className="surface px-5 py-4">
      {/* Rojo solo si hubo gastos: un $ 0 en rojo se lee como una alarma. */}
      <MoneyStack lines={totalLines} className={currentMonthExpenses.length > 0 ? 'text-clay' : ''} />
      {pct !== null && (
        <p className="mt-2 text-footnote text-ink-soft">
          {formatPercent(Math.abs(pct), 0)} {pct >= 0 ? 'más' : 'menos'} que en{' '}
          {fullMonthName(previousMonth)} a esta altura{mixed ? ', en pesos' : ''}
        </p>
      )}

      {/* Desglose por categoría */}
      {/* Una lista por moneda (ver groupByCategory). La barra de cada categoría
          se mide contra la más grande DE SU MONEDA: una barra que compara pesos
          con dólares no dice nada. Con gastos en una sola moneda es exactamente
          el desglose de siempre, sin encabezado que lo anuncie. */}
      {breakdown.length === 0 ? (
        <p className="mt-4 border-t border-line pt-3.5 text-subhead text-ink-soft">
          Sin gastos este mes.
        </p>
      ) : (
        breakdown.map((group) => (
          <div key={group.currency} className="mt-4 space-y-2.5 border-t border-line pt-3.5">
            {breakdown.length > 1 && (
              <p className="text-footnote text-ink-soft">
                {group.currency === 'ARS' ? 'En pesos' : 'En dólares'}
              </p>
            )}
            {group.categories.map((cat) => (
              <div key={cat.name}>
                <div className="flex items-baseline justify-between gap-2 text-footnote">
                  <span className="truncate text-ink-soft">{cat.name}</span>
                  <span className="font-money shrink-0 font-medium">
                    {formatByCurrency(group.currency, cat.total)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-clay/15">
                  <div
                    className="animate-grow-x h-full origin-left rounded-full bg-clay"
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
          <span className="text-footnote text-ink-soft">
            No se pudo convertir tus gastos a dólares.
          </span>
          <button
            type="button"
            onClick={loadUsd}
            className="btn-text shrink-0 text-footnote text-accent-ink underline"
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
    </Section>
  )
}

export default ExpensesBlock
