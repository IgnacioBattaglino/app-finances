import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useTheme } from '../hooks/useTheme.jsx'
import { readChartColors } from '../lib/chartColors.js'
import BinaryChoice from './form/BinaryChoice.jsx'
import FormError from './form/FormError.jsx'
import InfoButton from './InfoButton.jsx'
import { getPortfolioSeries, earliestOperationDate, rangeFrom, trimLeadingZeros } from '../lib/portfolioSeries.js'
import { formatUSD, formatPercent, formatCompactNumber, formatDay, formatDayYear, todayISO } from '../lib/format.js'

// Recharts pinta en SVG, así que necesita valores y no clases de Tailwind.
// Los colores se leen de las mismas variables CSS que usa el resto de la app
// (ver lib/chartColors.js) y se vuelven a leer cuando cambia el acento o el
// modo claro/oscuro — de ahí la dependencia en useMemo.

const RANGE_OPTIONS = [
  { value: '3m', label: '3 meses' },
  { value: '1y', label: '1 año' },
  { value: 'todo', label: 'Todo' },
]

function ChartTooltip({ active, payload, label, colors }) {
  if (!active || !payload?.length) return null
  const value = payload.find((p) => p.dataKey === 'total_value')?.value
  const contributed = payload.find((p) => p.dataKey === 'contributed')?.value
  return (
    <div className="surface px-3 py-2.5 text-[13px] shadow-[var(--shadow-raised)]">
      <p className="mb-1.5 font-semibold">{formatDayYear(label)}</p>
      <p className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: colors.accent }} />
        <span className="text-ink-soft">Dinero invertido</span>
        <span className="font-money font-semibold">{formatUSD(value)}</span>
      </p>
      <p className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-3.5 border-t border-dashed" style={{ borderColor: colors.inkFaint }} />
        <span className="text-ink-soft">Aportado</span>
        <span className="font-money font-semibold">{formatUSD(contributed)}</span>
      </p>
    </div>
  )
}

function Legend({ colors }) {
  return (
    <div className="flex items-center gap-4 text-[13px] text-ink-soft">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-0.5 w-4 rounded-full"
          style={{ backgroundColor: colors.accent }}
        />
        Dinero invertido
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 border-t border-dashed" style={{ borderColor: colors.inkFaint }} />
        Aportado
      </span>
    </div>
  )
}

