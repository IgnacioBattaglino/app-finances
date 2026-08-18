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
import BinaryChoice from './form/BinaryChoice.jsx'
import FormError from './form/FormError.jsx'
import InfoButton from './InfoButton.jsx'
import { getPortfolioSeries, earliestOperationDate, rangeFrom, trimLeadingZeros } from '../lib/portfolioSeries.js'
import { formatUSD, formatPercent, formatCompactNumber, formatDay, formatDayYear, todayISO } from '../lib/format.js'

// Recharts pinta en SVG, así que necesita valores y no clases de Tailwind: el
// color de marca (la serie "Dinero invertido") sale de useTheme, que es el
// que sabe cuál eligió el usuario. GAIN/CLAY son el par fijo de
// ganancia/pérdida que tiñe el área, y no siguen al acento. Ver index.css.
const GAIN = '#1e6b4c'
const CLAY = '#b5472e'
const INK_SOFT = '#66716a'
const LINE = '#e2e6e1'

const RANGE_OPTIONS = [
  { value: '3m', label: '3 meses' },
  { value: '1y', label: '1 año' },
  { value: 'todo', label: 'Todo' },
]

function ChartTooltip({ active, payload, label }) {
  const { accent } = useTheme()
  if (!active || !payload?.length) return null
  const value = payload.find((p) => p.dataKey === 'total_value')?.value
  const contributed = payload.find((p) => p.dataKey === 'contributed')?.value
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">{formatDayYear(label)}</p>
      <p className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-3" style={{ backgroundColor: accent.color }} />
        <span className="text-ink-soft">Dinero invertido</span>
        <span className="font-money font-semibold text-ink">{formatUSD(value)}</span>
      </p>
      <p className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-3 border-t border-dashed" style={{ borderColor: INK_SOFT }} />
        <span className="text-ink-soft">Aportado</span>
        <span className="font-money font-semibold text-ink">{formatUSD(contributed)}</span>
      </p>
    </div>
  )
}

function Legend() {
  const { accent } = useTheme()
  return (
    <div className="flex items-center gap-4 text-xs text-ink-soft">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-0.5 w-4 rounded-full"
          style={{ backgroundColor: accent.color }}
        />
        Dinero invertido
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 border-t border-dashed" style={{ borderColor: INK_SOFT }} />
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
  const { accent } = useTheme()
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
  const areaColor = gainPositive ? GAIN : CLAY

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

  const hasLine = !loading && series && series.length >= 2

  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
          Evolución del portafolio
        </span>
      </div>

      <div className="mt-3">
        <BinaryChoice options={RANGE_OPTIONS} value={range} onChange={setRange} />
      </div>

      {loading && (
        <div className="mt-3 flex h-[220px] items-center justify-center text-sm text-ink-soft">
          Calculando…
        </div>
      )}

      {hasLine && (
        <div className="mt-3">
          <div className="mb-2">
            <Legend />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={LINE} strokeWidth={1} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                tick={{ fontSize: 11, fill: INK_SOFT }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={formatCompactNumber}
                tick={{ fontSize: 11, fill: INK_SOFT }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<ChartTooltip />} />
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
                stroke={INK_SOFT}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
              <Line dataKey="total_value" stroke={accent.color} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasOutdated ? (
        <div className="mt-3 space-y-2 rounded-xl border border-clay/20 bg-clay/5 px-3 py-3 text-xs text-clay">
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
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Rendimiento acumulado
              </span>
              <InfoButton
                label="Rendimiento acumulado"
                active={infoOpen}
                onToggle={() => setInfoOpen((v) => !v)}
              />
            </div>
            <p className="font-money mt-1 flex flex-wrap items-baseline gap-x-2">
              {pct !== null && (
                <span className={`text-3xl font-semibold tracking-tight ${gainColor}`}>
                  {gainPositive ? '+' : '−'}
                  {formatPercent(Math.abs(pct))}
                </span>
              )}
              <span className={`text-sm font-semibold ${gainColor}`}>
                {gainPositive ? '+' : '−'}
                {formatUSD(Math.abs(gain))}
              </span>
            </p>
            {infoOpen && (
              <p className="mt-2 rounded-xl bg-mist/50 px-3 py-2 text-left text-xs text-ink-soft">
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
