// delete_my_account (migración 0063) contra un Postgres de verdad.
//
// El esquema es el grafo REAL de claves foráneas de la base (leído con el MCP
// el 2026-11-16): las mismas tablas y las mismas FK, ninguna con cascade desde
// auth.users. Lo que se prueba es lo que importa de un borrado así: que se va
// TODO lo de quien lo pide, que no se toca NADA de otra persona, que el orden
// no choca con ninguna clave, y que no se puede borrar a nadie más.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DB = `app_finances_delete_account_${process.pid}`

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
const fails = (sql) => {
  try {
    psql(sql)
    return null
  } catch (e) {
    return String(e.stderr ?? e.message)
  }
}

const ANA = '10101010-1010-4010-8010-101010101010'
const BETO = '20202020-2020-4020-8020-202020202020'
const ADMIN = '30303030-3030-4030-8030-303030303030'

// Tablas con dueño directo, y las tres que heredan el dueño por su FK.
const OWNED = ['categories', 'transactions', 'assets', 'asset_types', 'debts', 'settings', 'liquid_reconciliations',
  'liquid_accounts', 'payment_cards', 'commitments', 'commitment_charges']
const CHILDREN = { contributions: ['asset_id', 'assets'], asset_valuations: ['asset_id', 'assets'], debt_payments: ['debt_id', 'debts'] }

const SCHEMA = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
exception when duplicate_object or unique_violation then null;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
exception when duplicate_object or unique_violation then null;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
create table auth.users (id uuid primary key, email text);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);

create table liquid_accounts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  name text, currency text not null default 'ARS', is_savings boolean not null default false, is_archived boolean not null default false);
create table categories (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), name text);
create table debts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), creditor text);
create table transactions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  category_id uuid not null references categories(id), account_id uuid not null references liquid_accounts(id),
  debt_id uuid references debts(id) on delete cascade, amount numeric);
create table asset_types (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), name text);
create table assets (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  asset_type_id uuid references asset_types(id), savings_account_id uuid references liquid_accounts(id), name text);
create table contributions (id uuid primary key default gen_random_uuid(), asset_id uuid not null references assets(id),
  account_id uuid references liquid_accounts(id), amount_usd numeric);
create table asset_valuations (id uuid primary key default gen_random_uuid(), asset_id uuid not null references assets(id), value_usd numeric);
create table debt_payments (id uuid primary key default gen_random_uuid(), debt_id uuid not null references debts(id),
  account_id uuid references liquid_accounts(id), amount_usd numeric);
create table settings (user_id uuid primary key references auth.users(id));
create table liquid_reconciliations (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  account_id uuid references liquid_accounts(id), adjustment_transaction_id uuid references transactions(id),
  redistribution_transaction_id uuid references transactions(id));
create table payment_cards (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), name text);
create table commitments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  category_id uuid not null references categories(id), account_id uuid not null references liquid_accounts(id),
  card_id uuid references payment_cards(id), name text);
create table commitment_charges (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  commitment_id uuid not null references commitments(id), transaction_id uuid references transactions(id) on delete set null);
create table app_admins (user_id uuid primary key references auth.users(id));
create table invitations (id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users(id),
  used_at timestamptz, used_by uuid references auth.users(id), used_by_email text);

-- La función que el trigger de cuentas consulta al ocultar (acá no se ejerce).
create function get_liquid_by_account() returns table (account_id uuid, amount numeric) language sql stable as $$
  select id, 0::numeric from liquid_accounts
$$;
`

// Una vida completa por persona: todo tipo de fila, con todos los cruces.
const person = (id, tag) => `
insert into auth.users values ('${id}', '${tag}@example.com');
insert into auth.sessions (user_id) values ('${id}');
insert into settings values ('${id}');
with acc as (insert into liquid_accounts (user_id, name) values ('${id}', 'Efectivo ${tag}') returning id),
     sav as (insert into liquid_accounts (user_id, name, is_savings) values ('${id}', 'Ahorro ${tag}', true) returning id),
     cat as (insert into categories (user_id, name) values ('${id}', 'Comida ${tag}') returning id),
     debt as (insert into debts (user_id, creditor) values ('${id}', 'Banco ${tag}') returning id),
     tx as (insert into transactions (user_id, category_id, account_id, amount)
            select '${id}', cat.id, acc.id, 100 from cat, acc returning id),
     loan as (insert into transactions (user_id, category_id, account_id, debt_id, amount)
            select '${id}', cat.id, acc.id, debt.id, 500 from cat, acc, debt returning id),
     grp as (insert into asset_types (user_id, name) values ('${id}', 'Cripto ${tag}') returning id),
     asset as (insert into assets (user_id, asset_type_id, savings_account_id, name)
            select '${id}', grp.id, sav.id, 'BTC ${tag}' from grp, sav returning id),
     c as (insert into contributions (asset_id, account_id, amount_usd) select asset.id, acc.id, 10 from asset, acc returning id),
     v as (insert into asset_valuations (asset_id, value_usd) select asset.id, 12 from asset returning id),
     pay as (insert into debt_payments (debt_id, account_id, amount_usd) select debt.id, acc.id, 5 from debt, acc returning id),
     rec as (insert into liquid_reconciliations (user_id, account_id, adjustment_transaction_id, redistribution_transaction_id)
            select '${id}', acc.id, tx.id, tx.id from acc, tx returning id),
     card as (insert into payment_cards (user_id, name) values ('${id}', 'Visa ${tag}') returning id),
     plan as (insert into commitments (user_id, category_id, account_id, card_id, name)
            select '${id}', cat.id, acc.id, card.id, 'Heladera ${tag}' from cat, acc, card returning id)
