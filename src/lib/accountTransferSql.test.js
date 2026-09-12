// create_account_transfer (migración 0040), corrido contra un Postgres de
// verdad — mismo criterio que reconcileSql.test.js: desde la 0040 todo lo que
// una transferencia entre cuentas ESCRIBE lo escribe la base, y probar eso
// con un mock no probaría nada.
//
// auth.uid() se emula con una función stub que lee un GUC de sesión
// (app.current_user_id), fijado en el mismo -c que llama a la función —
// reconcile_liquid no lo necesitó (nunca llama a auth.uid()), pero
// create_account_transfer sí, para el chequeo de pertenencia (mismo criterio
// que create_transfer, 0017).
//
// Se aplica el archivo de migración TAL CUAL. Sin Postgres local el test se
// saltea: es una verificación de máquina de desarrollo, no un requisito para
// correr la suite.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DB = `app_finances_account_transfer_${process.pid}`

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

function psqlExpectingFailure(sql) {
  try {
    psql(sql)
    return null
  } catch (e) {
    return String(e.stderr ?? e.message)
  }
}

const rows = (sql) =>
  psql(sql)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))

const count = (table) => Number(psql(`select count(*) from ${table};`).trim())

const USER = '10101010-1010-4010-8010-101010101010'
const OTHER_USER = '20202020-2020-4020-8020-202020202020'
const EFECTIVO = '11111111-1111-4111-8111-111111111111' // ARS, del USER
const MERCADO_PAGO = '22222222-2222-4222-8222-222222222222' // ARS, del USER
const AHORRO_USD = '33333333-3333-4333-8333-333333333333' // USD, del USER
const AJENA = '99999999-9999-4999-8999-999999999999' // ARS, de OTHER_USER

// Esquema mínimo: solo lo que la función toca, con los mismos tipos y CHECKs
// que la base real. Sin transfer_id en transactions -- lo agrega la propia
// migración, que se aplica tal cual más abajo (mismo criterio que
// reconcileSql.test.js con amount_ars/amount).
const SCHEMA = `
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  is_system boolean not null default false,
  system_key text,
  is_archived boolean not null default false,
  position int not null default 0
);
create table liquid_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  currency text not null default 'ARS'
);
create table transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null check (kind in ('expense','income')),
  category_id uuid not null references categories(id),
  description text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'ARS',
  account_id uuid references liquid_accounts(id)
);
-- El rol de Supabase no existe en un Postgres local (mismo problema que
-- reconcileSql.test.js).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
-- auth.uid() no existe fuera de Supabase: se emula leyendo un GUC de sesión,
-- fijado con "set" en el mismo -c que hace la llamada real.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;
-- Lo que la 0041 toca al aplicarse: siembra la categoría nueva a partir de
-- auth.users, redefine handle_new_user (cuyo cuerpo no se valida al crearla,
-- pero sí necesita que las tablas existan para el insert que sí corre) y
-- enlaza el reparto desde liquid_reconciliations.
create table auth.users (id uuid primary key);
insert into auth.users values ('${USER}');
create table asset_types (id uuid primary key default gen_random_uuid(), user_id uuid, name text,
  earns_yield boolean, include_in_total boolean, display_order int);
create table settings (user_id uuid primary key);
create table liquid_reconciliations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  declared_amount numeric(14,2) not null,
  adjustment_transaction_id uuid references transactions(id),
  account_id uuid references liquid_accounts(id)
);
`

const SEED = `
truncate transactions, liquid_accounts, categories cascade;
-- Las dos llaves conviven a propósito: desde la 0041 una transferencia usa
-- 'account_transfer' y 'savings_movement' queda solo para los aportes y
-- retiros de una cuenta de ahorro. Si la función volviera a la llave vieja,
-- los tests de más abajo --que exigen la categoría correcta-- se caerían.
insert into categories (id, user_id, name, kind, is_system, system_key) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '${USER}', 'Movimiento de ahorro', 'expense', true, 'savings_movement'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '${USER}', 'Movimiento de ahorro', 'income', true, 'savings_movement'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '${USER}', 'Transferencia de cuenta', 'expense', true, 'account_transfer'),
  ('aaaaaaaa-0000-4000-8000-000000000004', '${USER}', 'Transferencia de cuenta', 'income', true, 'account_transfer');
insert into liquid_accounts (id, user_id, name, currency) values
  ('${EFECTIVO}', '${USER}', 'Efectivo', 'ARS'),
  ('${MERCADO_PAGO}', '${USER}', 'Mercado Pago', 'ARS'),
  ('${AHORRO_USD}', '${USER}', 'Ahorro USD', 'USD'),
  ('${AJENA}', '${OTHER_USER}', 'Cuenta ajena', 'ARS');
`

