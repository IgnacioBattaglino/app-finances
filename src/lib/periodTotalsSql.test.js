// Paridad de los renglones del período: las migraciones 0055 (los cinco
// renglones y los gastos por categoría) y 0059 (deudas, intereses, gastar
// desde el ahorro y el tipo "Movimiento de deuda"), contra su definición en JS:
// monthTotals / periodLines, groupExpensesByCategory, paymentParts,
// debtBalance, movementType y, para Inicio, sumByCurrency + expensesInMonth +
// previousMonthToDate.
//
// Dos partes:
//   · Un dataset aleatorio (semilla fija) con todo lo que las reglas tratan
//     distinto, comparado contra el JS en varios rangos.
//   · Escenarios escritos a mano con los números esperados: una deuda con
//     entrada y pagos de a partes, con intereses, sin intereses y pagada de
//     más; una deuda que ya existía; gastar y cobrar desde el ahorro, y la
//     equivalencia con transferir primero y gastar después.
//
// Las consultas corren como authenticated con RLS y las policies reales; un
// segundo usuario tiene datos que no pueden aparecer. Se aplican 0055, 0056 y
// 0059 TAL CUAL. Necesita Postgres 15+ (security_invoker); el CI corre 15.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { monthTotals, periodLines } from './movements.js'
import { groupExpensesByCategory } from './transactions.js'
import { sumByCurrency, expensesInMonth, previousMonthToDate, previousMonthToDateRange } from './expensesSummary.js'
import { movementType, isMovedMoneyType } from './systemCategories.js'
import { currencyLines, amountInCurrency } from './currencyTotals.js'
import { paymentParts, debtBalance, totalPaid, isSettled } from './debts.js'

const DB = `app_finances_period_totals_${process.pid}`

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
const ALICE = '30303030-3030-4030-8030-303030303030' // los escenarios a mano
const BRUNO = '40404040-4040-4040-8040-404040404040' // lo de Alice, transfiriendo primero
const uid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// ── Datos ──────────────────────────────────────────────────────────────────
const ACCOUNTS = [
  { id: uid('a', 1), user_id: USER, currency: 'ARS', is_savings: false },
  { id: uid('a', 2), user_id: USER, currency: 'ARS', is_savings: false },
  { id: uid('a', 3), user_id: USER, currency: 'USD', is_savings: false },
  { id: uid('a', 4), user_id: USER, currency: 'ARS', is_savings: true },
  { id: uid('a', 5), user_id: USER, currency: 'USD', is_savings: true },
  { id: uid('a', 9), user_id: OTHER, currency: 'ARS', is_savings: false },
  { id: uid('a', 20), user_id: ALICE, currency: 'ARS', is_savings: false },
  { id: uid('a', 21), user_id: ALICE, currency: 'USD', is_savings: false },
  { id: uid('a', 22), user_id: ALICE, currency: 'ARS', is_savings: true },
  { id: uid('a', 30), user_id: BRUNO, currency: 'ARS', is_savings: false },
  { id: uid('a', 32), user_id: BRUNO, currency: 'ARS', is_savings: true },
]
const own = (user) => ACCOUNTS.filter((a) => a.user_id === user)

// Categorías de usuario y las ocho del sistema, por usuario. Se insertan ANTES
// de la 0059: su sembrado (on conflict do nothing) no las duplica, y así los
// ids son conocidos.
const CATEGORIES = []
for (const user of [USER, OTHER, ALICE, BRUNO]) {
  const add = (name, kind, system_key = null) =>
    CATEGORIES.push({ id: uid('c', CATEGORIES.length + 1), user_id: user, name, kind, system_key })
  for (const name of ['Comida', 'Alquiler', 'Transporte', 'Salidas']) add(name, 'expense')
  for (const name of ['Sueldo', 'Freelance']) add(name, 'income')
  for (const kind of ['expense', 'income']) {
    add('Ajuste de saldo', kind, 'balance_adjustment')
    add('Transferencia de cuenta', kind, 'account_transfer')
    add('Movimiento de ahorro', kind, 'savings_movement')
  }
  add('Movimiento de deuda', 'income', 'debt_movement')
  add('Intereses', 'expense', 'debt_interest')
}
const catOf = (user, pred) => CATEGORIES.find((c) => c.user_id === user && pred(c))

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

