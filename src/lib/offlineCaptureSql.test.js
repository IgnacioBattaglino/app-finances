// La migración 0060: lo que la base necesita para la carga sin conexión de la
// app nativa. Se prueba el contrato que va a usar el teléfono, como
// authenticated y con RLS:
//   · el id lo genera el teléfono, y subir dos veces el mismo gasto no lo
//     duplica (INSERT ... ON CONFLICT (id) DO NOTHING, que es lo que hace
//     PostgREST con `resolution=ignore-duplicates`);
//   · captured_at guarda cuándo se cargó de verdad, nunca en el futuro, y no
//     cambia al editar; lo que ya existía queda con su created_at;
//   · una cuenta oculta no recibe movimientos nuevos (gastos, aportes, pagos).
//
// Se aplican la 0050 (el trigger de moneda y las reglas de cuenta, que
// conviven con estos en la misma tabla) y la 0060 TAL CUAL. Sin Postgres local
// el test se saltea; el CI corre uno.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DB = `app_finances_offline_${process.pid}`

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
const asUser = (sql) => psql(`set app.current_user_id = '${USER}'; set role authenticated; ${sql}`)

function rejection(sql) {
  try {
    asUser(sql)
    return null
  } catch (e) {
    return String(e.stderr ?? e.message)
  }
}

const USER = '10101010-1010-4010-8010-101010101010'
const EFECTIVO = '11111111-1111-4111-8111-111111111111'
const OCULTA = '22222222-2222-4222-8222-222222222222'
const CAT = 'aaaaaaaa-0000-4000-8000-000000000001'
const OLD_TX = 'bbbbbbbb-0000-4000-8000-000000000001'
const PHONE_ID = 'cccccccc-0000-4000-8000-000000000001' // el id que generó el teléfono
const HIDDEN_TX = 'dddddddd-0000-4000-8000-000000000001'
const HIDDEN_C = 'dddddddd-0000-4000-8000-000000000002'
const HIDDEN_P = 'dddddddd-0000-4000-8000-000000000003'

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
grant usage on schema auth to authenticated;

create table liquid_accounts (id uuid primary key, user_id uuid not null default auth.uid(), name text not null,
  currency text not null default 'ARS', is_savings boolean not null default false, is_archived boolean not null default false);
create table categories (id uuid primary key, user_id uuid not null default auth.uid(), name text not null);
create table transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(),
  date date not null default current_date, kind text not null default 'expense',
  category_id uuid not null references categories(id), description text,
  amount numeric(14,2) not null check (amount > 0), currency text not null default 'ARS',
  account_id uuid references liquid_accounts(id), created_at timestamptz not null default now()
);
create table contributions (id uuid primary key default gen_random_uuid(), amount_usd numeric(14,2) not null,
  date date not null default current_date, mep_rate numeric(10,2), direction text not null default 'in',
  affects_liquid boolean not null default true, account_id uuid references liquid_accounts(id));
create table debt_payments (id uuid primary key default gen_random_uuid(), amount_usd numeric(14,2) not null,
  date date not null default current_date, mep_rate numeric(10,2), interest_usd numeric(14,2),
  affects_liquid boolean not null default true, account_id uuid references liquid_accounts(id));
create table commitments (id uuid primary key default gen_random_uuid(), name text, account_id uuid references liquid_accounts(id));
create table liquid_reconciliations (id uuid primary key default gen_random_uuid(), declared_amount numeric(14,2) not null,
  account_id uuid references liquid_accounts(id));
alter table liquid_accounts enable row level security;
alter table transactions enable row level security;
create policy "own rows" on liquid_accounts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on transactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on all tables in schema public to authenticated;

insert into liquid_accounts (id, user_id, name) values ('${EFECTIVO}', '${USER}', 'Efectivo'), ('${OCULTA}', '${USER}', 'Vieja');
insert into categories values ('${CAT}', '${USER}', 'Comida');
-- Un gasto de antes de la 0060: tiene que quedar con captured_at = created_at.
insert into transactions (id, user_id, category_id, amount, account_id, created_at)
  values ('${OLD_TX}', '${USER}', '${CAT}', 100, '${EFECTIVO}', '2026-01-15T10:00:00Z');
-- Movimientos que ya estaban en la cuenta antes de ocultarla.
insert into transactions (id, user_id, category_id, amount, account_id, description)
  values ('${HIDDEN_TX}', '${USER}', '${CAT}', 500, '${OCULTA}', 'viejo');
