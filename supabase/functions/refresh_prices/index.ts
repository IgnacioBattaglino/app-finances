// Edge Function: refresh_prices
//
// Alimenta instrument_prices (precios diarios compartidos). La llama el cron
// diario (pg_cron -> pg_net) y también se usa para el backfill histórico.
//
// Modos:
//   - daily   (default): precio de HOY (fecha ART) para cada instrumento activo.
//               MEP -> dolarapi (misma fuente que usan hoy los formularios).
//               Binance -> ticker/price, una sola llamada batch con todos los
//               pares (?symbols=[...]). Es la fuente PRIMARIA de cripto (ver
//               ADR-006, "Cripto: unificado en Binance") -- histórico, diario
//               y precio en vivo de la app salen los tres de acá, sin
//               escalón entre orígenes.
//               CoinGecko -> simple/price. Fallback SOLO para instrumentos
//               cripto sin par de Binance conocido (source='coingecko'); hoy
//               ningún instrumento sembrado usa este camino.
//               data912 -> panel en vivo de BYMA (una llamada por panel, 4 fijas).
//   - backfill (?mode=backfill&days=365): serie histórica hacia atrás. `days`
//               solo afecta a mep -- Binance y data912 siempre traen historia
//               completa, y el fallback de CoinGecko usa un tope fijo (365,
//               ver COINGECKO_FALLBACK_DAYS), no 'max' (rechazado fuera de
//               plan pago).
//               MEP -> argentinadatos (dolarapi no da histórico).
//               Binance -> /klines, paginado de a BINANCE_KLINES_LIMIT velas
//               diarias por par, avanzando startTime hasta agotar la
//               historia (ver binanceBackfillOne). Límites de Binance mucho
//               más holgados que CoinGecko: las 13 monedas sembradas entran
//               cómodas en una sola invocación, sin necesitar el
//               batching/reintento progresivo que hizo falta para
//               sobrevivir al rate limit de CoinGecko.
//               CoinGecko -> fallback, market_chart con days=365 fijo, solo
//               para instrumentos cripto sin par de Binance.
//               data912 -> un request por instrumento, serie completa (data912
//               no soporta rango de fechas); ver data912BackfillTargets para
//               por qué esto NO recorre todo el catálogo activo (salvo
//               ?force=true, ver README).
//
// Idempotente: upsert por (instrument_id, date), en lotes (ver UPSERT_CHUNK_SIZE:
// con historia completa por ticker un solo upsert() podría ser demasiado
// grande). Correrla dos veces el mismo día no duplica ni corrompe nada. Si una
// fuente falla, se saltea SOLO esa fuente (se loguea) y el resto de la corrida
// sigue: un día sin precio es un hueco aceptable (la lectura lo resuelve con
// carry-forward).
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

// Reintentos ante 429 (rate limit) u otro error transitorio (5xx, fallo de
// red): espera creciente (5s, 10s) antes del 2do y 3er intento. Genérico --
// lo usan tanto el backfill de Binance (paginado) como el fallback de
// CoinGecko. Si se agotan, ese pedido se da por perdido y se loguea -- no
// mata la corrida.
const RETRY_MAX_ATTEMPTS = 3
const RETRY_BASE_MS = 5000

// Binance: límites MUCHO más holgados que CoinGecko para este volumen (peso
// por defecto ~6000/min sin API key; unas pocas decenas de requests de
// backfill no se acercan). No hace falta el delay largo que sí hacía falta
// para CoinGecko -- ver BINANCE_BACKFILL_DELAY_MS.
const BINANCE_KLINES_LIMIT = 1000
const BINANCE_BACKFILL_DELAY_MS = 300

// Fallback de cripto sin par de Binance: CoinGecko market_chart con un tope
// FIJO de días, nunca 'max' -- confirmado contra la API real que el plan
// público lo topea en ~365 días de todas formas, así que pedir 'max'
// explícitamente no suma nada (ese soporte queda en el tipo de
// coingeckoMarketChart por si algún día hay plan pago, pero no se usa).
const COINGECKO_FALLBACK_DAYS = 365