const DAYS = []
for (const [m, last] of [[6, 30], [7, 31], [8, 31], [9, 30]]) {
  for (let d = 1; d <= last; d++) DAYS.push(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
}

function buildDataset() {
  const rnd = makeRandom(20260926)
  const pick = (list) => list[Math.floor(rnd() * list.length)]
  const transactions = []
  const contributions = []
  const debts = []
  const payments = []
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
      debt_id: extra.debt_id ?? null,
    })
  const cat = (user, kind, pred) => pick(CATEGORIES.filter((c) => c.user_id === user && c.kind === kind && pred(c)))

  for (const user of [USER, OTHER]) {
    const accounts = own(user)
    const daily = accounts.filter((a) => !a.is_savings)
    for (let i = 0; i < (user === USER ? 260 : 40); i++) {
      const r = rnd()
      const account = pick(accounts) // incluidas las de ahorro: gastar desde lo guardado
      const kind = rnd() < 0.35 ? 'income' : 'expense'
      if (r < 0.6) tx(user, account, kind, cat(user, kind, (c) => !c.system_key))
      else if (r < 0.7) tx(user, account, kind, cat(user, kind, (c) => c.system_key === 'balance_adjustment'))
      else if (r < 0.8) tx(user, account, kind, cat(user, kind, (c) => c.system_key === 'account_transfer'))
      else if (r < 0.87) tx(user, account, kind, cat(user, kind, (c) => c.system_key === 'savings_movement'))
      else if (accounts.length > 1) {
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
        account_id: affects ? pick(accounts).id : null,
      })
    }
    // Deudas: con entrada (a veces en una cuenta de ahorro) y sin entrada.
    for (let i = 0; i < (user === USER ? 6 : 2); i++) {
      const debt = { id: uid('f', ++n), user_id: user, original_amount_usd: cents(rnd, 3000) + 100, start_date: pick(DAYS) }
      debts.push(debt)
      if (rnd() < 0.6) {
        tx(user, pick(accounts), 'income', catOf(user, (c) => c.system_key === 'debt_movement'), {
          date: debt.start_date,
          debt_id: debt.id,
        })
      }
      for (let k = 0; k < 2 + Math.floor(rnd() * 5); k++) {
        const amount = cents(rnd, debt.original_amount_usd / 2)
        const affects = rnd() < 0.85
        payments.push({
          id: uid('9', ++n),
          debt_id: debt.id,
          user_id: user,
          date: pick(DAYS),
          created_at: `2026-10-01T00:00:${String(k).padStart(2, '0')}Z`,
          amount_usd: amount,
          // Intereses a mano en algunos, nunca más que el pago.
          interest_usd: rnd() < 0.4 ? Math.round(amount * rnd() * 50) / 100 : null,
          mep_rate: rnd() < 0.9 ? cents(rnd, 1500) : null,
          affects_liquid: affects,
          account_id: affects ? pick(daily).id : null,
        })
      }
    }
  }
  return { transactions, contributions, debts, payments }
}

const DATA = buildDataset()

