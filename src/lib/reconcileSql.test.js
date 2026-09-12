// La reconciliación del disponible, corrida contra un Postgres de verdad.
//
// Desde la migración 0034 todo lo que la reconciliación ESCRIBE lo escribe la
// base (reconcile_liquid): los ajustes en transactions, las filas de
// liquid_reconciliations, y la decisión de cuáles corresponden. El cliente
// hace una sola llamada. Así que probar esto con un mock no probaría nada —
// hay que correr el SQL.
//
// Y sobre todo: hay que probar la ATOMICIDAD, que es la razón de ser de la
// migración. Un mock nunca puede demostrar que un fallo a mitad de camino no
// deja rastro, porque no hay transacción que revertir. Acá sí: se le pasa una
// declaración que revienta DESPUÉS de que la primera cuenta ya escribió, y se
// cuenta que no haya quedado ni una fila.
//
// Desde la migración 0041 hay una segunda cosa que verificar contra datos: el
// NETEO. Un conteo escribe el gasto real (el neto del total de cada moneda) y
// el reparto entre cuentas por separado, y las dos propiedades que no se
// pueden perder —cada cuenta cuadrada en lo declarado, y el reparto sumando
// exactamente cero— son aritméticas, así que se comprueban con números.
//
// Se aplica el archivo de migración TAL CUAL (no una copia del SQL: si el
// archivo cambia, el test corre lo nuevo). Sin Postgres local el test se
// saltea: es una verificación de máquina de desarrollo, no un requisito para
// correr la suite.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { planReconciliation } from './liquid.js'

const DB = `app_finances_reconcile_${process.pid}`

function hasPostgres() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// -A -t -F '\t': sin encabezados ni alineación, columnas separadas por tabs.
const psql = (sql) =>
  execFileSync('psql', ['-d', DB, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
  })

// Igual que psql, pero para el caso que se espera que falle: devuelve el error
// en vez de tirarlo, para poder mirar el mensaje Y el estado de las tablas.
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

const one = (sql) => rows(sql)[0]
const count = (table) => Number(one(`select count(*) from ${table};`)[0])

const USER = '10101010-1010-4010-8010-101010101010'
const EFECTIVO = '11111111-1111-4111-8111-111111111111'
const MERCADO_PAGO = '22222222-2222-4222-8222-222222222222'
const AJENA = '99999999-9999-4999-8999-999999999999' // no existe (o es de otro usuario)

// Esquema mínimo: solo lo que la función toca, con los MISMOS tipos, escalas y
// CHECKs que la base real (0001 / 0009 / 0032). Los CHECKs importan: uno de
// ellos es el que dispara el fallo a mitad de camino del test de atomicidad.
//
// Es el esquema ANTES de la 0036: los montos todavía se llaman amount_ars y
// declared_amount_ars, y la migración —que se aplica más abajo tal cual— los
// renombra. El seed y las consultas de más abajo ya usan los nombres nuevos,
// porque corren con las migraciones puestas. Lo mismo con `system_key`
// (0037) y `redistribution_transaction_id` (0041).
//
// `transfer_id` sí está desde el principio, aunque lo agregue la 0040: esta
// tanda no aplica esa migración (no se prueba acá la transferencia entre
// cuentas, eso es accountTransferSql.test.js) y la 0041 lee esa columna para
// reetiquetar las transferencias viejas.
//
// Sin RLS: acá no se prueba el aislamiento (eso es verify:rls), se prueba la
// lógica y la transacción. La función nunca escribe user_id — lo completa el
// default auth.uid() en la base real.
const SCHEMA = `
create schema if not exists auth;
create table auth.users (id uuid primary key);
insert into auth.users values ('${USER}');

create table categories (
  id uuid primary key default gen_random_uuid(),
  -- user_id lo necesita el índice único de la 0037, que es lo que garantiza
  -- que no pueda haber dos categorías del sistema con la misma llave.
  user_id uuid,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  is_system boolean not null default false,
  is_archived boolean not null default false,
  position int not null default 0
);
create table liquid_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  position int not null default 0
);
create table transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null check (kind in ('expense','income')),
  category_id uuid not null references categories(id),
  description text,
  amount_ars numeric(14,2) not null check (amount_ars > 0),
  account_id uuid references liquid_accounts(id),
  transfer_id uuid
);
create table contributions (
  id uuid primary key default gen_random_uuid(),
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  mep_rate numeric(10,2),
  direction text not null default 'in' check (direction in ('in','out')),
  affects_liquid boolean not null default true,
  account_id uuid references liquid_accounts(id)
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
-- Las tablas que toca handle_new_user, que la 0041 redefine: el cuerpo de una
-- función plpgsql no se valida al crearla, pero el archivo también hace un
-- insert sobre categories a partir de auth.users, que sí corre.
create table asset_types (id uuid primary key default gen_random_uuid(), user_id uuid, name text,
  earns_yield boolean, include_in_total boolean, display_order int);
create table settings (user_id uuid primary key);
-- El rol de Supabase no existe en un Postgres local, y las migraciones le
-- hacen un grant. Se crea acá para poder correr los archivos sin tocarlos.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
`

