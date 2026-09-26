// Paridad de la migración 0056: get_usd_rate contra rateOn (la búsqueda "la
// cotización vigente ese día" que hacía localCurrency.js) y
// get_monthly_expenses_usd contra monthlyUsdTotals con esa misma conversión.
//
// Se aplican la 0055 (la vista con el tipo de cada movimiento, que decide qué
// es un gasto real) y la 0056 TAL CUAL. RLS encendido, con otro usuario.
// Necesita Postgres 15+ (la vista usa security_invoker); el CI corre 15.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { rateOn } from './localCurrency.js'
import { monthlyUsdTotals, lastMonths, monthKey } from './expensesSummary.js'
import { movementType, isMovedMoneyType } from './systemCategories.js'

const DB = `app_finances_monthly_usd_${process.pid}`

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
const asUser = (user, sql) => psql(`set app.current_user_id = '${user}'; set role authenticated; ${sql}`)

const USER = '10101010-1010-4010-8010-101010101010'
const OTHER = '20202020-2020-4020-8020-202020202020'
const uid = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MEP = uid('f', 1)

function makeRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}
const cents = (rnd, max) => Math.max(0.01, Math.round(rnd() * max * 100) / 100)
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// La serie del MEP: desde 2025-10-03 (después del primer mes de la ventana, a
// propósito: hay gastos anteriores a toda la serie), con huecos de 1 a 4 días
// como fines de semana y feriados.
const RATES = []
{
  const rnd = makeRandom(7)
  let date = '2025-10-03'
  let price = 1200
  while (date <= '2026-09-20') {
    RATES.push({ date, price: Math.round(price * 100) / 100 })
    price *= 1 + (rnd() - 0.45) * 0.02
    date = addDays(date, 1 + Math.floor(rnd() * 4))
  }
}

const TODAY = '2026-09-26'
const MONTHS = lastMonths(TODAY, 12) // 2025-10 … 2026-09
const FROM = `${monthKey(MONTHS[0])}-01`

const ACCOUNTS = [
  { id: uid('a', 1), user_id: USER, currency: 'ARS' },
  { id: uid('a', 2), user_id: USER, currency: 'USD' },
  { id: uid('a', 9), user_id: OTHER, currency: 'ARS' },
]
const CATEGORIES = [
  { id: uid('c', 1), user_id: USER, kind: 'expense', system_key: null },
  { id: uid('c', 2), user_id: USER, kind: 'expense', system_key: 'balance_adjustment' },
  { id: uid('c', 3), user_id: USER, kind: 'expense', system_key: 'account_transfer' },
  { id: uid('c', 4), user_id: USER, kind: 'expense', system_key: 'savings_movement' },
  { id: uid('c', 5), user_id: USER, kind: 'income', system_key: null },
  { id: uid('c', 9), user_id: OTHER, kind: 'expense', system_key: null },
]

function buildTransactions() {
  const rnd = makeRandom(20260926)
  const pick = (list) => list[Math.floor(rnd() * list.length)]
  const rows = []
  let n = 0
  const days = []
  for (let d = '2025-09-20'; d <= TODAY; d = addDays(d, 1)) days.push(d)
  for (let i = 0; i < 400; i++) {
    const account = pick(ACCOUNTS.filter((a) => a.user_id === USER))
    const category = pick(CATEGORIES.filter((c) => c.user_id === USER))
    rows.push({
      id: uid('d', ++n), user_id: USER, date: pick(days), kind: category.kind,
      amount: cents(rnd, account.currency === 'USD' ? 200 : 80000), currency: account.currency,
      account_id: account.id, category_id: category.id, transfer_id: rnd() < 0.05 ? uid('e', n) : null,
    })
  }
  // Un gasto ANTERIOR a toda la serie del MEP: usa la cotización más vieja.
  rows.push({ id: uid('d', ++n), user_id: USER, date: '2025-10-01', kind: 'expense', amount: 5000, currency: 'ARS',
    account_id: ACCOUNTS[0].id, category_id: CATEGORIES[0].id, transfer_id: null })
  for (let i = 0; i < 30; i++) {
    rows.push({ id: uid('d', ++n), user_id: OTHER, date: pick(days), kind: 'expense', amount: cents(rnd, 90000),
      currency: 'ARS', account_id: ACCOUNTS[2].id, category_id: CATEGORIES[5].id, transfer_id: null })
  }
  return rows
}
const TRANSACTIONS = buildTransactions()

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

