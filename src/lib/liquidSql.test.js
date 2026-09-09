// Paridad entre la función SQL que suma el disponible (get_liquid_by_account,
// migración 0033) y la función JS que lo sumaba antes (computeLiquidByAccount).
//
// El cambio de la 0033 es de CÓMO se calcula, no de QUÉ se calcula: para
// cualquier conjunto de datos las dos tienen que dar exactamente lo mismo, por
// cuenta y en el total. Eso no se puede verificar leyendo el SQL — hay que
// correrlo. Así que este test levanta una base scratch en el Postgres local,
// aplica el archivo de migración TAL CUAL (no una copia del SQL: si el archivo
// cambia, el test corre lo nuevo), le mete el mismo dataset sintético que le
// pasa a la función JS, y compara balde por balde.
//
// Sin Postgres local el test se saltea: es una verificación de máquina de
// desarrollo, no un requisito para correr la suite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { computeLiquidByAccount, computeLiquidFromCollections } from './liquid.js'
import { round } from './money.js'

const DB = `app_finances_liquid_parity_${process.pid}`
const DB_ARS = `app_finances_liquid_ars_${process.pid}`

function hasPostgres() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const psql = (sql, db = DB) =>
  execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
  })

// ── El dataset ──────────────────────────────────────────────────────────────
// Cientos de filas, deterministas (PRNG con semilla fija: un fallo se puede
// reproducir), repartidas entre cuatro cuentas, el balde "sin cuenta" y una
// cuenta huérfana. Incluye a propósito todos los casos que el cálculo trata
// distinto: aportes de afuera, patas de transferencia, pagos con dólares
// propios y pagos sin tipo de cambio congelado.
const ACCOUNTS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
]
const ORPHAN = '99999999-9999-4999-8999-999999999999'

function makeRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

// Montos con dos decimales exactos: es lo que admiten las columnas
// numeric(14,2) / numeric(10,2), así que insertar no redondea nada y las dos
// implementaciones ven el mismo número.
const cents = (rnd, max) => Math.round(rnd() * max * 100) / 100

function buildDataset() {
  const rnd = makeRandom(20260906)
  const bucket = () => {
    const r = rnd()
    if (r < 0.08) return null // sin cuenta
    if (r < 0.12) return ORPHAN // apunta a una cuenta que ya no está
    return ACCOUNTS[Math.floor(rnd() * ACCOUNTS.length)]
  }

  const transactions = []
  for (let i = 0; i < 400; i++) {
    transactions.push({
      kind: rnd() < 0.3 ? 'income' : 'expense',
      amount: cents(rnd, 500000),
      account_id: bucket(),
    })
  }

  const contributions = []
  for (let i = 0; i < 150; i++) {
    contributions.push({
      amount_usd: cents(rnd, 3000),
      mep_rate: cents(rnd, 2000),
      direction: rnd() < 0.75 ? 'in' : 'out',
      // Un cuarto no toca el disponible: cargas iniciales, tenencias previas y
      // las dos patas de una transferencia.
      affects_liquid: rnd() < 0.75,
      account_id: bucket(),
    })
  }

  const debtPayments = []
  for (let i = 0; i < 120; i++) {
    debtPayments.push({
      amount_usd: cents(rnd, 1500),
      // Uno de cada seis sin MEP congelado (anteriores a la 0010): queda fuera
      // del cálculo en las dos implementaciones.
      mep_rate: rnd() < 0.85 ? cents(rnd, 2000) : null,
      affects_liquid: rnd() < 0.8,
      account_id: bucket(),
    })
  }

  return { transactions, contributions, debtPayments }
}

const uuid = (value) => (value === null ? 'null' : `'${value}'`)
const num = (value) => (value === null ? 'null' : String(value))

function insertScript({ transactions, contributions, debtPayments }) {
  const lines = []
  for (const t of transactions) {
    lines.push(
      `insert into transactions (kind, amount, account_id) values ('${t.kind}', ${num(t.amount)}, ${uuid(t.account_id)});`,
    )
  }
  for (const c of contributions) {
    lines.push(
      `insert into contributions (amount_usd, mep_rate, direction, affects_liquid, account_id) values (${num(c.amount_usd)}, ${num(c.mep_rate)}, '${c.direction}', ${c.affects_liquid}, ${uuid(c.account_id)});`,
    )
  }
  for (const p of debtPayments) {
    lines.push(
      `insert into debt_payments (amount_usd, mep_rate, affects_liquid, account_id) values (${num(p.amount_usd)}, ${num(p.mep_rate)}, ${p.affects_liquid}, ${uuid(p.account_id)});`,
    )
  }
  return lines.join('\n')
}

