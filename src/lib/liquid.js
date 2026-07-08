import { supabase } from './supabase.js'

const ADJUSTMENT_CATEGORY = 'Ajuste de saldo'

export async function getLastReconciliation() {
  const { data, error } = await supabase
    .from('liquid_reconciliations')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// Líquido actual = suma pura de TODOS los movimientos del usuario:
// + ingresos − gastos − aportes (USD × su MEP congelado) − pagos de deuda (ídem).
// Los ajustes de reconciliación son transactions normales (categoría "Ajuste de
// saldo"), así que ya están incluidos. La última reconciliación se trae solo
// para mostrar ("Reconciliado el X") y para etiquetar el próximo ajuste.
export async function computeCurrentLiquid() {
  const [last, transactions, contributions, debtPayments] = await Promise.all([
    getLastReconciliation(),
    supabase
      .from('transactions')
      .select('kind, amount_ars')
      .then(({ data, error }) => {
        if (error) throw error
        return data
      }),
    supabase
      .from('contributions')
      .select('amount_usd, mep_rate')
      .then(({ data, error }) => {
        if (error) throw error
        return data
      }),
    supabase
      .from('debt_payments')
      .select('amount_usd, mep_rate')
      .then(({ data, error }) => {
        if (error) throw error
        return data
      }),
  ])

  let current = 0
  for (const t of transactions) {
    current += t.kind === 'income' ? Number(t.amount_ars) : -Number(t.amount_ars)
  }
  for (const c of contributions) {
    current -= Number(c.amount_usd) * Number(c.mep_rate)
  }
  for (const p of debtPayments) {
    // Pagos sin MEP congelado (anteriores a la migración 0010) quedan fuera
    if (p.mep_rate) current -= Number(p.amount_usd) * Number(p.mep_rate)
  }

  return { current, isFirst: !last, last }
}

// Declara el líquido real. Si difiere del actual calculado, registra la
// diferencia como transaction de ajuste para que el líquido pase a ser
// exactamente lo declarado, y guarda la reconciliación enlazada.
export async function reconcile({ date, declaredAmount }) {
  const { current, isFirst } = await computeCurrentLiquid()
  const difference = Math.round((declaredAmount - current) * 100) / 100

  let adjustment = null
  if (Math.abs(difference) >= 0.01) {
    const kind = difference > 0 ? 'income' : 'expense'
    const { data: category, error: catError } = await supabase
      .from('categories')
      .select('id')
      .eq('name', ADJUSTMENT_CATEGORY)
      .eq('kind', kind)
      .eq('is_archived', false)
      .limit(1)
      .maybeSingle()
    if (catError) throw catError
    if (!category) {
      throw new Error(
        `Falta la categoría "${ADJUSTMENT_CATEGORY}" (${kind === 'income' ? 'ingreso' : 'gasto'}). Restaurala o creala en Ajustes.`,
      )
    }

    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        date,
        kind,
        category_id: category.id,
        description: isFirst ? 'Saldo inicial' : 'Reconciliación de líquido',
        amount_ars: Math.abs(difference),
      })
      .select()
      .single()
    if (txError) throw txError
    adjustment = tx
  }

  const { data: reconciliation, error } = await supabase
    .from('liquid_reconciliations')
    .insert({
      date,
      declared_amount_ars: declaredAmount,
      adjustment_transaction_id: adjustment?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error

  return { reconciliation, adjustment, difference }
}
