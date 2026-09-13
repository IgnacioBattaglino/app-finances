// La migración 0044 (activar RLS explícitamente en las 8 tablas originales),
// corrida contra un Postgres de verdad — lo que hay que probar es justo lo que
// no se puede afirmar leyendo el SQL: que activar RLS dos veces no cambia nada
// y no falla, y que sobre una base donde ya estaba activo el resultado es
// idéntico.
//
// Sin Postgres local el test se saltea: es una verificación de máquina de
// desarrollo, no un requisito para correr la suite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DB = `app_finances_enable_rls_${process.pid}`

function hasPostgres() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const psql = (sql) =>
  execFileSync('psql', ['-d', DB, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
  })

const TABLES = [
  'categories',
  'transactions',
  'assets',
  'contributions',
  'asset_valuations',
  'debts',
  'debt_payments',
  'settings',
]

// Esquema mínimo: solo las 8 tablas que la migración toca, vacías de columnas
// (esta migración no lee ni escribe ninguna, solo el flag de RLS).
const SCHEMA = TABLES.map((t) => `create table ${t} (id uuid primary key default gen_random_uuid());`).join(
  '\n',
)

const rlsFlags = () =>
  Object.fromEntries(
    psql(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;`,
    )
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t')),
  )

const available = hasPostgres()
const MIGRATION = readFileSync('supabase/migrations/0044_enable_rls_original_tables.sql', 'utf8')

describe.skipIf(!available)('activar RLS en las tablas originales (SQL, migración 0044)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  it('sobre una base donde RLS estaba apagado, lo activa en las 8 tablas', () => {
    expect(Object.values(rlsFlags())).toEqual(TABLES.map(() => 'f'))
    psql(MIGRATION)
    const flags = rlsFlags()
    for (const table of TABLES) {
      expect(flags[table]).toBe('t')
    }
  })

  it('correrla de nuevo sobre una base donde ya está activo no cambia nada y no falla', () => {
    expect(() => psql(MIGRATION)).not.toThrow()
    const flags = rlsFlags()
    for (const table of TABLES) {
      expect(flags[table]).toBe('t')
    }
  })
})
