import { supabase } from './supabase.js'
import { UserError } from './errors.js'

// Conversión de moneda local a dólares — el ÚNICO lugar del cliente que la
// hace. La cotización de cada día la da la base (get_usd_rate, migración
// 0056): el dólar MEP del catálogo, vigente ese día (carry-forward). Nada más
// en la app conoce la palabra "MEP".
//
// Hasta la 0056 la búsqueda "cotización vigente ese día" se hacía acá, sobre
// una serie traída una vez por sesión — y esa caché guardaba la ventana de
// fechas de la PRIMERA llamada, así que quien después pedía una fecha anterior
// recibía en silencio la cotización más vieja que tuviera (D5 del informe).
// Ahora se cachea la respuesta de la base por fecha, que no tiene ventana.
const ratesByDate = new Map()

function getRate(date) {
  if (!ratesByDate.has(date)) {
    // Se cachea la PROMESA para que varias conversiones del mismo día
    // compartan una sola consulta; si falla, se borra antes de propagar el
    // error, para que "Reintentar" consulte de nuevo en vez de recibir el
    // mismo fracaso para siempre.
    const promise = supabase
      .rpc('get_usd_rate', { p_date: date })
      .then(({ data, error }) => {
        if (error) throw error
        if (data == null) throw new UserError('No hay cotizaciones cargadas para convertir a dólares.')
        return Number(data)
      })
      .catch((e) => {
        ratesByDate.delete(date)
        throw e
      })
    ratesByDate.set(date, promise)
  }
  return ratesByDate.get(date)
}

// Solo para tests: la caché es un módulo de por vida.
export function resetRatesCache() {
  ratesByDate.clear()
}

// DEFINICIÓN EJECUTABLE de get_usd_rate (la búsqueda que hacía este módulo
// hasta la 0056): la cotización vigente en `date` es la última conocida ese
// día o antes; si `date` es anterior a toda la serie, la más vieja. `rates`
// ordenadas de más vieja a más nueva. La corre monthlyUsdSql.test.js.
export function rateOn(rates, date) {
  let rate = rates[0].price
  for (const r of rates) {
    if (r.date > date) break
    rate = r.price
  }
  return rate
}

// Convierte un monto en moneda local a dólares, a la cotización vigente en
// `date` ('YYYY-MM-DD').
export async function localCurrencyToUsd(amountLocal, date) {
  return amountLocal / (await getRate(date))
}

// Como localCurrencyToUsd, pero para un monto que puede ya estar en dólares:
// 'USD' vuelve tal cual, cualquier otra moneda pasa por la conversión. Para
// sumar montos de distinta moneda a un mismo total (el Total de Inicio).
export async function toUsd(amountLocal, currency, date) {
  return currency === 'USD' ? amountLocal : localCurrencyToUsd(amountLocal, date)
}
