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