// Delay entre monedas del fallback de CoinGecko (rate limit público
// ~5-15 req/min). Hoy ningún instrumento sembrado ejercita este camino (los
// 13 tienen par de Binance); si en el futuro hay varios sin par, este delay
// evita repetir el problema que forzó a rediseñar el backfill viejo de
// CoinGecko (ver historial en git: WORKER_RESOURCE_LIMIT por sleep largo
// acumulado). Con pocos instrumentos de fallback esperables, no hace falta
// la infraestructura de batching/salteo que tuvo ese diseño.
const COINGECKO_BACKFILL_DELAY_MS = 6000

// Tamaño de lote para el upsert a instrument_prices. Con historia completa por
// ticker (data912 backfill puede traer miles de filas de un solo instrumento)
// un único upsert() con todo junto podría superar límites de tamaño/tiempo de
// PostgREST; en lotes es más seguro sin cambiar la semántica (sigue siendo
// idempotente por (instrument_id, date)).
const UPSERT_CHUNK_SIZE = 1000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Fecha de HOY en Argentina (UTC−3). El precio del día se guarda con la fecha
// ART, no la UTC, para que coincida con lo que ve el usuario.
function argentinaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date()) // en-CA => YYYY-MM-DD
}

// Convierte un timestamp (ms) a fecha ART YYYY-MM-DD. Usado por el fallback
// de CoinGecko (market_chart devuelve muestras a horas arbitrarias del día;
// bucketear por fecha ART tiene sentido para "qué vio el usuario ese día").
function msToArgentinaDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(ms))
}

// Fecha UTC (YYYY-MM-DD) de un timestamp. A diferencia de msToArgentinaDate,
// NO se corre a fecha ART: las velas diarias de Binance están definidas en
// UTC (00:00:00 a 23:59:59), así que la fecha "correcta" de una vela es su
// fecha UTC -- convertirla a ART correría TODAS las fechas un día para atrás
// (una vela abierta 2020-05-13T00:00:00Z cae en 2020-05-12 en ART).
function msToUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
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

// Como fetchJson, pero reintenta con espera creciente cuando la respuesta es
// 429 (rate limit) o 5xx, o cuando fetch tira una excepción de red -- casos
// transitorios donde reintentar más tarde suele alcanzar. Si se agotan los
// intentos, se comporta como fetchJson: loguea y devuelve null para que el
// llamador decida cómo seguir (ej. saltear esa moneda sin matar la corrida).
async function fetchJsonWithRetry(url: string, maxAttempts = RETRY_MAX_ATTEMPTS): Promise<unknown | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts
    try {
      const res = await fetch(url)

      if (res.status === 429 || res.status >= 500) {
        if (isLastAttempt) {
          console.error(`fetch ${url} -> HTTP ${res.status} (agotados los reintentos)`)
          return null
        }
        const waitMs = RETRY_BASE_MS * 2 ** (attempt - 1)
        console.error(`fetch ${url} -> HTTP ${res.status}, reintento ${attempt}/${maxAttempts} en ${waitMs}ms`)
        await sleep(waitMs)
        continue
      }

      if (!res.ok) {
        console.error(`fetch ${url} -> HTTP ${res.status}`)
        return null
      }

      return await res.json()
    } catch (e) {
      if (isLastAttempt) {
        console.error(`fetch ${url} -> ${(e as Error).message} (agotados los reintentos)`)
        return null
      }
      const waitMs = RETRY_BASE_MS * 2 ** (attempt - 1)
      console.error(`fetch ${url} -> ${(e as Error).message}, reintento ${attempt}/${maxAttempts} en ${waitMs}ms`)
      await sleep(waitMs)
    }
  }
  return null
}

type Instrument = {
  id: string
  source: string
  symbol: string
  kind: string
}

type PriceRow = { instrument_id: string; date: string; price: number }

type SupabaseClient = ReturnType<typeof createClient>

// Sube filas a instrument_prices en lotes (ver UPSERT_CHUNK_SIZE). Todas las
// fuentes acumulan sus filas en memoria y el handler upsertea una sola vez al
// final de cada una.
async function upsertPriceRows(supabase: SupabaseClient, rows: PriceRow[]): Promise<void> {
  if (rows.length === 0) return
  const stamped = rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() }))
  for (let i = 0; i < stamped.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = stamped.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await supabase
      .from('instrument_prices')
      .upsert(chunk, { onConflict: 'instrument_id,date' })
    if (error) throw new Error(error.message)
  }
}

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

