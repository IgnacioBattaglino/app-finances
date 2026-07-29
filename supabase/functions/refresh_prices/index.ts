// Edge Function: refresh_prices
//
// Alimenta instrument_prices (precios diarios compartidos). La llama el cron
// diario (pg_cron -> pg_net) y también se usa para el backfill histórico.
//
// Modos:
//   - daily   (default): precio de HOY (fecha ART) para cada instrumento activo.
//               MEP -> dolarapi (misma fuente que usan hoy los formularios).
//               Cripto -> CoinGecko simple/price (una llamada para todos los ids).
//               data912 -> panel en vivo de BYMA (una llamada por panel, 4 fijas).
//   - backfill (?mode=backfill&days=365): serie histórica hacia atrás. `days`
//               solo afecta a mep -- coingecko siempre pide historia completa
//               (days='max', igual criterio que data912; ver coingeckoBackfill).
//               MEP -> argentinadatos (dolarapi no da histórico).
//               Cripto -> CoinGecko market_chart, una llamada por moneda, con
//               reintento ante 429 y upsert INMEDIATO por moneda (no se
//               acumula todo en memoria): si la corrida se corta a mitad de
//               camino, lo ya guardado no se pierde. Además saltea monedas
//               que ya tienen historia profunda (coingeckoBackfillTargets),
//               así cada re-corrida avanza más lejos en vez de repetir las
//               mismas monedas y cortar en el mismo punto. Ver coingeckoBackfill.
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

// Rate limiting de la API pública de CoinGecko (sin API key): documentado como
// ~5-15 req/min. Con 2500ms (~24 req/min) el backfill terminaba rechazado por
// 429 a partir de la 6ta moneda: solo las primeras ~5 traían historia y el
// resto fallaba en silencio. 13000ms da ~4,6 req/min, con margen incluso
// contra el piso de ese rango.
const COINGECKO_BACKFILL_DELAY_MS = 13000

// Reintentos por moneda ante 429 (rate limit) u otro error transitorio (5xx,
// fallo de red): espera creciente (5s, 10s) antes del 2do y 3er intento. Si
// se agotan, esa moneda se da por perdida y se loguea -- no mata la corrida.
const COINGECKO_RETRY_MAX_ATTEMPTS = 3
const COINGECKO_RETRY_BASE_MS = 5000

// Umbral para decidir si una moneda "ya tiene historia" y el backfill la
// puede saltear (ver coingeckoBackfillTargets). El cron diario solo agrega UN
// día por corrida: si el precio más viejo guardado está a menos de este
// umbral de hoy, esa profundidad la pudo haber generado el cron solo con el
// paso del tiempo, no necesariamente un backfill -- no se saltea. Si está más
// lejos, es porque un backfill ya trajo historia real.
const COINGECKO_BACKFILL_COVERAGE_DAYS = 90

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

