import { useState } from 'react'
import { formatUSD, formatDay } from '../lib/format.js'
import { computePortfolioGain } from '../lib/portfolio.js'
import Gain from './Gain.jsx'
import EditIcon from './EditIcon.jsx'

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
  if (valuation.source === 'contributed') {
    return <span className="text-xs text-ink-soft">no requiere valuación</span>
  }
  return <span className="text-xs text-clay">sin valuación — no suma al total</span>
}

function AssetActions({ asset, valuation, onAportar, onRetirar, onTransfer, onLiquidate }) {
  const [menuOpen, setMenuOpen] = useState(false)
  // Nada que liquidar: sin aportado y sin valor.
  const canLiquidate = !(valuation.contributed === 0 && !valuation.value)

  return (
    <div className="mt-2 flex items-center gap-4 text-xs">
      <button type="button" onClick={() => onAportar(asset)} className="font-medium text-pine">
        Aportar
      </button>
      <button type="button" onClick={() => onRetirar(asset)} className="font-medium text-pine">
        Retirar
      </button>
      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Más acciones"
          className="px-1 text-ink-soft"
        >
          ⋯
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onTransfer(asset)
                }}
                className="block w-full px-3 py-2 text-left text-[13px] transition hover:bg-mist/60"
              >
                Transferir a otro activo
              </button>
              {canLiquidate && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onLiquidate(asset)
                  }}
                  className="block w-full px-3 py-2 text-left text-[13px] transition hover:bg-mist/60"
                >
                  Liquidar posición
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AssetRow({
  asset,
  valuation,
  contributions,
  onEdit,
  onUpdateValue,
  onEditContribution,
  onAportar,
  onRetirar,
  onTransfer,
  onLiquidate,
}) {
  const [showContributions, setShowContributions] = useState(false)
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const gain = valuation.value !== null ? valuation.value - valuation.contributed : null
  const doesNotYield = asset.yields === false

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onEdit(asset)} className="min-w-0 text-left">
          <p className="flex items-center gap-1 text-[15px]">
            <span className="truncate">
              {asset.name}
              {asset.ticker && (
                <span className="font-money ml-1.5 text-xs text-ink-soft">{asset.ticker}</span>
              )}
            </span>
            <EditIcon />
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

      <AssetActions
        asset={asset}
        valuation={valuation}
        onAportar={onAportar}
        onRetirar={onRetirar}
        onTransfer={onTransfer}
        onLiquidate={onLiquidate}
      />

      <div className="mt-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowContributions((prev) => !prev)}
            className="text-ink-soft"
          >
            {showContributions ? '▾' : '▸'} Aportes ({own.length})
          </button>
          {valuation.source !== 'live' && valuation.source !== 'contributed' && (
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
            own.map((c) => {
              const isWithdrawal = c.direction === 'out'
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onEditContribution(c)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-mist"
                >
                  <span className="flex items-center gap-1 text-ink-soft">
                    {formatDay(c.date)}
                    {c.quantity ? ` · ${isWithdrawal ? '−' : ''}${Number(c.quantity)}` : ''}
                    {c.affects_liquid === false && (
                      <span className="ml-1.5 rounded-full bg-mist px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        {isWithdrawal ? 'no acredita' : 'inicial'}
                      </span>
                    )}
                    <EditIcon className="h-3 w-3 shrink-0 text-ink-soft" />
                  </span>
                  <span className={`font-money ${isWithdrawal ? 'text-clay' : ''}`}>
                    {isWithdrawal ? '−' : ''}
                    {formatUSD(c.amount_usd)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function AssetGroup({
  assetType,
  assets,
  valuations,
  contributions,
  onEditAsset,
  onUpdateValue,
  onEditContribution,
  onAportar,
  onRetirar,
  onTransfer,
  onLiquidate,
}) {
  const [expanded, setExpanded] = useState(false)

  const contributed = assets.reduce((sum, a) => sum + valuations[a.id].contributed, 0)
  const value = assets.reduce((sum, a) => sum + (valuations[a.id].value ?? 0), 0)
  // Ganancia solo sobre activos con valor que buscan rendimiento (sin valuación
  // ≠ pérdida; los que no rinden no aguan el %). Esto es el rendimiento propio
  // del grupo — se muestra igual aunque la bolsa esté fuera del total general.
  const { contributed: valuedContributed, gain } = computePortfolioGain(assets, valuations)
  const allUnvalued = assets.every((a) => valuations[a.id].value === null)

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-4 py-3 text-left transition hover:bg-mist/40"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold">
            {assetType.name}
            {assetType.include_in_total === false && (
              <span className="rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-ink-soft">
                fuera del total
              </span>
            )}
          </span>
          <span className="font-money text-[15px] font-semibold">
            {allUnvalued ? (
              <span className="text-clay">sin valuación</span>
            ) : (
              formatUSD(value)
            )}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-ink-soft">
            aportado <span className="font-money">{formatUSD(contributed)}</span>
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
              onAportar={onAportar}
              onRetirar={onRetirar}
              onTransfer={onTransfer}
              onLiquidate={onLiquidate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default AssetGroup