// Backfill FALLBACK: solo para instrumentos cripto sin par de Binance (ver
// ADR-006). Una llamada market_chart POR moneda, con reintento ante 429/5xx.
// days queda tipado 'number | max' por si algún día hay plan pago que sí
// soporte 'max' (historia completa); HOY se llama siempre con
// COINGECKO_FALLBACK_DAYS (365) porque el plan público topea ahí de todas
// formas. NO pasamos interval=daily: en la API pública ese parámetro es de
// plan enterprise; con days>90 la granularidad diaria ya viene por default.
//
// Sin batching ni salteo de completas (a diferencia del backfill de Binance
// de abajo, o del backfill de CoinGecko viejo antes de este cambio): el
// volumen esperado acá es bajo (instrumentos sin par de Binance, hoy
// ninguno), así que no hace falta esa infraestructura.
async function coingeckoMarketChart(inst: Instrument, days: number | 'max'): Promise<PriceRow[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${inst.symbol}/market_chart?vs_currency=usd&days=${days}`
  const data = (await fetchJsonWithRetry(url)) as { prices?: [number, number][] } | null
  const byDate = new Map<string, number>()
  if (data?.prices) {
    for (const [ms, price] of data.prices) byDate.set(msToArgentinaDate(ms), price)
  }
  return [...byDate].map(([date, price]) => ({ instrument_id: inst.id, date, price }))
}

async function coingeckoBackfill(instruments: Instrument[]): Promise<PriceRow[]> {
  const rows: PriceRow[] = []
  for (let idx = 0; idx < instruments.length; idx++) {
    const inst = instruments[idx]
    const coinRows = await coingeckoMarketChart(inst, COINGECKO_FALLBACK_DAYS)
    if (coinRows.length === 0) console.error(`CoinGecko fallback: sin datos para ${inst.symbol}`)
    else rows.push(...coinRows)
    if (idx < instruments.length - 1) await sleep(COINGECKO_BACKFILL_DELAY_MS)
  }
  return rows
}

// ── Binance (fuente primaria de cripto) ─────────────────────────────────────
// Histórico, diario y precio en vivo de la app salen los tres de Binance, sin
// escalón entre orígenes (ver ADR-006, "Cripto: unificado en Binance"). El
// catálogo guarda symbol = par de Binance (ej. 'BTCUSDT') para
// source='binance'.

// Diario: UNA sola llamada ticker/price batch para todos los pares del
// catálogo (?symbols=["BTCUSDT",...]). Precio = último operado.
async function binanceDaily(instruments: Instrument[], date: string): Promise<PriceRow[]> {
  const symbols = instruments.map((i) => i.symbol)
  const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
  const data = (await fetchJson(url)) as { symbol: string; price: string }[] | null
  if (!Array.isArray(data)) throw new Error('Binance ticker/price devolvió no-array')
  const bySymbol = new Map(data.map((row) => [row.symbol, Number(row.price)]))
  const rows: PriceRow[] = []
  for (const inst of instruments) {
    const price = bySymbol.get(inst.symbol)
    if (typeof price === 'number') rows.push({ instrument_id: inst.id, date, price })
    else console.error(`Binance sin precio para ${inst.symbol}`)
  }
  return rows
}

// Un kline de /api/v3/klines: [openTime, open, high, low, close, volume,
// closeTime, ...resto sin usar]. Solo nos interesan openTime (índice 0, para
// la fecha) y close (índice 4).
type BinanceKline = [number, string, string, string, string, string, number, ...unknown[]]

// Pagina /klines de a BINANCE_KLINES_LIMIT velas diarias por instrumento,
// avanzando startTime al closeTime de la última vela +1ms hasta que una
// página vuelve con menos del límite (fin de la historia real del par). Nos
// quedamos con el cierre y la fecha UTC de cada vela (ver msToUtcDate).
async function binanceBackfillOne(inst: Instrument): Promise<PriceRow[]> {
  const rows: PriceRow[] = []
  let startTime = 0
  for (;;) {
    const url =
      `https://api.binance.com/api/v3/klines?symbol=${inst.symbol}` +
      `&interval=1d&startTime=${startTime}&limit=${BINANCE_KLINES_LIMIT}`
    const data = (await fetchJsonWithRetry(url)) as BinanceKline[] | null
    if (!Array.isArray(data) || data.length === 0) break

    for (const k of data) {
      rows.push({ instrument_id: inst.id, date: msToUtcDate(k[0]), price: Number(k[4]) })
    }

    if (data.length < BINANCE_KLINES_LIMIT) break
    startTime = data[data.length - 1][6] + 1
    await sleep(BINANCE_BACKFILL_DELAY_MS)
  }
  return rows
}

