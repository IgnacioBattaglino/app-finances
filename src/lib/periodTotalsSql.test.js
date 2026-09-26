// Paridad de la migración 0055: get_period_totals y get_expenses_by_category
// contra su definición en JS (monthTotals, groupExpensesByCategory y, para
// Inicio, sumByCurrency + expensesInMonth + previousMonthToDate sobre los
// gastos que filtraba getExpenses).
//
// Mismo patrón que liquidSummarySql.test.js: base scratch, los archivos de
// migración TAL CUAL, el mismo dataset a las dos implementaciones, y las
// consultas como authenticated con RLS y las policies reales. Un segundo
// usuario tiene datos que no pueden aparecer.
//
// Sin Postgres local el test se saltea; el CI corre uno.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { monthTotals, periodLines } from './movements.js'
import { groupExpensesByCategory } from './transactions.js'
import { sumByCurrency, expensesInMonth, previousMonthToDate, previousMonthToDateRange } from './expensesSummary.js'
import { isMovedMoney } from './systemCategories.js'
import { currencyLines } from './currencyTotals.js'

const DB = `app_finances_period_totals_${process.pid}`

// Necesita Postgres 15+ (la vista usa security_invoker, igual que la 0049).
function postgresVersion() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return Number(
      execFileSync('psql', ['-d', 'postgres', '-A', '-t', '-c', 'show server_version_num'], { encoding: 'utf8' }).trim(),
    )
  } catch {
    return 0
  }
}
const available = postgresVersion() >= 150000

const psql = (sql) =>
  execFileSync('psql', ['-d', DB, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const rowsAs = (user, sql) =>
  psql(`set app.current_user_id = '${user}'; set role authenticated; ${sql}`)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))

const USER = '10101010-1010-4010-8010-101010101010'
const OTHER = '20202020-2020-4020-8020-202020202020'
const uid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// Cuentas: pesos y dólares, del día a día y de ahorro; una del otro usuario.
const ACCOUNTS = [
  { id: uid('a', 1), user_id: USER, currency: 'ARS', is_savings: false },
  { id: uid('a', 2), user_id: USER, currency: 'ARS', is_savings: false },
  { id: uid('a', 3), user_id: USER, currency: 'USD', is_savings: false },
  { id: uid('a', 4), user_id: USER, currency: 'ARS', is_savings: true },
  { id: uid('a', 5), user_id: USER, currency: 'USD', is_savings: true },
  { id: uid('a', 9), user_id: OTHER, currency: 'ARS', is_savings: false },
]
const own = (user) => ACCOUNTS.filter((a) => a.user_id === user)

// Categorías: del usuario y las seis del sistema, por usuario.
const CATEGORIES = []
for (const [user, base] of [[USER, 10], [OTHER, 50]]) {
  const add = (name, kind, system_key = null) =>
    CATEGORIES.push({ id: uid('c', base + CATEGORIES.filter((c) => c.user_id === user).length), user_id: user, name, kind, system_key })
  for (const name of ['Comida', 'Alquiler', 'Transporte', 'Salidas']) add(name, 'expense')
  for (const name of ['Sueldo', 'Freelance']) add(name, 'income')
  for (const kind of ['expense', 'income']) {
    add('Ajuste de saldo', kind, 'balance_adjustment')
    add('Transferencia de cuenta', kind, 'account_transfer')
    add('Movimiento de ahorro', kind, 'savings_movement')
  }
}

const ASSETS = [
  { id: uid('b', 1), user_id: USER, savings_account_id: null },
  { id: uid('b', 2), user_id: USER, savings_account_id: uid('a', 4) }, // la 0038 lo convirtió en ahorro
  { id: uid('b', 9), user_id: OTHER, savings_account_id: null },
]

function makeRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}
const cents = (rnd, max) => Math.max(0.01, Math.round(rnd() * max * 100) / 100)

