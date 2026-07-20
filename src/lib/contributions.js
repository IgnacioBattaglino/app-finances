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
  }
}

export async function getContributions({ assetId, month, year, limit, offset = 0 } = {}) {
  let query = supabase.from('contributions').select('*')

  if (assetId) query = query.eq('asset_id', assetId)
  if (month && year) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const next =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`
    query = query.gte('date', start).lt('date', next)
  }

  query = query.order('date', { ascending: false }).order('created_at', { ascending: false })
  if (limit != null) query = query.range(offset, offset + limit - 1)

  const { data, error } = await query
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
// emptiesAsset viene del formulario (checkbox "Vendí/retiré todo este
// activo") — nunca se infiere comparando amountUsd contra la valuación,
// porque una valuación desactualizada cristalizaría una ganancia o pérdida
// falsa para siempre.
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
    p_mep_rate: round(mepRate),
    p_realized_gain: realizedGain,
  })
  if (error) throw error
  return data
}

// Edita un retiro existente: recalcula su realized_gain contra el aportado
// vigente, excluyéndose a sí mismo del cómputo (si no, se restaría dos
// veces). No es "recalcular retroactivamente" — es la fila editándose a sí
// misma, igual que cualquier otro campo de un aporte editado.
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