// ── Los escenarios a mano ──────────────────────────────────────────────────
// Alice: una deuda de US$ 1.000 con entrada de $1.200.000 en su cuenta en
// pesos y tres pagos (el primero con US$ 50 de intereses, el tercero pagando
// de más), y otra de US$ 500 que ya existía, sin entrada, pagada desde su
// cuenta en dólares. Además gasta y cobra desde su cuenta de ahorro.
// Bruno transfiere del ahorro a su cuenta común y gasta desde ahí.
const ALICE_DEBT = uid('f', 900)
const ALICE_OLD_DEBT = uid('f', 901)
const txRow = (id, user, date, kind, amount, currency, account, category, extra = {}) => ({
  id, user_id: user, date, kind, amount, currency, account_id: account, category_id: category.id,
  transfer_id: extra.transfer_id ?? null, debt_id: extra.debt_id ?? null,
})
const payRow = (id, debt, date, amount, interest, mep, account) => ({
  id, debt_id: debt, user_id: ALICE, date, created_at: `${date}T00:00:00Z`,
  amount_usd: amount, interest_usd: interest, mep_rate: mep, affects_liquid: true, account_id: account,
})
const SCENARIO = {
  debts: [
    { id: ALICE_DEBT, user_id: ALICE, original_amount_usd: 1000, start_date: '2026-07-01' },
    { id: ALICE_OLD_DEBT, user_id: ALICE, original_amount_usd: 500, start_date: '2025-01-01' },
  ],
  payments: [
    payRow(uid('9', 901), ALICE_DEBT, '2026-07-10', 300, 50, 1200, uid('a', 20)),
    payRow(uid('9', 902), ALICE_DEBT, '2026-08-10', 500, null, 1250, uid('a', 20)),
    payRow(uid('9', 903), ALICE_DEBT, '2026-09-10', 400, null, 1300, uid('a', 20)),
    payRow(uid('9', 904), ALICE_OLD_DEBT, '2026-08-20', 100, null, 1250, uid('a', 21)),
  ],
  transactions: [
    txRow(uid('d', 901), ALICE, '2026-07-01', 'income', 1200000, 'ARS', uid('a', 20),
      catOf(ALICE, (c) => c.system_key === 'debt_movement'), { debt_id: ALICE_DEBT }),
    txRow(uid('d', 902), ALICE, '2026-08-05', 'expense', 10000, 'ARS', uid('a', 22), catOf(ALICE, (c) => c.name === 'Comida')),
    txRow(uid('d', 903), ALICE, '2026-08-06', 'income', 5000, 'ARS', uid('a', 22), catOf(ALICE, (c) => c.name === 'Freelance')),
    txRow(uid('d', 904), BRUNO, '2026-08-05', 'expense', 10000, 'ARS', uid('a', 32),
      catOf(BRUNO, (c) => c.system_key === 'account_transfer' && c.kind === 'expense'), { transfer_id: uid('e', 904) }),
    txRow(uid('d', 905), BRUNO, '2026-08-05', 'income', 10000, 'ARS', uid('a', 30),
      catOf(BRUNO, (c) => c.system_key === 'account_transfer' && c.kind === 'income'), { transfer_id: uid('e', 904) }),
    txRow(uid('d', 906), BRUNO, '2026-08-05', 'expense', 10000, 'ARS', uid('a', 30), catOf(BRUNO, (c) => c.name === 'Comida')),
  ],
}

const ALL = {
  transactions: [...DATA.transactions, ...SCENARIO.transactions],
  contributions: DATA.contributions,
  debts: [...DATA.debts, ...SCENARIO.debts],
  payments: [...DATA.payments, ...SCENARIO.payments],
}

// ── La base ────────────────────────────────────────────────────────────────
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
create table auth.users (id uuid primary key);
-- system_category_id es de la 0041 (la usa save_debt): la misma búsqueda por llave.
create or replace function system_category_id(p_system_key text, p_kind text) returns uuid language plpgsql stable as $$
begin
  return (select id from categories where system_key = p_system_key and kind = p_kind and not is_archived limit 1);
end $$;
-- La 0059 redefine handle_new_user, que declara una variable de este tipo.
create table invitations (id uuid primary key, used_at timestamptz, used_by uuid, used_by_email text, revoked_at timestamptz, expires_at timestamptz);
insert into auth.users values ('${USER}'), ('${OTHER}'), ('${ALICE}'), ('${BRUNO}');

