import { round } from './money.js'

// Precio en vivo: hoy un solo proveedor (CoinGecko por coingecko_id). Sumar
// un proveedor de tickers a futuro (fase 2 de precios automáticos) es
// agregar una rama acá, no reescribir valueAsset.
function resolveLivePrice(asset, cryptoPrices) {
  const price = cryptoPrices?.[asset.coingecko_id]?.usd
  return typeof price === 'number' ? price : null
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
  return round(total)
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
    return { realizedGain: round(amount - contributedBefore) }
  }
  return { realizedGain: 0 }
}

// ¿El monto supera el último valor conocido del activo? Nunca bloquea por sí
// solo (ver política única de guardas en ContributionFormModal/
// TransferFormModal): el valor puede estar desactualizado o el precio pudo
// cambiar, así que esto solo alimenta un aviso, nunca un bloqueo. Lo único
// que sí bloquea es retirar más unidades de las que hay (heldQuantity) — eso
// es lo único que dejaría una posición en negativo.
export function withdrawalExceedsValue(amount, valuation) {
  return valuation.value !== null && amount > valuation.value
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
  return round(total, 8)
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
      // unitPrice viaja en la valuación a propósito: es el precio de mercado
      // que ya resolvimos acá, y así llega a cualquier consumidor sin tener
      // que pasarle `prices` por props (ver currentUnitPrice).
      return { contributed, value: quantity * price, source: 'live', unitPrice: price }
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
      outdated: hasOperationsAfter(own, latestValuation.date),
    }
  }
  return { contributed, value: null, source: 'none' }
}

// ¿Hay operaciones posteriores a la última valuación? Cualquier fila cuenta
// —aporte, retiro o pata de transferencia—: todas mueven el aportado, que es
// justamente la base contra la que se compara el valor.
//
// Por qué importa: en un activo de valuación manual el valor es un TOTAL
// cargado a mano en una fecha. Si después entra o sale plata, ese total queda
// viejo y compararlo contra el aportado de hoy no da un rendimiento viejo: da
// uno INCORRECTO. Ej. real: un activo valuado en 262,5 en junio que en agosto
// recibe una transferencia de 319,49 pasa a mostrar −53,9%, una pérdida que
// nunca ocurrió. Las fechas son 'YYYY-MM-DD', así que comparan bien como texto.
export function hasOperationsAfter(contributions, valuationDate) {
  if (!valuationDate) return false
  return contributions.some((c) => c.date > valuationDate)
}

// Un activo necesita carga manual de valor cuando su modo es 'manual', o
// cuando es 'live' pero todavía no tiene identificador resoluble (hoy:
// coingecko_id) y por lo tanto no puede traer precio en vivo.
export function needsManualValuation(asset) {
  const mode = asset.valuation_mode
  return mode === 'manual' || (mode === 'live' && !asset.coingecko_id)
}

// Activos que entran en los totales generales del portafolio: los de bolsas
// con include_in_total distinto de false. Cada bolsa sigue mostrando su propio
// valor y rendimiento igual (ver AssetGroup) — este filtro es solo del total.
// Una bolsa ausente o sin el flag cuenta: solo un false explícito excluye.
export function totalableAssets(assets) {
  return assets.filter((a) => a.asset_type?.include_in_total !== false)
}

// Valor total del portafolio en USD. Un activo sin valuación (value null) no
// suma ni resta: es un dato que falta, no un cero.
export function computePortfolioValue(assets, valuations) {
  return totalableAssets(assets).reduce((sum, a) => sum + (valuations[a.id]?.value ?? 0), 0)
}

// Aportado total a los activos que entran en el total. A diferencia de la
// ganancia, acá SÍ cuentan los activos sin valuación: la plata se puso igual.
export function computePortfolioContributed(assets, valuations) {
  return totalableAssets(assets).reduce((sum, a) => sum + (valuations[a.id]?.contributed ?? 0), 0)
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
    // Una valuación desactualizada queda afuera por el mismo motivo que una
    // ausente: su rendimiento no es un dato viejo, es un dato falso, y sumarlo
    // acá lo escondería dentro del total del grupo y del portafolio en vez de
    // mostrarlo. El VALOR sí sigue contando (ver computePortfolioValue): es
    // viejo pero verdadero a su fecha.
    if (v.outdated) continue
    contributed += v.contributed
    value += v.value
  }
  return { contributed, value, gain: value - contributed }
}

// Precio unitario del valor de HOY: valor total ÷ tenencia. Es la métrica
// comparable con averagePurchasePrice (las dos miden "cuánto vale una
// unidad") y la única lectura correcta del valor de un activo de precio en
// vivo sin mezclarla con cuánto tenés. Solo aplica a activos que manejan
// cantidad (modo 'live'); null si no hay tenencia o no hay valor. Vale
// también cuando el valor viene de una valuación manual vieja ('stale'): es
// el precio implícito de ese último valor conocido.
export function currentUnitPrice(asset, contributions, valuation) {
  if (asset?.valuation_mode !== 'live') return null
  if (!valuation) return null
  // El precio de mercado existe aunque no tengas ni una unidad: si valueAsset
  // lo resolvió, ES ese número, no una división. Dividir valor ÷ cantidad era
  // el defecto — con tenencia 0 daba 0/0 y la pantalla mostraba "—" para un
  // precio que la API acababa de darnos.
  if (typeof valuation.unitPrice === 'number') return valuation.unitPrice
  // Sin precio en vivo (valuación 'stale'), lo único reconstruible es el
  // precio implícito del último valor conocido, y eso sí necesita tenencia.
  if (valuation.value === null) return null
  const quantity = heldQuantity(asset, contributions)
  return quantity > 0 ? valuation.value / quantity : null
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
// aportado remanente (mismo fold que computeContributed).
//
// "Liquidación" es un retiro sin transfer_id que CIERRA la posición: la deja
// en 0 (o menos) viniendo de una posición abierta (> 0). Se mira la
// transición, no el saldo suelto — un saldo ≤ 0 puntual no significa que se
// haya cerrado nada. El caso que lo obliga: un retiro cargado con fecha
// anterior a los aportes ordena primero y deja el acumulado en negativo,
// aunque la posición siga abierta; ahí no se cerró nada y es "Retiro".
// Cualquier otro retiro sin transfer_id también es "Retiro" — sin importar
// si realized_gain es 0 o no: con el aportado ya en 0, cada venta futura de
// un activo ganador tiene realized_gain≠0 para siempre, aunque no vacíe la
// posición.
//
// Invariante asumido (activos de precio en vivo): TODA entrada que suma
// posición trae quantity > 0. Si se mezclan filas con y sin quantity en un
// mismo activo live, runningQuantity subestima la tenencia real y un retiro
// puede marcar "Liquidación" antes de tiempo (posición contada en 0 aunque
// todavía haya tenencia cargada sin cantidad). Ver el test del caso mixto.
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
    const before = usesQuantity ? runningQuantity : runningContributed
    runningQuantity -= qty
    runningContributed -= amount - Number(c.realized_gain ?? 0)
    if (c.transfer_id) {
      labels[c.id] = 'Transferencia enviada'
      continue
    }
    const after = usesQuantity ? runningQuantity : runningContributed
    const closesPosition = round(before, 8) > 0 && round(after, 8) <= 0
    labels[c.id] = closesPosition ? 'Liquidación' : 'Retiro'
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
