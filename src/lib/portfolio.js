// Precio en vivo: hoy un solo proveedor (CoinGecko por coingecko_id). Sumar
// un proveedor de tickers a futuro (fase 2 de precios automáticos) es
// agregar una rama acá, no reescribir valueAsset.
function resolveLivePrice(asset, cryptoPrices) {
  const price = cryptoPrices?.[asset.coingecko_id]?.usd
  return typeof price === 'number' ? price : null
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// Aportado neto de un activo: entradas suman completo; salidas restan solo
// la porción de capital devuelto (amount_usd − realized_gain). No requiere
// orden cronológico: cada realized_gain ya quedó congelado contra el
// aportado vigente en el momento de ESE retiro (ver decomposeWithdrawal),
// así que la suma agregada es aritméticamente equivalente al fold
// secuencial que produjo cada realized_gain.
export function computeContributed(contributions) {
  let total = 0
  for (const c of contributions) {
    const amount = Number(c.amount_usd)
    total += c.direction === 'out' ? -(amount - Number(c.realized_gain ?? 0)) : amount
  }
  return round2(total)
}

// Descompone un retiro en capital devuelto vs. ganancia/pérdida realizada
// (Opción A, "primero capital" — ver ADR pendiente):
// - No excede el aportado y no vacía el activo → resta directo, sin
//   ganancia realizada (incluye el caso "plata de la casa": aportado 0,
//   cualquier retiro excede por definición).
// - Excede el aportado, o vacía el activo (emptiesAsset es una declaración
//   explícita del usuario, no se infiere de la valuación — una valuación
//   vieja cristalizaría una pérdida o ganancia falsa) → el aportado cae a 0
//   y la diferencia (retiro − aportado) se cristaliza: positiva si es
//   ganancia, negativa si el activo se vació en pérdida.
export function decomposeWithdrawal({ contributedBefore, amount, emptiesAsset }) {
  if (amount > contributedBefore || emptiesAsset) {
    return { realizedGain: round2(amount - contributedBefore) }
  }
  return { realizedGain: 0 }
}

// Guard de retiro: con valuación confiable (todo salvo 'stale'/'none')
// bloquea exceder el valor actual. Con 'stale' (precio caído, cae a último
// valor manual) o 'none' (sin valuación), la app no tiene con qué exigir
// precisión — avisa pero no bloquea.
export function withdrawalExceedsValue(amount, valuation) {
  return valuation.value !== null && amount > valuation.value
}

export function withdrawalGuardBlocks(valuation) {
  return valuation.source !== 'stale' && valuation.source !== 'none'
}

// Tenencia acumulada (unidades) de un activo: aportes suman, retiros restan.
// Solo tiene sentido para activos de precio en vivo (los únicos que registran
// quantity); redondeado a 8 decimales para no arrastrar ruido de punto
// flotante hacia comparaciones (ej: el guard de retiro contra la tenencia).
export function heldQuantity(asset, contributions) {
  const total = contributions
    .filter((c) => c.asset_id === asset.id)
    .reduce(
      (sum, c) => sum + (c.direction === 'out' ? -Number(c.quantity ?? 0) : Number(c.quantity ?? 0)),
      0,
    )
  return Math.round(total * 1e8) / 1e8
}

// Cálculo puro del valor de un activo, según el valuation_mode del activo
// (ver FUNCTIONAL.md):
// - 'live' (hoy: cripto) con precio resoluble: cantidad acumulada × precio.
//   Sin precio (API caída o sin identificador): cae a la última valuación
//   manual (marcada 'stale'), o 'none' si no hay ninguna.
// - 'contributed' (hoy: efectivo): el valor es lo aportado, nunca pide
//   valuación.
// - 'manual' (resto): última valuación manual; sin valuación no suma al
//   total.
export function valueAsset(asset, contributions, latestValuation, cryptoPrices) {
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const contributed = computeContributed(own)

  if (asset.valuation_mode === 'live') {
    const quantity = heldQuantity(asset, contributions)
    const price = resolveLivePrice(asset, cryptoPrices)
    if (price !== null) {
      return { contributed, value: quantity * price, source: 'live' }
    }
    if (latestValuation) {
      return {
        contributed,
        value: Number(latestValuation.value_usd),
        source: 'stale',
        date: latestValuation.date,
      }
    }
    return { contributed, value: null, source: 'none' }
  }

  if (asset.valuation_mode === 'contributed') {
    return { contributed, value: contributed, source: 'contributed' }
  }

  if (latestValuation) {
    return {
      contributed,
      value: Number(latestValuation.value_usd),
      source: 'manual',
      date: latestValuation.date,
    }
  }
  return { contributed, value: null, source: 'none' }
}

// Un activo necesita carga manual de valor cuando su modo es 'manual', o
// cuando es 'live' pero todavía no tiene identificador resoluble (hoy:
// coingecko_id) y por lo tanto no puede traer precio en vivo.
export function needsManualValuation(asset) {
  const mode = asset.valuation_mode
  return mode === 'manual' || (mode === 'live' && !asset.coingecko_id)
}

// Ganancia total de un conjunto de activos, solo sobre los que buscan
// rendimiento (yields !== false) y tienen valor. Los que no rinden (ej:
// efectivo) o no tienen valuación quedan afuera de este cálculo, pero
// siguen sumando al valor total del portafolio en otro lado.
export function computePortfolioGain(assets, valuations) {
  let contributed = 0
  let value = 0
  for (const asset of assets) {
    if (asset.yields === false) continue
    const v = valuations[asset.id]
    if (v.value === null) continue
    contributed += v.contributed
    value += v.value
  }
  return { contributed, value, gain: value - contributed }
}

// Precio promedio ponderado de compra: Σ(amount_usd) ÷ Σ(quantity) sobre las
// operaciones de ENTRADA con cantidad > 0 (aportes y patas de entrada de
// transferencias comparten esa forma). Retiros y patas de salida no son
// compras y no entran. null si no hay ninguna operación con cantidad.
export function averagePurchasePrice(contributions) {
  let totalAmount = 0
  let totalQuantity = 0
  for (const c of contributions) {
    if (c.direction === 'out') continue
    const qty = Number(c.quantity ?? 0)
    if (!(qty > 0)) continue
    totalAmount += Number(c.amount_usd)
    totalQuantity += qty
  }
  return totalQuantity > 0 ? totalAmount / totalQuantity : null
}

// Etiqueta cada operación recorriendo el historial COMPLETO en orden
// cronológico (nunca la página visible: la posición real depende de todo lo
// anterior). Para activos que manejan cantidad (cualquier fila con
// quantity > 0) la posición relevante es la cantidad remanente; si no, es el
// aportado remanente (mismo fold que computeContributed). "Liquidación" es
// un retiro sin transfer_id que deja esa posición exactamente en 0
// (redondeado, para no arrastrar ruido de punto flotante); cualquier otro
// retiro sin transfer_id es "Retiro" — sin importar si realized_gain es 0 o
// no: con el aportado ya en 0, cada venta futura de un activo ganador tiene
// realized_gain≠0 para siempre, aunque no vacíe la posición.
export function classifyOperations(contributions) {
  const usesQuantity = contributions.some((c) => Number(c.quantity ?? 0) > 0)
  const sorted = [...contributions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return (a.created_at ?? '') < (b.created_at ?? '')
      ? -1
      : (a.created_at ?? '') > (b.created_at ?? '')
        ? 1
        : 0
  })

  const labels = {}
  let runningQuantity = 0
  let runningContributed = 0

  for (const c of sorted) {
    const amount = Number(c.amount_usd)
    const qty = Number(c.quantity ?? 0)
    if (c.direction !== 'out') {
      labels[c.id] = c.transfer_id ? 'Transferencia recibida' : 'Aporte'
      runningQuantity += qty
      runningContributed += amount
      continue
    }
    runningQuantity -= qty
    runningContributed -= amount - Number(c.realized_gain ?? 0)
    if (c.transfer_id) {
      labels[c.id] = 'Transferencia enviada'
      continue
    }
    const remaining = usesQuantity ? runningQuantity : runningContributed
    labels[c.id] = Math.round(remaining * 1e8) / 1e8 <= 0 ? 'Liquidación' : 'Retiro'
  }
  return labels
}

// Combina operaciones ya paginadas + valuaciones manuales del activo en un
// único historial ordenado desc. Una valuación solo entra si su fecha cae
// dentro del rango ya cargado (>= fecha de la operación más vieja cargada):
// con hasMore=true no sabemos si faltan operaciones más viejas entre medio,
// así que se posterga hasta que se cargue esa página; con hasMore=false
// (llegamos al final) se muestran todas.
export function mergeAssetHistory({ contributions, valuations, hasMore }) {
  const floorDate = contributions.at(-1)?.date ?? null
  const visible = !hasMore
    ? valuations
    : valuations.filter((v) => floorDate !== null && v.date >= floorDate)
  const events = [
    ...contributions.map((c) => ({ type: 'contribution', date: c.date, data: c })),
    ...visible.map((v) => ({ type: 'valuation', date: v.date, data: v })),
  ]
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.type === b.type) return 0
    return a.type === 'contribution' ? -1 : 1
  })
  return events
}
