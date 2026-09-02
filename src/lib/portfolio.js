import { round } from './money.js'

// Precio del activo, buscado por el instrumento al que está enganchado
// (assets.instrument_id -> catálogo compartido). El mapa ya viene resuelto y
// en dólares desde portfolioPrices.js, que decide si el número es del momento
// o del último cierre; acá solo se lee.
function resolveInstrumentPrice(asset, prices) {
  const entry = prices?.[asset.instrument_id]
  return typeof entry?.usd === 'number' ? entry : null
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
// - 'live' con instrumento cotizable: cantidad acumulada × precio. El precio
//   puede ser del momento ('live', cripto) o el último cierre del cron
//   ('close', lo de BYMA y lo que no resolvió en vivo). Sin ninguno de los
//   dos (sin instrumento, o todo caído): cae a la última valuación manual
//   (marcada 'stale'), o 'none' si no hay ninguna.
// - 'contributed' (hoy: efectivo): el valor es lo aportado, nunca pide
//   valuación.
// - 'manual' (resto): última valuación manual; sin valuación no suma al
//   total.
export function valueAsset(asset, contributions, latestValuation, prices) {
  const own = contributions.filter((c) => c.asset_id === asset.id)
  const contributed = computeContributed(own)

  if (asset.valuation_mode === 'live') {
    const quantity = heldQuantity(asset, contributions)
    const priced = resolveInstrumentPrice(asset, prices)
    if (priced !== null) {
      // unitPrice viaja en la valuación a propósito: es el precio de mercado
      // que ya resolvimos acá, y así llega a cualquier consumidor sin tener
      // que pasarle `prices` por props (ver currentUnitPrice).
      // 'close' = el instrumento no cotiza en vivo desde el navegador (o la
      // API falló) y el valor sale del último cierre del cron. Sigue siendo
      // un precio de mercado real, por eso NO es 'stale': esa marca es para
      // cuando se cae a una valuación cargada a mano.
      return {
        contributed,
        value: quantity * priced.usd,
        source: priced.live ? 'live' : 'close',
        unitPrice: priced.usd,
        date: priced.date ?? null,
      }
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
// cuando es 'live' pero no está enganchado a ningún instrumento del catálogo
// y por lo tanto no hay de dónde sacarle un precio.
export function needsManualValuation(asset) {
  const mode = asset.valuation_mode
  return mode === 'manual' || (mode === 'live' && !asset.instrument_id)
}

// Agrupa los activos para mostrarlos, SIEMPRE desde los activos mismos: cada
// activo cae en el grupo que dice su propia fila. `assetTypes` (la lista de
// grupos sin archivar) se usa solo para el ORDEN.
//
// Por qué así y no recorriendo los grupos: recorriendo la lista de grupos
// activos, un activo cuyo grupo estaba archivado no caía en ninguno y
// desaparecía de la pantalla — pero seguía sumando al total, que se calcula
// sobre todos los activos. El total decía una cosa y la lista mostraba otra,
// sin nada que explicara la diferencia. Un activo invisible que suma plata es
// peor que un grupo archivado que reaparece: acá la lista y el total cuentan
// lo mismo por construcción, no por acordarse de filtrar igual en los dos
// lados.
//
// Los grupos archivados que todavía tienen activos activos van al final y se
// marcan (ver AssetGroup): archivar un grupo con activos adentro no es un
// estado normal, pero mientras exista tiene que verse.
export function groupAssetsByType(assets, assetTypes) {
  const order = new Map(assetTypes.map((at, i) => [at.id, i]))
  const byId = new Map(assetTypes.map((at) => [at.id, at]))

  const groups = new Map()
  for (const asset of assets) {
    const id = asset.asset_type_id
    if (!groups.has(id)) {
      // El grupo sale del listado si está ahí; si no (archivado), del que
      // viene embebido en el activo. Sin ninguno de los dos igual se muestra:
      // un grupo sin nombre es raro, un activo perdido es un número mal.
      const assetType = byId.get(id) ??
        asset.asset_type ?? { id, name: 'Sin grupo', include_in_total: true }
      groups.set(id, { assetType, assets: [] })
    }
    groups.get(id).assets.push(asset)
  }

  // Los que no están en la lista activa no tienen posición: al final, en un
  // orden estable (por nombre) para que no bailen entre renders.
  const AT_END = Number.MAX_SAFE_INTEGER
  return [...groups.values()].sort((a, b) => {
    const oa = order.get(a.assetType.id) ?? AT_END
    const ob = order.get(b.assetType.id) ?? AT_END
    if (oa !== ob) return oa - ob
    return String(a.assetType.name).localeCompare(String(b.assetType.name))
  })
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

// Reparte el valor del portafolio en los dos baldes que la cabecera nombra:
// lo que busca rendimiento y lo que es reserva de valor (yields === false, ej.
// efectivo). La suma de los dos ES computePortfolioValue, siempre — por eso se
// parte del mismo conjunto (totalableAssets) y con la misma regla para el
// valor faltante (null no suma ni resta). yields null/undefined rinde: solo un
// false explícito manda un activo al balde de la reserva.
//
// Ojo con el monto de `yielding`: NO es el `value` de computePortfolioGain.
// Esa función deja afuera los activos con la valuación desactualizada porque
// su rendimiento sería falso, pero su VALOR sigue siendo el último dato
// verdadero y tiene que mostrarse. `outdated` marca justamente ese caso, para
// que la cabecera muestre el monto y cambie el % por el aviso.
export function splitPortfolioByYield(assets, valuations) {
  let yielding = 0
  let notYielding = 0
  let outdated = false
  for (const asset of totalableAssets(assets)) {
    const v = valuations[asset.id]
    const value = v?.value ?? 0
    if (asset.yields === false) {
      notYielding += value
      continue
    }
    yielding += value
    // Un activo sin valuación no está "desactualizado": le falta el dato, y de
    // eso ya avisa la pantalla por otro lado.
    if (v?.outdated && v.value !== null) outdated = true
  }
  return { yielding, notYielding, outdated }
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
