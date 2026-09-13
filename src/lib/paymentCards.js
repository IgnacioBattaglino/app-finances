import { supabase } from './supabase.js'
import { UserError } from './errors.js'

// Tarjetas (migración 0045). Una tarjeta agrupa compras en cuotas y, sobre
// todo, LES DA LA FECHA: si hay tres compras en la misma tarjeta, las tres
// vencen el mismo día, porque en la vida real se paga un solo resumen. Esa es
// la razón de que exista como tabla y no sea un texto libre en cada compra.
//
// NO es una cuenta del disponible: una cuenta tiene saldo y suma al "Dinero
// disponible", una tarjeta es lo contrario — el lugar del que va a salir plata
// que todavía no salió.
//
// Mismo patrón de orden manual que liquid_accounts y categories: `position`
// 0-based con el nombre como desempate.
export async function getCards() {
  const { data, error } = await supabase
    .from('payment_cards')
    .select('*')
    .order('position')
    .order('name')
  if (error) throw error
  return data
}

export async function getCard(id) {
  const { data, error } = await supabase.from('payment_cards').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

async function nextPosition() {
  const { data, error } = await supabase
    .from('payment_cards')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data[0]?.position ?? -1) + 1
}

function toRow({ name, dueDay, creditLimit, currency }) {
  return {
    name: name.trim(),
    // Los dos opcionales a propósito: quien no se acuerda del día de cierre de
    // su tarjeta tiene que poder cargarla igual. Sin día, cada compra usa su
    // propia fecha, que es lo que la app hacía hasta ahora.
    due_day: dueDay ?? null,
    credit_limit: creditLimit ?? null,
    currency: currency ?? 'ARS',
  }
}

export async function createCard(fields) {
  const { data, error } = await supabase
    .from('payment_cards')
    .insert({ ...toRow(fields), position: await nextPosition() })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCard(id, fields) {
  const { data, error } = await supabase
    .from('payment_cards')
    .update(toRow(fields))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Borrar una tarjeta con compras cargadas no se permite: la FK de
// `commitments.card_id` lo rechazaría igual (23503), pero la app cuenta antes
// para poder explicarlo en castellano en vez de dejar salir un error de
// constraint — mismo mecanismo y mismo motivo que deleteDebt.
export async function deleteCard(id) {
  const { count, error: countError } = await supabase
    .from('commitments')
    .select('id', { count: 'exact', head: true })
    .eq('card_id', id)
  if (countError) throw countError
  if (count > 0) {
    throw new UserError(
      `Esta tarjeta tiene ${count} ${count === 1 ? 'compra cargada' : 'compras cargadas'}. ` +
        'Borralas o pasalas a otra tarjeta antes de eliminarla.',
    )
  }

  const { error } = await supabase.from('payment_cards').delete().eq('id', id)
  if (error) throw error
}
