import { supabase } from './supabase.js'
import { computeContributed, decomposeWithdrawal } from './portfolio.js'
import { round } from './money.js'

function toRow({
  assetId,
  date,
  amountUsd,
  quantity,
  mepRate,
  affectsLiquid,
  direction,
  realizedGain,
  transferId,
  emptiesAsset,
}) {
  return {
    asset_id: assetId,
    date,
    amount_usd: amountUsd,
    quantity: quantity ?? null,
    mep_rate: mepRate,
    affects_liquid: affectsLiquid ?? true,
    direction: direction ?? 'in',
    realized_gain: realizedGain ?? null,
    transfer_id: transferId ?? null,
    // Si vació el activo o no (migración 0017, columna nullable). Se persiste
    // desde acá porque es la ÚNICA forma de recalcular bien el realized_gain
    // al reeditar el retiro: antes el formulario mandaba `false` fijo al
    // editar, así que reabrir y guardar un retiro nacido de Liquidar le
    // borraba la ganancia realizada y resucitaba una posición cerrada.
    // `?? null` y no `?? false`: las filas viejas (anteriores a esto) tienen
    // null y ahí se quedan — null es "no sé", no "no vació".
    empties_asset: emptiesAsset ?? null,
  }
}

// [inicio, fin) del mes, como texto 'YYYY-MM-DD': las fechas de la base son
// date planas y se comparan como texto, sin pasar por Date (que las
// interpretaría en UTC y podría correrlas un día).
function monthRange(month, year) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const next =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { start, next }
}

export async function getContributions({ assetId, month, year, limit, offset = 0 } = {}) {
  let query = supabase.from('contributions').select('*')

  if (assetId) query = query.eq('asset_id', assetId)
  if (month && year) {
    const { start, next } = monthRange(month, year)
    query = query.gte('date', start).lt('date', next)
  }

  query = query.order('date', { ascending: false }).order('created_at', { ascending: false })
  if (limit != null) query = query.range(offset, offset + limit - 1)

  const { data, error } = await query
  if (error) throw error
  return data
}

// Las inversiones del mes que Movimientos muestra junto a los gastos e
// ingresos: SOLO las que mueven el disponible (affects_liquid), que son las
// que pasaron por el bolsillo en pesos. Un aporte "de afuera" no aparece —
// no movió plata del usuario— y las dos patas de una transferencia quedan
// afuera solas, porque create_transfer (migración 0017) las graba con
// affects_liquid = false.
//
// El nombre del activo viene por join: la lista tiene que poder decir "a qué"
// se invirtió, y el id solo sirve para navegar al detalle.
export async function getLiquidContributions({ month, year }) {
  const { start, next } = monthRange(month, year)

  const { data, error } = await supabase
    .from('contributions')
    .select('id, date, direction, amount_usd, mep_rate, created_at, asset:assets(id, name)')
    .eq('affects_liquid', true)
    .gte('date', start)
    .lt('date', next)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Separa una tanda de `pageSize + 1` filas (pedidas de más a propósito) en la
// página a mostrar + si hay más para cargar — evita una segunda ida y vuelta
// solo para saber si mostrar "Ver más".
export function splitPage(rows, pageSize) {
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize }
}

export async function createContribution(fields) {
  const { data, error } = await supabase
    .from('contributions')
    .insert(toRow(fields))
    .select()
    .single()
  if (error) throw error
  return data
}

// Guarda un retiro: calcula la descomposición capital/ganancia contra el
// aportado vigente del activo y la congela en la fila (realized_gain).
// emptiesAsset lo declara el formulario que origina la operación (true en
// Liquidar, false en Retirar) — nunca se infiere comparando amountUsd contra
// la valuación, porque una valuación desactualizada cristalizaría una
// ganancia o pérdida falsa para siempre. Además de alimentar el cálculo,
// ahora queda guardado en la fila: sin eso, reeditar el retiro no tiene con
// qué recalcularlo y la ganancia se pierde.
export async function createWithdrawal({
  assetId,
  date,
  amountUsd,
  quantity,
  mepRate,
  affectsLiquid,
  contributions,
  emptiesAsset,
  transferId = null,
}) {
  const own = contributions.filter((c) => c.asset_id === assetId)
  const contributedBefore = computeContributed(own)
  const { realizedGain } = decomposeWithdrawal({
    contributedBefore,
    amount: round(amountUsd),
    emptiesAsset,
  })

  return createContribution({
    assetId,
    date,
    amountUsd: round(amountUsd),
    quantity,
    mepRate,
    affectsLiquid,
    direction: 'out',
    realizedGain,
    transferId,
    emptiesAsset,
  })
}

