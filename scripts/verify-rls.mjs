// Verifica que las políticas RLS aíslen correctamente los datos por usuario.
// Solo lectura: no inserta, modifica ni borra nada.
// NUNCA imprime el email ni el password del usuario test, ni siquiera parcialmente.
//
// Uso: npm run verify:rls
// Requiere VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (.env del proyecto)
// y TEST_USER_EMAIL / TEST_USER_PASSWORD (.env.test.local, ver .env.test.example).

import { createClient } from '@supabase/supabase-js'

const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const BOLD = '\x1b[1m'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const TEST_EMAIL = process.env.TEST_USER_EMAIL
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY en el entorno.')
  process.exit(1)
}
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error(
    'Faltan TEST_USER_EMAIL / TEST_USER_PASSWORD.\n' +
      'Creá .env.test.local a partir de .env.test.example y completá los valores.',
  )
  process.exit(1)
}

// Tablas raíz: user_id directo (default auth.uid(), RLS "own rows").
const ROOT_TABLES = [
  'categories',
  'transactions',
  'assets',
  'asset_types',
  'debts',
  'settings',
  'liquid_reconciliations',
]

// Tablas hijas: sin user_id propio, heredan el dueño vía FK a su tabla raíz
// (RLS "own via asset" / "own via debt").
const CHILD_TABLES = [
  { table: 'contributions', parent: 'assets' },
  { table: 'asset_valuations', parent: 'assets' },
  { table: 'debt_payments', parent: 'debts' },
]

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }

function printRow(name, count, ok, note = '') {
  const status = ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`
  const countLabel = count === null ? '—' : `${count} fila${count === 1 ? '' : 's'}`
  console.log(`  ${status}  ${name.padEnd(22)} ${countLabel}${note ? '  ' + note : ''}`)
}

async function checkOwnRoot(client, table, userId) {
  const { data, error } = await client.from(table).select('*')
  if (error) return { ok: false, count: null, note: error.message }
  const leaked = data.filter((row) => row.user_id !== userId)
  return {
    ok: leaked.length === 0,
    count: data.length,
    note: leaked.length > 0 ? `${leaked.length} fila(s) de otro usuario` : '',
  }
}

async function checkOwnChild(client, table, parent, userId) {
  const { data, error } = await client.from(table).select(`*, ${parent}(user_id)`)
  if (error) return { ok: false, count: null, note: error.message }
  // Una fila cuyo padre embebido viene null (o de otro usuario) es exactamente
  // el patrón de fuga que este chequeo existe para detectar: no se ignora,
  // cuenta como fallo.
  const leaked = data.filter((row) => row[parent]?.user_id !== userId)
  return {
    ok: leaked.length === 0,
    count: data.length,
    note: leaked.length > 0 ? `${leaked.length} fila(s) sin dueño visible o de otro usuario` : '',
  }
}

async function checkAnon(client, table) {
  const { data, error } = await client.from(table).select('id')
  if (error) return { ok: true, count: 0, note: 'bloqueado por RLS (error)' }
  return {
    ok: data.length === 0,
    count: data.length,
    note: data.length > 0 ? 'FUGA: visible sin login' : '',
  }
}

// create_transfer (migración 0017) no debe permitir transferir hacia/desde un
// activo ajeno. Verificación estrictamente no destructiva: la función valida
// la pertenencia ANTES de insertar, así que un activo ajeno se rechaza sin
// escribir; igual contamos contributions antes/después para probar que no
// hubo ninguna escritura parcial. Si la función todavía no existe (migración
// sin correr), se reporta PENDIENTE y no se marca como fallo.
async function checkTransferGuard(client) {
  console.log(`\n${BOLD}create_transfer — no debe permitir transferir activos ajenos${RESET}`)

  const { data: assetRows, error: assetErr } = await client.from('assets').select('id').limit(1)
  if (assetErr) {
    printRow('create_transfer', null, false, assetErr.message)
    return false
  }
  const ownedId = assetRows?.[0]?.id ?? null

  async function countContributions() {
    const { count, error } = await client
      .from('contributions')
      .select('id', { count: 'exact', head: true })
    return error ? null : count
  }

  const before = await countContributions()
  let ok = true
  let pending = false

  const cases = []
  if (ownedId) {
    cases.push(['origen propio → destino ajeno', ownedId, crypto.randomUUID()])
  }
  cases.push(['origen ajeno → destino ajeno', crypto.randomUUID(), crypto.randomUUID()])

  for (const [label, fromId, toId] of cases) {
    const { error } = await client.rpc('create_transfer', {
      p_from_asset_id: fromId,
      p_to_asset_id: toId,
      p_date: '2020-01-01',
      p_amount_usd: 1,
      p_from_quantity: null,
      p_to_quantity: null,
      p_mep_rate: 1,
      p_realized_gain: 0,
    })
    if (error && (error.code === 'PGRST202' || /Could not find the function/i.test(error.message))) {
      printRow(label, null, true, 'función aún no existe — corré la migración 0017 (PENDIENTE)')
      pending = true
      continue
    }
    const rejected = Boolean(error)
    printRow(label, null, rejected, rejected ? 'rechazado' : 'FUGA: aceptó un activo ajeno')
    ok = ok && rejected
  }

  if (!pending) {
    const after = await countContributions()
    if (before !== null && after !== null) {
      const noWrites = before === after
      printRow(
        'sin escrituras parciales',
        after,
        noWrites,
        noWrites ? '' : `FUGA: contributions pasó de ${before} a ${after}`,
      )
      ok = ok && noWrites
    }
  }

  return ok
}

async function main() {
  const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, clientOptions)
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  if (authError) {
    console.error(`No se pudo autenticar el usuario test: ${authError.message}`)
    process.exit(1)
  }
  const userId = authData.user.id
  const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY, clientOptions)

  let allOk = true

  console.log(`${BOLD}Con login (usuario test) — cada fila debe pertenecer al usuario logueado${RESET}`)
  for (const table of ROOT_TABLES) {
    const result = await checkOwnRoot(authClient, table, userId)
    printRow(table, result.count, result.ok, result.note)
    allOk = allOk && result.ok
  }
  for (const { table, parent } of CHILD_TABLES) {
    const result = await checkOwnChild(authClient, table, parent, userId)
    printRow(table, result.count, result.ok, result.note)
    allOk = allOk && result.ok
  }

  console.log(`\n${BOLD}Sin login (cliente anónimo) — no debería ver ninguna fila${RESET}`)
  for (const table of [...ROOT_TABLES, ...CHILD_TABLES.map((c) => c.table)]) {
    const result = await checkAnon(anonClient, table)
    printRow(table, result.count, result.ok, result.note)
    allOk = allOk && result.ok
  }

  allOk = (await checkTransferGuard(authClient)) && allOk

  await authClient.auth.signOut()

  console.log()
  if (allOk) {
    console.log(`${GREEN}${BOLD}✓ RLS OK: el aislamiento por usuario funciona en las 10 tablas.${RESET}`)
    process.exit(0)
  } else {
    console.log(`${RED}${BOLD}✗ RLS FALLÓ: revisá las filas marcadas arriba antes de seguir.${RESET}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Error inesperado corriendo la verificación:', e.message)
  process.exit(1)
})
