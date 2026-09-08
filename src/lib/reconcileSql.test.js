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
// Se aplica el archivo de migración TAL CUAL (no una copia del SQL: si el
// archivo cambia, el test corre lo nuevo). Sin Postgres local el test se
// saltea: es una verificación de máquina de desarrollo, no un requisito para
// correr la suite.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

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
// porque corren con la migración puesta.
//
// Sin user_id ni RLS: acá no se prueba el aislamiento (eso es verify:rls), se
// prueba la lógica y la transacción. La función nunca escribe user_id — lo
// completa el default auth.uid() en la base real.
const SCHEMA = `
create table categories (
  id uuid primary key default gen_random_uuid(),
  -- user_id lo necesita el índice único de la 0037, que es lo que garantiza
  -- que no pueda haber dos categorías del sistema con la misma llave.
  user_id uuid,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  is_system boolean not null default false,
  is_archived boolean not null default false
);
create table liquid_accounts (
  id uuid primary key default gen_random_uuid(),
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
  account_id uuid references liquid_accounts(id)
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
insert into categories (id, name, kind, is_system, system_key) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ajuste de saldo', 'income', true, 'balance_adjustment'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Ajuste de saldo', 'expense', true, 'balance_adjustment'),
  -- La segunda categoría del sistema, la que la 0037 vino a desambiguar: si
  -- reconcile_liquid volviera a buscar por is_system + kind, el ajuste podría
  -- salir categorizado como movimiento de ahorro y los tests de más abajo
  -- --que exigen la categoría correcta-- se caerían.
  ('aaaaaaaa-0000-4000-8000-000000000004', 'Movimiento de ahorro', 'income', true, 'savings_movement'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'Movimiento de ahorro', 'expense', true, 'savings_movement'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'Comida', 'expense', false, null);
insert into liquid_accounts (id, name, position) values
  ('${EFECTIVO}', 'Efectivo', 0),
  ('${MERCADO_PAGO}', 'Mercado Pago', 1);
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

// Los ajustes escritos, en el orden en que se insertaron (los dos sembrados no
// tienen descripción, así que se los distingue por eso).
const adjustments = () =>
  rows(`select kind, amount, coalesce(account_id::text, 'null'), description,
               (select c.kind from categories c where c.id = t.category_id)
        from transactions t where description is not null order by ctid;`)

const reconciliations = () =>
  rows(`select coalesce(account_id::text, 'null'), declared_amount,
               coalesce(adjustment_transaction_id::text, 'null')
        from liquid_reconciliations where date = '2026-09-05' order by ctid;`)

const available = hasPostgres()

describe.skipIf(!available)('reconcile_liquid (SQL)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0033_liquid_by_account.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0034_reconcile_liquid.sql', 'utf8'))
    // Y encima la 0036 y la 0037, en el mismo orden que la base real: la 0036
    // renombra los dos montos y reemplaza las dos funciones; la 0037 hace que
    // reconcile_liquid busque su categoría por llave y no por is_system, que
    // desde la 0038 ya no alcanza para distinguirla.
    psql(readFileSync('supabase/migrations/0036_account_currency_and_savings.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0037_categories_system_key.sql', 'utf8'))
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  beforeEach(() => psql(SEED))

  describe('lo que escribe', () => {
    it('la cuenta con diferencia genera su ajuste; la que coincide, ninguno', () => {
      reconcile('2026-09-05', [
        [EFECTIVO, 12000], // +2000
        [MERCADO_PAGO, 5000], // sin diferencia
      ])

      expect(adjustments()).toEqual([
        ['income', '2000.00', EFECTIVO, 'Reconciliación de disponible', 'income'],
      ])
    })

    it('cada cuenta declarada graba su fila, tenga o no ajuste', () => {
      reconcile('2026-09-05', [
        [EFECTIVO, 12000],
        [MERCADO_PAGO, 5000],
      ])

      const written = reconciliations()
      expect(written).toHaveLength(2)
      expect(written[0].slice(0, 2)).toEqual([EFECTIVO, '12000.00'])
      expect(written[0][2]).not.toBe('null') // enlazada a su ajuste
      expect(written[1]).toEqual([MERCADO_PAGO, '5000.00', 'null'])
    })

    it('dos cuentas con diferencia generan DOS ajustes, cada uno con su signo', () => {
      reconcile('2026-09-05', [
        [EFECTIVO, 9000], // −1000 → gasto
        [MERCADO_PAGO, 6500], // +1500 → ingreso
      ])

      expect(adjustments()).toEqual([
        ['expense', '1000.00', EFECTIVO, 'Reconciliación de disponible', 'expense'],
        ['income', '1500.00', MERCADO_PAGO, 'Saldo inicial', 'income'],
      ])
    })

    it('una cuenta nunca reconciliada llama a su primer ajuste "Saldo inicial"', () => {
      reconcile('2026-09-05', [[MERCADO_PAGO, 6000]])
      expect(adjustments()[0][3]).toBe('Saldo inicial')

      // Y la siguiente vez ya no: la fila que acaba de escribir es su historia.
      psql(reconcileSql('2026-09-06', [[MERCADO_PAGO, 7000]]))
      expect(adjustments()[1][3]).toBe('Reconciliación de disponible')
    })

    it('el ajuste deja la cuenta cuadrada en lo declarado, y solo esa cuenta', () => {
      reconcile('2026-09-05', [[EFECTIVO, 12000]])

      const byAccount = new Map(
        rows(`select coalesce(account_id::text, 'null'), amount from get_liquid_by_account();`),
      )
      expect(Number(byAccount.get(EFECTIVO))).toBe(12000)
      expect(Number(byAccount.get(MERCADO_PAGO))).toBe(5000)
    })

    it('el ajuste usa "Ajuste de saldo", no la otra categoría del sistema', () => {
      // Es lo único que prueba la 0037: con dos categorías del sistema por
      // kind, buscar por `is_system + kind limit 1` elegiría cualquiera de las
      // dos. La llave las distingue. Sin este test, el bug entraría en silencio
      // -- el ajuste seguiría teniendo el kind correcto y solo estaría mal
      // categorizado.
      reconcile('2026-09-05', [[EFECTIVO, 12000]])

      expect(
        one(`select c.name from transactions t join categories c on c.id = t.category_id
             where t.description is not null;`),
      ).toEqual(['Ajuste de saldo'])
    })

    it('el ajuste hereda la moneda de la cuenta que se reconcilió', () => {
      // Hoy todas las cuentas son ARS y esto no mueve ningún número. Pero la
      // regla tiene que estar puesta ANTES de que exista la primera cuenta en
      // dólares: un ajuste en una moneda distinta a la de su cuenta sería plata
      // que no está en ningún lado.
      psql(`update liquid_accounts set currency = 'USD' where id = '${MERCADO_PAGO}';`)

      reconcile('2026-09-05', [
        [EFECTIVO, 12000], // +2000
        [MERCADO_PAGO, 6500], // +1500
      ])

      expect(
        rows(`select coalesce(account_id::text, 'null'), currency from transactions
              where description is not null order by ctid;`),
      ).toEqual([
        [EFECTIVO, 'ARS'],
        [MERCADO_PAGO, 'USD'],
      ])
    })

    it('una diferencia por debajo del centavo no genera ajuste, pero sí la fila', () => {
      reconcile('2026-09-05', [[EFECTIVO, 10000.004]])
      expect(adjustments()).toHaveLength(0)
      expect(reconciliations()).toHaveLength(1)
    })

    it('sin ninguna cuenta cargada se declara el disponible entero, como antes de la 0032', () => {
      psql(`
        delete from liquid_reconciliations;
        update transactions set account_id = null;
        delete from liquid_accounts;
      `)

      reconcile('2026-09-05', [[null, 16000]]) // +1000 sobre 15000

      expect(adjustments()).toEqual([['income', '1000.00', 'null', 'Saldo inicial', 'income']])
      expect(reconciliations()).toEqual([['null', '16000.00', adjustmentId()]])
      // Sin cuenta de la cual heredarla, el ajuste va en pesos: es el mismo
      // criterio con el que get_liquid_by_account lee el balde sin cuenta.
      expect(one(`select currency from transactions where description is not null;`)).toEqual(['ARS'])
    })

    it('devuelve una fila por cuenta declarada, con su diferencia', () => {
      const result = JSON.parse(
        reconcile('2026-09-05', [
          [EFECTIVO, 12000],
          [MERCADO_PAGO, 5000],
        ]),
      )

      expect(result).toHaveLength(2)
      expect(result[0].account_id).toBe(EFECTIVO)
      expect(Number(result[0].difference)).toBe(2000)
      expect(result[0].adjustment_transaction_id).not.toBe(null)
      expect(result[1].account_id).toBe(MERCADO_PAGO)
      expect(Number(result[1].difference)).toBe(0)
      expect(result[1].adjustment_transaction_id).toBe(null)
    })
  })

  // ── Lo que motivó la migración ─────────────────────────────────────────────
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
      // escribió el ajuste de Efectivo, su fila de reconciliación y el ajuste
      // de Mercado Pago. Es exactamente el fallo a mitad de camino.
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
      psql(`update categories set is_archived = true where is_system;`)

      const error = psqlExpectingFailure(
        reconcileSql('2026-09-05', [
          [EFECTIVO, 12000],
          [MERCADO_PAGO, 6000],
        ]),
      )

      expect(error).toMatch(/Falta la categoría del sistema "Ajuste de saldo" \(ingreso\)/)
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
  return one(`select id::text from transactions where description is not null order by ctid limit 1;`)[0]
}
