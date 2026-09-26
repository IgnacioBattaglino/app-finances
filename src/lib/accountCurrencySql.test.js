// Las reglas de la migración 0050, corridas contra un Postgres de verdad: la
// moneda de un movimiento la pone la base, no hay plata "sin cuenta", una
// cuenta con historia no cambia de moneda y la última cuenta del día a día no
// se va.
//
// Es una regla de ESCRITURA (triggers), así que la paridad es distinta a la de
// una vista (ver docs/mudanza-reglas.md): cada caso se escribe contra la base y
// la moneda que quedó se compara con la que da transactionCurrency, la regla
// que usaba el cliente. Y cada caso que la base RECHAZA tiene su test, porque
// esos no existen en la versión JS.
//
// Se escribe con el rol authenticated, RLS encendido en liquid_accounts y el
// usuario en sesión: una cuenta ajena tiene que ser "inexistente".
//
// Se aplica el archivo de migración TAL CUAL. Sin Postgres local el test se
// saltea; el CI corre uno.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { transactionCurrency } from './transactions.js'

const DB = `app_finances_account_currency_${process.pid}`

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

const USER = '10101010-1010-4010-8010-101010101010'
const OTHER_USER = '20202020-2020-4020-8020-202020202020'
const EFECTIVO = '11111111-1111-4111-8111-111111111111' // ARS
const MP = '22222222-2222-4222-8222-222222222222' // ARS
const DOLARES = '33333333-3333-4333-8333-333333333333' // USD
const AHORRO = '44444444-4444-4444-8444-444444444444' // USD, ahorro
const AJENA = '99999999-9999-4999-8999-999999999999' // ARS, de OTHER_USER
const CAT = 'aaaaaaaa-0000-4000-8000-000000000001'
const TX = 'bbbbbbbb-0000-4000-8000-000000000001'

// Las cuentas como las ve el cliente, para preguntarle a transactionCurrency.
const ACCOUNTS = [
  { id: EFECTIVO, currency: 'ARS' },
  { id: MP, currency: 'ARS' },
  { id: DOLARES, currency: 'USD' },
]

// Como la app: rol authenticated, con el usuario en sesión.
const asUser = (sql, user = USER) => psql(`set app.current_user_id = '${user}'; set role authenticated; ${sql}`)

function rejection(sql, user) {
  try {
    asUser(sql, user)
    return null
  } catch (e) {
    return String(e.stderr ?? e.message)
  }
}

const currencyOf = (id = TX) => psql(`select currency from transactions where id = '${id}';`).trim()

// Esquema mínimo: solo lo que la migración toca, con los mismos tipos.
const SCHEMA = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
exception when duplicate_object or unique_violation then null; -- carrera entre archivos en paralelo
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;
grant usage on schema auth to authenticated;

create table liquid_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  currency text not null default 'ARS',
  is_savings boolean not null default false,
  is_archived boolean not null default false
);
alter table liquid_accounts enable row level security;
create policy "own rows" on liquid_accounts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create table categories (id uuid primary key, name text not null);
create table transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  kind text not null default 'expense',
  category_id uuid not null references categories(id),
  description text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'ARS',
  account_id uuid references liquid_accounts(id)
);
create table contributions (
  id uuid primary key default gen_random_uuid(),
  amount_usd numeric(14,2) not null,
  affects_liquid boolean not null default true,
  account_id uuid references liquid_accounts(id)
);
create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  amount_usd numeric(14,2) not null,
  affects_liquid boolean not null default true,
  account_id uuid references liquid_accounts(id)
);
create table commitments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_id uuid references liquid_accounts(id)
);
create table liquid_reconciliations (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  declared_amount numeric(14,2) not null,
  account_id uuid references liquid_accounts(id)
);
grant all on all tables in schema public to authenticated;

