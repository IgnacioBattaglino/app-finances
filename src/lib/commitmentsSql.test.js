// confirm_commitment_charge / unconfirm_commitment_charge (migración 0045),
// corridas contra un Postgres de verdad — mismo criterio que
// accountTransferSql.test.js y reconcileSql.test.js: lo que una confirmación
// ESCRIBE lo escribe la base, y probar eso con un mock no probaría nada.
//
// Lo que de verdad se verifica acá son las dos garantías que sostienen toda la
// sección: que confirmar dos veces el mismo vencimiento es imposible (el gasto
// se cobraría dos veces), y que borrar el gasto desde Movimientos devuelve el
// vencimiento a pendiente SOLO, sin ningún trigger ni ningún código que se
// acuerde de hacerlo.
//
// Se aplica el archivo de migración TAL CUAL. Sin Postgres local el test se
// saltea: es una verificación de máquina de desarrollo, no un requisito para
// correr la suite.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DB = `app_finances_commitments_${process.pid}`

function hasPostgres() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const psql = (sql) =>
  execFileSync(
    'psql',
    ['-d', DB, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql],
    {
      encoding: 'utf8',
    },
  )

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
const AHORRO_USD = '33333333-3333-4333-8333-333333333333' // USD, del USER
const AJENA = '99999999-9999-4999-8999-999999999999' // ARS, de OTHER_USER
const HOGAR = 'cccccccc-0000-4000-8000-000000000001' // categoría de usuario
const PLAN = 'dddddddd-0000-4000-8000-000000000001'
const PLAN_AJENO = 'dddddddd-0000-4000-8000-000000000009'

// Esquema mínimo: solo lo que la migración toca, con los mismos tipos y CHECKs
// que la base real. Las tres tablas nuevas las crea la propia migración, que
// se aplica tal cual más abajo.
const SCHEMA = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;
create table auth.users (id uuid primary key);
insert into auth.users values ('${USER}'), ('${OTHER_USER}');
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  is_system boolean not null default false,
  system_key text
);
create table liquid_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  currency text not null default 'ARS',
  is_savings boolean not null default false
);
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  date date not null,
  kind text not null check (kind in ('expense','income')),
  category_id uuid not null references categories(id),
  description text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'ARS',
  account_id uuid references liquid_accounts(id),
  transfer_id uuid,
  created_at timestamptz not null default now()
);
`

// RLS no se activa en el Postgres local (el dueño de las tablas la bypassa
// igual), así que la pertenencia se prueba por el camino que la función usa
// realmente: en Supabase, RLS hace que un plan ajeno simplemente no aparezca
// en el select. Acá se emula filtrando por user_id en el seed y comprobando
// que la función levanta el error cuando no encuentra la fila — para eso, el
// plan ajeno se crea con OTHER_USER y la comprobación mira el mensaje.
const SEED = `
truncate commitment_charges, commitments, transactions, payment_cards, liquid_accounts, categories cascade;
insert into categories (id, user_id, name, kind) values ('${HOGAR}', '${USER}', 'Hogar', 'expense');
insert into liquid_accounts (id, user_id, name, currency) values
  ('${EFECTIVO}', '${USER}', 'Efectivo', 'ARS'),
  ('${AHORRO_USD}', '${USER}', 'Ahorro USD', 'USD'),
  ('${AJENA}', '${OTHER_USER}', 'Cuenta ajena', 'ARS');
insert into commitments (id, user_id, kind, name, category_id, account_id, currency, amount, installments, start_date)
values
  ('${PLAN}', '${USER}', 'installments', 'Heladera', '${HOGAR}', '${EFECTIVO}', 'ARS', 50000, 6, '2026-09-10'),
  ('${PLAN_AJENO}', '${OTHER_USER}', 'installments', 'Ajeno', '${HOGAR}', null, 'ARS', 100, 3, '2026-09-10');
