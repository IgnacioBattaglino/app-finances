import { supabase } from './supabase.js'
import { computeContributed, decomposeWithdrawal } from './portfolio.js'

function round2(n) {
  return Math.round(n * 100) / 100
}

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

export async function getContributions({ assetId, month, year } = {}) {
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

  const { data, error } = await query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
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
    amount: round2(amountUsd),
    emptiesAsset,
  })

  return createContribution({
    assetId,
    date,
    amountUsd: round2(amountUsd),
    quantity,
    mepRate,
    affectsLiquid,
    direction: 'out',
    realizedGain,
    transferId,
  })
}

// Transferencia entre activos: retiro + aporte vinculados por transfer_id.
// affects_liquid se fuerza a false en ambas filas por código, no es un
// default editable en la UI — la plata nunca sale del mundo invertido, no
// debe tocar el líquido.
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
  const transferId = crypto.randomUUID()
  const withdrawal = await createWithdrawal({
    assetId: fromAssetId,
    date,
    amountUsd,
    quantity: fromQuantity,
    mepRate,
    affectsLiquid: false,
    contributions,
    emptiesAsset,
    transferId,
  })
  const deposit = await createContribution({
    assetId: toAssetId,
    date,
    amountUsd: round2(amountUsd),
    quantity: toQuantity,
    mepRate,
    affectsLiquid: false,
    direction: 'in',
    transferId,
  })
  return { withdrawal, deposit }
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
