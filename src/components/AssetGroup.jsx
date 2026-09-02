import { Link } from 'react-router-dom'
import { formatUSD, formatDay, formatQuantity } from '../lib/format.js'
import {
  computePortfolioGain,
  heldQuantity,
  averagePurchasePrice,
  currentUnitPrice,
} from '../lib/portfolio.js'
import Gain from './Gain.jsx'
import SourceTag from './SourceTag.jsx'

// Línea 2 de la fila, según el modo de valuación del activo (ver
// FUNCTIONAL.md — Portafolio): la única línea que cambia de forma entre
// modos, porque cada uno mide su posición distinto.
function secondLine(asset, valuation, own) {
  if (asset.valuation_mode === 'live') {
    const quantity = heldQuantity(asset, own)
    const avg = averagePurchasePrice(own)
    const unitPrice = currentUnitPrice(asset, own, valuation)
    return `${formatQuantity(quantity)} · prom. ${avg !== null ? formatUSD(avg) : '—'} → hoy ${
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
//
// Se exporta porque un activo sin grupo se dibuja con ESTA misma fila, sola
// dentro de su tarjeta (ver Portafolio): un activo suelto tiene que decir lo
// mismo que uno agrupado, no una versión propia que se desincronice.
export function AssetRow({ asset, valuation, contributions }) {
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const gain = valuation.value !== null ? valuation.value - valuation.contributed : null
  const neutral = asset.yields === false || asset.valuation_mode === 'contributed'

  return (
    <Link
      to={`/portafolio/${asset.id}`}
      className="block px-4 py-3.5 text-left transition active:bg-mist md:hover:bg-mist"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[17px] font-medium">{asset.name}</span>
        </span>
        <span className="font-money shrink-0 text-[17px] font-medium">
          {valuation.value !== null ? formatUSD(valuation.value) : '—'}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[13px] text-ink-soft">{secondLine(asset, valuation, own)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <SourceTag valuation={valuation} />
        {/* Con la valuación vieja el porcentaje no es impreciso, es falso
            (compara un valor de junio contra un aportado de agosto): no se
            muestra, ni tachado ni con asterisco. La fila entera ya linkea al
            detalle, que es donde vive "Actualizar valuación" — por eso acá va
            solo el aviso y no un botón (sería un botón adentro de un link). */}
        {valuation.outdated ? (
          <span className="text-[13px] text-clay">
            Valuación desactualizada — hay operaciones posteriores
          </span>
        ) : (
          <Gain value={gain} base={valuation.contributed} neutral={neutral} className="text-[13px]" />
        )}
      </div>
    </Link>
  )
}

function AssetGroup({ assetType, assets, valuations, contributions }) {
  const contributed = assets.reduce((sum, a) => sum + valuations[a.id].contributed, 0)
  const value = assets.reduce((sum, a) => sum + (valuations[a.id].value ?? 0), 0)
  // Ganancia solo sobre activos con valor que buscan rendimiento (sin valuación
  // ≠ pérdida; los que no rinden no aguan el %). Esto es el rendimiento propio
  // del grupo — se muestra igual aunque el grupo esté fuera del total general.
  const { contributed: valuedContributed, gain } = computePortfolioGain(assets, valuations)
  const allUnvalued = assets.every((a) => valuations[a.id].value === null)
  const outOfTotal = assetType.include_in_total === false
  // Un grupo archivado no debería tener activos sin archivar (la app no deja
  // archivarlo si los tiene), pero se puede llegar restaurando un activo cuyo
  // grupo se archivó después. Mientras eso exista, se muestra: sus activos
  // suman al total, así que esconderlos dejaba un total que no se podía
  // explicar mirando la pantalla.
  const archivedGroup = assetType.is_archived === true

  return (
    <div className="list">
      {/* Encabezado del grupo: se apoya sobre un relleno apenas distinto para
          separarlo de sus activos sin necesidad de un borde. */}
      <div className="bg-mist/45 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold">
            {assetType.name}
            {outOfTotal && (
              <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink-soft uppercase">
                fuera del total
              </span>
            )}
            {archivedGroup && (
              <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink-soft uppercase">
                grupo archivado
              </span>
            )}
          </span>
          <span className="font-money text-[15px] font-semibold">
            {allUnvalued ? <span className="text-clay">sin valuación</span> : formatUSD(value)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 text-[13px]">
          <span className="text-ink-soft">
            aportado <span className="font-money">{formatUSD(contributed)}</span>
          </span>
          {/* Mismo guard que el resumen general de Portafolio: sin ningún
              activo comparable (todos sin valuar o desactualizados) el
              agregado da 0 y un "+US$ 0" se leería como "no ganaste nada",
              que es distinto de "no hay con qué calcularlo". */}
          {valuedContributed > 0 && (
            <Gain value={gain} base={valuedContributed} className="text-[13px]" />
          )}
        </div>
        {archivedGroup && (
          <p className="mt-1.5 text-[13px] text-ink-soft">
            Este grupo está archivado pero todavía tiene activos sin archivar, así que se
            muestra: su valor sigue contando en el total. Movelos a otro grupo, o restaurá el
            grupo desde Ajustes.
          </p>
        )}
        {outOfTotal && (
          <p className="mt-1.5 text-[13px] text-ink-soft">
            Este grupo se ve, pero no suma al valor total.
          </p>
        )}
      </div>

      <div className="rows">
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
