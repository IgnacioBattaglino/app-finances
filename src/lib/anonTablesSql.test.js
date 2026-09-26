// La migración 0053: anon no tiene ningún permiso sobre tablas, vistas ni
// secuencias de public, y authenticated no tiene truncate, references ni
// trigger. Ni en lo que ya existe ni en lo que se cree después.
//
// Mismo patrón que anonFunctionsSql.test.js: el test reproduce los defaults de
// Supabase (todo para anon, authenticated y service_role en cada objeto nuevo
// de public) y exige, ANTES de aplicar, que anon tenga permisos — si no, no
// probaría nada. Y una parte sin base de datos: ninguna migración posterior
// puede volver a darle algo a anon (o a PUBLIC) sobre una tabla.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const DB = `app_finances_anon_tables_${process.pid}`
const MIGRATION = '0053_anon_table_hardening.sql'

function hasPostgres() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const available = hasPostgres()

const psql = (sql) =>
  execFileSync('psql', ['-d', DB, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const has = (role, obj, privs) => psql(`select has_table_privilege('${role}', '${obj}', '${privs}');`).trim() === 't'
const hasSeq = (role, seq) => psql(`select has_sequence_privilege('${role}', '${seq}', 'usage,select,update');`).trim() === 't'

const ANY = 'select,insert,update,delete,truncate,references,trigger'
const CRUD = ['select', 'insert', 'update', 'delete']
const UNUSED = 'truncate,references,trigger'

const SCHEMA = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
exception when duplicate_object or unique_violation then null; -- carrera entre archivos en paralelo
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
exception when duplicate_object or unique_violation then null;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
exception when duplicate_object or unique_violation then null;
end $$;

-- Lo que hace Supabase en public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table public.transactions (id uuid primary key, amount numeric);
create table public.instruments (id uuid primary key, name text);
create view public.instrument_prices_usd as select id, name from public.instruments;
create sequence public.una_secuencia;
`

describe.skipIf(!available)('0053: anon y las tablas de public (SQL)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  // En orden: el mundo como está hoy en Supabase, después la migración.
  it('antes: anon tiene permisos en tablas, vistas y secuencias (el test reproduce a Supabase)', () => {
    for (const obj of ['public.transactions', 'public.instruments', 'public.instrument_prices_usd']) {
      expect(has('anon', obj, ANY), obj).toBe(true)
    }
    expect(hasSeq('anon', 'public.una_secuencia')).toBe(true)
    expect(has('authenticated', 'public.transactions', 'truncate')).toBe(true)
  })

  it('después: anon no tiene nada, en ningún objeto', () => {
    psql(readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8'))
    for (const obj of ['public.transactions', 'public.instruments', 'public.instrument_prices_usd']) {
      expect(has('anon', obj, ANY), obj).toBe(false)
    }
    expect(hasSeq('anon', 'public.una_secuencia')).toBe(false)
  })

  it('authenticated conserva leer y escribir, sin truncate, references ni trigger', () => {
    for (const priv of CRUD) expect(has('authenticated', 'public.transactions', priv), priv).toBe(true)
    expect(has('authenticated', 'public.transactions', UNUSED)).toBe(false)
    expect(has('authenticated', 'public.instrument_prices_usd', 'select')).toBe(true)
  })

  it('sin sesión, leer una tabla da "permission denied"', () => {
    expect(() => psql('set role anon; select * from public.transactions;')).toThrow(/permission denied/)
  })

  it('una tabla y una secuencia creadas DESPUÉS nacen cerradas para anon', () => {
    psql('create table public.tabla_nueva (id int); create sequence public.secuencia_nueva;')
    expect(has('anon', 'public.tabla_nueva', ANY)).toBe(false)
    expect(hasSeq('anon', 'public.secuencia_nueva')).toBe(false)
    for (const priv of CRUD) expect(has('authenticated', 'public.tabla_nueva', priv), priv).toBe(true)
    expect(has('authenticated', 'public.tabla_nueva', UNUSED)).toBe(false)
    expect(has('service_role', 'public.tabla_nueva', ANY)).toBe(true)
  })
})

// Sin base de datos: una migración posterior que vuelva a darle algo a anon (o
// a PUBLIC, del que anon hereda) sobre tablas, vistas o secuencias falla acá.
const opensToAnon = (stmt) =>
  /\bgrant\b/i.test(stmt) &&
  /\b(tables?|sequences?|views?)\b|\bon\s+(public\.)?[a-z_]+\s+to\b/i.test(stmt) &&
  !/\bfunctions?\b/i.test(stmt) &&
  /\bto\b[^;]*\b(anon|public)\b/i.test(stmt)

describe('ninguna migración posterior a la 0053 le abre tablas a anon', () => {
  const dir = 'supabase/migrations'
  const later = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f > MIGRATION)

  it.each(later.length ? later : ['(ninguna todavía)'])('%s', (file) => {
    if (!file.endsWith('.sql')) return
    // Sin comentarios: la verificación al pie de cada archivo nombra a anon.
    const sql = readFileSync(`${dir}/${file}`, 'utf8').replace(/--.*$/gm, '')
    expect(sql.split(';').filter(opensToAnon).map((s) => s.trim())).toEqual([])
  })

  it('el chequeo detecta un grant a anon sobre una tabla o vista (si no, no prueba nada)', () => {
    expect(opensToAnon('grant select on public.transactions to anon')).toBe(true)
    expect(opensToAnon('grant select on all tables in schema public to anon')).toBe(true)
    expect(opensToAnon('alter default privileges in schema public grant all on tables to anon')).toBe(true)
    expect(opensToAnon('grant select on public.debt_balances to authenticated')).toBe(false)
    expect(opensToAnon('grant execute on function public.x() to anon')).toBe(false)
  })
})