// Efectivo con $10.000 y una reconciliación vieja; Mercado Pago con $5.000 y
// ninguna. Total: $15.000. Mismo escenario que el test del cliente, para poder
// leer los dos en paralelo.
const SEED = `
truncate liquid_reconciliations, transactions, contributions, debt_payments, liquid_accounts, categories cascade;
insert into categories (id, user_id, name, kind, is_system, system_key) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '${USER}', 'Ajuste de saldo', 'income', true, 'balance_adjustment'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '${USER}', 'Ajuste de saldo', 'expense', true, 'balance_adjustment'),
  -- La segunda categoría del sistema, la que la 0037 vino a desambiguar: si
  -- reconcile_liquid volviera a buscar por is_system + kind, el ajuste podría
  -- salir categorizado como movimiento de ahorro y los tests de más abajo
  -- --que exigen la categoría correcta-- se caerían.
  ('aaaaaaaa-0000-4000-8000-000000000004', '${USER}', 'Movimiento de ahorro', 'income', true, 'savings_movement'),
  ('aaaaaaaa-0000-4000-8000-000000000005', '${USER}', 'Movimiento de ahorro', 'expense', true, 'savings_movement'),
  -- Y la tercera (0041), la del reparto de un conteo y las transferencias.
  ('aaaaaaaa-0000-4000-8000-000000000006', '${USER}', 'Transferencia de cuenta', 'income', true, 'account_transfer'),
  ('aaaaaaaa-0000-4000-8000-000000000007', '${USER}', 'Transferencia de cuenta', 'expense', true, 'account_transfer'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '${USER}', 'Comida', 'expense', false, null);
insert into liquid_accounts (id, user_id, name, position) values
  ('${EFECTIVO}', '${USER}', 'Efectivo', 0),
  ('${MERCADO_PAGO}', '${USER}', 'Mercado Pago', 1);
insert into transactions (date, kind, category_id, amount, account_id) values
  ('2026-01-01', 'income', 'aaaaaaaa-0000-4000-8000-000000000001', 10000, '${EFECTIVO}'),
  ('2026-01-01', 'income', 'aaaaaaaa-0000-4000-8000-000000000001', 5000, '${MERCADO_PAGO}');
insert into liquid_reconciliations (date, declared_amount, account_id) values
  ('2026-01-01', 10000, '${EFECTIVO}');
`

// La llamada tal como la hace el cliente: una sola, con todas las cuentas.
const declaration = (accountId, amount) =>
  `jsonb_build_object('account_id', ${accountId === null ? 'null' : `'${accountId}'`}, 'declared_amount', ${amount})`

const reconcileSql = (date, declarations) =>
  `select reconcile_liquid('${date}', jsonb_build_array(${declarations
    .map(([id, amount]) => declaration(id, amount))
    .join(', ')}));`

const reconcile = (date, declarations) => psql(reconcileSql(date, declarations)).trim()

// Lo que escribió un conteo, separado por lo que significa cada categoría.
// El seed deja dos transactions con fecha 2026-01-01, así que filtrar por la
// fecha del conteo alcanza para no verlas.
const writtenOn = (systemKey, date = '2026-09-05') =>
  rows(`select t.kind, t.amount, coalesce(t.account_id::text, 'null'), t.description, t.currency
        from transactions t join categories c on c.id = t.category_id
        where c.system_key = '${systemKey}' and t.date = '${date}' order by t.ctid;`)

// El gasto (o ingreso) que de verdad ocurrió: el neto del total de su moneda.
const adjustments = (date) => writtenOn('balance_adjustment', date)
// Plata que estaba en otra cuenta: no es gasto ni ingreso en ninguna pantalla.
const redistributions = (date) => writtenOn('account_transfer', date)

