// La migración 0054: una cuenta con saldo no se puede ocultar. Se aplican la
// 0050 (el trigger y las reglas de cuenta), la 0051 (get_liquid_by_account,
// de donde sale el saldo) y la 0054 TAL CUAL, en ese orden, sobre un esquema
// mínimo con los mismos tipos que la base real.
//
// La 0054 reemplaza la función del trigger, así que además de la regla nueva
// se prueba que las dos de la 0050 siguen en pie: la última cuenta del día a
// día y la moneda de una cuenta con historia.
//
// Sin Postgres local el test se saltea; el CI corre uno.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DB = `app_finances_hide_account_${process.pid}`

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

function rejection(sql) {
  try {
    psql(sql)
    return null
  } catch (e) {
    return String(e.stderr ?? e.message)
  }
}

const USER = '10101010-1010-4010-8010-101010101010'
const EFECTIVO = '11111111-1111-4111-8111-111111111111' // ARS
const MP = '22222222-2222-4222-8222-222222222222' // ARS
const DOLARES = '33333333-3333-4333-8333-333333333333' // USD
const CAT = 'aaaaaaaa-0000-4000-8000-000000000001'

const hide = (id) => `update liquid_accounts set is_archived = true where id = '${id}';`
const hidden = (id) => psql(`select is_archived from liquid_accounts where id = '${id}';`).trim() === 't'
const tx = (kind, amount, account) =>
  psql(`insert into transactions (category_id, kind, amount, account_id) values ('${CAT}', '${kind}', ${amount}, '${account}');`)

const SCHEMA = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
exception when duplicate_object or unique_violation then null; -- carrera entre archivos en paralelo
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
exception when duplicate_object or unique_violation then null;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

create table liquid_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null,
  currency text not null default 'ARS', is_savings boolean not null default false,
  is_archived boolean not null default false
);
create table categories (id uuid primary key, name text not null);
create table transactions (
  id uuid primary key default gen_random_uuid(), date date not null default current_date,
  kind text not null, category_id uuid not null references categories(id), description text,
  amount numeric(14,2) not null check (amount > 0), currency text not null default 'ARS',
  account_id uuid references liquid_accounts(id)
);
create table contributions (
  id uuid primary key default gen_random_uuid(), amount_usd numeric(14,2) not null,
  mep_rate numeric(10,2), direction text not null default 'in',
  affects_liquid boolean not null default true, account_id uuid references liquid_accounts(id)
);
create table debt_payments (
  id uuid primary key default gen_random_uuid(), amount_usd numeric(14,2) not null,
  mep_rate numeric(10,2), affects_liquid boolean not null default true,
  account_id uuid references liquid_accounts(id)
);
create table commitments (id uuid primary key default gen_random_uuid(), name text, account_id uuid references liquid_accounts(id));
create table liquid_reconciliations (
  id uuid primary key default gen_random_uuid(), declared_amount numeric(14,2) not null,
  account_id uuid references liquid_accounts(id)
);
insert into categories values ('${CAT}', 'Comida');
`

// Cada test arranca del mismo mundo; la limpieza apaga los triggers (si no,
// la guarda de la última cuenta impediría borrarlas).
const SEED = `
set session_replication_role = replica;
delete from transactions; delete from contributions; delete from debt_payments; delete from liquid_reconciliations;
delete from liquid_accounts;
set session_replication_role = origin;
insert into liquid_accounts (id, user_id, name, currency) values
  ('${EFECTIVO}', '${USER}', 'Efectivo', 'ARS'),
  ('${MP}', '${USER}', 'Mercado Pago', 'ARS'),
  ('${DOLARES}', '${USER}', 'Dólares', 'USD');
`

describe.skipIf(!available)('0054: una cuenta con saldo no se oculta (SQL)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    for (const m of ['0050_account_currency_rules', '0051_liquid_summary', '0054_no_hiding_accounts_with_balance']) {
      psql(readFileSync(`supabase/migrations/${m}.sql`, 'utf8'))
    }
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  beforeEach(() => psql(SEED))

  it('con saldo a favor, no se oculta', () => {
    tx('income', 1000, MP)
    expect(rejection(hide(MP))).toMatch(/todavía tiene plata/)
    expect(hidden(MP)).toBe(false)
  })

  it('con saldo en contra, tampoco', () => {
    tx('expense', 500, MP)
    expect(rejection(hide(MP))).toMatch(/todavía tiene plata/)
  })

  it('vaciada (el ajuste de "vaciar y eliminar" o una transferencia), sí', () => {
    tx('income', 1000, MP)
    tx('expense', 1000, MP)
    psql(hide(MP))
    expect(hidden(MP)).toBe(true)
  })

  it('el saldo de un aporte convertido cuenta: una cuenta con solo eso tampoco se oculta', () => {
    psql(`insert into contributions (amount_usd, mep_rate, direction, account_id) values (10, 1000, 'out', '${MP}');`)
    expect(rejection(hide(MP))).toMatch(/todavía tiene plata/)
  })

  it('menos de un centavo no es saldo: se oculta', () => {
    // 0,01 USD × 0,40 = 0,004 pesos: ningún ajuste puede escribir eso.
    psql(`insert into contributions (amount_usd, mep_rate, direction, account_id) values (0.01, 0.40, 'out', '${MP}');`)
    psql(hide(MP))
    expect(hidden(MP)).toBe(true)
  })

  it('una cuenta sin ningún movimiento se oculta', () => {
    psql(hide(DOLARES))
    expect(hidden(DOLARES)).toBe(true)
  })

  it('renombrarla o reordenarla con saldo no pasa por la regla', () => {
    tx('income', 1000, MP)
    psql(`update liquid_accounts set name = 'MP' where id = '${MP}';`)
  })

  it('sigue en pie la 0050: la última cuenta del día a día no se oculta', () => {
    psql(hide(DOLARES))
    psql(hide(MP))
    expect(rejection(hide(EFECTIVO))).toMatch(/única cuenta para el día a día/)
  })

  it('sigue en pie la 0050: una cuenta con historia no cambia de moneda', () => {
    tx('income', 1000, MP)
    expect(rejection(`update liquid_accounts set currency = 'USD' where id = '${MP}';`)).toMatch(/ya tiene movimientos/)
  })
})