-- Un conteo viejo sin cuenta (anterior a la 0032): tiene que sobrevivir.
insert into liquid_reconciliations (declared_amount, account_id) values (1000, null);
`

// Cada test arranca del mismo mundo. La limpieza apaga los triggers
// (replica): si no, borrar la última cuenta la propia guarda lo impediría.
const SEED = `
set session_replication_role = replica;
delete from liquid_reconciliations where account_id is not null;
delete from transactions; delete from contributions; delete from debt_payments; delete from commitments;
delete from liquid_accounts;
set session_replication_role = origin;
insert into liquid_accounts (id, user_id, name, currency, is_savings) values
  ('${EFECTIVO}', '${USER}', 'Efectivo', 'ARS', false),
  ('${MP}', '${USER}', 'Mercado Pago', 'ARS', false),
  ('${DOLARES}', '${USER}', 'Dólares', 'USD', false),
  ('${AHORRO}', '${USER}', 'Ahorro', 'USD', true),
  ('${AJENA}', '${OTHER_USER}', 'Ajena', 'ARS', false);
insert into transactions (id, category_id, amount, account_id) values ('${TX}', '${CAT}', 50000, '${EFECTIVO}');
`

describe.skipIf(!available)('0050: moneda y cuenta de cada movimiento (SQL)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(`insert into categories values ('${CAT}', 'Comida');`)
    psql(readFileSync('supabase/migrations/0050_account_currency_rules.sql', 'utf8'))
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  beforeEach(() => psql(SEED))

  describe('paridad con transactionCurrency', () => {
    it('A. crear: la moneda es la de la cuenta, aunque el cliente mande otra', () => {
      const id = 'bbbbbbbb-0000-4000-8000-000000000002'
      asUser(`insert into transactions (id, category_id, amount, currency, account_id)
              values ('${id}', '${CAT}', 10, 'ARS', '${DOLARES}');`)
      expect(currencyOf(id)).toBe(transactionCurrency({ accountId: DOLARES, accounts: ACCOUNTS }))
      expect(currencyOf(id)).toBe('USD')
    })

    it('A. crear sin mandar moneda: también la de la cuenta', () => {
      const id = 'bbbbbbbb-0000-4000-8000-000000000003'
      asUser(`insert into transactions (id, category_id, amount, account_id) values ('${id}', '${CAT}', 10, '${DOLARES}');`)
      expect(currencyOf(id)).toBe('USD')
    })

    it('C. editar sin tocar la cuenta: la moneda de la fila queda igual', () => {
      const initial = { account_id: EFECTIVO, currency: 'ARS' }
      const currency = transactionCurrency({ initial, accountId: EFECTIVO, accounts: ACCOUNTS })
      asUser(`update transactions set amount = 60000, currency = '${currency}' where id = '${TX}';`)
      expect(currencyOf()).toBe('ARS')
    })

    it("C'. pasar a otra cuenta de la misma moneda: pasa", () => {
      const initial = { account_id: EFECTIVO, currency: 'ARS' }
      const currency = transactionCurrency({ initial, accountId: MP, accounts: ACCOUNTS })
      asUser(`update transactions set account_id = '${MP}', currency = '${currency}' where id = '${TX}';`)
      expect(currencyOf()).toBe('ARS')
    })

    it("C'. pasar a otra cuenta de la misma moneda sin mandar moneda: pasa", () => {
      asUser(`update transactions set account_id = '${MP}' where id = '${TX}';`)
      expect(currencyOf()).toBe('ARS')
    })

    it('D. pasar a una cuenta de otra moneda mandando la moneda nueva: pasa', () => {
      const initial = { account_id: EFECTIVO, currency: 'ARS' }
      const currency = transactionCurrency({ initial, accountId: DOLARES, accounts: ACCOUNTS })
      asUser(`update transactions set account_id = '${DOLARES}', amount = 50, currency = '${currency}' where id = '${TX}';`)
      expect(currencyOf()).toBe('USD')
    })
  })

  describe('rechazos', () => {
    it('D. pasar a una cuenta de otra moneda SIN mandar la moneda nueva', () => {
      const err = rejection(`update transactions set account_id = '${DOLARES}' where id = '${TX}';`)
      expect(err).toMatch(/Esta cuenta está en USD y el movimiento estaba en ARS/)
      expect(currencyOf()).toBe('ARS')
    })

    it('C. cambiar la moneda sola, sin cambiar la cuenta', () => {
      expect(rejection(`update transactions set currency = 'USD' where id = '${TX}';`)).toMatch(/no se cambia por separado/)
    })

    it('B. crear un movimiento sin cuenta', () => {
      expect(rejection(`insert into transactions (category_id, amount) values ('${CAT}', 10);`)).toMatch(
        /Todo movimiento tiene que tener una cuenta/,
      )
    })

    it('B. sacarle la cuenta a un movimiento', () => {
      expect(rejection(`update transactions set account_id = null where id = '${TX}';`)).toMatch(
        /Todo movimiento tiene que tener una cuenta/,
      )
    })

    it('una cuenta de otro usuario es inexistente', () => {
      expect(
        rejection(`insert into transactions (category_id, amount, account_id) values ('${CAT}', 10, '${AJENA}');`),
      ).toMatch(/Cuenta inexistente o de otro usuario/)
    })

    it('B. aporte y pago de deuda del disponible sin cuenta; los "de afuera" sí pueden', () => {
      expect(rejection(`insert into contributions (amount_usd, affects_liquid) values (10, true);`)).toMatch(
        /contributions_liquid_needs_account/,
      )
      expect(rejection(`insert into debt_payments (amount_usd, affects_liquid) values (10, true);`)).toMatch(
        /debt_payments_liquid_needs_account/,
      )
      asUser(`insert into contributions (amount_usd, affects_liquid) values (10, false);
              insert into debt_payments (amount_usd, affects_liquid) values (10, false);`)
    })

    it('B. plan de A pagar sin cuenta', () => {
      expect(rejection(`insert into commitments (name) values ('Netflix');`)).toMatch(/account_id/)
    })

    it('B. conteo nuevo sin cuenta; el viejo sigue ahí', () => {
      expect(rejection(`insert into liquid_reconciliations (declared_amount) values (5);`)).toMatch(
        /liquid_reconciliations_account_required/,
      )
      expect(psql('select count(*) from liquid_reconciliations where account_id is null;').trim()).toBe('1')
    })

    it('E. una cuenta con movimientos no cambia de moneda; una sin historia sí', () => {
      expect(rejection(`update liquid_accounts set currency = 'USD' where id = '${EFECTIVO}';`)).toMatch(
        /ya tiene movimientos/,
      )
      asUser(`update liquid_accounts set currency = 'USD' where id = '${MP}';`)
      expect(psql(`select currency from liquid_accounts where id = '${MP}';`).trim()).toBe('USD')
    })

    it('E. vale también para aportes, pagos y conteos', () => {
      psql(`insert into contributions (amount_usd, account_id) values (10, '${MP}');
            insert into debt_payments (amount_usd, account_id) values (10, '${DOLARES}');
            insert into liquid_reconciliations (declared_amount, account_id) values (1, '${AHORRO}');`)
      for (const id of [MP, DOLARES, AHORRO]) {
        expect(rejection(`update liquid_accounts set currency = 'EUR' where id = '${id}';`)).toMatch(/ya tiene movimientos/)
      }
    })

    describe('la última cuenta del día a día', () => {
      // Deja a USER con una sola cuenta del día a día (Efectivo) y la de ahorro.
      const onlyEfectivo = () =>
        asUser(`update transactions set account_id = '${EFECTIVO}' where id = '${TX}';
                delete from liquid_accounts where id in ('${MP}', '${DOLARES}');`)

      it('no se borra', () => {
        onlyEfectivo()
        expect(rejection(`delete from liquid_accounts where id = '${EFECTIVO}';`)).toMatch(/única cuenta para el día a día/)
      })

      it('no se oculta', () => {
        onlyEfectivo()
        expect(rejection(`update liquid_accounts set is_archived = true where id = '${EFECTIVO}';`)).toMatch(
          /única cuenta para el día a día/,
        )
      })

      it('no pasa a ahorro (la de ahorro no cuenta como del día a día)', () => {
        onlyEfectivo()
        expect(rejection(`update liquid_accounts set is_savings = true where id = '${EFECTIVO}';`)).toMatch(
          /única cuenta para el día a día/,
        )
      })

      it('con otra del día a día, sí se puede', () => {
        asUser(`update liquid_accounts set is_archived = true where id = '${DOLARES}';
                delete from liquid_accounts where id = '${MP}';`)
        expect(psql(`select count(*) from liquid_accounts where user_id = '${USER}' and not is_archived and not is_savings;`).trim()).toBe('1')
      })
    })
  })
})