// Transferencia entre activos: retiro + aporte, atómicos. Antes eran dos
// escrituras separadas (createWithdrawal + createContribution); si la segunda
// fallaba quedaba un retiro huérfano. Ahora una sola llamada a la función de
// Postgres create_transfer (migración 0017) inserta las dos patas en una
// transacción, con el mismo transfer_id y validando la pertenencia de ambos
// activos. affects_liquid se fuerza a false en ambas filas dentro de la
// función — la plata nunca sale del mundo invertido, no toca el líquido.
//
// El realized_gain del retiro (Opción A, "primero capital") se sigue
// calculando acá y se pasa a la función: la lógica de negocio vive en un solo
// lugar (portfolio.js), la base solo garantiza atomicidad y pertenencia.
//
// empties_asset queda en null en las dos patas: create_transfer (migración
// 0017) no lo setea, y no hace falta — una transferencia nunca vacía el
// activo (emptiesAsset es false fijo acá) y sus patas son de solo lectura,
// así que nunca vuelven a pasar por un recálculo de realized_gain.
export async function createTransfer({
  fromAssetId,
  toAssetId,
  date,
  amountUsd,
  fromQuantity,
  toQuantity,
  mepRate,
  contributions,
  emptiesAsset = false,
}) {
  const own = contributions.filter((c) => c.asset_id === fromAssetId)
  const contributedBefore = computeContributed(own)
  const { realizedGain } = decomposeWithdrawal({
    contributedBefore,
    amount: round(amountUsd),
    emptiesAsset,
  })

  const { data, error } = await supabase.rpc('create_transfer', {
    p_from_asset_id: fromAssetId,
    p_to_asset_id: toAssetId,
    p_date: date,
    p_amount_usd: round(amountUsd),
    p_from_quantity: fromQuantity ?? null,
    p_to_quantity: toQuantity ?? null,
    // Nunca redondear un mepRate null con round() (da 0, no null): una
    // transferencia jamás afecta el líquido, la tasa es opcional y ya viene
    // redondeada (o null) desde el formulario.
    p_mep_rate: mepRate,
    p_realized_gain: realizedGain,
  })
  if (error) throw error
  return data
}

// Edita un retiro existente: recalcula su realized_gain contra el aportado
// vigente, excluyéndose a sí mismo del cómputo (si no, se restaría dos
// veces). No es "recalcular retroactivamente" — es la fila editándose a sí
// misma, igual que cualquier otro campo de un aporte editado.
//
// emptiesAsset tiene que llegar desde la fila guardada (contributions
// .empties_asset), no como un false fijo: es el mismo insumo con el que se
// calculó la primera vez, y con otro valor el recálculo da otra cosa. Un
// retiro que vació el activo, reeditado con emptiesAsset=false, perdía toda
// su ganancia realizada.
export async function updateWithdrawal({
  id,
  assetId,
  date,
  amountUsd,
  quantity,
  mepRate,
  affectsLiquid,
  contributions,
  emptiesAsset,
  transferId = null,
}) {
  const own = contributions.filter((c) => c.asset_id === assetId && c.id !== id)
  const contributedBefore = computeContributed(own)
  const { realizedGain } = decomposeWithdrawal({
    contributedBefore,
    amount: round(amountUsd),
    emptiesAsset,
  })

  return updateContribution(id, {
    assetId,
    date,
    amountUsd: round(amountUsd),
    quantity,
    mepRate,
    affectsLiquid,
    direction: 'out',
    realizedGain,
    transferId,
    emptiesAsset,
  })
}

export async function updateContribution(id, fields) {
  const { data, error } = await supabase
    .from('contributions')
    .update(toRow(fields))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteContribution(id) {
  const { error } = await supabase.from('contributions').delete().eq('id', id)
  if (error) throw error
}

// Las dos patas de una transferencia (para mostrar con qué activo está
// vinculada la que se está mirando) — trae el nombre del activo de cada una.
export async function getTransferPair(transferId) {
  const { data, error } = await supabase
    .from('contributions')
    .select('*, asset:assets(id, name)')
    .eq('transfer_id', transferId)
  if (error) throw error
  return data
}

// Borra las dos patas de una transferencia juntas. Un solo DELETE por
// transfer_id es una sola sentencia SQL — atómica de por sí, sin necesitar
// una función de Postgres (a diferencia de create_transfer, que sí la
// necesita porque inserta dos filas *nuevas* relacionadas). RLS ("own via
// asset") sigue aplicando fila por fila.
export async function deleteTransfer(transferId) {
  const { error } = await supabase.from('contributions').delete().eq('transfer_id', transferId)
  if (error) throw error
}