// Esquema mínimo: solo las columnas que tocan las funciones, con los MISMOS
// tipos y escalas que la base real (0001/0009/0032). Las escalas importan — son
// las que definen con cuántos decimales se guarda cada monto.
//
// Es el esquema ANTES de la 0036, a propósito: la columna se llama amount_ars y
// la renombra la migración, que se aplica más abajo tal cual. Así el test no
// solo compara los dos cálculos, también prueba que el archivo que va a correr
// Nacho se aplica limpio — incluido el rename de los CHECK, que dependen de
// cómo los nombró Postgres al crearlos inline.
const SCHEMA = `
create table transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expense','income')),
  amount_ars numeric(14,2) not null check (amount_ars > 0),
  account_id uuid
);
create table contributions (
  id uuid primary key default gen_random_uuid(),
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  mep_rate numeric(10,2),
  direction text not null default 'in' check (direction in ('in','out')),
  affects_liquid boolean not null default true,
  account_id uuid
);
create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  mep_rate numeric(10,2),
  affects_liquid boolean not null default true,
  account_id uuid
);
-- Las dos tablas que la 0036 altera. account_id no lleva FK a propósito: el
-- dataset incluye un balde huérfano (plata apuntando a una cuenta que ya no
-- está), que es uno de los casos que el cálculo tiene que respetar.
create table liquid_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0
);
create table liquid_reconciliations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  declared_amount_ars numeric(14,2) not null check (declared_amount_ars >= 0),
  adjustment_transaction_id uuid,
  account_id uuid
);
-- El rol de Supabase no existe en un Postgres local, y la migración le hace un
-- grant. Se crea acá para poder correr el archivo sin tocarlo.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
`

// Las cuatro cuentas del dataset. Dos salen de los defaults (pesos, no ahorro)
// y dos NO, justamente para que el test distinga entre "la función lee la fila
// de la cuenta" y "la función devuelve el default y parece que funciona".
// Ninguna de las dos columnas entra en la suma, así que esto no puede mover un
// solo centavo — que es lo que el resto del archivo verifica.
const ACCOUNT_ROWS = [
  { id: ACCOUNTS[0], name: 'Efectivo', currency: 'ARS', is_savings: false },
  { id: ACCOUNTS[1], name: 'Mercado Pago', currency: 'ARS', is_savings: false },
  { id: ACCOUNTS[2], name: 'Caja de ahorro', currency: 'ARS', is_savings: true },
  { id: ACCOUNTS[3], name: 'Dólares', currency: 'USD', is_savings: true },
  // La cuenta que hace falta desde la 0039: en dólares y NO de ahorro. Es el
  // caso que antes sumaba dólares como si fueran pesos, y el único que
  // ejercita la rama nueva de la función — sin ella el test pasaría igual con
  // la versión vieja.
  { id: ACCOUNTS[4], name: 'Dólares del día a día', currency: 'USD', is_savings: false },
]

const accountsScript = ACCOUNT_ROWS.map(
  (a, i) =>
    `insert into liquid_accounts (id, name, position, currency, is_savings) values ('${a.id}', '${a.name}', ${i}, '${a.currency}', ${a.is_savings});`,
).join('\n')

const available = hasPostgres()
const dataset = buildDataset()
// La función JS necesita las cuentas para saber la moneda de cada balde
// (migración 0039). Es el mismo dataset: las cuentas son contexto, no filas.
const datasetWithAccounts = { ...dataset, accounts: ACCOUNT_ROWS }