// Backfill: pagina por instrumento (ver binanceBackfillOne). Rápido -- límites
// de Binance mucho más holgados que CoinGecko -- así que las 13 monedas
// sembradas entran cómodas en una sola invocación: a diferencia del backfill
// de CoinGecko de antes de este cambio, no hace falta upsert incremental por
// moneda ni batching por ?limit=N. Se acumula todo y se upsertea una sola vez
// (mismo patrón que data912Backfill).
async function binanceBackfill(instruments: Instrument[]): Promise<PriceRow[]> {
  const rows: PriceRow[] = []
  for (let idx = 0; idx < instruments.length; idx++) {
    const inst = instruments[idx]
    const coinRows = await binanceBackfillOne(inst)
    if (coinRows.length === 0) console.error(`Binance: sin historia para ${inst.symbol}`)
    else rows.push(...coinRows)
    if (idx < instruments.length - 1) await sleep(BINANCE_BACKFILL_DELAY_MS)
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

// ── data912 (acciones argentinas, CEDEARs y bonos — BYMA) ──────────────────────
// Sin API key, sin rate limit observado en el reconocimiento. El panel en vivo
// trae TODO el panel en una sola llamada (no hay endpoint por ticker); el
// histórico es al revés: un request POR ticker, y sin soporte de rango de
// fechas -- siempre devuelve la serie completa.
//
// CRÍTICO: un ticker inexistente en /historical responde HTTP 200 con
// {"Error": "..."} en el body, NUNCA 404. fetchJson ya devuelve ese objeto tal
// cual (res.ok es true), así que acá SIEMPRE hay que validar que la respuesta
// sea un array antes de tratarla como serie de precios.

const DATA912_PANEL_BY_KIND: Record<string, string> = {
  stock: 'arg_stocks',
  cedear: 'arg_cedears',
  bond: 'arg_bonds',
  corp_bond: 'arg_corp',
}

// Solo stock/cedear/bond tienen histórico en data912. corp_bond (obligaciones
// negociables) no tiene endpoint /historical -- confirmado en el reconocimiento;
// hoy además no hay ningún instrumento sembrado con ese kind, queda preparado
// para cuando se sume el primero.
const DATA912_HISTORICAL_PATH_BY_KIND: Record<string, string> = {
  stock: 'stocks',
  cedear: 'cedears',
  bond: 'bonds',
}

type Data912LiveRow = { symbol: string; c: number }
type Data912HistoricalRow = { date: string; c: number }

// Diario: una llamada por panel (las 4 fijas, siempre, aunque hoy no haya
// ningún instrumento activo de un kind puntual -- así no hace falta redeployar
// el día que se sume el primer corp_bond). El precio que usamos es 'c' (último
// operado), en ARS.
async function data912Daily(instruments: Instrument[], date: string): Promise<PriceRow[]> {
  const panels = [...new Set(Object.values(DATA912_PANEL_BY_KIND))]
  const priceByPanel = new Map<string, Map<string, number>>()

  for (const panel of panels) {
    const data = (await fetchJson(`https://data912.com/live/${panel}`)) as Data912LiveRow[] | null
    const bySymbol = new Map<string, number>()
    if (Array.isArray(data)) {
      for (const row of data) {
        if (typeof row.c === 'number') bySymbol.set(row.symbol, row.c)
      }
    } else {
      console.error(`data912 /live/${panel} no devolvió un array`)
    }
    priceByPanel.set(panel, bySymbol)
  }

  const rows: PriceRow[] = []
  for (const inst of instruments) {
    const panel = DATA912_PANEL_BY_KIND[inst.kind]
    const price = panel ? priceByPanel.get(panel)?.get(inst.symbol) : undefined
    if (typeof price === 'number') rows.push({ instrument_id: inst.id, date, price })
    else console.error(`data912 sin precio para ${inst.symbol} (kind '${inst.kind}')`)
  }
  return rows
}

// El backfill NO recorre todo el catálogo data912 activo (podrían ser cientos
// de CEDEARs si el catálogo crece): solo trae historia para instrumentos que
// ya usa algún usuario (assets.instrument_id) o que ya tienen precios cargados
// (para completar huecos o extender la serie de una corrida anterior). El
// resto queda sin historia hasta que alguien lo use -- momento en el que el
// próximo backfill ya lo va a levantar. ?force=true en el request salta este
// filtro (ver handler) y backfillea todos los instrumentos data912 activos.
async function data912BackfillTargets(
  supabase: SupabaseClient,
  candidates: Instrument[],
): Promise<Instrument[]> {
  const ids = candidates.map((i) => i.id)
  if (ids.length === 0) return []

  const [{ data: assetRows }, { data: priceRows }] = await Promise.all([
    supabase.from('assets').select('instrument_id').in('instrument_id', ids),
    supabase.from('instrument_prices').select('instrument_id').in('instrument_id', ids),
  ])

  const usedIds = new Set<string>()
  for (const r of (assetRows ?? []) as { instrument_id: string | null }[]) {
    if (r.instrument_id) usedIds.add(r.instrument_id)
  }
  for (const r of (priceRows ?? []) as { instrument_id: string }[]) {
    usedIds.add(r.instrument_id)
  }

  return candidates.filter((i) => usedIds.has(i.id))
}

// Backfill: un request por instrumento a /historical/{stocks|cedears|bonds}/{symbol}.
// Guarda TODA la historia que devuelve -- data912 ignora parámetros de rango de
// fecha, siempre trae la serie completa -- y nos quedamos con cierre (c) y
// fecha del OHLC diario. corp_bond no tiene histórico: se saltea sin error. Si
// un ticker puntual falla o no existe, se saltea SOLO ese (se loguea) y sigue
// con el resto -- mismo criterio que las fuentes a nivel superior.
async function data912Backfill(instruments: Instrument[]): Promise<PriceRow[]> {
  const rows: PriceRow[] = []
  for (const inst of instruments) {
    const path = DATA912_HISTORICAL_PATH_BY_KIND[inst.kind]
    if (!path) {
      console.log(`data912 ${inst.symbol}: sin histórico para kind '${inst.kind}', salteado`)
      continue
    }
    const data = await fetchJson(`https://data912.com/historical/${path}/${inst.symbol}`)
    // Ticker inexistente => HTTP 200 con {"Error": "..."}, no un array. Nunca
    // alcanza con mirar res.ok (fetchJson ya lo hizo): hay que chequear acá la
    // forma de la respuesta antes de tratarla como serie.
    if (!Array.isArray(data)) {
      console.error(`data912 histórico sin datos para ${inst.symbol}: ${JSON.stringify(data)}`)
      continue
    }
    for (const day of data as Data912HistoricalRow[]) {
      if (day.date && typeof day.c === 'number') {
        rows.push({ instrument_id: inst.id, date: day.date, price: day.c })
      }
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
  // Solo afecta a mep: Binance y data912 siempre traen historia completa, y
  // el fallback de CoinGecko usa un tope fijo (COINGECKO_FALLBACK_DAYS).
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 365))
  // Salteo explícito de data912BackfillTargets: backfillea TODOS los
  // instrumentos data912 activos, no solo los ya usados/con precios. Ver
  // README para cuándo usarlo (arranque de instrumentos recién sembrados).
  const force = url.searchParams.get('force') === 'true'

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: instruments, error: instErr } = await supabase
    .from('instruments')
    .select('id, source, symbol, kind')
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
      if (source === 'binance') {
        rows = mode === 'backfill' ? await binanceBackfill(list) : await binanceDaily(list, today)
      } else if (source === 'coingecko') {
        // Fallback: instrumentos cripto sin par de Binance (ver ADR-006).
        // Hoy ninguno de los sembrados cae acá, los 13 tienen par confirmado.
        rows = mode === 'backfill' ? await coingeckoBackfill(list) : await coingeckoDaily(list, today)
      } else if (source === 'mep') {
        rows = mode === 'backfill' ? await mepBackfill(list, days) : await mepDaily(list, today)
      } else if (source === 'data912') {
        if (mode === 'backfill') {
          const targets = force ? list : await data912BackfillTargets(supabase, list)
          rows = await data912Backfill(targets)
        } else {
          rows = await data912Daily(list, today)
        }
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

      await upsertPriceRows(supabase, rows)
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
