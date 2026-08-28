import { supabase } from './supabase.js'

// Conversión de moneda local a dólares — el ÚNICO lugar del código que la
// hace. Hoy la resuelve el dólar MEP (instruments source='mep', symbol='mep',
// serie diaria en instrument_prices); el día que la app sirva otro país, se
// cambia acá adentro y en ningún otro lado — nada más en la app conoce la
// palabra "MEP". La serie se trae una sola vez por sesión (promise cacheada)
// y se reusa en cada conversión.
let ratesPromise = null

async function loadRates() {
  const { data: instrument, error: instrumentError } = await supabase
    .from('instruments')
    .select('id')
    .eq('source', 'mep')
    .eq('symbol', 'mep')
    .single()
  if (instrumentError) throw instrumentError

  const { data: prices, error: pricesError } = await supabase
    .from('instrument_prices')
    .select('date, price')
    .eq('instrument_id', instrument.id)
    .order('date', { ascending: true })
  if (pricesError) throw pricesError
  if (prices.length === 0) throw new Error('No hay cotizaciones cargadas para convertir a dólares.')
  return prices
}

function getRates() {
  if (!ratesPromise) {
    // Se cachea la PROMESA para que varias conversiones en paralelo compartan
    // una sola consulta. Pero si falla, lo que quedaba cacheado era el
    // fracaso: cada reintento recibía la misma promesa ya rechazada y volvía
    // a fallar al instante, para siempre, hasta recargar la app entera — el
    // botón "Reintentar" del bloque de gastos no servía para nada. Por eso el
    // error limpia la caché antes de propagarse: lo que se guarda es el
    // resultado, no el intento.
    ratesPromise = loadRates().catch((e) => {
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
export async function localCurrencyToUsd(amountLocal, date) {
  const rates = await getRates()
  let rate = rates[0].price
  for (const r of rates) {
    if (r.date > date) break
    rate = r.price
  }
  return amountLocal / rate
}
