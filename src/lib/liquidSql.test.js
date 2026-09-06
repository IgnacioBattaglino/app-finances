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
      amount_ars: cents(rnd, 500000),
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
      `insert into transactions (kind, amount_ars, account_id) values ('${t.kind}', ${num(t.amount_ars)}, ${uuid(t.account_id)});`,
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

// Esquema mínimo: solo las columnas que lee la función, con los MISMOS tipos y
// escalas que la base real (0001/0009/0032). Las escalas importan — son las que
// definen con cuántos decimales se guarda cada monto.
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
-- El rol de Supabase no existe en un Postgres local, y la migración le hace un
-- grant. Se crea acá para poder correr el archivo sin tocarlo.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
`

const available = hasPostgres()
const dataset = buildDataset()

describe.skipIf(!available)('get_liquid_by_account (SQL) vs computeLiquidByAccount (JS)', () => {
  let fromSql

  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0033_liquid_by_account.sql', 'utf8'))
    psql(insertScript(dataset))
    const out = psql('select coalesce(account_id::text, $$null$$), amount from get_liquid_by_account();')
    fromSql = new Map(
      out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [key, amount] = line.split('\t')
          return [key === 'null' ? null : key, Number(amount)]
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
    const fromJs = computeLiquidByAccount(dataset)
    expect(fromJs.has(null)).toBe(true)
    expect(fromJs.has(ORPHAN)).toBe(true)
    expect(fromJs.size).toBe(ACCOUNTS.length + 2)
  })

  it('mismos baldes: ni una cuenta de más ni una de menos', () => {
    const fromJs = computeLiquidByAccount(dataset)
    const keys = (map) => [...map.keys()].map(String).sort()
    expect(keys(fromSql)).toEqual(keys(fromJs))
  })

  it('mismo monto en cada cuenta, al centavo', () => {
    const fromJs = computeLiquidByAccount(dataset)
    for (const [key, amount] of fromJs) {
      expect(round(fromSql.get(key))).toBe(round(amount))
    }
  })

  it('mismo total', () => {
    const total = [...fromSql.values()].reduce((sum, amount) => sum + amount, 0)
    expect(round(total)).toBe(round(computeLiquidFromCollections(dataset)))
  })

  it('y la diferencia cruda es ruido de punto flotante, no una regla distinta', () => {
    // El SQL suma en numeric (decimal exacto) y el JS en doubles: si las reglas
    // son las mismas, lo único que puede separarlos es el error de redondeo
    // binario acumulado, muy por debajo del centavo. Cualquier diferencia de
    // criterio (un filtro, un signo) daría un salto mucho mayor.
    const total = [...fromSql.values()].reduce((sum, amount) => sum + amount, 0)
    expect(Math.abs(total - computeLiquidFromCollections(dataset))).toBeLessThan(1e-6)
  })
})
