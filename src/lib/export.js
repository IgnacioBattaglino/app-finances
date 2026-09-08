import { supabase } from './supabase.js'
import { todayISO } from './format.js'

// Exportación de los datos propios a CSV, para abrir en una planilla.
//
// Formato pensado para Excel en español, que es el consumidor más frágil:
// separador PUNTO Y COMA y coma decimal (con coma de separador, un monto
// "1234,5" partiría la columna al medio), y BOM al principio para que los
// acentos no salgan rotos. Google Sheets detecta el punto y coma solo.
//
// Los montos van sin separador de miles a propósito: con "1.234,50" la
// planilla los toma como texto y no se pueden sumar.
//
// Las filas salen con NOMBRES (categoría, activo, grupo), no con los uuid:
// un CSV lleno de identificadores no le sirve a nadie fuera de la app.

const DELIMITER = ';'

// PostgREST corta cualquier consulta en 1000 filas sin avisar. Una
// exportación es, por definición, todo el historial -- así que en vez de
// pedir todo de una, se pagina con `.range()` hasta que una página vuelve con
// menos de PAGE_SIZE filas (la señal de que ya no queda nada más).
//
// `buildQuery` recibe el (from, to) de la página y devuelve la consulta ya
// armada, ordenada de forma ESTABLE (con un desempate único, como `id`): sin
// eso, dos filas con el mismo valor en las columnas de orden podrían caer las
// dos en una página y ninguna en la otra, o repetirse en las dos.
const PAGE_SIZE = 1000

async function fetchAllPages(buildQuery) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows
    from += PAGE_SIZE
  }
}

function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  // Solo hace falta encomillar si el valor trae el separador, comillas o un
  // salto de línea (una descripción puede tener cualquiera de los tres).
  if (text.includes(DELIMITER) || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(DELIMITER)).join('\r\n')
}

// dd/mm/aaaa: las fechas de la base son 'YYYY-MM-DD' planas, así que se
// parten a mano en vez de pasarlas por Date (que las interpreta en UTC y
// puede correrlas un día según la zona horaria).
export function csvDate(iso) {
  if (!iso) return ''
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

export function csvNumber(value) {
  if (value === null || value === undefined || value === '') return ''
  return String(value).replace('.', ',')
}

export async function getTransactionsForExport() {
  return fetchAllPages((from, to) =>
    supabase
      .from('transactions')
      .select('date, kind, description, amount, category:categories(name)')
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
}

export function transactionsCsv(transactions) {
  return toCsv(
    ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto ARS'],
    transactions.map((tx) => [
      csvDate(tx.date),
      tx.kind === 'expense' ? 'Gasto' : 'Ingreso',
      tx.category?.name ?? '',
      tx.description ?? '',
      csvNumber(tx.amount),
    ]),
  )
}

export async function getPortfolioOperationsForExport() {
  return fetchAllPages((from, to) =>
    supabase
      .from('contributions')
      .select(
        'date, direction, amount_usd, quantity, mep_rate, affects_liquid, realized_gain, transfer_id, asset:assets(name, asset_type:asset_types(name))',
      )
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
}

export function portfolioCsv(operations) {
  return toCsv(
    [
      'Fecha',
      'Activo',
      'Grupo',
      'Operación',
      'Monto USD',
      'Cantidad',
      'Tipo de cambio',
      'De dónde sale',
      'Ganancia realizada USD',
      'Parte de una transferencia',
    ],
    operations.map((op) => [
      csvDate(op.date),
      op.asset?.name ?? '',
      op.asset?.asset_type?.name ?? '',
      op.direction === 'out' ? 'Retiro' : 'Aporte',
      csvNumber(op.amount_usd),
      csvNumber(op.quantity),
      csvNumber(op.mep_rate),
      op.affects_liquid ? 'De mi disponible' : 'De afuera',
      csvNumber(op.realized_gain),
      op.transfer_id ? 'Sí' : 'No',
    ]),
  )
}

// Guarda el CSV. En el celular usa la hoja de compartir del sistema, que es
// la forma natural de mandarlo a Archivos, Drive o un mail; en el escritorio,
// la descarga común.
//
// El gate NO puede ser solo `navigator.canShare({ files })`: en Chrome de
// escritorio eso da true, pero `navigator.share` se queda colgada sin
// resolver nunca ni rechazar, así que la pantalla queda en "Generando…" para
// siempre y el archivo no baja. Por eso se pide ADEMÁS puntero grueso, que es
// lo que distingue un touch de un mouse.
//
// Ojo: navigator.share exige que el gesto del usuario siga "fresco", así que
// esto tiene que llamarse en el click SIN un await de datos en el medio — por
// eso la pantalla de exportar trae los datos al entrar y no al tocar el botón.
function canUseShareSheet(file) {
  return (
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] }) &&
    window.matchMedia?.('(pointer: coarse)').matches
  )
}

export async function saveCsv(filename, csv) {
  // El BOM es lo que hace que Excel lea el archivo como UTF-8
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })

  if (typeof File === 'function') {
    const file = new File([blob], filename, { type: 'text/csv' })
    if (canUseShareSheet(file)) {
      try {
        await navigator.share({ files: [file], title: filename })
        return 'shared'
      } catch (e) {
        // Cancelar la hoja de compartir no es un error que haya que mostrar
        if (e.name === 'AbortError') return 'cancelled'
        // Cualquier otra falla cae a la descarga común, abajo
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revocar en el acto corta la descarga en algunos navegadores
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'downloaded'
}

export function exportFilename(prefix) {
  return `${prefix}-${todayISO()}.csv`
}