describe.skipIf(!available)('get_liquid_by_account (SQL) vs computeLiquidByAccount (JS)', () => {
  let fromSql

  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0033_liquid_by_account.sql', 'utf8'))
    // La 0036 se aplica ENCIMA de la 0033, en el mismo orden en que las va a
    // correr la base real: renombra la columna y reemplaza la función. Y la
    // 0039 encima de las dos, que es la que enseña la regla de moneda.
    psql(readFileSync('supabase/migrations/0036_account_currency_and_savings.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0039_liquid_by_account_currency.sql', 'utf8'))
    psql(accountsScript)
    psql(insertScript(dataset))
    const out = psql(
      `select coalesce(account_id::text, $$null$$), currency, is_savings, amount
       from get_liquid_by_account();`,
    )
    fromSql = new Map(
      out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [key, currency, isSavings, amount] = line.split('\t')
          return [
            key === 'null' ? null : key,
            { currency, isSavings: isSavings === 't', amount: Number(amount) },
          ]
        }),
    )
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  it('el dataset es de cientos de filas y toca todos los baldes', () => {
    const rows =
      dataset.transactions.length + dataset.contributions.length + dataset.debtPayments.length
    expect(rows).toBeGreaterThan(600)
    const fromJs = computeLiquidByAccount(datasetWithAccounts)
    expect(fromJs.has(null)).toBe(true)
    expect(fromJs.has(ORPHAN)).toBe(true)
    expect(fromJs.size).toBe(ACCOUNTS.length + 2)
  })

  it('mismos baldes: ni una cuenta de más ni una de menos', () => {
    const fromJs = computeLiquidByAccount(datasetWithAccounts)
    const keys = (map) => [...map.keys()].map(String).sort()
    expect(keys(fromSql)).toEqual(keys(fromJs))
  })

  it('mismo monto en cada cuenta, al centavo', () => {
    const fromJs = computeLiquidByAccount(datasetWithAccounts)
    for (const [key, amount] of fromJs) {
      expect(round(fromSql.get(key).amount)).toBe(round(amount))
    }
  })

  it('mismo total', () => {
    const total = [...fromSql.values()].reduce((sum, b) => sum + b.amount, 0)
    expect(round(total)).toBe(round(computeLiquidFromCollections(datasetWithAccounts)))
  })

  it('y la diferencia cruda es ruido de punto flotante, no una regla distinta', () => {
    // El SQL suma en numeric (decimal exacto) y el JS en doubles: si las reglas
    // son las mismas, lo único que puede separarlos es el error de redondeo
    // binario acumulado, muy por debajo del centavo. Cualquier diferencia de
    // criterio (un filtro, un signo) daría un salto mucho mayor.
    const total = [...fromSql.values()].reduce((sum, b) => sum + b.amount, 0)
    expect(Math.abs(total - computeLiquidFromCollections(datasetWithAccounts))).toBeLessThan(1e-6)
  })

  // ── Lo que agrega la 0036 ────────────────────────────────────────────────
  it('cada balde trae la moneda y la marca de ahorro de SU cuenta', () => {
    for (const account of ACCOUNT_ROWS) {
      expect(fromSql.get(account.id)).toMatchObject({
        currency: account.currency,
        isSavings: account.is_savings,
      })
    }
  })

  // ── Lo que agrega la 0039 ────────────────────────────────────────────────
  it('el balde de la cuenta en dólares NO está multiplicado por ningún MEP', () => {
    // Verificación independiente de la función JS: se recalcula el balde a
    // mano, en dólares, directamente desde el dataset. Si la función SQL
    // convirtiera (el bug), este número no tendría nada que ver — sería unas
    // mil veces más grande y negativo.
    const account = ACCOUNTS[4]
    let expected = 0
    for (const t of dataset.transactions) {
      if (t.account_id === account) expected += t.kind === 'income' ? t.amount : -t.amount
    }
    for (const c of dataset.contributions) {
      if (c.account_id !== account || !c.affects_liquid || c.mep_rate === null) continue
      expected += c.direction === 'out' ? c.amount_usd : -c.amount_usd
    }
    for (const p of dataset.debtPayments) {
      if (p.account_id !== account || p.affects_liquid === false || p.mep_rate === null) continue
      expected -= p.amount_usd
    }
    expect(round(fromSql.get(account).amount)).toBe(round(expected))
  })

  it('el balde de una cuenta en pesos SÍ sigue convirtiendo con su tasa congelada', () => {
    const account = ACCOUNTS[0]
    let expected = 0
    for (const t of dataset.transactions) {
      if (t.account_id === account) expected += t.kind === 'income' ? t.amount : -t.amount
    }
    for (const c of dataset.contributions) {
      if (c.account_id !== account || !c.affects_liquid || c.mep_rate === null) continue
      const ars = c.amount_usd * c.mep_rate
      expected += c.direction === 'out' ? ars : -ars
    }
    for (const p of dataset.debtPayments) {
      if (p.account_id !== account || p.affects_liquid === false || p.mep_rate === null) continue
      expected -= p.amount_usd * p.mep_rate
    }
    expect(round(fromSql.get(account).amount)).toBe(round(expected))
  })

  it('lo que no tiene cuenta se lee como pesos y no-ahorro, no como null', () => {
    // El balde "sin cuenta" y el que apunta a una cuenta borrada no tienen de
    // dónde leer la moneda. Son movimientos en pesos que nadie asignó, así que
    // eso es lo que dicen ser — un null obligaría a cada lector a inventar un
    // default por su cuenta, que es como se terminan inventando dos distintos.
    for (const key of [null, ORPHAN]) {
      expect(fromSql.get(key)).toMatchObject({ currency: 'ARS', isSavings: false })
    }
  })
})