// Fechas entre junio y septiembre de 2026, con días de fin de mes.
const DAYS = []
for (const [m, last] of [[6, 30], [7, 31], [8, 31], [9, 30]]) {
  for (let d = 1; d <= last; d++) DAYS.push(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
}

function buildDataset() {
  const rnd = makeRandom(20260926)
  const pick = (list) => list[Math.floor(rnd() * list.length)]
  const transactions = []
  const contributions = []
  let n = 0
  const tx = (user, account, kind, category, extra = {}) =>
    transactions.push({
      id: uid('d', ++n),
      user_id: user,
      date: extra.date ?? pick(DAYS),
      kind,
      amount: extra.amount ?? cents(rnd, account.currency === 'USD' ? 300 : 90000),
      currency: account.currency,
      account_id: account.id,
      category_id: category.id,
      transfer_id: extra.transfer_id ?? null,
    })
  const cat = (user, kind, pred) => pick(CATEGORIES.filter((c) => c.user_id === user && c.kind === kind && pred(c)))

  for (const user of [USER, OTHER]) {
    const accounts = own(user)
    const daily = accounts.filter((a) => !a.is_savings)
    for (let i = 0; i < (user === USER ? 260 : 40); i++) {
      const r = rnd()
      const account = pick(accounts)
      const kind = rnd() < 0.35 ? 'income' : 'expense'
      if (r < 0.6) tx(user, account, kind, cat(user, kind, (c) => !c.system_key))
      else if (r < 0.7) tx(user, account, kind, cat(user, kind, (c) => c.system_key === 'balance_adjustment'))
      else if (r < 0.8) tx(user, account, kind, cat(user, kind, (c) => c.system_key === 'account_transfer')) // reparto
      else if (r < 0.87) tx(user, account, kind, cat(user, kind, (c) => c.system_key === 'savings_movement'))
      else if (accounts.length > 1) {
        // Una transferencia: dos patas con el mismo transfer_id y la misma fecha.
        const from = pick(accounts)
        const to = pick(accounts.filter((a) => a.id !== from.id))
        const transfer_id = uid('e', ++n)
        const date = pick(DAYS)
        tx(user, from, 'expense', cat(user, 'expense', (c) => c.system_key === 'account_transfer'), { transfer_id, date })
        if (rnd() > 0.05) {
          // Una de cada veinte queda sin su hermana: se ignora en las dos.
          tx(user, to, 'income', cat(user, 'income', (c) => c.system_key === 'account_transfer'), { transfer_id, date })
        }
      }
    }
    const assets = ASSETS.filter((a) => a.user_id === user)
    for (let i = 0; i < (user === USER ? 60 : 10); i++) {
      const affects = rnd() < 0.8
      contributions.push({
        user_id: user,
        asset_id: pick(assets).id,
        date: pick(DAYS),
        amount_usd: cents(rnd, 800),
        // Algunas sin tasa (D4): en pesos suman 0, en dólares tal cual.
        mep_rate: rnd() < 0.9 ? cents(rnd, 1500) : null,
        direction: rnd() < 0.7 ? 'in' : 'out',
        affects_liquid: affects,
        account_id: affects ? pick(daily.concat(accounts.filter((a) => a.is_savings))).id : null,
      })
    }
  }
  return { transactions, contributions }
}

const DATA = buildDataset()

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
grant usage on schema auth to authenticated, anon;

create table liquid_accounts (id uuid primary key, user_id uuid not null, currency text not null, is_savings boolean not null);
create table categories (id uuid primary key, user_id uuid not null, name text not null, kind text not null, system_key text);
create table assets (id uuid primary key, user_id uuid not null, savings_account_id uuid);
create table transactions (
  id uuid primary key, user_id uuid not null, date date not null, kind text not null,
  amount numeric(14,2) not null, currency text not null, account_id uuid not null references liquid_accounts(id),
  category_id uuid not null references categories(id), transfer_id uuid
);
create table contributions (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references assets(id), date date not null,
  amount_usd numeric(14,2) not null, mep_rate numeric(10,2), direction text not null,
  affects_liquid boolean not null, account_id uuid references liquid_accounts(id)
);
alter table liquid_accounts enable row level security;
alter table categories enable row level security;
alter table assets enable row level security;
alter table transactions enable row level security;
alter table contributions enable row level security;
create policy "own rows" on liquid_accounts for all to authenticated using (user_id = auth.uid());
create policy "own rows" on categories for all to authenticated using (user_id = auth.uid());
create policy "own rows" on assets for all to authenticated using (user_id = auth.uid());
create policy "own rows" on transactions for all to authenticated using (user_id = auth.uid());
create policy "own via asset" on contributions for all to authenticated
  using (exists (select 1 from assets a where a.id = contributions.asset_id and a.user_id = auth.uid()));
grant select on all tables in schema public to authenticated;
`

const q = (v) => (v === null ? 'null' : `'${v}'`)
function seedSql() {
  const values = (rows, f) => rows.map(f).join(',\n')
  return `
insert into liquid_accounts values ${values(ACCOUNTS, (a) => `('${a.id}', '${a.user_id}', '${a.currency}', ${a.is_savings})`)};
insert into categories values ${values(CATEGORIES, (c) => `('${c.id}', '${c.user_id}', '${c.name}', '${c.kind}', ${q(c.system_key)})`)};
insert into assets values ${values(ASSETS, (a) => `('${a.id}', '${a.user_id}', ${q(a.savings_account_id)})`)};
insert into transactions values ${values(DATA.transactions, (t) =>
    `('${t.id}', '${t.user_id}', '${t.date}', '${t.kind}', ${t.amount}, '${t.currency}', '${t.account_id}', '${t.category_id}', ${q(t.transfer_id)})`)};
insert into contributions (asset_id, date, amount_usd, mep_rate, direction, affects_liquid, account_id) values ${values(DATA.contributions, (c) =>
    `('${c.asset_id}', '${c.date}', ${c.amount_usd}, ${c.mep_rate ?? 'null'}, '${c.direction}', ${c.affects_liquid}, ${q(c.account_id)})`)};`
}

// ── Las filas como las ve el JS (la forma de getTransactions y
// getLiquidContributions), de UN usuario y dentro de un rango ──────────────
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to)
function jsRows(user, from, to) {
  const accounts = new Map(ACCOUNTS.map((a) => [a.id, a]))
  const categories = new Map(CATEGORIES.map((c) => [c.id, c]))
  const assets = new Map(ASSETS.map((a) => [a.id, a]))
  const transactions = DATA.transactions
    .filter((t) => t.user_id === user && inRange(t.date, from, to))
    .map((t) => ({ ...t, category: categories.get(t.category_id), account: accounts.get(t.account_id) }))
  const contributions = DATA.contributions
    .filter((c) => c.user_id === user && c.affects_liquid && inRange(c.date, from, to))
    .map((c) => ({ ...c, asset: assets.get(c.asset_id), account: accounts.get(c.account_id) }))
  return { transactions, contributions }
}

const sqlTotals = (user, from, to) =>
  rowsAs(user, `select currency, expenses, incomes, invested, saved, balance from get_period_totals(${q(from)}, ${q(to)});`).map(
    ([currency, expenses, incomes, invested, saved, balance]) => ({ currency, expenses, incomes, invested, saved, balance }),
  )

// Un centavo de margen: JS suma en punto flotante, Postgres en decimal exacto,
// y un aporte × tasa puede caer justo en medio centavo.
const closeLines = (a, b) => {
  expect(a.map((l) => l.currency)).toEqual(b.map((l) => l.currency))
  a.forEach((l, i) => expect(Math.abs(l.amount - b[i].amount)).toBeLessThan(0.011))
}

const RANGES = [
  ['un mes', '2026-07-01', '2026-07-31'],
  ['un mes a medias', '2026-09-01', '2026-09-15'],
  ['dos fechas cualesquiera', '2026-06-17', '2026-08-03'],
  ['todo el historial', null, null],
]

describe.skipIf(!available)('0055: los cinco renglones y los gastos por categoría (SQL) vs JS', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0055_period_totals_and_expenses.sql', 'utf8'))
    psql(seedSql())
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  for (const [label, from, to] of RANGES) {
    it(`${label}: los cinco renglones coinciden con monthTotals`, () => {
      const sql = periodLines(sqlTotals(USER, from, to))
      const js = monthTotals(jsRows(USER, from, to))
      for (const key of ['expenses', 'incomes', 'invested', 'saved', 'balance']) closeLines(sql[key], js[key])
    })

    it(`${label}: los gastos por categoría coinciden con groupExpensesByCategory`, () => {
      const sql = rowsAs(USER, `select currency, category_name, total from get_expenses_by_category(${q(from)}, ${q(to)});`)
      const js = groupExpensesByCategory(jsRows(USER, from, to).transactions)
      const flat = js.flatMap((g) => g.categories.map((c) => [g.currency, c.name, c.total]))
      expect(sql.map(([c, n]) => `${c}:${n}`).sort()).toEqual(flat.map(([c, n]) => `${c}:${n}`).sort())
      for (const [currency, name, total] of sql) {
        const match = flat.find(([c, n]) => c === currency && n === name)
        expect(Math.abs(Number(total) - match[2])).toBeLessThan(0.011)
      }
    })
  }

  it('Inicio: el gasto del mes y el del mes anterior a esta altura coinciden con la definición', () => {
    // getExpenses filtraba por categoría (isMovedMoney); monthTotals, por el
    // tipo del movimiento. Hoy dan lo mismo, y la 0055 deja una sola regla.
    const expensesOf = (rows) => rows.filter((t) => t.kind === 'expense' && !isMovedMoney(t.category))
    const today = '2026-08-31'
    const all = expensesOf(jsRows(USER, '2025-09-01', today).transactions)
    const current = currencyLines(sumByCurrency(expensesInMonth(all, { year: 2026, month: 8 })))
    const previous = currencyLines(sumByCurrency(previousMonthToDate(all, today)))
    closeLines(periodLines(sqlTotals(USER, '2026-08-01', today)).expenses, current)
    const range = previousMonthToDateRange(today)
    closeLines(periodLines(sqlTotals(USER, range.from, range.to)).expenses, previous)
  })

  it('el dataset toca todos los casos (si no, el test no prueba nada)', () => {
    const { transactions, contributions } = jsRows(USER, null, null)
    const keys = new Set(transactions.map((t) => t.category.system_key))
    for (const k of ['balance_adjustment', 'account_transfer', 'savings_movement']) expect(keys.has(k)).toBe(true)
    const pairs = new Map()
    for (const t of transactions.filter((t) => t.transfer_id)) pairs.set(t.transfer_id, [...(pairs.get(t.transfer_id) ?? []), t])
    expect([...pairs.values()].some((p) => p.length === 1)).toBe(true) // pata sin hermana
    expect([...pairs.values()].some((p) => p.length === 2 && p.filter((t) => t.account.is_savings).length === 1)).toBe(true)
    expect(contributions.some((c) => c.asset.savings_account_id)).toBe(true)
    expect(contributions.some((c) => c.mep_rate === null && c.account.currency === 'USD')).toBe(true)
    const totals = monthTotals({ transactions, contributions })
    expect(totals.saved.some((l) => Math.abs(l.amount) > 0)).toBe(true)
    expect(totals.expenses.map((l) => l.currency)).toEqual(['ARS', 'USD'])
  })

  it('otro usuario ve solo lo suyo', () => {
    const sql = periodLines(sqlTotals(OTHER, null, null))
    const js = monthTotals(jsRows(OTHER, null, null))
    for (const key of ['expenses', 'incomes', 'invested', 'saved', 'balance']) closeLines(sql[key], js[key])
  })

  it('sin sesión (anon) no se pueden ejecutar ni leer la vista', () => {
    for (const sql of [
      'select * from get_period_totals(null, null)',
      'select * from get_expenses_by_category(null, null)',
      'select * from transaction_movement_types',
    ]) {
      expect(() => psql(`set role anon; ${sql};`)).toThrow(/permission denied/)
    }
  })
})
