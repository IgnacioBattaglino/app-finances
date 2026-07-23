// Edge Function: refresh_prices
//
// Alimenta instrument_prices (precios diarios compartidos). La llama el cron
// diario (pg_cron -> pg_net) y también se usa para el backfill histórico.
//
// Modos:
//   - daily   (default): precio de HOY (fecha ART) para cada instrumento activo.
//               MEP -> dolarapi (misma fuente que usan hoy los formularios).
//               Cripto -> CoinGecko simple/price (una llamada para todos los ids).
//   - backfill (?mode=backfill&days=365): serie histórica hacia atrás.
//               MEP -> argentinadatos (dolarapi no da histórico).
//               Cripto -> CoinGecko market_chart (una llamada por moneda, con
//               rate limiting explícito entre monedas).
//
// Idempotente: upsert por (instrument_id, date). Correrla dos veces el mismo
// día no duplica ni corrompe nada. Si una fuente falla, se saltea SOLO esa
// fuente (se loguea) y el resto de la corrida sigue: un día sin precio es un
// hueco aceptable (la lectura lo resuelve con carry-forward).
//
// Seguridad: escribe con SUPABASE_SERVICE_ROLE_KEY (bypassa RLS; único
// escritor de instrument_prices). Protegida por CRON_SECRET (bearer): sin el
// header correcto responde 401.
//
// Deploy y variables: ver supabase/functions/refresh_prices/README.md

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

// Rate limiting de la API pública de CoinGecko (sin API key): ~5-15 req/min.
// Dejamos un colchón amplio entre llamadas del backfill (una por moneda).
const COINGECKO_BACKFILL_DELAY_MS = 2500

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Fecha de HOY en Argentina (UTC−3). El precio del día se guarda con la fecha
// ART, no la UTC, para que coincida con lo que ve el usuario.
function argentinaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date()) // en-CA => YYYY-MM-DD
}

// Convierte un timestamp (ms) a fecha ART YYYY-MM-DD.
function msToArgentinaDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(ms))
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`fetch ${url} -> HTTP ${res.status}`)
      return null
    }
    return await res.json()
  } catch (e) {
    console.error(`fetch ${url} -> ${(e as Error).message}`)
    return null
  }
}

type Instrument = {
  id: string
  source: string
  symbol: string
}

type PriceRow = { instrument_id: string; date: string; price: number }

// ── CoinGecko ────────────────────────────────────────────────────────────────

// Diario: una sola llamada simple/price para todos los ids.
async function coingeckoDaily(instruments: Instrument[], date: string): Promise<PriceRow[]> {
  const ids = instruments.map((i) => i.symbol)
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
  const data = (await fetchJson(url)) as Record<string, { usd?: number }> | null
  if (!data) throw new Error('CoinGecko simple/price devolvió null')
  const rows: PriceRow[] = []
  for (const inst of instruments) {
    const price = data[inst.symbol]?.usd
    if (typeof price === 'number') rows.push({ instrument_id: inst.id, date, price })
    else console.error(`CoinGecko sin precio para ${inst.symbol}`)
  }
  return rows
}

// Backfill: una llamada market_chart POR moneda (con delay entre monedas).
// Devuelve prices [[ms, price], ...]. NO pasamos interval=daily: en la API
// pública de CoinGecko ese parámetro es de plan enterprise; con days>90 la
// granularidad diaria ya viene por default, que es justo lo que pedimos (365).
async function coingeckoBackfill(instruments: Instrument[], days: number): Promise<PriceRow[]> {
  const rows: PriceRow[] = []
  for (let idx = 0; idx < instruments.length; idx++) {
    const inst = instruments[idx]
    const url =
      `https://api.coingecko.com/api/v3/coins/${inst.symbol}/market_chart` +
      `?vs_currency=usd&days=${days}`
    const data = (await fetchJson(url)) as { prices?: [number, number][] } | null
    if (data?.prices) {
      // Una fila por fecha ART (última muestra del día gana).
      const byDate = new Map<string, number>()
      for (const [ms, price] of data.prices) byDate.set(msToArgentinaDate(ms), price)
      for (const [date, price] of byDate) rows.push({ instrument_id: inst.id, date, price })
    } else {
      console.error(`CoinGecko market_chart sin datos para ${inst.symbol}`)
    }
    if (idx < instruments.length - 1) await sleep(COINGECKO_BACKFILL_DELAY_MS)
  }
  return rows
}