create table liquid_accounts (id uuid primary key, user_id uuid not null, currency text not null, is_savings boolean not null default false);
create table categories (id uuid primary key, user_id uuid not null, name text not null default 'x', kind text not null, system_key text);
create table assets (id uuid primary key, user_id uuid not null, savings_account_id uuid);
create table transactions (
  id uuid primary key, user_id uuid not null, date date not null, kind text not null,
  amount numeric(14,2) not null, currency text not null, account_id uuid not null references liquid_accounts(id),
  category_id uuid not null references categories(id), transfer_id uuid
);
create table contributions (id uuid primary key, asset_id uuid, date date, amount_usd numeric, mep_rate numeric,
  direction text, affects_liquid boolean, account_id uuid);
create table instruments (id uuid primary key, source text not null, symbol text not null);
create table instrument_prices (id uuid primary key default gen_random_uuid(), instrument_id uuid not null references instruments(id),
  date date not null, price numeric(20,8) not null, unique (instrument_id, date));
alter table liquid_accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table instruments enable row level security;
alter table instrument_prices enable row level security;
create policy "own rows" on liquid_accounts for all to authenticated using (user_id = auth.uid());
create policy "own rows" on categories for all to authenticated using (user_id = auth.uid());
create policy "own rows" on transactions for all to authenticated using (user_id = auth.uid());
create policy "read" on instruments for select to authenticated using (true);
create policy "read" on instrument_prices for select to authenticated using (true);
grant select on all tables in schema public to authenticated;
`

const q = (v) => (v === null ? 'null' : `'${v}'`)
function seedSql() {
  const values = (rows, f) => rows.map(f).join(',\n')
  return `
insert into liquid_accounts (id, user_id, currency) values ${values(ACCOUNTS, (a) => `('${a.id}', '${a.user_id}', '${a.currency}')`)};
insert into categories (id, user_id, kind, system_key) values ${values(CATEGORIES, (c) => `('${c.id}', '${c.user_id}', '${c.kind}', ${q(c.system_key)})`)};
insert into transactions values ${values(TRANSACTIONS, (t) =>
    `('${t.id}', '${t.user_id}', '${t.date}', '${t.kind}', ${t.amount}, '${t.currency}', '${t.account_id}', '${t.category_id}', ${q(t.transfer_id)})`)};
