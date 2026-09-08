// La migración de los activos "Vale lo que pusiste" a cuentas de ahorro
// (0038), corrida contra un Postgres de verdad.
//
// Esto no se puede probar con un mock: lo que hay que demostrar es que un
// script de migración, aplicado sobre el esquema real y en el orden real,
// deja los datos donde tienen que quedar Y NO MUEVE EL DISPONIBLE. La segunda
// mitad es la que importa: la migración escribe movimientos nuevos, y la única
// forma de saber que no tocó la plata de todos los días es medirla antes,
// aplicar, y volver a medirla.
//
// Se aplica la CADENA COMPLETA de archivos tal cual (0033 → 0034 → 0036 →
// 0037 → 0038), no una copia del SQL: es exactamente lo que va a correr Nacho,
// así que de paso queda probado que se aplican limpio y en ese orden.
//
// Sin Postgres local el test se saltea: es una verificación de máquina de
// desarrollo, no un requisito para correr la suite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function hasPostgres() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const USER = '00000000-0000-4000-8000-000000000001'
const EFECTIVO = '11111111-1111-4111-8111-111111111111'
const DOLARES = 'aaaaaaaa-1111-4111-8111-111111111111' // el activo 'contributed'
const BITCOIN = 'bbbbbbbb-2222-4222-8222-222222222222' // un 'live' que sobrevive
const TRANSFER = 'cccccccc-3333-4333-8333-333333333333'
const BOLSA = 'dddddddd-4444-4444-8444-444444444444'

// Esquema tal como está la base ANTES de la 0036 (0001 + 0009 + 0014 + 0015 +
// 0016 + 0032 + 0035), con los mismos tipos, escalas y CHECKs: las migraciones
// de la cadena lo van transformando desde ahí.
//
// instrument_prices_usd es una TABLA y no la vista de la 0026 a propósito:
// get_portfolio_series solo la lee, y montar la vista de verdad obligaría a
// traer instruments + instrument_prices + la cotización del MEP para probar
// algo que esta migración no toca.
const SCHEMA = `
create schema if not exists auth;
create table auth.users (id uuid primary key);

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  is_system boolean not null default false,
  is_archived boolean not null default false,
  position int not null default 0
);
create table liquid_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  position int not null default 0,
  is_archived boolean not null default false
);
create table asset_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  include_in_total boolean not null default true
);
create table assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  asset_type_id uuid references asset_types(id),
  instrument_id uuid,
  valuation_mode text not null check (valuation_mode in ('contributed','manual','live')),
  is_archived boolean not null default false
);
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  kind text not null check (kind in ('expense','income')),
  category_id uuid not null references categories(id),
  description text,
  amount_ars numeric(14,2) not null check (amount_ars > 0),
  account_id uuid references liquid_accounts(id)
);
create table contributions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  date date not null,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  quantity numeric(20,8),
  mep_rate numeric(10,2),
  affects_liquid boolean not null default true,
  direction text not null default 'in' check (direction in ('in','out')),
  realized_gain numeric(14,2),
  transfer_id uuid,
  account_id uuid references liquid_accounts(id)
);
create table asset_valuations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  date date not null,
  value_usd numeric(14,2) not null check (value_usd >= 0)
);
create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  mep_rate numeric(10,2),
  affects_liquid boolean not null default true,
  account_id uuid references liquid_accounts(id)
);
create table liquid_reconciliations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  declared_amount_ars numeric(14,2) not null check (declared_amount_ars >= 0),
  adjustment_transaction_id uuid references transactions(id),
  account_id uuid references liquid_accounts(id)
);
create table instrument_prices_usd (
  instrument_id uuid,
  date date,
  price_usd numeric
);
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
`

