import { Link } from 'react-router-dom'
import { formatUSD, formatDay } from '../lib/format.js'
import { computePortfolioGain, heldQuantity, averagePurchasePrice } from '../lib/portfolio.js'
import Gain from './Gain.jsx'
import SourceTag from './SourceTag.jsx'

// Línea 2 de la fila, según el modo de valuación del activo (ver
// FUNCTIONAL.md — Portafolio): la única línea que cambia de forma entre
// modos, porque cada uno mide su posición distinto.
function secondLine(asset, valuation, own) {
  if (asset.valuation_mode === 'live') {
    const quantity = heldQuantity(asset, own)
    const avg = averagePurchasePrice(own)
    const unitPrice = quantity > 0 && valuation.value !== null ? valuation.value / quantity : null
    const tickerPart = asset.ticker ? ` ${asset.ticker.toUpperCase()}` : ''
    return `${quantity}${tickerPart} · prom. ${avg !== null ? formatUSD(avg) : '—'} → hoy ${
      unitPrice !== null ? formatUSD(unitPrice) : '—'
    }`
  }
  if (asset.valuation_mode === 'manual') {
    return `Valuación manual · ${valuation.date ? formatDay(valuation.date) : 'sin valuar'}`
  }
  return `${formatUSD(valuation.contributed)} aportado`
}

// Fila de 3 líneas, toda ella un link al detalle del activo — ahí viven
// aportar/retirar/transferir/liquidar/editar y el historial completo.
function AssetRow({ asset, valuation, contributions }) {
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const gain = valuation.value !== null ? valuation.value - valuation.contributed : null
  const neutral = asset.yields === false || asset.valuation_mode === 'contributed'

  return (
    <Link
      to={`/portafolio/${asset.id}`}
      className="block px-4 py-3 text-left transition active:bg-mist/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px]">
            {asset.name}
            {asset.ticker && (
              <span className="font-money ml-1.5 text-xs text-ink-soft">{asset.ticker}</span>
            )}
          </span>
          <SourceTag valuation={valuation} />
        </span>
        <span className="font-money shrink-0 text-[15px]">
          {valuation.value !== null ? formatUSD(valuation.value) : '—'}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-ink-soft">{secondLine(asset, valuation, own)}</p>
      <div className="mt-1">
        <Gain value={gain} base={valuation.contributed} neutral={neutral} className="text-xs" />
      </div>
    </Link>
  )
}

function AssetGroup({ assetType, assets, valuations, contributions }) {
  const contributed = assets.reduce((sum, a) => sum + valuations[a.id].contributed, 0)
  const value = assets.reduce((sum, a) => sum + (valuations[a.id].value ?? 0), 0)
  // Ganancia solo sobre activos con valor que buscan rendimiento (sin valuación
  // ≠ pérdida; los que no rinden no aguan el %). Esto es el rendimiento propio
  // del grupo — se muestra igual aunque la bolsa esté fuera del total general.
  const { contributed: valuedContributed, gain } = computePortfolioGain(assets, valuations)
  const allUnvalued = assets.every((a) => valuations[a.id].value === null)

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="px-4 py-3">
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
            {allUnvalued ? <span className="text-clay">sin valuación</span> : formatUSD(value)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-ink-soft">
            aportado <span className="font-money">{formatUSD(contributed)}</span>
          </span>
          <Gain value={gain} base={valuedContributed} className="text-xs" />
        </div>
      </div>

      <div className="divide-y divide-line border-t border-line">
        {assets.map((asset) => (
          <AssetRow
            key={asset.id}
            asset={asset}
            valuation={valuations[asset.id]}
            contributions={contributions}
          />
        ))}
      </div>
    </div>
  )
}

export default AssetGroup
