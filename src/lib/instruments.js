import { supabase } from './supabase.js'

// Catálogo COMPARTIDO de activos cotizables (instruments / instrument_prices,
// migración 0018; ver ADR-006). No lleva user_id: las mismas filas para todos,
// solo lectura desde la app — el único escritor es la Edge Function del cron.
//
// Este módulo es la única puerta al catálogo. Antes el vínculo entre un activo
// del usuario y su precio era un `coingecko_id` que se escribía a mano en el
// formulario: se podía escribir mal sin que nada avisara, y nunca completaba
// assets.instrument_id, así que el gráfico de evolución (que busca por
// instrumento) valuaba esos activos en 0. Ahora se elige de este catálogo y lo
// que se guarda es el instrument_id.

// El MEP no es un activo que alguien tenga: es la cotización con la que se
// traducen los precios en pesos. Nunca se ofrece en el buscador.
const CURRENCY_KIND = 'currency'

const KIND_LABELS = {
  crypto: 'Cripto',
  stock: 'Acción',
  etf: 'ETF',
  bond: 'Bono',
  cedear: 'CEDEAR',
  corp_bond: 'Obligación negociable',
  currency: 'Moneda',
}

export function instrumentKindLabel(kind) {
  return KIND_LABELS[kind] ?? kind
}

// Instrumentos que se le pueden ofrecer al usuario: los que el cron mantiene
// al día (is_active) y que representan una tenencia. Los 'pending' quedan
// afuera solos por is_active = false — son un placeholder de lo que todavía no
// tiene proveedor de precios, ofrecerlos sería prometer un precio que no llega.
//
// Son unas pocas decenas de filas: se traen enteras una vez y el buscador
// filtra en memoria, sin una consulta por tecla.
export async function getInstruments() {
  const { data, error } = await supabase
    .from('instruments')
    .select('id, source, symbol, name, kind, currency')
    .eq('is_active', true)
    .neq('kind', CURRENCY_KIND)
    .order('name')
  if (error) throw error
  return data
}

// Un instrumento puntual, para mostrar a qué está enganchado un activo ya
// guardado sin depender de que el catálogo entero esté cargado.
export async function getInstrument(id) {
  const { data, error } = await supabase
    .from('instruments')
    .select('id, source, symbol, name, kind, currency')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/-/g, ' ')
}

// Busca por nombre o por símbolo, sin acentos ni mayúsculas. Pura y testeable.
// Ordena poniendo primero lo que empieza con lo escrito (tipear "bit" tiene
// que traer Bitcoin arriba, no un nombre que lo menciona al pasar), y dentro
// de cada tramo, primero el match por símbolo: quien escribe "AL30" busca ese
// ticker exacto.
//
// El query se parte en palabras (por espacio; un guión cuenta como espacio,
// igual que en los nombres guardados) y cada palabra matchea por separado
// contra nombre o símbolo: así "Mercado Libre" encuentra "MercadoLibre" (cada
// palabra es substring del nombre pegado) y "coca cola" encuentra "Coca-Cola"
// sin que el guión o la falta de espacio en el dato lo bloqueen.
export function searchInstruments(instruments, query, limit = 8) {
  const q = normalize(query).trim()
  if (!q) return []
  const words = q.split(/\s+/).filter(Boolean)

  const scored = []
  for (const instrument of instruments) {
    const name = normalize(instrument.name)
    const symbol = normalize(instrument.symbol)
    const matches = words.every((word) => symbol.includes(word) || name.includes(word))
    if (!matches) continue
    const symbolStarts = symbol.startsWith(q)
    const nameStarts = name.startsWith(q)
    const score = symbolStarts ? 0 : nameStarts ? 1 : 2
    scored.push({ instrument, score })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.instrument.name.localeCompare(b.instrument.name))
    .slice(0, limit)
    .map((s) => s.instrument)
}

// Cuántos días hacia atrás se buscan cierres. Cubre feriados largos sin traer
// una ventana que compita con el tope de 1000 filas de PostgREST: son pocos
// instrumentos (los enganchados a activos del usuario), no el catálogo entero.
const CLOSE_LOOKBACK_DAYS = 30

function daysAgoISO(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

// Último precio conocido de cada instrumento pedido ->
// { [instrumentId]: { usd, native, currency, date } }.
//
// Sale de instrument_prices_usd (migración 0026), NO de instrument_prices: la
// vista ya devuelve el precio en dólares, convertido al MEP del día de ese
// precio. La app no convierte nada — ese es justamente el punto de la vista.
// Antes la conversión vivía acá y también, distinta, dentro de
// get_portfolio_series, y por eso el mismo activo valía dos cosas según dónde
// se lo mirara.
//
// `native` y `currency` viajan además del dólar porque el formulario de activo
// muestra el precio en la moneda en que cotiza el papel ("$ 7.070"), que es el
// número que el usuario reconoce para confirmar que eligió bien.
//
// Se descartan las filas sin price_usd: un instrumento en pesos sin cotización
// del dólar hasta esa fecha no tiene valor expresable en dólares, y el activo
// cae a su valuación manual igual que si la API estuviera caída.
//
// Carry-forward acotado: si un instrumento no cotizó en la ventana (feriados,
// suspensión), queda sin entrada y el activo cae a su valuación manual.
export async function getLatestInstrumentPrices(instrumentIds) {
  const ids = [...new Set(instrumentIds.filter(Boolean))]
  if (ids.length === 0) return {}

  const { data, error } = await supabase
    .from('instrument_prices_usd')
    .select('instrument_id, date, price_usd, price_native, native_currency')
    .in('instrument_id', ids)
    .gte('date', daysAgoISO(CLOSE_LOOKBACK_DAYS))
    .not('price_usd', 'is', null)
    .order('date', { ascending: false })
  if (error) throw error

  const latest = {}
  for (const row of data) {
    if (latest[row.instrument_id]) continue
    latest[row.instrument_id] = {
      usd: Number(row.price_usd),
      native: Number(row.price_native),
      currency: row.native_currency,
      date: row.date,
    }
  }
  return latest
}