// Un usuario con una cuenta en pesos, un activo 'contributed' que se va a
// migrar y un 'live' que sobrevive. Las operaciones del 'contributed' tocan a
// propósito los cuatro casos que la migración trata: un aporte de afuera, uno
// que salió del disponible, un retiro, y una pata de transferencia cuya
// contraparte vive en el activo que NO se migra.
const SEED = `
insert into auth.users values ('${USER}');
insert into categories (user_id, name, kind, is_system, position) values
  ('${USER}', 'Ajuste de saldo', 'expense', true, 100),
  ('${USER}', 'Ajuste de saldo', 'income', true, 100),
  ('${USER}', 'Sueldo', 'income', false, 0);
insert into liquid_accounts (id, user_id, name, position) values
  ('${EFECTIVO}', '${USER}', 'Efectivo', 0);
insert into asset_types (id, user_id, name, include_in_total) values
  ('${BOLSA}', '${USER}', 'Efectivo USD', true);
insert into assets (id, user_id, name, asset_type_id, valuation_mode) values
  ('${DOLARES}', '${USER}', 'Dólares', '${BOLSA}', 'contributed'),
  ('${BITCOIN}', '${USER}', 'Bitcoin', '${BOLSA}', 'live');

insert into transactions (user_id, date, kind, category_id, amount_ars, account_id)
select '${USER}', '2026-01-01', 'income',
       (select id from categories where user_id = '${USER}' and name = 'Sueldo'),
       500000, '${EFECTIVO}';

insert into contributions (asset_id, date, amount_usd, mep_rate, affects_liquid, direction, account_id, transfer_id) values
  -- Tenencia previa: no salió del disponible.
  ('${DOLARES}', '2026-01-10', 100, 1000, false, 'in',  null,          null),
  -- Compró dólares con pesos: SÍ salió del disponible (200 × 1500 = 300.000).
  ('${DOLARES}', '2026-02-10', 200, 1500, true,  'in',  '${EFECTIVO}', null),
  -- Vendió dólares: vuelven al disponible (50 × 1600 = 80.000).
  ('${DOLARES}', '2026-03-10',  50, 1600, true,  'out', '${EFECTIVO}', null),
  -- Pata de una transferencia hacia Bitcoin: no toca el disponible.
  ('${DOLARES}', '2026-04-10',  30, null, false, 'out', null,          '${TRANSFER}'),
  ('${BITCOIN}', '2026-04-10',  30, null, false, 'in',  null,          '${TRANSFER}');
`

const MIGRATIONS = [
  '0033_liquid_by_account.sql',
  '0034_reconcile_liquid.sql',
  '0036_account_currency_and_savings.sql',
  '0037_categories_system_key.sql',
]
const SAVINGS_MIGRATION = '0038_contributed_assets_to_savings_accounts.sql'

const available = hasPostgres()

// Cada escenario levanta su propia base: la migración corre UNA vez y lo que
// se prueba es en qué estado la deja.
function makeDb(name, extraSeed = '') {
  const db = `app_finances_savings_${name}_${process.pid}`
  const psql = (sql) =>
    execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql], {
      encoding: 'utf8',
    })
  const file = (path, single = false) =>
    execFileSync(
      'psql',
      ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', ...(single ? ['-1'] : []), '-f', path],
      { encoding: 'utf8' },
    )

  execFileSync('dropdb', ['--if-exists', db])
  execFileSync('createdb', [db])
  psql(SCHEMA)
  psql(SEED)
  if (extraSeed) psql(extraSeed)
  for (const m of MIGRATIONS) psql(readFileSync(`supabase/migrations/${m}`, 'utf8'))

  const rows = (sql) =>
    psql(sql)
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t'))

  return { db, psql, file, rows, one: (sql) => rows(sql)[0], drop: () => execFileSync('dropdb', ['--if-exists', db]) }
}

// El disponible EN PESOS, que es el número que no se puede mover.
const liquidArs = (h) =>
  h.rows(`select coalesce(account_id::text,'null'), amount from get_liquid_by_account()
          where currency = 'ARS' order by 1;`)