// ── Dólar MEP ─────────────────────────────────────────────────────────────────

// Diario: dolarapi (misma fuente que la app). Devuelve solo la cotización actual.
async function mepDaily(instruments: Instrument[], date: string): Promise<PriceRow[]> {
  const data = (await fetchJson('https://dolarapi.com/v1/dolares/bolsa')) as
    | { venta?: number }
    | null
  if (!data || typeof data.venta !== 'number') throw new Error('dolarapi bolsa sin venta')
  return instruments.map((inst) => ({ instrument_id: inst.id, date, price: data.venta! }))
}

// Backfill: argentinadatos (serie histórica diaria en una sola llamada).
async function mepBackfill(instruments: Instrument[], days: number): Promise<PriceRow[]> {
  const data = (await fetchJson(
    'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa',
  )) as { fecha?: string; venta?: number }[] | null
  if (!Array.isArray(data)) throw new Error('argentinadatos bolsa devolvió no-array')
  const cutoff = new Date(Date.now() - days * 86400000)
  const rows: PriceRow[] = []
  for (const row of data) {
    if (!row.fecha || typeof row.venta !== 'number') continue
    if (new Date(row.fecha) < cutoff) continue
    for (const inst of instruments) {
      rows.push({ instrument_id: inst.id, date: row.fecha, price: row.venta })
    }
  }
  return rows
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Auth: bearer == CRON_SECRET.
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') === 'backfill' ? 'backfill' : 'daily'
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 365))

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: instruments, error: instErr } = await supabase
    .from('instruments')
    .select('id, source, symbol')
    .eq('is_active', true)

  if (instErr) {
    console.error(`No se pudo leer instruments: ${instErr.message}`)
    return new Response(JSON.stringify({ error: instErr.message }), { status: 500 })
  }

  // Agrupar por source: una tanda de llamadas por fuente.
  const bySource = new Map<string, Instrument[]>()
  for (const inst of instruments as Instrument[]) {
    if (!bySource.has(inst.source)) bySource.set(inst.source, [])
    bySource.get(inst.source)!.push(inst)
  }

  const today = argentinaToday()
  const summary: Record<string, unknown> = { mode, sources: {} }

  for (const [source, list] of bySource) {
    try {
      let rows: PriceRow[] = []
      if (source === 'coingecko') {
        rows = mode === 'backfill' ? await coingeckoBackfill(list, days) : await coingeckoDaily(list, today)
      } else if (source === 'mep') {
        rows = mode === 'backfill' ? await mepBackfill(list, days) : await mepDaily(list, today)
      } else {
        // 'pending' u otras fuentes sin proveedor: no debería llegar acá porque
        // están is_active=false, pero por las dudas se saltea sin romper.
        console.log(`source '${source}' sin proveedor, salteada`)
        ;(summary.sources as Record<string, unknown>)[source] = 'skipped (sin proveedor)'
        continue
      }

      if (rows.length === 0) {
        ;(summary.sources as Record<string, unknown>)[source] = 'sin filas'
        continue
      }

      // Upsert idempotente por (instrument_id, date).
      const stamped = rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() }))
      const { error: upErr } = await supabase
        .from('instrument_prices')
        .upsert(stamped, { onConflict: 'instrument_id,date' })
      if (upErr) throw new Error(upErr.message)

      ;(summary.sources as Record<string, unknown>)[source] = `${rows.length} filas`
    } catch (e) {
      // Falla de una fuente: se loguea y se sigue con las demás.
      console.error(`source '${source}' falló: ${(e as Error).message}`)
      ;(summary.sources as Record<string, unknown>)[source] = `error: ${(e as Error).message}`
    }
  }

  console.log(JSON.stringify(summary))
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
