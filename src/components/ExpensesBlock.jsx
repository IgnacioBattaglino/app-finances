import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '../hooks/useTheme.jsx'
import { readChartColors } from '../lib/chartColors.js'
import FormError from './form/FormError.jsx'
import MoneyStack from './MoneyStack.jsx'
import { getExpenses } from '../lib/transactions.js'
import {
  lastMonths,
  monthKey,
  monthLabel,
  fullMonthName,
  sumByCurrency,
  localAmount,
  expensesInMonth,
  previousMonthToDate,
  monthOverMonthPct,
  groupByCategory,
  countMonthsWithData,
  monthlyUsdTotals,
} from '../lib/expensesSummary.js'
import { formatByCurrency, formatUSD, formatPercent, formatCompactNumber, todayISO } from '../lib/format.js'
import { currencyLines } from '../lib/currencyTotals.js'

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
  const { accent, isDark } = useTheme()
  // accent e isDark no se usan adentro a propósito: son la SEÑAL de que las
  // variables CSS cambiaron, y readChartColors las lee del DOM. Sin ellas en
  // las deps el gráfico se quedaría con los colores del tema anterior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => readChartColors(), [accent, isDark])
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
      setError({ message: 'No se pudieron cargar los gastos.', detail: e })
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

  if (expenses.length === 0) {
    return (
      <div className="surface px-5 py-8 text-center">
        <p className="text-[15px] text-ink-soft">
          Todavía no cargaste ningún gasto. Cuando registres el primero, acá vas a ver en qué se te va
          la plata.
        </p>
      </div>
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
      {/* Una lista por moneda (ver groupByCategory). La barra de cada categoría
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
            onClick={loadUsd}
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

export default ExpensesBlock