insert into contributions (id, amount_usd, mep_rate, account_id) values ('${HIDDEN_C}', 10, 1000, '${OCULTA}');
insert into debt_payments (id, amount_usd, mep_rate, account_id) values ('${HIDDEN_P}', 10, 1000, '${OCULTA}');
`

const upload = (id, capturedAt, account = EFECTIVO) =>
  asUser(`insert into transactions (id, category_id, amount, account_id, captured_at)
          values ('${id}', '${CAT}', 2500, '${account}', ${capturedAt ? `'${capturedAt}'` : 'default'})
          on conflict (id) do nothing;`)

describe.skipIf(!available)('0060: carga sin conexión (SQL)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0050_account_currency_rules.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0060_offline_capture.sql', 'utf8'))
    // Se oculta después de la 0050 (su guarda exige otra cuenta del día a día, que hay).
    psql(`update liquid_accounts set is_archived = true where id = '${OCULTA}';`)
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  it('lo que ya existía queda con captured_at = created_at', () => {
    expect(psql(`select captured_at = created_at from transactions where id = '${OLD_TX}';`).trim()).toBe('t')
  })

  it('subir dos veces el mismo gasto (mismo id) no lo duplica', () => {
    upload(PHONE_ID, '2026-09-20T08:30:00Z')
    upload(PHONE_ID, '2026-09-20T08:30:00Z') // el reintento después de un corte
    expect(psql(`select count(*) from transactions where id = '${PHONE_ID}';`).trim()).toBe('1')
  })

  it('captured_at guarda cuándo se cargó en el teléfono, no cuándo subió', () => {
    const [captured, created] = psql(`select captured_at at time zone 'UTC', created_at > captured_at from transactions where id = '${PHONE_ID}';`)
      .trim().split('\t')
    expect(captured).toMatch(/^2026-09-20 08:30:00/)
    expect(created).toBe('t')
  })

  it('un reloj adelantado no puede fecharlo en el futuro', () => {
    const id = 'cccccccc-0000-4000-8000-000000000002'
    upload(id, '2099-01-01T00:00:00Z')
    expect(psql(`select captured_at <= now() from transactions where id = '${id}';`).trim()).toBe('t')
  })

  it('sin captured_at (la web) vale ahora', () => {
    const id = 'cccccccc-0000-4000-8000-000000000003'
    upload(id, null)
    expect(psql(`select captured_at = created_at from transactions where id = '${id}';`).trim()).toBe('t')
  })

  it('editar un movimiento no cambia su captured_at', () => {
    asUser(`update transactions set amount = 3000, captured_at = '2026-01-01' where id = '${PHONE_ID}';`)
    expect(psql(`select captured_at at time zone 'UTC' from transactions where id = '${PHONE_ID}';`).trim()).toMatch(/^2026-09-20 08:30:00/)
  })

  it('un gasto nuevo en una cuenta oculta se rechaza, en castellano', () => {
    expect(rejection(`insert into transactions (category_id, amount, account_id) values ('${CAT}', 10, '${OCULTA}');`)).toMatch(
      /Esa cuenta ya no está disponible/,
    )
  })

  it('mudar un movimiento a una cuenta oculta también', () => {
    expect(rejection(`update transactions set account_id = '${OCULTA}' where id = '${PHONE_ID}';`)).toMatch(
      /Esa cuenta ya no está disponible/,
    )
  })

  it('aportes y pagos de deuda nuevos en una cuenta oculta, también', () => {
    expect(rejection(`insert into contributions (amount_usd, account_id) values (10, '${OCULTA}');`)).toMatch(/ya no está disponible/)
    expect(rejection(`insert into debt_payments (amount_usd, account_id) values (10, '${OCULTA}');`)).toMatch(/ya no está disponible/)
    // Los "de afuera" no tienen cuenta y siguen entrando.
    asUser(`insert into contributions (amount_usd, affects_liquid) values (10, false);`)
  })

  it('en una cuenta visible todo sigue entrando, con la moneda que pone la 0050', () => {
    const id = 'cccccccc-0000-4000-8000-000000000004'
    asUser(`insert into transactions (id, category_id, amount, currency, account_id) values ('${id}', '${CAT}', 10, 'USD', '${EFECTIVO}');`)
    expect(psql(`select currency from transactions where id = '${id}';`).trim()).toBe('ARS')
  })

  describe('un movimiento de una cuenta oculta no se edita en lo que mueve su saldo', () => {
    const NOT_EDITABLE = /no se puede cambiar su monto, fecha, tipo ni cuenta/
    for (const [label, sql] of [
      ['el monto', `update transactions set amount = 600 where id = '${HIDDEN_TX}';`],
      ['la fecha', `update transactions set date = '2026-01-01' where id = '${HIDDEN_TX}';`],
      ['el tipo', `update transactions set kind = 'income' where id = '${HIDDEN_TX}';`],
      ['sacarlo de la cuenta oculta', `update transactions set account_id = '${EFECTIVO}' where id = '${HIDDEN_TX}';`],
    ]) {
      it(`gasto o ingreso: ${label}`, () => {
        expect(rejection(sql)).toMatch(NOT_EDITABLE)
      })
    }

    it('aporte: el monto; pago de deuda: los intereses', () => {
      expect(rejection(`update contributions set amount_usd = 20 where id = '${HIDDEN_C}';`)).toMatch(NOT_EDITABLE)
      expect(rejection(`update debt_payments set interest_usd = 1 where id = '${HIDDEN_P}';`)).toMatch(NOT_EDITABLE)
    })

    it('la descripción sí se puede cambiar, y nada más se movió', () => {
      asUser(`update transactions set description = 'corregido' where id = '${HIDDEN_TX}';`)
      expect(psql(`select description, amount from transactions where id = '${HIDDEN_TX}';`).trim()).toBe('corregido\t500.00')
    })
  })
})
