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
  if (!ratesPromise) ratesPromise = loadRates()
  return ratesPromise
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