// Curva de evolución del portafolio (get_portfolio_series) + el % de
// rendimiento acumulado. El % sale de la MISMA serie (último día:
// total_value − contributed), no de usePortfolio — la serie dibuja TODO
// (incluye archivados, precio de cierre — ver migración 0022), así que
// mezclar un % acotado (el de Portafolio) con una curva completa daba
// resultados contradictorios entre sí (brecha positiva con % negativo).
// Ahora el mismo número maneja el color del área Y el %: no pueden
// contradecirse. A cambio, este % puede no coincidir con el "Rendimiento" de
// Portafolio — es intencional, miden universos distintos.
//
// Excepción (misma regla que Portafolio, ver hasOperationsAfter en
// portfolio.js): con al menos un activo de valuación desactualizada, ese
// valor viejo puede estar metido en total_value sin que nadie lo sepa, así
// que el % se oculta en vez de mostrar un número que capaz ya no es cierto.
// El gráfico se sigue dibujando igual — ahí no cambia nada.
function PortfolioEvolutionChart({ contributions, outdatedAssetNames = [] }) {
  const navigate = useNavigate()
  const { accent, isDark } = useTheme()
  // accent e isDark no se usan adentro a propósito: son la SEÑAL de que las
  // variables CSS cambiaron, y readChartColors las lee del DOM. Sin ellas en
  // las deps el gráfico se quedaría con los colores del tema anterior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => readChartColors(), [accent, isDark])
  const [range, setRange] = useState('todo')
  const [series, setSeries] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const earliest = useMemo(() => earliestOperationDate(contributions), [contributions])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const today = todayISO()
      const from = rangeFrom(range, today, earliest)
      const data = await getPortfolioSeries(from, today)
      setSeries(trimLeadingZeros(data))
    } catch (e) {
      setError({ message: 'No se pudo cargar la evolución del portafolio.', detail: e.message })
    } finally {
      setLoading(false)
    }
  }, [range, earliest])

  useEffect(() => {
    load()
  }, [load])

  // Siempre el último día disponible (hoy), sin importar el rango elegido:
  // trimLeadingZeros solo recorta el principio de la serie, nunca la punta.
  const last = series && series.length > 0 ? series.at(-1) : null
  const gain = last ? last.total_value - last.contributed : null
  const pct = last && last.contributed > 0 ? (gain / last.contributed) * 100 : null
  const hasOutdated = outdatedAssetNames.length > 0
  const gainPositive = gain !== null ? gain >= 0 : true
  const gainColor = gainPositive ? 'text-gain' : 'text-clay'
  const areaColor = gainPositive ? colors.gain : colors.clay

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

  const hasLine = !loading && series && series.length >= 2

  return (
    <div className="surface px-5 py-4">
      <span className="eyebrow">Evolución del portafolio</span>

      {/* El selector de rango no se estira a lo ancho del gráfico en desktop:
          son tres opciones cortas y un segmentado de 700px se lee como una
          barra de navegación, no como un control. */}
      <div className="mt-3 md:max-w-xs">
        <BinaryChoice options={RANGE_OPTIONS} value={range} onChange={setRange} />
      </div>

      {loading && (
        <div className="mt-3 flex h-[220px] items-center justify-center text-[15px] text-ink-soft">
          Calculando…
        </div>
      )}

      {hasLine && (
        <div className="mt-3">
          <div className="mb-2">
            <Legend colors={colors} />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={colors.line} strokeWidth={1} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                tick={{ fontSize: 11, fill: colors.inkFaint }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={formatCompactNumber}
                tick={{ fontSize: 11, fill: colors.inkFaint }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<ChartTooltip colors={colors} />} />
              <Area
                dataKey="contributed"
                stackId="gap"
                stroke="none"
                fill="transparent"
                isAnimationActive={false}
                activeDot={false}
              />
              {/* Sombreado apilado: el área "contributed" es invisible y solo
                  empuja la base; encima se sombrea el hueco hasta
                  total_value. Un hueco negativo (pérdida) se recorta a 0 en
                  vez de apilar un valor negativo — Recharts no lo dibuja
                  "hacia abajo" de forma legible. */}
              <Area
                dataKey={(row) => Math.max(row.total_value - row.contributed, 0)}
                stackId="gap"
                stroke="none"
                fill={areaColor}
                fillOpacity={0.1}
                isAnimationActive={false}
                activeDot={false}
              />
              <Line
                dataKey="contributed"
                stroke={colors.inkFaint}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="total_value"
                stroke={colors.accent}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasOutdated ? (
        <div className="notice mt-3 space-y-2 text-[13px]">
          <p>
            {outdatedAssetNames.length === 1
              ? `«${outdatedAssetNames[0]}» tiene una valuación vieja, así que no podemos calcular cuánto ganaste.`
              : `${outdatedAssetNames.length} activos tienen una valuación vieja, así que no podemos calcular cuánto ganaste.`}
          </p>
          <button
            type="button"
            onClick={() => navigate('/portafolio')}
            className="font-semibold underline"
          >
            Actualizar valuación
          </button>
        </div>
      ) : (
        (pct !== null || (gain !== null && gain !== 0)) && (
          <div className="mt-4 border-t border-line pt-3.5">
            <div className="flex items-center gap-1.5">
              <span className="eyebrow">Rendimiento acumulado</span>
              <InfoButton
                label="Rendimiento acumulado"
                active={infoOpen}
                onToggle={() => setInfoOpen((v) => !v)}
              />
            </div>
            <p className="font-money mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
              {pct !== null && (
                <span className={`text-[30px] leading-none font-semibold ${gainColor}`}>
                  {gainPositive ? '+' : '−'}
                  {formatPercent(Math.abs(pct))}
                </span>
              )}
              <span className={`text-[15px] font-semibold ${gainColor}`}>
                {gainPositive ? '+' : '−'}
                {formatUSD(Math.abs(gain))}
              </span>
            </p>
            {infoOpen && (
              <p className="mt-2.5 rounded-[14px] bg-mist px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-ink-soft">
                Cuánto ganaste o perdiste sobre todo lo que aportaste, contando absolutamente todo lo
                que tenés invertido (incluidos activos archivados o que no buscan rendimiento) — por eso
                puede no coincidir con el "Rendimiento" de Portafolio, que mide un grupo más acotado. No
                tiene en cuenta en qué momento pusiste cada aporte.
              </p>
            )}
          </div>
        )
      )}
    </div>
  )
}

export default PortfolioEvolutionChart