const transferSql = (from, to, fromAmount, toAmount) =>
  `set app.current_user_id = '${USER}';
   select create_account_transfer('${from}', '${to}', '2026-09-05', ${fromAmount}, ${toAmount});`

const transfer = (from, to, fromAmount, toAmount) => psql(transferSql(from, to, fromAmount, toAmount)).trim()
const transferExpectingFailure = (from, to, fromAmount, toAmount) =>
  psqlExpectingFailure(transferSql(from, to, fromAmount, toAmount))

// Las dos patas, por kind (una sola de cada una por transferencia).
function legsByKind() {
  const data = rows(
    `select kind, amount, currency, account_id, description, coalesce(transfer_id::text, 'null')
     from transactions order by kind;`,
  )
  const map = {}
  for (const [kind, amount, currency, accountId, description, transferId] of data) {
    map[kind] = { amount, currency, accountId, description, transferId }
  }
  return map
}

const available = hasPostgres()

describe.skipIf(!available)('create_account_transfer (SQL)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0040_account_transfers.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0041_reconcile_netting.sql', 'utf8'))
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  beforeEach(() => psql(SEED))

  it('misma moneda: las dos patas llevan el mismo monto', () => {
    transfer(EFECTIVO, MERCADO_PAGO, 1000, 1000)
    const legs = legsByKind()
    expect(legs.expense).toMatchObject({ amount: '1000.00', currency: 'ARS', accountId: EFECTIVO })
    expect(legs.income).toMatchObject({ amount: '1000.00', currency: 'ARS', accountId: MERCADO_PAGO })
  })

  it('distinta moneda: cada pata guarda el monto que efectivamente entró o salió, en su propia moneda', () => {
    transfer(EFECTIVO, AHORRO_USD, 15000, 10)
    const legs = legsByKind()
    expect(legs.expense).toMatchObject({ amount: '15000.00', currency: 'ARS', accountId: EFECTIVO })
    expect(legs.income).toMatchObject({ amount: '10.00', currency: 'USD', accountId: AHORRO_USD })
  })

  it('las dos patas comparten transfer_id, y ninguna otra fila lo tiene', () => {
    transfer(EFECTIVO, MERCADO_PAGO, 1000, 1000)
    const legs = legsByKind()
    expect(legs.expense.transferId).not.toBe('null')
    expect(legs.expense.transferId).toBe(legs.income.transferId)
  })

  it('la descripción de cada pata nombra la OTRA cuenta', () => {
    transfer(EFECTIVO, MERCADO_PAGO, 1000, 1000)
    const legs = legsByKind()
    expect(legs.expense.description).toBe('Transferencia a Mercado Pago')
    expect(legs.income.description).toBe('Transferencia de Efectivo')
  })

  it('rechaza origen y destino iguales, sin escribir nada', () => {
    const err = transferExpectingFailure(EFECTIVO, EFECTIVO, 1000, 1000)
    expect(err).toMatch(/cuentas distintas/)
    expect(count('transactions')).toBe(0)
  })

  it('rechaza una cuenta de origen inexistente o de otro usuario', () => {
    const err = transferExpectingFailure(AJENA, EFECTIVO, 1000, 1000)
    expect(err).toMatch(/origen inexistente o de otro usuario/)
    expect(count('transactions')).toBe(0)
  })

  it('rechaza una cuenta de destino inexistente o de otro usuario', () => {
    const err = transferExpectingFailure(EFECTIVO, AJENA, 1000, 1000)
    expect(err).toMatch(/destino inexistente o de otro usuario/)
    expect(count('transactions')).toBe(0)
  })

  it('rechaza un monto que no sea mayor a cero, en cualquiera de las dos patas', () => {
    expect(transferExpectingFailure(EFECTIVO, MERCADO_PAGO, 0, 1000)).toMatch(/mayor a cero/)
    expect(transferExpectingFailure(EFECTIVO, MERCADO_PAGO, 1000, -5)).toMatch(/mayor a cero/)
    expect(count('transactions')).toBe(0)
  })

  it('la categoría es "Transferencia de cuenta", no "Movimiento de ahorro"', () => {
    // El cambio de la 0041: 'savings_movement' mentía en la mitad de sus usos.
    // Transferir de Efectivo a Mercado Pago no es un ahorro, la plata sigue
    // siendo líquida.
    transfer(EFECTIVO, MERCADO_PAGO, 1000, 1000)

    expect(
      rows(`select distinct c.system_key from transactions t
            join categories c on c.id = t.category_id;`),
    ).toEqual([['account_transfer']])
  })

  it('sin la categoría del sistema, avisa en vez de escribir a medias', () => {
    psql(`update categories set is_archived = true where system_key = 'account_transfer';`)
    const err = transferExpectingFailure(EFECTIVO, MERCADO_PAGO, 1000, 1000)
    expect(err).toMatch(/Transferencia de cuenta/)
    expect(count('transactions')).toBe(0)
  })
})