const reconciliations = () =>
  rows(`select coalesce(account_id::text, 'null'), declared_amount,
               coalesce(adjustment_transaction_id::text, 'null'),
               coalesce(redistribution_transaction_id::text, 'null')
        from liquid_reconciliations where date = '2026-09-05' order by ctid;`)

// El saldo de cada cuenta después de escribir: la propiedad que ningún
// esquema de neteo puede perder.
const balances = () =>
  new Map(
    rows(`select coalesce(account_id::text, 'null'), amount from get_liquid_by_account();`).map(
      ([id, amount]) => [id, Number(amount)],
    ),
  )

const available = hasPostgres()

describe.skipIf(!available)('reconcile_liquid (SQL)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0033_liquid_by_account.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0034_reconcile_liquid.sql', 'utf8'))
    // Y encima el resto, en el mismo orden que la base real: la 0036 renombra
    // los dos montos y reemplaza las dos funciones; la 0037 hace que
    // reconcile_liquid busque su categoría por llave y no por is_system, que
    // desde la 0038 ya no alcanza para distinguirla; la 0041 le agrega el
    // neteo.
    psql(readFileSync('supabase/migrations/0036_account_currency_and_savings.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0037_categories_system_key.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0041_reconcile_netting.sql', 'utf8'))
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  beforeEach(() => psql(SEED))

  // ── Lo que motiva la 0041 ────────────────────────────────────────────────
  // Un conteo produce DOS hechos: cuánto falta EN TOTAL (el gasto real) y
  // dónde estaba la plata (el reparto). Hasta la 0041 se escribían sumados en
  // uno solo, y por eso una reconciliación de varias cuentas inflaba los
  // gastos del mes con plata que nunca se gastó.
  describe('el neteo: qué es gasto y qué es reparto', () => {
    it('una sola cuenta con diferencia se escribe como antes: un ajuste y nada más', () => {
      // El caso más frecuente. Su diff ES el neto, así que no queda resto y no
      // hay ningún movimiento de reparto: la pantalla se ve igual que siempre.
      reconcile('2026-09-05', [
        [EFECTIVO, 12000], // +2000
        [MERCADO_PAGO, 5000], // sin diferencia
      ])

      expect(adjustments()).toEqual([
        ['income', '2000.00', EFECTIVO, 'Reconciliación de disponible', 'ARS'],
      ])
      expect(redistributions()).toEqual([])
    })

    it('si el total no cambia y solo se movió plata entre cuentas, NO hay ningún gasto', () => {
      // El bug entero, en un caso: el efectivo baja $3.000 y Mercado Pago sube
      // $3.000. Antes esto escribía un gasto de $3.000 y un ingreso de $3.000
      // — dos hechos que nunca ocurrieron, sobre un total que no se movió.
      reconcile('2026-09-05', [
        [EFECTIVO, 7000], // −3000
        [MERCADO_PAGO, 8000], // +3000
      ])

      expect(adjustments()).toEqual([])
      expect(redistributions()).toEqual([
        ['expense', '3000.00', EFECTIVO, 'Reparto entre cuentas', 'ARS'],
        ['income', '3000.00', MERCADO_PAGO, 'Reparto entre cuentas', 'ARS'],
      ])

      const after = balances()
      expect(after.get(EFECTIVO)).toBe(7000)
      expect(after.get(MERCADO_PAGO)).toBe(8000)
    })

    it('una cuenta que baja y otra que sube dejan como gasto solo el neto', () => {
      // Efectivo −1000, Mercado Pago +1500: el neto es +500, así que lo único
      // real es un ingreso de $500. El resto es plata que cambió de cuenta.
      reconcile('2026-09-05', [
        [EFECTIVO, 9000],
        [MERCADO_PAGO, 6500],
      ])

      // El ajuste va en Mercado Pago: su diff (+1500) es el que menos resto
      // deja contra el neto (+500). Y es su primer conteo, de ahí el nombre.
      expect(adjustments()).toEqual([
        ['income', '500.00', MERCADO_PAGO, 'Saldo inicial', 'ARS'],
      ])
      expect(redistributions()).toEqual([
        ['expense', '1000.00', EFECTIVO, 'Reparto entre cuentas', 'ARS'],
        ['income', '1000.00', MERCADO_PAGO, 'Reparto entre cuentas', 'ARS'],
      ])
    })

    it('el reparto suma exactamente cero: no crea ni destruye plata', () => {
      reconcile('2026-09-05', [
        [EFECTIVO, 8500], // −1500
        [MERCADO_PAGO, 4800], // −200
      ])

      const total = redistributions().reduce(
        (sum, [kind, amount]) => sum + (kind === 'income' ? 1 : -1) * Number(amount),
        0,
      )
      expect(total).toBe(0)
    })

    it('dos monedas en el mismo conteo no se netean entre sí', () => {
      // Mercado Pago pasa a ser una cuenta en dólares. Los pesos bajan $2.000
      // y los dólares suben US$ 30: si se netearan, cualquiera de los dos
      // números se comería al otro. Son dos ajustes, cada uno en su moneda.
      psql(`update liquid_accounts set currency = 'USD' where id = '${MERCADO_PAGO}';`)

      reconcile('2026-09-05', [
        [EFECTIVO, 8000], // −2000 ARS
        [MERCADO_PAGO, 5030], // +30 USD (la cuenta tenía 5000)
      ])

      expect(adjustments()).toEqual([
        ['expense', '2000.00', EFECTIVO, 'Reconciliación de disponible', 'ARS'],
        ['income', '30.00', MERCADO_PAGO, 'Saldo inicial', 'USD'],
      ])
      // Cada moneda es su propio total, y cada una quedó explicada entera por
      // su ajuste: no hay nada que repartir.
      expect(redistributions()).toEqual([])
    })

    it('una cuenta declarada en 0 la vacía, y eso es un gasto por todo su saldo', () => {
      reconcile('2026-09-05', [[EFECTIVO, 0]])

      expect(adjustments()).toEqual([
        ['expense', '10000.00', EFECTIVO, 'Reconciliación de disponible', 'ARS'],
      ])
      expect(redistributions()).toEqual([])
      expect(balances().get(EFECTIVO)).toBe(0)
    })

    it('vaciar una cuenta y encontrar esa plata en otra no es un gasto', () => {
      // Sacaste todo el efectivo y lo pusiste en Mercado Pago. Declarar 0 y
      // 15.000 tiene que dar neto cero: la plata está toda, en otro lado.
      reconcile('2026-09-05', [
        [EFECTIVO, 0],
        [MERCADO_PAGO, 15000],
      ])

      expect(adjustments()).toEqual([])
      expect(redistributions()).toHaveLength(2)
      const after = balances()
      expect(after.get(EFECTIVO)).toBe(0)
      expect(after.get(MERCADO_PAGO)).toBe(15000)
    })

    it('cada cuenta queda EXACTA en lo declarado, sin resto', () => {
      // La propiedad que no se puede perder, con decimales que no dividen
      // redondo entre dos cuentas.
      reconcile('2026-09-05', [
        [EFECTIVO, 9333.33],
        [MERCADO_PAGO, 5666.67],
      ])

      const after = balances()
      expect(after.get(EFECTIVO)).toBe(9333.33)
      expect(after.get(MERCADO_PAGO)).toBe(5666.67)
    })
  })

  // ── En qué cuenta se anota el neto ───────────────────────────────────────
  // El orden de preferencia está escrito como regla en la migración y acá se
  // verifica entero: no puede depender del orden en que la base devuelva las
  // filas ni del orden en que el cliente mande las declaraciones.
  describe('la elección de la cuenta del ajuste', () => {
    it('gana la cuenta que deja menos resto, sin importar el orden en que llegue', () => {
      // Efectivo −200, Mercado Pago −100, neto −300: Efectivo deja 100 de
      // resto y Mercado Pago 200, así que el gasto se anota en Efectivo.
      const expected = [['expense', '300.00', EFECTIVO, 'Reconciliación de disponible', 'ARS']]

      reconcile('2026-09-05', [
        [EFECTIVO, 9800],
        [MERCADO_PAGO, 4900],
      ])
      expect(adjustments()).toEqual(expected)

      // Y al revés, con las mismas cuentas en el otro orden: mismo resultado.
      psql(SEED)
      reconcile('2026-09-05', [
        [MERCADO_PAGO, 4900],
        [EFECTIVO, 9800],
      ])
      expect(adjustments()).toEqual(expected)
    })

    it('empatado el resto, gana la cuenta del día a día sobre la de ahorro', () => {
      // Las dos se movieron lo mismo (−500 cada una), así que las dos dejan el
      // mismo resto contra el neto de −1000. Desempata no ser de ahorro: un
      // gasto real se lee mejor en la cuenta con la que se vive.
      psql(`update liquid_accounts set is_savings = true where id = '${EFECTIVO}';`)

      reconcile('2026-09-05', [
        [EFECTIVO, 9500],
        [MERCADO_PAGO, 4500],
      ])

      expect(adjustments()[0][2]).toBe(MERCADO_PAGO)
    })

    it('empatado todo lo demás, gana la que va primero en la pantalla', () => {
      // Mismo resto y ninguna es de ahorro: decide `position`, que es el orden
      // en que el usuario las ve.
      reconcile('2026-09-05', [
        [MERCADO_PAGO, 4500],
        [EFECTIVO, 9500],
      ])

      expect(adjustments()[0][2]).toBe(EFECTIVO) // position 0
    })

    it('una cuenta de ahorro se netea con las del día a día de su misma moneda', () => {
      // Plata que pasó del bolsillo al ahorro sin registrarse es justamente lo
      // que no hay que contar como gasto: el total en pesos no cambió.
      psql(`update liquid_accounts set is_savings = true where id = '${MERCADO_PAGO}';`)

      reconcile('2026-09-05', [
        [EFECTIVO, 6000], // −4000
        [MERCADO_PAGO, 9000], // +4000
      ])

      expect(adjustments()).toEqual([])
      expect(redistributions()).toHaveLength(2)
    })
  })

  describe('lo que escribe', () => {
    it('cada cuenta declarada graba su fila, tenga o no ajuste', () => {
      reconcile('2026-09-05', [
        [EFECTIVO, 12000],
        [MERCADO_PAGO, 5000],
      ])

      const written = reconciliations()
      expect(written).toHaveLength(2)
      expect(written[0].slice(0, 2)).toEqual([EFECTIVO, '12000.00'])
      expect(written[0][2]).not.toBe('null') // enlazada a su ajuste
      expect(written[1]).toEqual([MERCADO_PAGO, '5000.00', 'null', 'null'])
    })

    it('la fila de la cuenta que solo se repartió enlaza su reparto, no un ajuste', () => {
      reconcile('2026-09-05', [
        [EFECTIVO, 9800], // lleva el ajuste del neto
        [MERCADO_PAGO, 4900], // solo reparto
      ])

      const [efectivo, mercadoPago] = reconciliations()
      expect(efectivo[2]).not.toBe('null') // ajuste
      expect(mercadoPago[2]).toBe('null') // sin ajuste
      expect(mercadoPago[3]).not.toBe('null') // reparto
    })

    it('una cuenta nunca reconciliada llama a su primer ajuste "Saldo inicial"', () => {
      reconcile('2026-09-05', [[MERCADO_PAGO, 6000]])
      expect(adjustments()[0][3]).toBe('Saldo inicial')

      // Y la siguiente vez ya no: la fila que acaba de escribir es su historia.
      psql(reconcileSql('2026-09-06', [[MERCADO_PAGO, 7000]]))
      expect(adjustments('2026-09-06')[0][3]).toBe('Reconciliación de disponible')
    })

    it('el ajuste deja la cuenta cuadrada en lo declarado, y solo esa cuenta', () => {
      reconcile('2026-09-05', [[EFECTIVO, 12000]])

      const after = balances()
      expect(after.get(EFECTIVO)).toBe(12000)
      expect(after.get(MERCADO_PAGO)).toBe(5000)
    })

    it('el ajuste usa "Ajuste de saldo", no otra categoría del sistema', () => {
      // Es lo que prueba la 0037: con varias categorías del sistema por kind,
      // buscar por `is_system + kind limit 1` elegiría cualquiera. La llave las
      // distingue. Sin este test, el bug entraría en silencio -- el ajuste
      // seguiría teniendo el kind correcto y solo estaría mal categorizado.
      reconcile('2026-09-05', [[EFECTIVO, 12000]])

      expect(
        one(`select c.name from transactions t join categories c on c.id = t.category_id
             where t.date = '2026-09-05';`),
      ).toEqual(['Ajuste de saldo'])
    })

    it('el reparto usa "Transferencia de cuenta", no "Movimiento de ahorro"', () => {
      // La categoría que nace en la 0041: el reparto de un conteo es lo mismo
      // que una transferencia entre cuentas, y no un movimiento de ahorro --
      // que quedó solo para lo que de verdad es ahorro.
      reconcile('2026-09-05', [
        [EFECTIVO, 7000],
        [MERCADO_PAGO, 8000],
      ])

      expect(
        rows(`select distinct c.name from transactions t join categories c on c.id = t.category_id
              where t.date = '2026-09-05';`),
      ).toEqual([['Transferencia de cuenta']])
    })

    it('el ajuste hereda la moneda de la cuenta que se reconcilió', () => {
      psql(`update liquid_accounts set currency = 'USD' where id = '${MERCADO_PAGO}';`)

      reconcile('2026-09-05', [
        [EFECTIVO, 12000], // +2000 ARS
        [MERCADO_PAGO, 6500], // +1500 USD
      ])

      expect(adjustments().map(([, , accountId, , currency]) => [accountId, currency])).toEqual([
        [EFECTIVO, 'ARS'],
        [MERCADO_PAGO, 'USD'],
      ])
    })

    it('una diferencia por debajo del centavo no genera ajuste, pero sí la fila', () => {
      reconcile('2026-09-05', [[EFECTIVO, 10000.004]])
      expect(adjustments()).toHaveLength(0)
      expect(redistributions()).toHaveLength(0)
      expect(reconciliations()).toHaveLength(1)
    })

    it('sin ninguna cuenta cargada se declara el disponible entero, como antes de la 0032', () => {
      psql(`
        delete from liquid_reconciliations;
        update transactions set account_id = null;
        delete from liquid_accounts;
      `)

      reconcile('2026-09-05', [[null, 16000]]) // +1000 sobre 15000

      // Una sola declaración: netea contra sí misma, así que es todo ajuste.
      expect(adjustments()).toEqual([['income', '1000.00', 'null', 'Saldo inicial', 'ARS']])
      expect(redistributions()).toEqual([])
      expect(reconciliations()).toEqual([['null', '16000.00', adjustmentId(), 'null']])
    })

    it('devuelve una fila por cuenta declarada, con su diferencia y el neto de su moneda', () => {
      const result = JSON.parse(
        reconcile('2026-09-05', [
          [EFECTIVO, 12000],
          [MERCADO_PAGO, 5000],
        ]),
      )

      expect(result).toHaveLength(2)
      expect(result[0].account_id).toBe(EFECTIVO)
      expect(Number(result[0].difference)).toBe(2000)
      expect(Number(result[0].net)).toBe(2000)
      expect(result[0].adjustment_transaction_id).not.toBe(null)
      expect(result[1].account_id).toBe(MERCADO_PAGO)
      expect(Number(result[1].difference)).toBe(0)
      expect(result[1].adjustment_transaction_id).toBe(null)
      expect(result[1].redistribution_transaction_id).toBe(null)
    })
  })

  // ── La misma regla, en los dos lados ─────────────────────────────────────
  // planReconciliation (lib/liquid.js) es la definición ejecutable del neteo y
  // la que el modal usa para el preview; reconcile_liquid es la que escribe.
  // Si las dos se separan, el usuario ve una cosa antes de guardar y otra
  // después. Mismo patrón que computeLiquidByAccount vs. get_liquid_by_account
  // en liquidSql.test.js.
  describe('paridad con planReconciliation (JS)', () => {
    const account = (id, current, declaredAmount, extra = {}) => ({
      key: id,
      accountId: id,
      name: id === EFECTIVO ? 'Efectivo' : 'Mercado Pago',
      currency: 'ARS',
      isSavings: false,
      position: id === EFECTIVO ? 0 : 1,
      current,
      declaredAmount,
      ...extra,
    })

    // Lo que el plan del cliente dice que se va a escribir, con la misma forma
    // que devuelven adjustments() / redistributions().
    function predicted(plan) {
      const asRow = (movement, row) => [
        movement.kind,
        movement.amount.toFixed(2),
        row.accountId,
        expect.any(String),
        row.currency,
      ]
      return {
        adjustments: plan.rows
          .filter((r) => r.adjustment)
          .map((r) => asRow(r.adjustment, r)),
        redistributions: plan.rows
          .filter((r) => r.remainder)
          .map((r) => asRow(r.remainder, r)),
      }
    }

    const cases = [
      ['una sola cuenta cambió', [[EFECTIVO, 12000], [MERCADO_PAGO, 5000]]],
      ['el total no cambia', [[EFECTIVO, 7000], [MERCADO_PAGO, 8000]]],
      ['una baja y otra sube', [[EFECTIVO, 9000], [MERCADO_PAGO, 6500]]],
      ['las dos bajan', [[EFECTIVO, 9800], [MERCADO_PAGO, 4900]]],
      ['una queda en cero', [[EFECTIVO, 0], [MERCADO_PAGO, 15000]]],
      ['con centavos', [[EFECTIVO, 9333.33], [MERCADO_PAGO, 5666.67]]],
    ]

    it.each(cases)('%s: la base escribe lo que el cliente anticipó', (_name, declarations) => {
      const current = { [EFECTIVO]: 10000, [MERCADO_PAGO]: 5000 }
      const plan = planReconciliation(
        declarations.map(([id, declared]) => account(id, current[id], declared)),
      )

      reconcile('2026-09-05', declarations)

      const expected = predicted(plan)
      expect(adjustments()).toEqual(expect.arrayContaining(expected.adjustments))
      expect(adjustments()).toHaveLength(expected.adjustments.length)
      expect(redistributions()).toEqual(expect.arrayContaining(expected.redistributions))
      expect(redistributions()).toHaveLength(expected.redistributions.length)
    })
  })

  // ── Lo que motivó la migración 0034 ────────────────────────────────────────
  // Antes, con el loop en el cliente, cada uno de estos casos dejaba escritas
  // las cuentas anteriores mientras la pantalla decía "no se pudo guardar".
  describe('todo o nada', () => {
    // El estado sembrado: 2 transactions y 1 reconciliación. Si después de un
    // fallo sigue siendo exactamente eso, no quedó ningún rastro parcial.
    const untouched = () => {
      expect(count('transactions')).toBe(2)
      expect(count('liquid_reconciliations')).toBe(1)
    }

    it('si la SEGUNDA cuenta revienta, la primera no queda escrita', () => {
      // Un monto negativo pasa el cálculo (genera su ajuste) y recién revienta
      // en el CHECK de liquid_reconciliations: para cuando falla, la función ya
      // escribió movimientos. Es exactamente el fallo a mitad de camino.
      const error = psqlExpectingFailure(
        reconcileSql('2026-09-05', [
          [EFECTIVO, 12000], // válida, con diferencia
          [MERCADO_PAGO, -1], // revienta
        ]),
      )

      expect(error).toMatch(/declared_amount|liquid_reconciliations/)
      untouched()
    })

    it('una cuenta ajena (o inexistente) se rechaza sin escribir nada', () => {
      const error = psqlExpectingFailure(
        reconcileSql('2026-09-05', [
          [EFECTIVO, 12000],
          [AJENA, 500],
        ]),
      )

      expect(error).toMatch(/Cuenta inexistente o de otro usuario/)
      untouched()
    })

    it('sin la categoría del sistema no se guarda nada, y el error lo dice', () => {
      psql(`update categories set is_archived = true where system_key = 'balance_adjustment';`)

      const error = psqlExpectingFailure(
        reconcileSql('2026-09-05', [
          [EFECTIVO, 12000],
          [MERCADO_PAGO, 6000],
        ]),
      )

      expect(error).toMatch(/Falta la categoría del sistema "Ajuste de saldo" \(ingreso\)/)
      untouched()
    })

    it('sin la categoría del reparto tampoco, aunque el ajuste sí exista', () => {
      psql(`update categories set is_archived = true where system_key = 'account_transfer';`)

      const error = psqlExpectingFailure(
        reconcileSql('2026-09-05', [
          [EFECTIVO, 9800],
          [MERCADO_PAGO, 4900],
        ]),
      )

      expect(error).toMatch(/Falta la categoría del sistema "Transferencia de cuenta"/)
      untouched()
    })

    it('una lista vacía no escribe nada y avisa', () => {
      const error = psqlExpectingFailure(`select reconcile_liquid('2026-09-05', '[]'::jsonb);`)
      expect(error).toMatch(/No hay ninguna cuenta declarada/)
      untouched()
    })
  })
})

// El id del ajuste recién escrito, para comprobar que la fila de
// reconciliación quedó enlazada a él.
function adjustmentId() {
  return one(`select id::text from transactions where date = '2026-09-05' order by ctid limit 1;`)[0]
}