insert into instruments values ('${MEP}', 'mep', 'mep'), ('${uid('f', 2)}', 'binance', 'BTCUSDT');
insert into instrument_prices (instrument_id, date, price) values ${values(RATES, (r) => `('${MEP}', '${r.date}', ${r.price})`)};
-- Un precio de OTRO instrumento: la búsqueda tiene que ignorarlo.
insert into instrument_prices (instrument_id, date, price) values ('${uid('f', 2)}', '2026-01-15', 99999);`
}

// La definición: los gastos reales de UN usuario, con la forma que tenía
// getExpenses, convertidos con rateOn sobre la misma serie.
function jsSeries(user) {
  const categories = new Map(CATEGORIES.map((c) => [c.id, c]))
  const expenses = TRANSACTIONS.filter((t) => t.user_id === user && t.date >= FROM && t.date <= TODAY)
    .map((t) => ({ ...t, category: categories.get(t.category_id) }))
    .filter((t) => t.kind === 'expense' && !isMovedMoneyType(movementType(t)))
  const convert = async (amount, currency, date) => (currency === 'USD' ? amount : amount / rateOn(RATES, date))
  return { expenses, convert }
}

describe.skipIf(!available)('0056: la cotización del día y la serie en dólares (SQL) vs JS', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0055_period_totals_and_expenses.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0056_usd_rate_and_monthly_expenses.sql', 'utf8'))
    psql(seedSql())
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  it('get_usd_rate coincide con rateOn: en un día con precio, en un hueco, antes y después de la serie', () => {
    const dates = ['2020-01-01', '2025-10-02', RATES[0].date, RATES[5].date, addDays(RATES[5].date, 1), '2026-01-15', '2026-09-26', '2027-01-01']
    for (const date of dates) {
      expect(Number(asUser(USER, `select get_usd_rate('${date}');`).trim()), date).toBeCloseTo(rateOn(RATES, date), 6)
    }
  })

  it('la serie mensual coincide con monthlyUsdTotals, mes por mes', async () => {
    const { expenses, convert } = jsSeries(USER)
    const js = await monthlyUsdTotals(expenses, MONTHS, convert)
    const sql = asUser(USER, `select month, total_usd from get_monthly_expenses_usd('${FROM}', '${TODAY}');`)
      .split('\n').filter(Boolean).map((l) => l.split('\t'))
    expect(sql.map(([m]) => m.slice(0, 7))).toEqual(MONTHS.map(monthKey))
    sql.forEach(([, total], i) => expect(Math.abs(Number(total) - js[i].total), monthKey(MONTHS[i])).toBeLessThan(0.011))
  })

  it('cuántos gastos tuvo cada mes coincide (Inicio muestra el gráfico con dos meses o más)', () => {
    const { expenses } = jsSeries(USER)
    const sql = asUser(USER, `select month, expense_count from get_monthly_expenses_usd('${FROM}', '${TODAY}');`)
      .split('\n').filter(Boolean).map((l) => l.split('\t'))
    for (const [month, count] of sql) {
      expect(Number(count), month).toBe(expenses.filter((t) => t.date.slice(0, 7) === month.slice(0, 7)).length)
    }
  })

  it('otro usuario ve solo sus gastos', async () => {
    const { expenses, convert } = jsSeries(OTHER)
    const js = await monthlyUsdTotals(expenses, MONTHS, convert)
    const sql = asUser(OTHER, `select total_usd from get_monthly_expenses_usd('${FROM}', '${TODAY}');`).split('\n').filter(Boolean)
    sql.forEach((total, i) => expect(Math.abs(Number(total) - js[i].total)).toBeLessThan(0.011))
  })

  it('el dataset toca los casos (si no, el test no prueba nada)', () => {
    const { expenses } = jsSeries(USER)
    expect(expenses.some((t) => t.currency === 'USD')).toBe(true)
    expect(expenses.some((t) => t.date < RATES[0].date)).toBe(true)
    expect(TRANSACTIONS.some((t) => t.user_id === USER && t.transfer_id && t.kind === 'expense')).toBe(true)
  })

  it('sin ninguna cotización cargada, avisa en castellano', () => {
    expect(() =>
      asUser(USER, `select 1; reset role; begin; delete from instrument_prices; set role authenticated;
        select * from get_monthly_expenses_usd('${FROM}', '${TODAY}'); rollback;`),
    ).toThrow(/No hay cotizaciones cargadas/)
    expect(Number(psql('select count(*) from instrument_prices;').trim())).toBe(RATES.length + 1)
  })

  it('sin sesión (anon) no se pueden ejecutar', () => {
    expect(() => psql(`set role anon; select get_usd_rate('2026-01-01');`)).toThrow(/permission denied/)
    expect(() => psql(`set role anon; select * from get_monthly_expenses_usd('${FROM}', '${TODAY}');`)).toThrow(/permission denied/)
  })
})