// ── La migración de lo que ya está cargado (0041) ──────────────────────────
// Las transferencias viejas quedaron anotadas con 'savings_movement', que
// miente: transferir de Efectivo a Mercado Pago no es un ahorro. Cambiarlas de
// categoría es mecánico —no toca montos, saldos ni cuentas— pero tiene que
// alcanzar SOLO a las transferencias: un aporte o un retiro de una cuenta de
// ahorro (SavingsMovementModal) no lleva transfer_id y sigue siendo un
// movimiento de ahorro de verdad.
//
// Base propia porque hace falta el estado ANTERIOR a la migración: filas
// escritas por la 0040 y recién después la 0041 encima.
const OLD_DB = `app_finances_transfer_migration_${process.pid}`

const oldPsql = (sql) =>
  execFileSync('psql', ['-d', OLD_DB, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
  })

describe.skipIf(!available)('la migración de las transferencias ya cargadas (0041)', () => {
  beforeAll(() => {
    execFileSync('createdb', [OLD_DB])
    oldPsql(SCHEMA)
    oldPsql(readFileSync('supabase/migrations/0040_account_transfers.sql', 'utf8'))
    // El mundo como estaba: las dos categorías viejas, y nada más.
    oldPsql(`
      insert into categories (id, user_id, name, kind, is_system, system_key) values
        ('aaaaaaaa-0000-4000-8000-000000000001', '${USER}', 'Movimiento de ahorro', 'expense', true, 'savings_movement'),
        ('aaaaaaaa-0000-4000-8000-000000000002', '${USER}', 'Movimiento de ahorro', 'income', true, 'savings_movement');
      insert into liquid_accounts (id, user_id, name, currency) values
        ('${EFECTIVO}', '${USER}', 'Efectivo', 'ARS'),
        ('${MERCADO_PAGO}', '${USER}', 'Mercado Pago', 'ARS');
    `)
    // Una transferencia de verdad, escrita por la función de la 0040...
    oldPsql(`set app.current_user_id = '${USER}';
             select create_account_transfer('${EFECTIVO}', '${MERCADO_PAGO}', '2026-08-01', 1000, 1000);`)
    // ...y un aporte a una cuenta de ahorro, que NO es una transferencia: una
    // sola fila, sin transfer_id, con la misma categoría.
    oldPsql(`insert into transactions (date, kind, category_id, description, amount, currency, account_id)
             values ('2026-08-02', 'income', 'aaaaaaaa-0000-4000-8000-000000000002',
                     'Aporte al ahorro', 500, 'ARS', '${MERCADO_PAGO}');`)

    oldPsql(readFileSync('supabase/migrations/0041_reconcile_netting.sql', 'utf8'))
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', OLD_DB])
  })

  const categorized = () =>
    oldPsql(`select coalesce(t.description, ''), c.system_key from transactions t
             join categories c on c.id = t.category_id order by t.date, t.kind;`)
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t'))

  it('las dos patas de una transferencia pasan a "Transferencia de cuenta"', () => {
    expect(categorized()).toEqual([
      ['Transferencia a Mercado Pago', 'account_transfer'],
      ['Transferencia de Efectivo', 'account_transfer'],
      // El aporte al ahorro queda donde estaba: no tiene transfer_id, no es
      // una transferencia entre cuentas.
      ['Aporte al ahorro', 'savings_movement'],
    ])
  })

  it('no toca montos, cuentas ni fechas: es un cambio de etiqueta', () => {
    expect(
      oldPsql(`select sum(case when kind = 'income' then amount else -amount end) from transactions;`).trim(),
    ).toBe('500.00') // +1000 −1000 (la transferencia) +500 (el aporte)
    expect(oldPsql(`select count(*) from transactions where account_id is null;`).trim()).toBe('0')
  })

  it('la categoría nueva nace para cada usuario que ya existía', () => {
    expect(
      oldPsql(`select kind from categories where system_key = 'account_transfer' order by kind;`)
        .split('\n')
        .filter(Boolean),
    ).toEqual(['expense', 'income'])
  })
})
