import { supabase } from './supabase.js'

// Conversión de moneda local a dólares — el ÚNICO lugar del código que la
// hace. Hoy la resuelve el dólar MEP (instruments source='mep', symbol='mep',
// serie diaria en instrument_prices); el día que la app sirva otro país, se
// cambia acá adentro y en ningún otro lado — nada más en la app conoce la
// palabra "MEP". La serie se trae una sola vez por sesión (promise cacheada)
// y se reusa en cada conversión.
let ratesPromise = null

// Margen hacia atrás de `from`, para el carry-forward: la cotización vigente
// en la fecha más vieja pedida puede ser de unos días antes (fin de semana,
// feriado, el MEP no cotiza todos los días). 10 días de sobra.
const CARRY_FORWARD_MARGIN_DAYS = 10

function daysBefore(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// `from`: la fecha más vieja que hace falta convertir (el consumidor de hoy
// es la serie de 12 meses de gastos de Inicio, ver monthlyUsdTotals). Sin
// acotar la consulta, PostgREST corta en 1000 filas sin avisar -- y como la
// serie es diaria desde hace años, ya se pasó ese límite. Pedir solo la
// ventana necesaria alcanza para no tocar el límite ni una vez.
async function loadRates(from) {
  const { data: instrument, error: instrumentError } = await supabase
    .from('instruments')
    .select('id')
    .eq('source', 'mep')
    .eq('symbol', 'mep')
    .single()
  if (instrumentError) throw instrumentError

  let query = supabase
    .from('instrument_prices')
    .select('date, price')
    .eq('instrument_id', instrument.id)
  if (from) query = query.gte('date', daysBefore(from, CARRY_FORWARD_MARGIN_DAYS))

  // Ordenada DESCENDENTE (más nueva primero) como cinturón de seguridad: si
  // por lo que fuera la ventana pedida tuviera más de 1000 cotizaciones, lo
  // que el corte de PostgREST se comería son las más VIEJAS, nunca las de
  // hoy -- que es al revés de como fallaba esto antes (ascendente y sin
  // límite: lo que se perdía eran justo las recientes). Se revierte antes de
  // devolver: el resto del módulo camina la serie de más vieja a más nueva.
  const { data: prices, error: pricesError } = await query
    .order('date', { ascending: false })
    .limit(1000)
  if (pricesError) throw pricesError
  if (prices.length === 0) throw new Error('No hay cotizaciones cargadas para convertir a dólares.')
  return prices.slice().reverse()
}

function getRates(from) {
  if (!ratesPromise) {
    // Se cachea la PROMESA para que varias conversiones en paralelo compartan
    // una sola consulta. Pero si falla, lo que quedaba cacheado era el
    // fracaso: cada reintento recibía la misma promesa ya rechazada y volvía
    // a fallar al instante, para siempre, hasta recargar la app entera — el
    // botón "Reintentar" del bloque de gastos no servía para nada. Por eso el
    // error limpia la caché antes de propagarse: lo que se guarda es el
    // resultado, no el intento.
    ratesPromise = loadRates(from).catch((e) => {
      ratesPromise = null
      throw e
    })
  }
  return ratesPromise
}

// Solo para tests: la caché es un módulo de por vida y no hay otra forma de
// devolverla a cero entre casos.
export function resetRatesCache() {
  ratesPromise = null
}

// Convierte un monto en moneda local a dólares, a la cotización vigente en
// `date` ('YYYY-MM-DD'): la última conocida en esa fecha o antes
// (carry-forward, mismo criterio que get_instrument_series). Si `date` es
// anterior a toda la serie, usa la cotización más vieja disponible.
//
// `from`: la fecha más vieja que este llamado (y los demás que comparten la
// caché de la sesión) va a pedir -- acota la consulta a esa ventana. Quien
// convierte una serie de fechas conocida de antemano (ver monthlyUsdTotals)
// la pasa siempre igual, así que la caché sigue sirviendo una sola consulta
// por sesión.
export async function localCurrencyToUsd(amountLocal, date, from) {
  const rates = await getRates(from)
  let rate = rates[0].price
  for (const r of rates) {
    if (r.date > date) break
    rate = r.price
  }
  return amountLocal / rate
}
