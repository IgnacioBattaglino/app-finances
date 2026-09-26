// La migración 0052: anon no puede ejecutar ninguna función de public salvo
// validate_invite, ni las que ya existen ni las que se creen después.
//
// Un Postgres local no tiene los privilegios por defecto de Supabase, y ahí
// estuvo el error de la 0051: su revoke pasaba acá y fallaba en producción. Por
// eso el test los crea igual que Supabase (EXECUTE para anon, authenticated y
// service_role en toda función nueva de public, más el EXECUTE global de
// Postgres para PUBLIC) y exige, ANTES de aplicar la migración, que anon pueda
// ejecutar todo: si no, el test no probaría nada.
//
// Además, una parte sin base de datos: ninguna migración posterior a la 0052
// puede volver a darle EXECUTE a anon (o a PUBLIC, del que anon hereda) salvo
// en validate_invite. Esa corre siempre, con o sin Postgres.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const DB = `app_finances_anon_functions_${process.pid}`
const MIGRATION = '0052_anon_function_hardening.sql'

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

const can = (role, fn) => psql(`select has_function_privilege('${role}', '${fn}', 'execute');`).trim() === 't'

// Una muestra de cada clase de función que hay en producción: la excepción
// (SECURITY DEFINER, se llama sin sesión), una RPC común, una que lee con
// parámetros, una de trigger y una de trigger SECURITY DEFINER.
const OURS = [
  'public.validate_invite(uuid)',
  'public.is_admin()',
  'public.get_liquid_summary()',
  'public.reconcile_liquid(date,jsonb)',
  'public.guard_liquid_account()',
  'public.handle_new_user()',
]

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
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Una extensión en public: sus funciones no son nuestras y no se tocan.
create extension if not exists pgcrypto schema public;

create function public.validate_invite(p_id uuid) returns text
  language sql stable security definer set search_path = public as $$ select 'not_found' $$;
create function public.is_admin() returns boolean language sql stable as $$ select false $$;
create function public.get_liquid_summary() returns table (currency text) language sql stable as $$ select 'ARS' $$;
create function public.reconcile_liquid(p_date date, p_declarations jsonb) returns jsonb
  language sql as $$ select '[]'::jsonb $$;
create function public.guard_liquid_account() returns trigger
  language plpgsql as $$ begin return new; end $$;
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$ begin return new; end $$;
`

describe.skipIf(!available)('0052: anon y las funciones de public (SQL)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  // Los tests corren en orden: primero el mundo como está hoy en Supabase,
  // después la migración.
  it('antes: anon puede ejecutar todas (el test reproduce a Supabase)', () => {
    for (const fn of OURS) expect(can('anon', fn), fn).toBe(true)
  })

  it('después: anon solo puede ejecutar validate_invite', () => {
    psql(readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8'))
    for (const fn of OURS) expect(can('anon', fn), fn).toBe(fn === 'public.validate_invite(uuid)')
  })

  it('authenticated conserva todas', () => {
    for (const fn of OURS) expect(can('authenticated', fn), fn).toBe(true)
  })

  it('sin sesión, llamar una RPC da "permission denied"; validate_invite responde', () => {
    expect(() => psql('set role anon; select public.is_admin();')).toThrow(/permission denied/)
    expect(psql(`set role anon; select public.validate_invite('${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}');`).trim()).toBe(
      'not_found',
    )
  })

  it('las funciones de una extensión no se tocan', () => {
    expect(can('anon', 'public.gen_random_bytes(integer)')).toBe(true)
  })

  it('una función creada DESPUÉS de la migración nace cerrada para anon y abierta para authenticated', () => {
    psql('create function public.funcion_nueva() returns int language sql as $$ select 1 $$;')
    expect(can('anon', 'public.funcion_nueva()')).toBe(false)
    expect(can('public', 'public.funcion_nueva()')).toBe(false)
    expect(can('authenticated', 'public.funcion_nueva()')).toBe(true)
    expect(can('service_role', 'public.funcion_nueva()')).toBe(true)
  })
})

// Sin base de datos: una migración posterior que vuelva a abrirle una función a
// anon (o a PUBLIC, del que anon hereda) tiene que fallar acá, salvo que sea
// validate_invite. Si un día hace falta otra excepción, se agrega a la lista a
// propósito y con su porqué.
const ALLOWED = ['validate_invite']

describe('ninguna migración posterior a la 0052 le abre funciones a anon', () => {
  const dir = 'supabase/migrations'
  const later = readdirSync(dir).filter((f) => /^\d{4}_/.test(f) && f > MIGRATION)

  it.each(later.length ? later : ['(ninguna todavía)'])('%s', (file) => {
    if (!file.endsWith('.sql')) return
    // Sin comentarios: la verificación al pie de cada archivo nombra a anon.
    const sql = readFileSync(`${dir}/${file}`, 'utf8').replace(/--.*$/gm, '')
    const grants = sql
      .split(';')
      .filter((stmt) => /\bgrant\b/i.test(stmt) && /\bfunctions?\b/i.test(stmt) && /\bto\b[^;]*\b(anon|public)\b/i.test(stmt))
    const offending = grants.filter((stmt) => !ALLOWED.some((name) => stmt.includes(`public.${name}(`)))
    expect(offending.map((s) => s.trim())).toEqual([])
  })

  it('el chequeo detecta un grant a anon (si no, no prueba nada)', () => {
    const stmt = 'grant execute on function public.otra() to anon'
    expect(/\bgrant\b/i.test(stmt) && /\bfunctions?\b/i.test(stmt) && /\bto\b[^;]*\b(anon|public)\b/i.test(stmt)).toBe(true)
  })
})
