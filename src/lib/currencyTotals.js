import { round } from './money.js'

// La moneda del día a día. La app la nombra una sola vez, acá: todo lo demás
// pregunta "¿es la local?" en vez de escribir 'ARS'. Es el mismo criterio que
// lib/localCurrency.js, que es el único lugar que sabe qué cotización la
// convierte a dólares — cuando la app se lance en otro país se cambian estas
// dos constantes y nada más.
export const LOCAL_CURRENCY = 'ARS'

// Un monto repartido en monedas, listo para MOSTRAR: una línea por moneda, la
// local primero. Pura y testeable; recibe un Map (o cualquier iterable de
// pares) moneda → monto, como el que devuelve totalsByCurrency.
//
// ── POR QUÉ UNA MONEDA EN CERO NO SE MUESTRA ───────────────────────────────
// Es el caso NORMAL, no el raro: los dólares se compran para guardarlos, no
// para gastarlos en el día a día, así que casi todos los meses el gasto en
// dólares es exactamente 0. Una línea "US$ 0" fija debajo de cada número
// convertiría esa normalidad en ruido permanente — el mismo criterio con el
// que "Deudas" no aparece sin deudas y "Dinero ahorrado" no aparece en cero.
//
// La consecuencia buscada es más fuerte que ahorrar una línea: con datos SOLO
// en pesos, todo lo que usa esto devuelve UNA línea en pesos y se ve
// exactamente igual que antes de que existiera este módulo.
//
// ── POR QUÉ EL CERO LOCAL SÍ SOBREVIVE, PERO SOLO SI NO HAY OTRO ───────────
// Si no queda ninguna línea, el resultado no es "no mostrar nada": un total
// vacío se muestra en cero, en la moneda local, que es lo que hacía la app
// cuando no tenía ningún dato. Pero si hay otra moneda con saldo, el cero
// local tampoco se muestra: quien tiene todo en dólares no necesita que le
// repitan que no tiene pesos.
export function currencyLines(totals) {
  const lines = [...totals]
    .map(([currency, amount]) => ({ currency, amount: round(amount) }))
    // Medio centavo: por debajo de eso, cualquier moneda es cero — es el mismo
    // umbral con el que decideAdjustment decide que no hay diferencia.
    .filter((line) => Math.abs(line.amount) >= 0.005)
    .sort(sortByCurrency)

  return lines.length > 0 ? lines : [{ currency: LOCAL_CURRENCY, amount: 0 }]
}

// La local primero porque es la unidad en la que se piensa el día a día; el
// resto alfabético, que con dos monedas es un desempate y con más es un orden
// estable (nunca el monto: una lista que se reordena sola cuando cambia un
// saldo es imposible de leer de un vistazo).
function sortByCurrency(a, b) {
  if (a.currency === b.currency) return 0
  if (a.currency === LOCAL_CURRENCY) return -1
  if (b.currency === LOCAL_CURRENCY) return 1
  return a.currency < b.currency ? -1 : 1
}

// Un monto que está en DÓLARES, expresado en `currency` con la tasa que quedó
// congelada en su fila. Es la regla del disponible en una línea, y vive acá
// porque la aplican dos módulos (lib/liquid.js y lib/movements.js) y la
// replica la función SQL get_liquid_by_account — una tercera copia suelta era
// la forma segura de que una de las tres se olvidara.
//
// A una cuenta en dólares el monto entra TAL CUAL: la operación no convirtió
// nada, y multiplicarla por el MEP metería pesos adentro de un saldo en
// dólares (era el bug que arregla la migración 0039). A cualquier otra entra
// convertido con su tasa, que es la conversión que de verdad ocurrió ese día
// (ADR-013).
//
// Una tasa ausente da 0, igual que antes: no se inventa una cotización de hoy
// para una operación de hace meses.
export function amountInCurrency(amountUsd, mepRate, currency) {
  return currency === 'USD' ? amountUsd : amountUsd * mepRate
}

// ¿Hay algo que mostrar? Un conjunto de líneas que es solo el cero local es
// "nada": lo usan las tarjetas que directamente no aparecen sin saldo.
export function hasAmount(lines) {
  return lines.some((line) => Math.abs(line.amount) >= 0.005)
}