// ── El requisito central de la tanda ─────────────────────────────────────────
// Con TODAS las cuentas en pesos --el estado real de hoy-- la migración 0039
// no puede mover un solo centavo. No se verifica leyendo el SQL ni comparando
// contra un número escrito a mano: se corre la función VIEJA (la de la 0036) y
// la NUEVA sobre exactamente los mismos datos, en la misma base, y se exige que
// devuelvan lo mismo balde por balde.
//
// El dataset es el mismo de arriba, de cientos de filas, con aportes de afuera,
// patas de transferencia, pagos con dólares propios, pagos sin tasa, el balde
// "sin cuenta" y una cuenta huérfana. Lo único que cambia es que acá todas las
// cuentas son ARS.
describe.skipIf(!available)('con todas las cuentas en pesos, la 0039 no mueve nada', () => {
  let before
  let after

  const readBuckets = () => {
    const out = psql(
      `select coalesce(account_id::text, $$null$$), currency, is_savings, amount
       from get_liquid_by_account() order by 1;`,
      DB_ARS,
    )
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t'))
  }

  beforeAll(() => {
    execFileSync('createdb', [DB_ARS])
    psql(SCHEMA, DB_ARS)
    psql(readFileSync('supabase/migrations/0033_liquid_by_account.sql', 'utf8'), DB_ARS)
    psql(readFileSync('supabase/migrations/0036_account_currency_and_savings.sql', 'utf8'), DB_ARS)

    // Las mismas cuentas, todas en pesos: es la única diferencia con el
    // escenario de arriba.
    psql(
      ACCOUNT_ROWS.map(
        (a, i) =>
          `insert into liquid_accounts (id, name, position, currency, is_savings) values ('${a.id}', '${a.name}', ${i}, 'ARS', ${a.is_savings});`,
      ).join('\n'),
      DB_ARS,
    )
    psql(insertScript(dataset), DB_ARS)

    // La foto de la función VIEJA...
    before = readBuckets()
    // ...y la de la nueva, sobre los mismos datos, sin tocar una sola fila.
    psql(readFileSync('supabase/migrations/0039_liquid_by_account_currency.sql', 'utf8'), DB_ARS)
    after = readBuckets()
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB_ARS])
  })

  it('la migración no escribe ninguna fila: es solo una función', () => {
    const counts = psql(
      `select (select count(*) from transactions), (select count(*) from contributions),
              (select count(*) from debt_payments), (select count(*) from liquid_accounts);`,
      DB_ARS,
    ).trim()
    expect(counts).toBe(
      [
        dataset.transactions.length,
        dataset.contributions.length,
        dataset.debtPayments.length,
        ACCOUNT_ROWS.length,
      ].join('\t'),
    )
  })

  it('los mismos baldes, con los mismos montos, carácter por carácter', () => {
    // Comparación sobre el texto que devuelve Postgres, no sobre números ya
    // parseados: así ni siquiera un cambio de escala o de redondeo pasaría
    // desapercibido.
    expect(after).toEqual(before)
  })

  it('y el total tampoco', () => {
    const total = (rows) => rows.reduce((sum, r) => sum + Number(r[3]), 0)
    expect(round(total(after))).toBe(round(total(before)))
  })
})