create table liquid_accounts (id uuid primary key, user_id uuid not null default auth.uid(), currency text not null, is_savings boolean not null);
create table categories (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), name text not null, kind text not null,
  system_key text, is_system boolean not null default false, is_archived boolean not null default false, position int not null default 0);
create unique index idx_categories_system_key on categories(user_id, system_key, kind) where system_key is not null;
create table assets (id uuid primary key, user_id uuid not null, savings_account_id uuid);
create table debts (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), creditor text not null default 'Alguien',
  original_amount_usd numeric(14,2) not null, start_date date not null, created_at timestamptz not null default now());
create table debt_payments (id uuid primary key default gen_random_uuid(), debt_id uuid not null references debts(id), date date not null,
  amount_usd numeric(14,2) not null check (amount_usd > 0), mep_rate numeric(10,2), affects_liquid boolean not null default true,
  account_id uuid references liquid_accounts(id), created_at timestamptz not null default now());
create table transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), date date not null, kind text not null,
  description text, amount numeric(14,2) not null, currency text not null default 'ARS',
  account_id uuid not null references liquid_accounts(id), category_id uuid not null references categories(id), transfer_id uuid
);
create table contributions (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references assets(id), date date not null,
  amount_usd numeric(14,2) not null, mep_rate numeric(10,2), direction text not null,
  affects_liquid boolean not null, account_id uuid references liquid_accounts(id)
);
create table instruments (id uuid primary key, source text not null, symbol text not null);
create table instrument_prices (id uuid primary key default gen_random_uuid(), instrument_id uuid not null references instruments(id),
  date date not null, price numeric(20,8) not null);

alter table liquid_accounts enable row level security;
alter table categories enable row level security;
alter table assets enable row level security;
alter table debts enable row level security;
alter table debt_payments enable row level security;
alter table transactions enable row level security;
alter table contributions enable row level security;
create policy "own rows" on liquid_accounts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on categories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on assets for all to authenticated using (user_id = auth.uid());
create policy "own rows" on debts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on transactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own via asset" on contributions for all to authenticated
  using (exists (select 1 from assets a where a.id = contributions.asset_id and a.user_id = auth.uid()));
create policy "own via debt" on debt_payments for all to authenticated
  using (exists (select 1 from debts d where d.id = debt_payments.debt_id and d.user_id = auth.uid()))
  with check (exists (select 1 from debts d where d.id = debt_payments.debt_id and d.user_id = auth.uid()));
grant select, insert, update, delete on all tables in schema public to authenticated;
`

const q = (v) => (v === null || v === undefined ? 'null' : `'${v}'`)
const num = (v) => (v === null || v === undefined ? 'null' : String(v))
const values = (rows, f) => rows.map(f).join(',\n')

// Antes de las migraciones: lo que la 0059 necesita encontrar (las categorías
// del sistema ya sembradas, las deudas a las que apuntan las entradas).
const BASE_SEED = () => `
insert into liquid_accounts values ${values(ACCOUNTS, (a) => `('${a.id}', '${a.user_id}', '${a.currency}', ${a.is_savings})`)};
insert into categories (id, user_id, name, kind, system_key, is_system) values ${values(CATEGORIES, (c) =>
  `('${c.id}', '${c.user_id}', '${c.name}', '${c.kind}', ${q(c.system_key)}, ${c.system_key !== null})`)};
insert into assets values ${values(ASSETS, (a) => `('${a.id}', '${a.user_id}', ${q(a.savings_account_id)})`)};
insert into debts (id, user_id, original_amount_usd, start_date) values ${values(ALL.debts, (d) =>
  `('${d.id}', '${d.user_id}', ${d.original_amount_usd}, '${d.start_date}')`)};`

// Después de las migraciones: transactions.debt_id y debt_payments.interest_usd ya existen.
const DATA_SEED = () => `
insert into transactions (id, user_id, date, kind, amount, currency, account_id, category_id, transfer_id, debt_id) values ${values(ALL.transactions, (t) =>
  `('${t.id}', '${t.user_id}', '${t.date}', '${t.kind}', ${t.amount}, '${t.currency}', '${t.account_id}', '${t.category_id}', ${q(t.transfer_id)}, ${q(t.debt_id)})`)};