// Como fetchJson, pero reintenta con espera creciente cuando la respuesta es
// 429 (rate limit) o 5xx, o cuando fetch tira una excepción de red -- casos
// transitorios donde reintentar más tarde suele alcanzar. Si se agotan los
// intentos, se comporta como fetchJson: loguea y devuelve null para que el
// llamador decida cómo seguir (ej. saltear esa moneda sin matar la corrida).
async function fetchJsonWithRetry(
  url: string,
  maxAttempts = COINGECKO_RETRY_MAX_ATTEMPTS,
): Promise<unknown | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts
    try {
      const res = await fetch(url)

      if (res.status === 429 || res.status >= 500) {
        if (isLastAttempt) {
          console.error(`fetch ${url} -> HTTP ${res.status} (agotados los reintentos)`)
          return null
        }
        const waitMs = COINGECKO_RETRY_BASE_MS * 2 ** (attempt - 1)
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
      const waitMs = COINGECKO_RETRY_BASE_MS * 2 ** (attempt - 1)
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

// Sube filas a instrument_prices en lotes (ver UPSERT_CHUNK_SIZE). Compartido
// por el handler (fuentes que acumulan todo en memoria y upsertean al final)
// y por coingeckoBackfill (que upsertea moneda por moneda apenas la descarga).
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

// El backfill saltea monedas que ya tienen historia "de verdad" (ver
// COINGECKO_BACKFILL_COVERAGE_DAYS): sin esto, una corrida que se corta por
// timeout siempre vuelve a arrancar desde la primera moneda de la lista y
// corta más o menos en el mismo punto -- las últimas nunca llegan a
// backfillearse por más veces que se reintente. Con el filtro, cada
// re-corrida avanza más lejos que la anterior en vez de repetir trabajo.
// Un request por moneda (solo la fecha más vieja, LIMIT 1) -- mismo espíritu
// que data912BackfillTargets, pero acá no alcanza con "tiene algún precio":
// el cron diario también deja precios, solo que superficiales (un día por
// corrida), así que hay que mirar qué tan atrás llega esa historia.
async function coingeckoBackfillTargets(
  supabase: SupabaseClient,
  candidates: Instrument[],
): Promise<Instrument[]> {
  const today = Date.now()
  const targets: Instrument[] = []
  for (const inst of candidates) {
    const { data } = await supabase
      .from('instrument_prices')
      .select('date')
      .eq('instrument_id', inst.id)
      .order('date', { ascending: true })
      .limit(1)
    const earliest = (data as { date: string }[] | null)?.[0]?.date
    if (earliest) {
      const daysCovered = (today - new Date(earliest).getTime()) / 86400000
      if (daysCovered >= COINGECKO_BACKFILL_COVERAGE_DAYS) {
        console.log(
          `CoinGecko ${inst.symbol}: ya tiene historia desde ${earliest} (~${Math.floor(daysCovered)} días), salteado`,
        )
        continue
      }
    }
    targets.push(inst)
  }
  return targets
}

// Backfill: una llamada market_chart POR moneda (con delay entre monedas,
// más reintento con backoff ante 429/5xx -- ver fetchJsonWithRetry). NO
// pasamos interval=daily: en la API pública de CoinGecko ese parámetro es de
// plan enterprise; con days>90 la granularidad diaria ya viene por default.
//
// Upsert INMEDIATO por moneda (no acumula todo en memoria para upsertear al
// final): si la corrida se corta a mitad de camino -- por timeout de la Edge
// Function, con 13 monedas y ~13s de por medio entre cada una es una
// posibilidad real -- lo ya guardado no se pierde. Volver a correr el
// backfill completa lo que falte (ver coingeckoBackfillTargets: cada
// re-corrida saltea lo ya cubierto y avanza más lejos, no repite desde cero).
//
// days acepta 'max' (historia completa) además de un número de días; el
// handler siempre llama con 'max' para cripto, mismo criterio que data912.
async function coingeckoBackfill(
  supabase: SupabaseClient,
  instruments: Instrument[],
  days: number | 'max',
): Promise<number> {
  let totalWritten = 0
  for (let idx = 0; idx < instruments.length; idx++) {
    const inst = instruments[idx]
    const url =
      `https://api.coingecko.com/api/v3/coins/${inst.symbol}/market_chart` +
      `?vs_currency=usd&days=${days}`
    const data = (await fetchJsonWithRetry(url)) as { prices?: [number, number][] } | null
    if (data?.prices) {
      // Una fila por fecha ART (última muestra del día gana).
      const byDate = new Map<string, number>()
      for (const [ms, price] of data.prices) byDate.set(msToArgentinaDate(ms), price)
      const coinRows: PriceRow[] = []
      for (const [date, price] of byDate) coinRows.push({ instrument_id: inst.id, date, price })
      try {
        await upsertPriceRows(supabase, coinRows)
        totalWritten += coinRows.length
      } catch (e) {
        console.error(`CoinGecko backfill: upsert falló para ${inst.symbol}: ${(e as Error).message}`)
      }
    } else {
      console.error(`CoinGecko market_chart sin datos para ${inst.symbol} (reintentos agotados o sin precios)`)
    }
    if (idx < instruments.length - 1) await sleep(COINGECKO_BACKFILL_DELAY_MS)
  }
  return totalWritten
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
  // Solo afecta a mep: coingecko siempre pide historia completa (days='max',
  // ver coingeckoBackfill) y data912 no soporta rango de fechas.
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
      if (source === 'coingecko' && mode === 'backfill') {
        // Caso especial: filtra primero las monedas que ya tienen historia
        // (coingeckoBackfillTargets) y upsertea moneda por moneda adentro de
        // la función (no acumula todo en memoria para upsertear al final, ver
        // coingeckoBackfill), así que no pasa por el upsert genérico de abajo.
        const targets = await coingeckoBackfillTargets(supabase, list)
        const written = await coingeckoBackfill(supabase, targets, 'max')
        ;(summary.sources as Record<string, unknown>)[source] = written > 0 ? `${written} filas` : 'sin filas'
        continue
      }

      let rows: PriceRow[] = []
      if (source === 'coingecko') {
        rows = await coingeckoDaily(list, today)
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
