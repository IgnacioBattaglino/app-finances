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

// COLOR (migración 0046): puramente de presentación, para distinguir varias
// tarjetas de un vistazo (PaymentCardVisual). Es una paleta PROPIA y no la de
// `theme.js` — ni la de los grupos de activos (ACCENTS) ni la del acento de la
// app: los grupos y el acento son colores que el usuario elige libremente,
// mientras que una tarjeta se parece a una tarjeta física, con sus colores
// fijos. `bg`/`text` ya vienen elegidos para pasar contraste AA con texto
// encima; `border` solo lo llevan la negra y la blanca, porque son las dos que
// se confunden con las superficies de la app (`card`/`paper`) en alguno de los
// dos modos — las demás ya contrastan solas contra cualquier fondo.
export const CARD_COLORS = [
  { id: 'blue', name: 'Azul', bg: '#1d3a8a', text: '#ffffff' },
  { id: 'red', name: 'Roja', bg: '#7a1f2b', text: '#ffffff' },
  { id: 'black', name: 'Negra', bg: '#17181c', text: '#f2f2f2', border: 'rgba(255,255,255,0.16)' },
  { id: 'white', name: 'Blanca', bg: '#f5f5f0', text: '#1a1a1e', border: 'rgba(0,0,0,0.14)' },
  { id: 'gold', name: 'Dorada', bg: '#7d5f1c', text: '#ffffff' },
]

// Un id desconocido (una tarjeta sin color, o un valor de otra versión) cae a
// "sin color" — nunca a un color que nadie eligió.
export function getCardColor(id) {
  if (!id) return null
  return CARD_COLORS.find((c) => c.id === id) ?? null
}

export async function getCards() {
  const { data, error } = await supabase
    .from('payment_cards')
    .select('*')
    .order('position')
    .order('name')
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

function toRow({ name, dueDay, creditLimit, currency, color, last4 }) {
  return {
    name: name.trim(),
    // Los dos opcionales a propósito: quien no se acuerda del día de cierre de
    // su tarjeta tiene que poder cargarla igual. Sin día, cada compra usa su
    // propia fecha, que es lo que la app hacía hasta ahora.
    due_day: dueDay ?? null,
    credit_limit: creditLimit ?? null,
    currency: currency ?? 'ARS',
    color: color ?? null,
    // SOLO los últimos cuatro (migración 0047): el formulario ya descarta
    // cualquier valor incompleto antes de llegar acá, así que lo único que se
    // guarda es null o cuatro dígitos.
    last4: last4 ?? null,
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