insert into contributions (asset_id, date, amount_usd, mep_rate, direction, affects_liquid, account_id) values ${values(ALL.contributions, (c) =>
  `('${c.asset_id}', '${c.date}', ${c.amount_usd}, ${num(c.mep_rate)}, '${c.direction}', ${c.affects_liquid}, ${q(c.account_id)})`)};
insert into debt_payments (id, debt_id, date, created_at, amount_usd, interest_usd, mep_rate, affects_liquid, account_id) values ${values(ALL.payments, (p) =>
  `('${p.id}', '${p.debt_id}', '${p.date}', '${p.created_at}', ${p.amount_usd}, ${num(p.interest_usd)}, ${num(p.mep_rate)}, ${p.affects_liquid}, ${q(p.account_id)})`)};`

// ── La definición, con la forma que ven las pantallas ──────────────────────
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to)
const debtOf = (d) => ({ ...d, payments: ALL.payments.filter((p) => p.debt_id === d.id) })

function jsRows(user, from, to) {
  const accounts = new Map(ACCOUNTS.map((a) => [a.id, a]))
  const categories = new Map(CATEGORIES.map((c) => [c.id, c]))
  const assets = new Map(ASSETS.map((a) => [a.id, a]))
  const transactions = ALL.transactions
    .filter((t) => t.user_id === user && inRange(t.date, from, to))
    .map((t) => ({ ...t, category: categories.get(t.category_id), account: accounts.get(t.account_id) }))
  const contributions = ALL.contributions
    .filter((c) => c.user_id === user && c.affects_liquid && inRange(c.date, from, to))
    .map((c) => ({ ...c, asset: assets.get(c.asset_id), account: accounts.get(c.account_id) }))
  // La partición de cada pago depende de los anteriores: se hace sobre la
  // deuda entera y recién después se recorta al período.
  const debtPayments = ALL.debts
    .filter((d) => d.user_id === user)
    .flatMap((d) => paymentParts(debtOf(d)))
    .filter((p) => inRange(p.date, from, to))
    .map((p) => ({ ...p, account: accounts.get(p.account_id) }))
  return { transactions, contributions, debtPayments }
}

const sqlTotals = (user, from, to) =>
  rowsAs(user, `select currency, expenses, incomes, invested, saved, debts, debt_movements, balance from get_period_totals(${q(from)}, ${q(to)});`).map(
    ([currency, expenses, incomes, invested, saved, debts, debt_movements, balance]) =>
      ({ currency, expenses, incomes, invested, saved, debts, debt_movements, balance }),
  )

// Un centavo de margen: JS suma en punto flotante, Postgres en decimal exacto.
const closeLines = (a, b, label = '') => {
  expect(a.map((l) => l.currency), label).toEqual(b.map((l) => l.currency))
  a.forEach((l, i) => expect(Math.abs(l.amount - b[i].amount), `${label} ${l.currency}`).toBeLessThan(0.011))
}
const ROWS = ['expenses', 'incomes', 'invested', 'saved', 'debts', 'balance']
const line = (lines, currency = 'ARS') => lines.find((l) => l.currency === currency)?.amount ?? 0

const RANGES = [
  ['un mes', '2026-07-01', '2026-07-31'],
  ['un mes a medias', '2026-09-01', '2026-09-15'],
  ['dos fechas cualesquiera', '2026-06-17', '2026-08-03'],
  ['todo el historial', null, null],
]

describe.skipIf(!available)('los renglones del período (SQL, 0055 + 0059) contra la definición en JS', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(BASE_SEED())
    for (const m of ['0055_period_totals_and_expenses', '0056_usd_rate_and_monthly_expenses', '0059_debts_and_savings_in_totals']) {
      psql(readFileSync(`supabase/migrations/${m}.sql`, 'utf8'))
    }
    psql(DATA_SEED())
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  describe('el dataset aleatorio', () => {
    for (const [label, from, to] of RANGES) {
      it(`${label}: los seis renglones coinciden con monthTotals`, () => {
        const sql = periodLines(sqlTotals(USER, from, to))
        const js = monthTotals(jsRows(USER, from, to))
        for (const key of ROWS) closeLines(sql[key], js[key], key)
        expect(sql.hasDebts).toBe(js.hasDebts)
      })

      it(`${label}: los gastos por categoría (con los intereses) coinciden con groupExpensesByCategory`, () => {
        const sql = rowsAs(USER, `select currency, category_name, total from get_expenses_by_category(${q(from)}, ${q(to)});`)
        const { transactions, debtPayments } = jsRows(USER, from, to)
        const flat = groupExpensesByCategory(transactions, debtPayments).flatMap((g) =>
          g.categories.map((c) => [g.currency, c.name, c.total]),
        )
        expect(sql.map(([c, name]) => `${c}:${name}`).sort()).toEqual(flat.map(([c, name]) => `${c}:${name}`).sort())
        for (const [currency, name, total] of sql) {
          const match = flat.find(([c, nm]) => c === currency && nm === name)
          expect(Math.abs(Number(total) - match[2]), `${currency}:${name}`).toBeLessThan(0.011)
        }
      })
    }

    it('el tipo de cada movimiento coincide con movementType, fila por fila', () => {
      const categories = new Map(CATEGORIES.map((c) => [c.id, c]))
      const sql = new Map(rowsAs(USER, 'select id, movement_type from transaction_movement_types;'))
      for (const t of ALL.transactions.filter((t) => t.user_id === USER)) {
        expect(sql.get(t.id), t.id).toBe(movementType({ ...t, category: categories.get(t.category_id) }))
      }
    })

    it('capital e intereses de cada pago coinciden con paymentParts; el saldo, con debtBalance', () => {
      const parts = new Map(
        rowsAs(USER, 'select id, capital_usd, interest_usd from debt_payment_parts;').map(([id, c, i]) => [id, [Number(c), Number(i)]]),
      )
      const balances = new Map(
        rowsAs(USER, 'select debt_id, paid_usd, balance_usd, is_settled from debt_balances;').map(([id, p, b, s]) => [id, [Number(p), Number(b), s === 't']]),
      )
      for (const d of ALL.debts.filter((d) => d.user_id === USER)) {
        const debt = debtOf(d)
        for (const p of paymentParts(debt)) {
          const [capital, interest] = parts.get(p.id)
          expect(Math.abs(capital - p.capital_usd), p.id).toBeLessThan(0.011)
          expect(Math.abs(interest - p.interest_usd), p.id).toBeLessThan(0.011)
        }
        const [paid, balance, settled] = balances.get(d.id)
        expect(Math.abs(paid - totalPaid(debt))).toBeLessThan(0.011)
        expect(Math.abs(balance - debtBalance(debt))).toBeLessThan(0.011)
        expect(settled).toBe(isSettled(debt))
      }
    })

    it('Inicio: el gasto del mes y el del mes anterior a esta altura coinciden con la definición', () => {
      const today = '2026-08-31'
      const { transactions, debtPayments } = jsRows(USER, '2025-09-01', today)
      // Los gastos reales (la forma que tenía getExpenses) más los intereses.
      const interests = debtPayments
        .filter((p) => p.affects_liquid && p.mep_rate != null && p.interest_usd > 0)
        .map((p) => ({
          date: p.date,
          currency: p.account.currency,
          amount: amountInCurrency(p.interest_usd, Number(p.mep_rate), p.account.currency),
        }))
      const all = [...transactions.filter((t) => t.kind === 'expense' && !isMovedMoneyType(movementType(t))), ...interests]
      const current = currencyLines(sumByCurrency(expensesInMonth(all, { year: 2026, month: 8 })))
      const previous = currencyLines(sumByCurrency(previousMonthToDate(all, today)))
      closeLines(periodLines(sqlTotals(USER, '2026-08-01', today)).expenses, current)
      const range = previousMonthToDateRange(today)
      closeLines(periodLines(sqlTotals(USER, range.from, range.to)).expenses, previous)
    })

    it('el dataset toca todos los casos (si no, el test no prueba nada)', () => {
      const { transactions, contributions } = jsRows(USER, null, null)
      const keys = new Set(transactions.map((t) => t.category.system_key))
      for (const k of ['balance_adjustment', 'account_transfer', 'savings_movement', 'debt_movement']) expect(keys.has(k), k).toBe(true)
      expect(transactions.some((t) => t.account.is_savings && movementType(t) === 'expense')).toBe(true)
      expect(transactions.some((t) => t.account.is_savings && movementType(t) === 'income')).toBe(true)
      expect(contributions.some((c) => c.asset.savings_account_id)).toBe(true)
      const own = ALL.debts.filter((d) => d.user_id === USER)
      expect(own.some((d) => ALL.transactions.some((t) => t.debt_id === d.id))).toBe(true) // con entrada
      expect(own.some((d) => !ALL.transactions.some((t) => t.debt_id === d.id))).toBe(true) // sin entrada
      const parts = own.flatMap((d) => paymentParts(debtOf(d)))
      expect(parts.some((p) => Number(p.interest_usd) > 0 && p.capital_usd > 0)).toBe(true) // intereses a mano
      // La red: algún pago cruza el monto de su deuda.
      expect(own.some((d) => paymentParts(debtOf(d)).some((p, i, all) =>
        p.interest_usd > Number(debtOf(d).payments.find((x) => x.id === all[i].id).interest_usd ?? 0)))).toBe(true)
      expect(ALL.payments.some((p) => p.user_id === USER && !p.affects_liquid)).toBe(true)
      expect(ALL.payments.some((p) => p.user_id === USER && p.affects_liquid && p.mep_rate === null)).toBe(true)
    })

    it('otro usuario ve solo lo suyo', () => {
      const sql = periodLines(sqlTotals(OTHER, null, null))
      const js = monthTotals(jsRows(OTHER, null, null))
      for (const key of ROWS) closeLines(sql[key], js[key], key)
    })
  })

  describe('los escenarios, con los números a mano', () => {
    const month = (user, m, last) => periodLines(sqlTotals(user, `2026-${m}-01`, `2026-${m}-${last}`))

    it('julio: entra el préstamo y se paga con intereses a mano', () => {
      // Entrada $1.200.000; pago de US$ 300 con US$ 50 de intereses a $1.200:
      // intereses $60.000 (Gastos), capital US$ 250 = $300.000 (Deudas).
      const july = month(ALICE, '07', '31')
      expect(line(july.expenses)).toBe(60000)
      expect(line(july.debts)).toBe(900000)
      expect(line(july.balance)).toBe(840000)
      expect(july.hasDebts).toBe(true)
    })

    it('agosto: un pago sin intereses, la deuda que ya existía y el ahorro', () => {
      const aug = month(ALICE, '08', '31')
      // Capital US$ 500 × $1.250 = $625.000; la vieja, US$ 100 desde la cuenta en dólares.
      expect(line(aug.debts)).toBe(-625000)
      expect(line(aug.debts, 'USD')).toBe(-100)
      // Gastar $10.000 y cobrar $5.000 desde el ahorro: cuentan en Gastos e
      // Ingresos, y Ahorrado se mueve al revés; el balance no los ve.
      expect(line(aug.expenses)).toBe(10000)
      expect(line(aug.incomes)).toBe(5000)
      expect(line(aug.saved)).toBe(-5000)
      expect(line(aug.balance)).toBe(-625000)
      expect(line(aug.balance, 'USD')).toBe(-100)
    })

    it('septiembre: pagar de más — el excedente es interés (la red)', () => {
      // Capital acumulado 250 + 500 = 750; el pago de US$ 400 cruza los US$ 1.000
      // por US$ 150: interés $195.000 y capital US$ 250 = $325.000.
      const sep = month(ALICE, '09', '30')
      expect(line(sep.expenses)).toBe(195000)
      expect(line(sep.debts)).toBe(-325000)
      expect(line(sep.balance)).toBe(-520000)
      const [paid, balance, settled] = rowsAs(ALICE, `select paid_usd, balance_usd, is_settled from debt_balances where debt_id = '${ALICE_DEBT}';`)[0]
      expect([Number(paid), Number(balance), settled]).toEqual([1150, 0, 't'])
    })

    it('la deuda que ya existía: sin entrada, su monto es lo que falta pagar', () => {
      const [paid, balance] = rowsAs(ALICE, `select paid_usd, balance_usd from debt_balances where debt_id = '${ALICE_OLD_DEBT}';`)[0]
      expect([Number(paid), Number(balance)]).toEqual([100, 400])
      expect(month(ALICE, '06', '30').hasDebts).toBe(false)
    })

    it('los intereses aparecen como "Intereses" en los gastos por categoría', () => {
      const rows = rowsAs(ALICE, `select category_name, total from get_expenses_by_category('2026-07-01', '2026-09-30');`)
      expect(rows.find(([name]) => name === 'Intereses')?.[1]).toBe('255000.00')
    })

    it('gastar desde el ahorro da lo mismo que transferir primero y gastar después', () => {
      const alice = periodLines(sqlTotals(ALICE, '2026-08-05', '2026-08-05'))
      const bruno = periodLines(sqlTotals(BRUNO, '2026-08-05', '2026-08-05'))
      for (const key of ['expenses', 'saved', 'balance']) closeLines(alice[key], bruno[key], key)
      expect(line(bruno.saved)).toBe(-10000)
      expect(line(bruno.balance)).toBe(0)
    })

    it('sin movimiento de deudas, no hay renglón "Deudas"', () => {
      expect(month(BRUNO, '08', '31').hasDebts).toBe(false)
    })
  })

  describe('las escrituras', () => {
    it('los intereses no pueden superar el pago, con un mensaje en castellano', () => {
      expect(() =>
        rowsAs(ALICE, `insert into debt_payments (debt_id, date, amount_usd, interest_usd, mep_rate, account_id)
                        values ('${ALICE_DEBT}', '2026-09-20', 100, 150, 1300, '${uid('a', 20)}');`),
      ).toThrow(/Los intereses no pueden ser más que el pago/)
    })

    it('save_debt crea la deuda con su entrada, la edita y la quita, todo junto', () => {
      const id = rowsAs(ALICE, `select save_debt(null, 'Banco', 2000, '2026-09-01', '${uid('a', 20)}', 2500000);`)[0][0]
      const inflow = () => rowsAs(ALICE, `select amount, currency from transactions where debt_id = '${id}';`)
      expect(inflow()).toEqual([['2500000.00', 'ARS']])
      rowsAs(ALICE, `select save_debt('${id}', 'Banco', 2000, '2026-09-01', '${uid('a', 21)}', 2000);`)
      expect(inflow()).toEqual([['2000.00', 'USD']]) // otra cuenta, otra moneda: la pone la base
      rowsAs(ALICE, `select save_debt('${id}', 'Banco', 2000, '2026-09-01', null, null);`)
      expect(inflow()).toEqual([])
    })

    it('sin sesión (anon) no se puede ejecutar ni leer nada de esto', () => {
      for (const sql of [
        'select * from get_period_totals(null, null)',
        'select * from get_expenses_by_category(null, null)',
        'select * from transaction_movement_types',
        'select * from debt_payment_parts',
        'select * from expense_lines',
        "select save_debt(null, 'x', 1, '2026-01-01')",
      ]) {
        expect(() => psql(`set role anon; ${sql};`), sql).toThrow(/permission denied/)
      }
    })
  })
})
