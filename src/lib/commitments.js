import { supabase } from './supabase.js'
import { UserError } from './errors.js'
import { fetchAllPages } from './pagination.js'
import { CONFIRMED, isResolved, planOccurrences } from './commitmentSchedule.js'

// LA CONSULTA de los planes y sus cargos (migración 0045). El calendario —qué
// vence, cuándo y con qué estado— no está acá: lo calcula
// lib/commitmentSchedule.js, que es puro. Mismo reparto que entre
// lib/transactions.js (consulta) y lib/movements.js (calcula).
//
// Un vencimiento PENDIENTE no se consulta porque no existe como fila: es una
// consecuencia del plan. Lo que se guarda, y lo que esta función trae, es qué
// pasó con los vencimientos que YA se resolvieron.

// El nombre de la categoría y de la cuenta se traen en la misma query: la
// pantalla los muestra en cada plan y la moneda de la cuenta es la que decide
// si al confirmar hay que volver a pedir el monto.
const SELECT =
  '*, category:categories(name, kind), account:liquid_accounts(name, currency, is_savings), card:payment_cards(name, due_day, currency)'

export async function getCommitments() {
  const { data, error } = await supabase
    .from('commitments')
    .select(SELECT)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// Las filas crudas, paginadas por el corte silencioso de PostgREST en 1000
// filas (lib/pagination.js): una suscripción confirmada todos los meses
// durante años, más las cuotas, pasa esa marca sin que nada lo indique — y
// acá una fila que falta se lee como un vencimiento pendiente, o sea que la
// app pediría de nuevo algo ya pagado.
//
// Devuelve el array plano (no agrupado) para que useCommitments (capa de
// datos, bloque 05) pueda cachearlo y armar el Map con groupChargesByPlan en
// su `select`: un Map no sobrevive el paso por localStorage (ver
// queryClient.js).
export async function getCommitmentChargesRaw() {
  return fetchAllPages((from, to) =>
    supabase
      .from('commitment_charges')
      .select('*')
      .order('due_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
}

// Todos los cargos del usuario, agrupados por plan. Pura y testeable.
export function groupChargesByPlan(rows) {
  const byPlan = new Map()
  for (const row of rows) {
    if (!byPlan.has(row.commitment_id)) byPlan.set(row.commitment_id, [])
    byPlan.get(row.commitment_id).push(row)
  }
  return byPlan
}

function toRow({
  kind,
  name,
  categoryId,
  accountId,
  cardId,
  currency,
  amount,
  firstAmount,
  installments,
  firstInstallment,
  frequency,
  startDate,
}) {
  return {
    kind,
    name: name.trim(),
    category_id: categoryId,
    // Nullable = "sin cuenta", el mismo balde que en transactions (0032).
    account_id: accountId ?? null,
    // Solo las cuotas cuelgan de una tarjeta; la base también lo exige
    // (commitments_card_only_for_installments), así que forzarlo acá evita
    // que un cambio de tipo en el formulario deje un vínculo colgado.
    card_id: kind === 'installments' ? (cardId ?? null) : null,
    currency: currency ?? 'ARS',
    amount,
    first_amount: kind === 'installments' ? (firstAmount ?? null) : null,
    installments: kind === 'installments' ? installments : null,
    first_installment: kind === 'installments' ? (firstInstallment ?? 1) : 1,
    frequency: frequency ?? 'monthly',
    start_date: startDate,
  }
}

export async function createCommitment(fields) {
  const { data, error } = await supabase
    .from('commitments')
    .insert(toRow(fields))
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

export async function updateCommitment(id, fields) {
  const { data, error } = await supabase
    .from('commitments')
    .update(toRow(fields))
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

// ── Terminar un plan ────────────────────────────────────────────────────────
//
// Cancelar una suscripción y terminar un plan de cuotas son LA MISMA
// operación: este plan deja de generar vencimientos a partir de tal fecha. Lo
// único que cambiaba entre las dos era el nombre, así que hay una sola — dos
// caminos que hacen lo mismo con distinta palabra es peor que uno solo.
//
// Nada se borra: lo ya confirmado queda intacto, y un vencimiento anterior a
// esa fecha que todavía no se confirmó sigue pendiente, porque de verdad se
// debe.
export async function finishCommitment(id, endsOn) {
  const { data, error } = await supabase
    .from('commitments')
    .update({ ends_on: endsOn })
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

// Volver a activarlo: sacarle la fecha de fin. Terminar es reversible a
// propósito (por eso el botón es neutro y no rojo, y la confirmación no dice
// "permanente"): lo permanente es Eliminar, que es otra cosa.
export async function reopenCommitment(id) {
  const { data, error } = await supabase
    .from('commitments')
    .update({ ends_on: null })
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return data
}

// Cuántos vencimientos de este plan ya se confirmaron. Es lo que decide si el
// plan se puede eliminar, y lo que el texto de la pantalla tiene que decir
// ANTES de que el usuario toque nada.
export async function countConfirmed(id) {
  const { count, error } = await supabase
    .from('commitment_charges')
    .select('id', { count: 'exact', head: true })
    .eq('commitment_id', id)
    .not('transaction_id', 'is', null)
  if (error) throw error
  return count ?? 0
}

// Un plan CON cuotas confirmadas no se elimina: se termina. Mismo patrón que
// deleteDebt y deleteCategory, que es el que la app ya usa — nada se borra si
// tiene historia. Los gastos confirmados son gastos reales que ya salieron de
// tu plata y no se tocan nunca.
//
// Sin ninguna confirmada sí se borra de verdad, con sus cargos descartados (no
// son historia de plata: son "este mes no lo pagué"). El `delete` de los
// cargos va primero porque la FK de commitment_id no lleva cascade, a
// propósito: es la red que hace que la comprobación de arriba no dependa solo
// de que el cliente se acuerde de hacerla.
export async function deleteCommitment(id) {
  const confirmed = await countConfirmed(id)
  if (confirmed > 0) {
    throw new UserError(
      `Este plan tiene ${confirmed} ${confirmed === 1 ? 'cuota confirmada' : 'cuotas confirmadas'}, ` +
        'así que no se puede eliminar. Terminalo: deja de generar vencimientos y su historial queda intacto.',
    )
  }

  const { error: chargesError } = await supabase
    .from('commitment_charges')
    .delete()
    .eq('commitment_id', id)
  if (chargesError) throw chargesError

  const { error } = await supabase.from('commitments').delete().eq('id', id)
  if (error) throw error
}

// ── Confirmar ───────────────────────────────────────────────────────────────
//
// La confirmación es SIEMPRE del usuario: nada se carga solo. Y son dos
// escrituras (el gasto y la marca de que ese vencimiento ya se resolvió), así
// que van por una función de Postgres — supabase-js no puede abrir una
// transacción, y sueltas dejan el agujero que ya mordió dos veces en este
// proyecto: si la segunda falla queda el gasto cargado y el vencimiento
// diciendo "pendiente", y el reintento lo cobra dos veces.
//
// LA MONEDA: la fila de transactions hereda la de su cuenta, que es el
// invariante del que depende get_liquid_by_account. Si el plan está en otra
// moneda, el formulario pide el monto de nuevo ANTES de llamar acá — no hay
// ninguna conversión en ningún lado.
export async function confirmCharge({
  commitmentId,
  dueDate,
  date,
  amount,
  accountId,
  description,
}) {
  const { data, error } = await supabase.rpc('confirm_commitment_charge', {
    p_commitment_id: commitmentId,
    p_due_date: dueDate,
    p_date: date,
    p_amount: amount,
    p_account_id: accountId ?? null,
    p_description: description ?? null,
  })
  if (error) throw error
  return data
}

// Deshacer una confirmación: borra el gasto y la marca, juntos. El otro camino
// —borrar el gasto desde Movimientos— también funciona y deja el vencimiento
// pendiente solo, por el `on delete set null` de la migración.
export async function unconfirmCharge({ commitmentId, dueDate }) {
  const { error } = await supabase.rpc('unconfirm_commitment_charge', {
    p_commitment_id: commitmentId,
    p_due_date: dueDate,
  })
  if (error) throw error
}

// Descartar un vencimiento: no lo pagué y no lo voy a pagar (el mes que no
// fui al gimnasio). Sin esto, sacarse de encima un vencimiento obligaría a
// inventar un gasto que no existió.
export async function dismissCharge({ commitmentId, dueDate }) {
  const { data, error } = await supabase
    .from('commitment_charges')
    .upsert(
      {
        commitment_id: commitmentId,
        due_date: dueDate,
        transaction_id: null,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: 'commitment_id,due_date' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// Volver a dejarlo pendiente: se borra la marca y el vencimiento vuelve a
// calcularse como lo que es.
export async function undismissCharge({ commitmentId, dueDate }) {
  const { error } = await supabase
    .from('commitment_charges')
    .delete()
    .eq('commitment_id', commitmentId)
    .eq('due_date', dueDate)
    .is('transaction_id', null)
  if (error) throw error
}

// ── Lecturas derivadas, para la pantalla ───────────────────────────────────

// Los vencimientos de un plan con su estado, ya listos para pintar. Es un
// atajo sobre planOccurrences que evita que cada pantalla se acuerde de pasar
// los cargos del plan correcto.
export function occurrencesOf({ plan, chargesByPlan, today, until }) {
  return planOccurrences({
    plan,
    charges: chargesByPlan.get(plan.id) ?? [],
    today,
    until,
  })
}

// ¿Este plan tiene alguna cuota confirmada? Lo pregunta la pantalla para
// decidir si ofrece "Eliminar" (rojo, permanente) o solo "Terminar" (neutro,
// reversible) — la misma distinción que el resto de la app.
export function hasConfirmed({ plan, chargesByPlan }) {
  return (chargesByPlan.get(plan.id) ?? []).some((c) => c.transaction_id)
}

export { CONFIRMED, isResolved }
