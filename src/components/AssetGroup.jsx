import { useState } from 'react'
import { formatUSD, formatPercent, formatDay } from '../lib/format.js'
import { computePortfolioGain } from '../lib/portfolio.js'

function Gain({ value, base, className = '' }) {
  if (value === null || base === 0) return null
  const pct = base > 0 ? (value / base) * 100 : 0
  const positive = value >= 0
  return (
    <span className={`font-money ${positive ? 'text-pine' : 'text-clay'} ${className}`}>
      {positive ? '+' : '−'}
      {formatUSD(Math.abs(value))} ({formatPercent(Math.abs(pct))})
    </span>
  )
}

function SourceTag({ valuation }) {
  if (valuation.source === 'live') {
    const time = valuation.at?.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return (
      <span className="inline-flex items-center gap-1 text-xs text-pine">
        <span className="h-1.5 w-1.5 rounded-full bg-pine" /> en vivo{time && ` ${time}`}
      </span>
    )
  }
  if (valuation.source === 'stale') {
    return (
      <span className="text-xs text-clay">
        precio caído · último valor {formatDay(valuation.date)}
      </span>
    )
  }
  if (valuation.source === 'manual') {
    return <span className="text-xs text-ink-soft">valuado {formatDay(valuation.date)}</span>
  }
  if (valuation.source === 'cash') {
    return <span className="text-xs text-ink-soft">efectivo</span>
  }
  return <span className="text-xs text-clay">sin valuación — no suma al total</span>
}

function AssetRow({ asset, valuation, contributions, onEdit, onUpdateValue, onEditContribution }) {
  const [showContributions, setShowContributions] = useState(false)
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const gain = valuation.value !== null ? valuation.value - valuation.contributed : null
  const doesNotYield = asset.yields === false

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onEdit(asset)} className="min-w-0 text-left">
          <p className="truncate text-[15px]">
            {asset.name}
            {asset.ticker && (
              <span className="font-money ml-1.5 text-xs text-ink-soft">{asset.ticker}</span>
            )}
          </p>
          <SourceTag valuation={valuation} />
        </button>
        <div className="shrink-0 text-right">
          <p className="font-money text-[15px]">
            {valuation.value !== null ? formatUSD(valuation.value) : '—'}
          </p>
          <p className="text-xs text-ink-soft">
            aportado <span className="font-money">{formatUSD(valuation.contributed)}</span>
          </p>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowContributions((prev) => !prev)}
            className="text-ink-soft"
          >
            {showContributions ? '▾' : '▸'} Aportes ({own.length})
          </button>
          {valuation.source !== 'live' && valuation.source !== 'cash' && (
            <button type="button" onClick={() => onUpdateValue(asset)} className="text-pine">
              Actualizar valor
            </button>
          )}
        </div>
        {doesNotYield ? (
          <span className="text-xs text-ink-soft">— no rinde</span>
        ) : (
          <Gain value={gain} base={valuation.contributed} className="text-xs" />
        )}
      </div>

      {showContributions && (
        <div className="mt-2 divide-y divide-line rounded-xl bg-mist/50">
          {own.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-soft">Sin aportes todavía.</p>
          ) : (
            own.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onEditContribution(c)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-mist"
              >
                <span className="text-ink-soft">
                  {formatDay(c.date)}
                  {c.quantity ? ` · ${Number(c.quantity)}` : ''}
                  {c.affects_liquid === false && (
                    <span className="ml-1.5 rounded-full bg-mist px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      inicial
                    </span>
                  )}
                </span>
                <span className="font-money">{formatUSD(c.amount_usd)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function AssetGroup({
  label,
  assets,
  valuations,
  contributions,
  onEditAsset,
  onUpdateValue,
  onEditContribution,
}) {
  const [expanded, setExpanded] = useState(false)

  const contributed = assets.reduce((sum, a) => sum + valuations[a.id].contributed, 0)
  const value = assets.reduce((sum, a) => sum + (valuations[a.id].value ?? 0), 0)
  // Ganancia solo sobre activos con valor que buscan rendimiento (sin valuación
  // ≠ pérdida; los que no rinden no aguan el %)
  const { contributed: valuedContributed, gain } = computePortfolioGain(assets, valuations)
  const allUnvalued = assets.every((a) => valuations[a.id].value === null)

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-4 py-3 text-left transition hover:bg-mist/40"
      >
        <span className="text-[15px] font-semibold">{label}</span>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-ink-soft">
            <span className="font-money">{formatUSD(contributed)}</span> →{' '}
            {allUnvalued ? (
              <span className="text-clay">sin valuación</span>
            ) : (
              <span className="font-money text-ink">{formatUSD(value)}</span>
            )}
          </span>
          <Gain value={gain} base={valuedContributed} className="text-xs" />
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-line border-t border-line">
          {assets.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              valuation={valuations[asset.id]}
              contributions={contributions}
              onEdit={onEditAsset}
              onUpdateValue={onUpdateValue}
              onEditContribution={onEditContribution}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default AssetGroup