describe.skipIf(!available)('0038: los activos contributed pasan a ser cuentas de ahorro', () => {
  let h
  let before
  let after

  beforeAll(() => {
    h = makeDb('ok')
    before = liquidArs(h)
    // La migración se aplica en UNA transacción (-1), igual que la corre el
    // editor SQL de Supabase: o entra entera o no entra nada.
    h.file(`supabase/migrations/${SAVINGS_MIGRATION}`, true)
    after = liquidArs(h)
  })

  afterAll(() => {
    if (available) h.drop()
  })

  // ── Lo que no se puede mover ──────────────────────────────────────────────
  it('el disponible en pesos queda EXACTAMENTE igual', () => {
    // 500.000 de sueldo − 300.000 de la compra + 80.000 de la venta = 280.000.
    // Con cuatro decimales porque la función no redondea: los aportes entran
    // como amount_usd × mep_rate y el redondeo a centavos lo hace el cliente.
    expect(before).toEqual([[EFECTIVO, '280000.0000']])
    expect(after).toEqual(before)
  })

  it('las contributions del activo migrado no se tocaron', () => {
    expect(h.one(`select count(*) from contributions where asset_id = '${DOLARES}';`)).toEqual(['4'])
    expect(
      h.one(`select count(*) from contributions where affects_liquid = true and account_id = '${EFECTIVO}';`),
    ).toEqual(['2'])
  })

  it('la transferencia sigue teniendo sus dos patas', () => {
    // Es lo que se habría roto si el lado 'contributed' se borrara: la
    // contraparte vive en Bitcoin, que no se migra.
    expect(h.one(`select count(*) from contributions where transfer_id = '${TRANSFER}';`)).toEqual(['2'])
  })

  // ── Lo que la migración crea ──────────────────────────────────────────────
  it('crea una cuenta de ahorro en dólares con el nombre del activo, al final de la lista', () => {
    expect(
      h.one(`select name, currency, is_savings, is_archived, position from liquid_accounts
             where is_savings = true;`),
    ).toEqual(['Dólares', 'USD', 't', 'f', '1'])
  })

  it('convierte cada operación en un movimiento de la cuenta, con su fecha original', () => {
    const account = h.one(`select id from liquid_accounts where is_savings = true;`)[0]
    expect(
      h.rows(`select date, kind, amount, currency from transactions
              where account_id = '${account}' order by date;`),
    ).toEqual([
      ['2026-01-10', 'income', '100.00', 'USD'],
      ['2026-02-10', 'income', '200.00', 'USD'],
      ['2026-03-10', 'expense', '50.00', 'USD'],
      ['2026-04-10', 'expense', '30.00', 'USD'], // la pata de la transferencia
    ])
  })

  it('los movimientos van a la categoría del sistema, así que no cuentan como gastos', () => {
    // getExpenses filtra is_system: sin esto, el retiro de ahorro aparecería
    // en el bloque de Gastos de Inicio.
    expect(
      h.rows(`select distinct c.system_key, c.is_system from transactions t
              join categories c on c.id = t.category_id
              where t.currency = 'USD';`),
    ).toEqual([['savings_movement', 't']])
  })

  it('el saldo de la cuenta de ahorro es el aportado neto del activo', () => {
    // 100 + 200 − 50 − 30 = 220, en dólares y sin convertir.
    expect(
      h.one(`select currency, amount from get_liquid_by_account() where is_savings = true;`),
    ).toEqual(['USD', '220.00'])
  })

  // ── Lo que pasa con el activo ─────────────────────────────────────────────
  it('el activo queda archivado y apuntando a la cuenta en la que se convirtió', () => {
    expect(
      h.one(`select is_archived, (savings_account_id is not null) from assets where id = '${DOLARES}';`),
    ).toEqual(['t', 't'])
    // Y el que sobrevive no se tocó.
    expect(
      h.one(`select is_archived, (savings_account_id is null) from assets where id = '${BITCOIN}';`),
    ).toEqual(['f', 't'])
  })

  it('el gráfico deja de contarlo, y no de a poco: desde su primera operación', () => {
    const serie = (d) =>
      h.one(`select total_value, contributed from get_portfolio_series('${d}','${d}');`)
    // Antes de la primera operación de Bitcoin (la transferencia del 2026-04-10)
    // el portafolio queda en cero: lo único que había hasta ahí era el activo
    // migrado. Es la baja del gráfico que hay que avisarle al usuario.
    expect(serie('2026-03-01')).toEqual(['0.00', '0.00'])
    // Y desde la transferencia queda solo lo que entró a Bitcoin.
    expect(serie('2026-04-10')).toEqual(['30.00', '30.00'])
  })
})

describe.skipIf(!available)('0038: guardas', () => {
  it('aborta sin escribir nada si el nombre del activo choca con una cuenta', () => {
    const h = makeDb('clash', `
      insert into liquid_accounts (user_id, name, position) values ('${USER}', 'dólares', 1);
    `)
    try {
      let error = null
      try {
        h.file(`supabase/migrations/${SAVINGS_MIGRATION}`, true)
      } catch (e) {
        error = String(e.stderr ?? e.message)
      }

      expect(error).toMatch(/nombre ya lo usa una cuenta/)
      // Y no quedó nada a medio hacer: ni cuenta de ahorro, ni movimientos, ni
      // el activo archivado. La migración entera es una transacción.
      expect(h.one(`select count(*) from liquid_accounts where is_savings = true;`)).toEqual(['0'])
      expect(h.one(`select count(*) from transactions where currency = 'USD';`)).toEqual(['0'])
      expect(h.one(`select is_archived from assets where id = '${DOLARES}';`)).toEqual(['f'])
    } finally {
      h.drop()
    }
  })
})