insert into commitment_charges (user_id, commitment_id, transaction_id) select '${id}', plan.id, tx.id from plan, tx;
`

const SEED = `
set session_replication_role = replica;
truncate auth.users, auth.sessions, liquid_accounts, categories, debts, transactions, asset_types, assets, contributions,
  asset_valuations, debt_payments, settings, liquid_reconciliations, payment_cards, commitments, commitment_charges,
  app_admins, invitations cascade;
set session_replication_role = origin;
${person(ANA, 'ana')}
${person(BETO, 'beto')}
${person(ADMIN, 'admin')}
insert into app_admins values ('${ADMIN}');
insert into invitations (created_by, used_at, used_by, used_by_email) values
  ('${ADMIN}', now(), '${ANA}', 'ana@example.com'),
  ('${ADMIN}', now(), '${BETO}', 'beto@example.com');
`

const as = (user, sql) => `set role authenticated; set app.current_user_id = '${user}'; ${sql}`

function rowsOf(user) {
  const counts = {}
  for (const table of OWNED) {
    counts[table] = Number(psql(`select count(*) from ${table} where user_id = '${user}'`).trim())
  }
  for (const [table, [fk, parent]] of Object.entries(CHILDREN)) {
    counts[table] = Number(
      psql(`select count(*) from ${table} where ${fk} in (select id from ${parent} where user_id = '${user}')`).trim(),
    )
  }
  counts.users = Number(psql(`select count(*) from auth.users where id = '${user}'`).trim())
  counts.sessions = Number(psql(`select count(*) from auth.sessions where user_id = '${user}'`).trim())
  return counts
}

describe.skipIf(!available)('borrar la propia cuenta (SQL, migración 0063)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    // El trigger de la 0050, que es el que la 0063 redefine.
    psql(`create function public.guard_liquid_account() returns trigger language plpgsql as $$ begin return old; end $$;
          create trigger liquid_accounts_guard before update of currency, is_archived, is_savings or delete
            on public.liquid_accounts for each row execute function public.guard_liquid_account();`)
    psql(readFileSync('supabase/migrations/0063_delete_my_account.sql', 'utf8'))
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  beforeEach(() => psql(SEED))

  it('el dataset le da a cada persona al menos una fila en cada tabla', () => {
    for (const count of Object.values(rowsOf(ANA))) expect(count).toBeGreaterThan(0)
  })

  it('se va TODO lo de quien lo pide, y nada de nadie más', () => {
    const betoBefore = rowsOf(BETO)
    const adminBefore = rowsOf(ADMIN)

    psql(as(ANA, 'select delete_my_account()'))

    for (const [table, count] of Object.entries(rowsOf(ANA))) expect(count, table).toBe(0)
    expect(rowsOf(BETO)).toEqual(betoBefore)
    expect(rowsOf(ADMIN)).toEqual(adminBefore)
  })

  it('la invitación con la que entró queda usada, sin decir por quién', () => {
    psql(as(ANA, 'select delete_my_account()'))
    const left = psql(`select count(*) filter (where used_by is null and used_by_email is null and used_at is not null),
                              count(*) filter (where used_by_email = 'beto@example.com') from invitations`).trim()
    expect(left).toBe('1\t1')
  })

  it('fuera de delete_my_account, la última cuenta del día a día se sigue sin poder borrar', () => {
    psql(`delete from commitment_charges; delete from liquid_reconciliations; delete from commitments;
          delete from debt_payments; delete from contributions; delete from asset_valuations;
          delete from transactions; delete from assets;`)
    const error = fails(`delete from liquid_accounts where user_id = '${BETO}' and not is_savings`)
    expect(error).toMatch(/única cuenta para el día a día/)
  })

  it('la marca que saltea esa regla no sobrevive a la transacción', () => {
    psql(as(ANA, 'select delete_my_account()'))
    expect(psql(`select coalesce(current_setting('encuenta.deleting_account', true), '')`).trim()).toBe('')
  })

  it('sin sesión no borra nada', () => {
    const error = fails(`set role authenticated; select delete_my_account()`)
    expect(error).toMatch(/iniciar sesión/)
    expect(rowsOf(ANA).users).toBe(1)
  })

  it('anon no puede ejecutarla', () => {
    expect(psql(`select has_function_privilege('anon', 'public.delete_my_account()', 'execute')`).trim()).toBe('f')
    expect(fails(`set role anon; select delete_my_account()`)).toMatch(/permission denied/)
  })

  it('el administrador no se borra desde la app', () => {
    const error = fails(as(ADMIN, 'select delete_my_account()'))
    expect(error).toMatch(/administración/)
    expect(rowsOf(ADMIN).users).toBe(1)
  })

  it('si algo falla a mitad de camino, no se borra nada', () => {
    // Una fila que la función no conoce y que apunta a una cuenta de Ana.
    psql(`create table intruso (id serial primary key, account_id uuid references liquid_accounts(id));
          insert into intruso (account_id) select id from liquid_accounts where user_id = '${ANA}' limit 1;`)
    const before = rowsOf(ANA)
    expect(fails(as(ANA, 'select delete_my_account()'))).toMatch(/violates foreign key/)
    expect(rowsOf(ANA)).toEqual(before)
    psql('drop table intruso')
  })

  it('authenticated lee app_config y no la puede escribir', () => {
    expect(psql(as(ANA, 'select min_ios_version from app_config')).trim()).toBe('0.1.0')
    expect(fails(as(ANA, `update app_config set min_ios_version = '9.9.9'`))).toMatch(/permission denied/)
    expect(fails(`set role anon; select * from app_config`)).toMatch(/permission denied/)
  })
})