`

const confirmSql = (planId, dueDate, amount, accountId, description = 'Heladera · Cuota 1 de 6') =>
  `set app.current_user_id = '${USER}';
   select confirm_commitment_charge('${planId}', '${dueDate}', '${dueDate}', ${amount},
     ${accountId ? `'${accountId}'` : 'null'}, '${description}');`

const confirm = (...args) => psql(confirmSql(...args)).trim()
const confirmExpectingFailure = (...args) => psqlExpectingFailure(confirmSql(...args))

const available = hasPostgres()

describe.skipIf(!available)('compromisos (SQL, migración 0045)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0045_commitments.sql', 'utf8'))
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  beforeEach(() => psql(SEED))

  describe('confirm_commitment_charge', () => {
    it('confirmar escribe UN gasto común con la categoría de usuario del plan', () => {
      confirm(PLAN, '2026-09-10', 50000, EFECTIVO)
      const [[kind, categoryId, amount, currency, accountId, description, transferId]] = rows(
        `select kind, category_id, amount, currency, account_id, description,
                coalesce(transfer_id::text, 'null')
         from transactions;`,
      )
      expect(kind).toBe('expense')
      // La categoría es la del USUARIO, no una del sistema: para movementType y
      // para monthTotals es un gasto indistinguible de uno cargado a mano.
      expect(categoryId).toBe(HOGAR)
      expect(amount).toBe('50000.00')
      expect(currency).toBe('ARS')
      expect(accountId).toBe(EFECTIVO)
      expect(description).toBe('Heladera · Cuota 1 de 6')
      // No es una transferencia ni una pata de nada.
      expect(transferId).toBe('null')
    })

    it('la moneda sale de la CUENTA, que es de lo que depende get_liquid_by_account', () => {
      confirm(PLAN, '2026-09-10', 120, AHORRO_USD)
      expect(psql('select currency from transactions;').trim()).toBe('USD')
    })

    it('sin cuenta, la moneda es ARS: la misma lectura que el balde null', () => {
      confirm(PLAN, '2026-09-10', 50000, null)
      const [[currency, accountId]] = rows(
        `select currency, coalesce(account_id::text, 'null') from transactions;`,
      )
      expect(currency).toBe('ARS')
      expect(accountId).toBe('null')
    })

    it('deja el cargo apuntando al gasto: "confirmado" es tener transaction_id', () => {
      const transactionId = confirm(PLAN, '2026-09-10', 50000, EFECTIVO)
      const [[dueDate, linked, dismissed]] = rows(
        `select due_date, coalesce(transaction_id::text, 'null'), coalesce(dismissed_at::text, 'null')
       from commitment_charges;`,
      )
      expect(dueDate).toBe('2026-09-10')
      expect(linked).toBe(transactionId)
      expect(dismissed).toBe('null')
    })

    it('CONFIRMAR DOS VECES EL MISMO VENCIMIENTO ES IMPOSIBLE', () => {
      confirm(PLAN, '2026-09-10', 50000, EFECTIVO)
      const error = confirmExpectingFailure(PLAN, '2026-09-10', 50000, EFECTIVO)
      expect(error).toMatch(/ya estaba confirmado/)
      // Y sobre todo: no quedó un segundo gasto colgado. El raise deshizo la
      // transacción entera, que es exactamente por lo que esto es una función y
      // no dos escrituras del cliente.
      expect(count('transactions')).toBe(1)
      expect(count('commitment_charges')).toBe(1)
    })

    it('BORRAR EL GASTO DEVUELVE EL VENCIMIENTO A PENDIENTE, solo', () => {
      const transactionId = confirm(PLAN, '2026-09-10', 50000, EFECTIVO)
      // Es lo que pasa si el usuario borra la fila desde Movimientos.
      psql(`delete from transactions where id = '${transactionId}';`)
      const [[linked, dismissed]] = rows(
        `select coalesce(transaction_id::text, 'null'), coalesce(dismissed_at::text, 'null')
       from commitment_charges;`,
      )
      // Los dos en null = pendiente. Sin trigger y sin código que se acuerde.
      expect(linked).toBe('null')
      expect(dismissed).toBe('null')
      expect(count('commitment_charges')).toBe(1)
    })

    it('y después se puede volver a confirmar, reusando la misma fila', () => {
      const first = confirm(PLAN, '2026-09-10', 50000, EFECTIVO)
      psql(`delete from transactions where id = '${first}';`)
      const second = confirm(PLAN, '2026-09-10', 48000, EFECTIVO)
      expect(second).not.toBe(first)
      expect(count('commitment_charges')).toBe(1)
      expect(psql('select amount from transactions;').trim()).toBe('48000.00')
    })

    it('un vencimiento descartado se puede confirmar igual', () => {
      psql(
        `insert into commitment_charges (user_id, commitment_id, due_date, dismissed_at)
       values ('${USER}', '${PLAN}', '2026-09-10', now());`,
      )
      confirm(PLAN, '2026-09-10', 50000, EFECTIVO)
      const [[linked, dismissed]] = rows(
        `select coalesce(transaction_id::text, 'null'), coalesce(dismissed_at::text, 'null')
       from commitment_charges;`,
      )
      expect(linked).not.toBe('null')
      expect(dismissed).toBe('null')
    })

    it('un plan ajeno se rechaza sin escribir nada', () => {
      // En Supabase lo filtra RLS antes (el select no ve la fila); acá se emula
      // pidiendo un plan que no existe para este usuario.
      const error = confirmExpectingFailure(
        'dddddddd-0000-4000-8000-000000000099',
        '2026-09-10',
        50000,
        EFECTIVO,
      )
      expect(error).toMatch(/Compromiso inexistente o de otro usuario/)
      expect(count('transactions')).toBe(0)
      expect(count('commitment_charges')).toBe(0)
    })

    it('una cuenta inexistente se rechaza sin escribir nada', () => {
      const error = confirmExpectingFailure(
        PLAN,
        '2026-09-10',
        50000,
        '99999999-9999-4999-8999-000000000000',
      )
      expect(error).toMatch(/Cuenta inexistente o de otro usuario/)
      expect(count('transactions')).toBe(0)
    })
  })

  describe('unconfirm_commitment_charge', () => {
    it('deshacer se lleva el gasto y la marca, juntos', () => {
      confirm(PLAN, '2026-09-10', 50000, EFECTIVO)
      psql(`set app.current_user_id = '${USER}';
            select unconfirm_commitment_charge('${PLAN}', '2026-09-10');`)
      expect(count('transactions')).toBe(0)
      expect(count('commitment_charges')).toBe(0)
    })

    it('deshacer algo que no estaba confirmado avisa en castellano', () => {
      const error = psqlExpectingFailure(
        `set app.current_user_id = '${USER}';
       select unconfirm_commitment_charge('${PLAN}', '2026-09-10');`,
      )
      expect(error).toMatch(/no estaba confirmado/)
    })
  })

  describe('las restricciones del plan', () => {
    const insert = (columns, values) =>
      psqlExpectingFailure(
        `insert into commitments (user_id, kind, name, category_id, currency, amount, start_date, ${columns})
         values ('${USER}', ${values});`,
      )

    it('una suscripción no puede tener cuotas, y una compra en cuotas tiene que tenerlas', () => {
      expect(
        insert(
          'installments',
          `'subscription', 'Netflix', '${HOGAR}', 'ARS', 7499, '2026-09-05', 6`,
        ),
      ).toMatch(/commitments_installments_only_for_installments/)
      expect(
        insert(
          'installments',
          `'installments', 'Heladera', '${HOGAR}', 'ARS', 50000, '2026-09-10', null`,
        ),
      ).toMatch(/commitments_installments_only_for_installments/)
    })

    it('no se puede arrancar en la cuota 7 de un plan de 6', () => {
      expect(
        insert(
          'installments, first_installment',
          `'installments', 'Heladera', '${HOGAR}', 'ARS', 50000, '2026-09-10', 6, 7`,
        ),
      ).toMatch(/commitments_first_installment_in_range/)
    })

    it('una suscripción no cuelga de una tarjeta', () => {
      psql(
        `insert into payment_cards (id, user_id, name) values
       ('eeeeeeee-0000-4000-8000-000000000001', '${USER}', 'Visa');`,
      )
      expect(
        insert(
          'installments, card_id',
          `'subscription', 'Netflix', '${HOGAR}', 'ARS', 7499, '2026-09-05', null, 'eeeeeeee-0000-4000-8000-000000000001'`,
        ),
      ).toMatch(/commitments_card_only_for_installments/)
    })

    it('el mismo vencimiento no puede tener dos cargos', () => {
      const duplicate = psqlExpectingFailure(
        `insert into commitment_charges (user_id, commitment_id, due_date, dismissed_at) values
        ('${USER}', '${PLAN}', '2026-09-10', now()),
        ('${USER}', '${PLAN}', '2026-09-10', now());`,
      )
      expect(duplicate).toMatch(/commitment_charges_one_per_due/)
    })

    it('un plan con cargos no se puede borrar: la FK es la red del chequeo del cliente', () => {
      psql(
        `insert into commitment_charges (user_id, commitment_id, due_date, dismissed_at)
       values ('${USER}', '${PLAN}', '2026-09-10', now());`,
      )
      expect(psqlExpectingFailure(`delete from commitments where id = '${PLAN}';`)).toMatch(
        /violates foreign key constraint/,
      )
    })
  })
})
