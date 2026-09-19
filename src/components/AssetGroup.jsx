import { Link } from 'react-router-dom'
import { formatUSD, formatQuantity } from '../lib/format.js'
import {
  computePortfolioGain,
  heldQuantity,
  averagePurchasePrice,
  currentUnitPrice,
} from '../lib/portfolio.js'
import { getGroupColor } from '../lib/theme.js'
import Gain from './Gain.jsx'
import SourceTag from './SourceTag.jsx'
import { ChevronRight } from './Icons.jsx'

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
  // Manual y "vale lo aportado": la fecha de la valuación ya la dice la línea
  // de abajo (SourceTag, "Valuado 30 jun"); repetirla acá era la misma
  // información dos veces. Lo que falta para leer el rendimiento es cuánto se
  // puso.
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
      viewTransition
      to={`/inversiones/${asset.id}`}
      className="block px-4 py-3.5 text-left pressable"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-body font-medium">{asset.name}</span>
        </span>
        <span className="font-money shrink-0 text-body font-medium">
          {valuation.value !== null ? formatUSD(valuation.value) : '—'}
        </span>
      </div>
      <p className="mt-0.5 truncate text-footnote text-ink-soft">{secondLine(asset, valuation, own)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <SourceTag valuation={valuation} />
        {/* Con la valuación vieja el porcentaje no es impreciso, es falso
            (compara un valor de junio contra un aportado de agosto): no se
            muestra, ni tachado ni con asterisco. La fila entera ya linkea al
            detalle, que es donde vive "Actualizar valuación" — por eso acá va
            solo el aviso y no un botón (sería un botón adentro de un link). */}
        {valuation.outdated ? (
          <span className="flex items-center gap-1.5 text-footnote text-ink-soft">
            <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-attention" />
            Valuación desactualizada — hay operaciones posteriores
          </span>
        ) : (
          <Gain value={gain} base={valuation.contributed} neutral={neutral} className="text-footnote" />
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

  // Color del grupo (migración 0031). Null = sin color: el grupo se ve
  // exactamente como se veía antes de que esto existiera. No hay un color por
  // default — un color que el usuario no eligió diría algo que él no dijo.
  //
  // Bloque 10: el color dejó de teñir el encabezado y las filas (un grupo
  // "Vino" al lado de una pérdida en rojo se leía como pérdida). Ahora es
  // solo una marca chica al lado del nombre; los dos tonos siguen yendo como
  // variables inline y `.group-mark` decide cuál usar según el modo.
  const color = getGroupColor(assetType.color)
  const tintVars = color ? { '--group-color': color.fill, '--group-color-dark': color.inkDark } : undefined

  return (
    <div className="list" style={tintVars}>
      {/* Encabezado del grupo. Lleva `mist` entero, tenga o no color: la
          diferencia contra la tarjeta blanca de las filas tiene que verse
          sola. El color, cuando está, es solo la marca redonda al lado del
          nombre (bloque 10) -- ya no tiñe el fondo.

          Y es un link al detalle del grupo, la MISMA pantalla que se abre
          desde la lista de grupos: ahí se le cambia el nombre, el color y el
          resto. Dos pantallas para lo mismo se desincronizan; una sola, no. */}
      <Link
        viewTransition
        to={`/inversiones/grupos/${assetType.id}`}
        state={{ from: { label: 'Inversiones' } }}
        className="block bg-mist px-4 py-3 transition active:opacity-90"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-subhead font-semibold">
            {color && (
              <span aria-hidden="true" className="group-mark inline-block h-2.5 w-2.5 shrink-0 rounded-full" />
            )}
            {assetType.name}
            <ChevronRight />
            {outOfTotal && (
              <span className="badge bg-card">
                fuera del total
              </span>
            )}
            {archivedGroup && (
              <span className="badge bg-card">
                grupo archivado
              </span>
            )}
          </span>
          <span className="font-money text-subhead font-semibold">
            {allUnvalued ? <span className="text-ink-soft">sin valuación</span> : formatUSD(value)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 text-footnote">
          <span className="text-ink-soft">
            aportado <span className="font-money">{formatUSD(contributed)}</span>
          </span>
          {/* Mismo guard que el resumen general de Portafolio: sin ningún
              activo comparable (todos sin valuar o desactualizados) el
              agregado da 0 y un "+US$ 0" se leería como "no ganaste nada",
              que es distinto de "no hay con qué calcularlo". */}
          {valuedContributed > 0 && (
            <Gain value={gain} base={valuedContributed} className="text-footnote" />
          )}
        </div>
        {archivedGroup && (
          <p className="mt-1.5 text-footnote text-ink-soft">
            Este grupo está archivado pero todavía tiene activos sin archivar, así que se
            muestra: su valor sigue contando en el total. Movelos a otro grupo, o restaurá el
            grupo desde su detalle.
          </p>
        )}
        {outOfTotal && (
          <p className="mt-1.5 text-footnote text-ink-soft">
            Este grupo se ve, pero no suma al valor total.
          </p>
        )}
      </Link>

      {/* Las filas ya no llevan tinte de color (bloque 10): la marca del
          encabezado alcanza para leer "estas son las de ese grupo". */}
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
