// Paridad de la migración 0051: get_liquid_summary y el get_liquid_by_account
// simplificado, contra su definición en JS (summarizeLiquid sobre
// computeLiquidByAccount).
//
// Mismo patrón que debtBalanceSql.test.js: base scratch, el archivo de
// migración TAL CUAL, el mismo dataset a las dos implementaciones. Las
// consultas corren con el rol authenticated, RLS encendido y las mismas
// policies que la base real ("own rows", "own via asset", "own via debt"):
// la plata de otro usuario no puede aparecer.
//
// El dataset cubre lo que el resumen trata distinto: cuentas en pesos y en
// dólares, del día a día y de ahorro, ocultas con saldo, aportes que salen del
// disponible (convertidos o no según la moneda de la cuenta), los "de afuera"
// y pagos de deuda sin tipo de cambio.
//
// Sin Postgres local el test se saltea; el CI corre uno.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { computeLiquidByAccount, summarizeLiquid } from './liquid.js'

const DB = `app_finances_liquid_summary_${process.pid}`

function hasPostgres() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const available = hasPostgres()

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
const OTHER_USER = '20202020-2020-4020-8020-202020202020'

const ACCOUNTS = [
  { id: 'a0000000-0000-4000-8000-000000000001', user_id: USER, currency: 'ARS', is_savings: false, is_archived: false },
  { id: 'a0000000-0000-4000-8000-000000000002', user_id: USER, currency: 'ARS', is_savings: false, is_archived: false },
  { id: 'a0000000-0000-4000-8000-000000000003', user_id: USER, currency: 'USD', is_savings: false, is_archived: false },
  { id: 'a0000000-0000-4000-8000-000000000004', user_id: USER, currency: 'ARS', is_savings: true, is_archived: false },
  { id: 'a0000000-0000-4000-8000-000000000005', user_id: USER, currency: 'USD', is_savings: true, is_archived: false },
  // Ocultas, con saldo: ocultar una cuenta no hace desaparecer su plata.
  { id: 'a0000000-0000-4000-8000-000000000006', user_id: USER, currency: 'ARS', is_savings: false, is_archived: true },
  { id: 'a0000000-0000-4000-8000-000000000007', user_id: USER, currency: 'USD', is_savings: true, is_archived: true },
  // Del otro usuario: nada de esto puede aparecer en el resumen de USER.
  { id: 'a0000000-0000-4000-8000-000000000008', user_id: OTHER_USER, currency: 'ARS', is_savings: false, is_archived: false },
  { id: 'a0000000-0000-4000-8000-000000000009', user_id: OTHER_USER, currency: 'USD', is_savings: true, is_archived: false },
]
const ASSET = { [USER]: 'b0000000-0000-4000-8000-000000000001', [OTHER_USER]: 'b0000000-0000-4000-8000-000000000002' }
const DEBT = { [USER]: 'c0000000-0000-4000-8000-000000000001', [OTHER_USER]: 'c0000000-0000-4000-8000-000000000002' }

function makeRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}
// Dos decimales exactos, lo que admiten las columnas: insertar no redondea.
const cents = (rnd, max) => Math.max(0.01, Math.round(rnd() * max * 100) / 100)

function buildDataset() {
  const rnd = makeRandom(20260925)
  const pick = () => ACCOUNTS[Math.floor(rnd() * ACCOUNTS.length)]

  const transactions = []
  for (let i = 0; i < 300; i++) {
    const account = pick()
    transactions.push({
      user_id: account.user_id,
      kind: rnd() < 0.35 ? 'income' : 'expense',
      amount: cents(rnd, account.currency === 'USD' ? 500 : 300000),
      account_id: account.id,
    })
  }

  const contributions = []
  for (let i = 0; i < 120; i++) {
    const account = pick()
    // Un cuarto "de afuera": nunca pasó por el disponible, así que sin cuenta.
    const affects = rnd() < 0.75
    contributions.push({
      user_id: account.user_id,
      amount_usd: cents(rnd, 2000),
      mep_rate: cents(rnd, 1500),
      direction: rnd() < 0.7 ? 'in' : 'out',
      affects_liquid: affects,
      account_id: affects ? account.id : null,
    })
  }

  const debtPayments = []
  for (let i = 0; i < 80; i++) {
    const account = pick()
    const affects = rnd() < 0.8
    debtPayments.push({
      user_id: account.user_id,
      amount_usd: cents(rnd, 800),
      // Algunos sin tipo de cambio (anteriores a la 0010): quedan fuera en las dos.
      mep_rate: rnd() < 0.85 ? cents(rnd, 1500) : null,
      affects_liquid: affects,
      account_id: affects ? account.id : null,
    })
  }
  return { transactions, contributions, debtPayments }
}

const DATASET = buildDataset()

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

create table liquid_accounts (
  id uuid primary key, user_id uuid not null, name text not null default 'x',
  currency text not null, is_savings boolean not null, is_archived boolean not null
);
create table assets (id uuid primary key, user_id uuid not null);
create table debts (id uuid primary key, user_id uuid not null);
create table transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  kind text not null check (kind in ('expense','income')),
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid not null references liquid_accounts(id)
);
create table contributions (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references assets(id),
  amount_usd numeric(14,2) not null, mep_rate numeric(10,2),
  direction text not null, affects_liquid boolean not null,
  account_id uuid references liquid_accounts(id),
  check (not affects_liquid or account_id is not null)
);
create table debt_payments (
  id uuid primary key default gen_random_uuid(), debt_id uuid not null references debts(id),
  amount_usd numeric(14,2) not null, mep_rate numeric(10,2), affects_liquid boolean not null,
  account_id uuid references liquid_accounts(id),
  check (not affects_liquid or account_id is not null)
);
alter table liquid_accounts enable row level security;
alter table assets enable row level security;
alter table debts enable row level security;
alter table transactions enable row level security;
alter table contributions enable row level security;
alter table debt_payments enable row level security;
create policy "own rows" on liquid_accounts for all to authenticated using (user_id = auth.uid());
create policy "own rows" on assets for all to authenticated using (user_id = auth.uid());
create policy "own rows" on debts for all to authenticated using (user_id = auth.uid());
create policy "own rows" on transactions for all to authenticated using (user_id = auth.uid());
create policy "own via asset" on contributions for all to authenticated
  using (exists (select 1 from assets a where a.id = contributions.asset_id and a.user_id = auth.uid()));
create policy "own via debt" on debt_payments for all to authenticated
  using (exists (select 1 from debts d where d.id = debt_payments.debt_id and d.user_id = auth.uid()));
grant select on all tables in schema public to authenticated, anon;
`

const q = (v) => (v === null ? 'null' : `'${v}'`)
const n = (v) => (v === null ? 'null' : String(v))

function seedSql({ transactions, contributions, debtPayments }) {
  return [
    `insert into liquid_accounts (id, user_id, currency, is_savings, is_archived) values ${ACCOUNTS.map(
      (a) => `('${a.id}', '${a.user_id}', '${a.currency}', ${a.is_savings}, ${a.is_archived})`,
    ).join(',')};`,
    `insert into assets values ('${ASSET[USER]}', '${USER}'), ('${ASSET[OTHER_USER]}', '${OTHER_USER}');`,
    `insert into debts values ('${DEBT[USER]}', '${USER}'), ('${DEBT[OTHER_USER]}', '${OTHER_USER}');`,
    `insert into transactions (user_id, kind, amount, account_id) values ${transactions
      .map((t) => `('${t.user_id}', '${t.kind}', ${t.amount}, '${t.account_id}')`)
      .join(',')};`,
    `insert into contributions (asset_id, amount_usd, mep_rate, direction, affects_liquid, account_id) values ${contributions
      .map((c) => `('${ASSET[c.user_id]}', ${c.amount_usd}, ${n(c.mep_rate)}, '${c.direction}', ${c.affects_liquid}, ${q(c.account_id)})`)
      .join(',')};`,
    `insert into debt_payments (debt_id, amount_usd, mep_rate, affects_liquid, account_id) values ${debtPayments
      .map((p) => `('${DEBT[p.user_id]}', ${p.amount_usd}, ${n(p.mep_rate)}, ${p.affects_liquid}, ${q(p.account_id)})`)
      .join(',')};`,
  ].join('\n')
}

// La definición, con los datos de UN usuario: los baldes por cuenta y el resumen.
function fromJs(user) {
  const own = (list) => list.filter((r) => r.user_id === user)
  const accounts = ACCOUNTS.filter((a) => a.user_id === user)
  const byAccount = computeLiquidByAccount({
    transactions: own(DATASET.transactions),
    contributions: own(DATASET.contributions),
    debtPayments: own(DATASET.debtPayments),
    accounts,
  })
  const buckets = [...byAccount].map(([account_id, amount]) => {
    const a = accounts.find((x) => x.id === account_id)
    return { account_id, currency: a.currency, is_savings: a.is_savings, amount }
  })
  return { buckets, summary: summarizeLiquid(buckets) }
}

// Un centavo de margen: JS suma en punto flotante, Postgres en decimal exacto,
// y un producto monto × tasa puede caer justo en medio centavo.
const CENT = 0.011

describe.skipIf(!available)('get_liquid_summary (SQL) vs summarizeLiquid (JS)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0051_liquid_summary.sql', 'utf8'))
    psql(seedSql(DATASET))
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  for (const [label, user] of [['usuario', USER], ['otro usuario', OTHER_USER]]) {
    it(`${label}: el resumen por moneda coincide, disponible y ahorro por separado`, () => {
      const sql = rowsAs(user, 'select currency, available, savings from get_liquid_summary();').map(
        ([currency, available, savings]) => ({ currency, available: Number(available), savings: Number(savings) }),
      )
      const js = fromJs(user).summary
      expect(sql.map((r) => r.currency)).toEqual(js.map((r) => r.currency))
      sql.forEach((row, i) => {
        expect(Math.abs(row.available - js[i].available)).toBeLessThan(CENT)
        expect(Math.abs(row.savings - js[i].savings)).toBeLessThan(CENT)
      })
    })

    it(`${label}: el desglose por cuenta coincide y son todas cuentas suyas`, () => {
      const sql = new Map(rowsAs(user, 'select account_id, amount from get_liquid_by_account();').map(([id, a]) => [id, Number(a)]))
      const js = fromJs(user).buckets
      expect([...sql.keys()].sort()).toEqual(js.map((b) => b.account_id).sort())
      for (const b of js) expect(Math.abs(sql.get(b.account_id) - b.amount)).toBeLessThan(CENT)
    })
  }

  it('el dataset toca todos los casos (si no, el test no prueba nada)', () => {
    const { buckets, summary } = fromJs(USER)
    expect(summary.map((r) => r.currency)).toEqual(['ARS', 'USD'])
    // Disponible y ahorro con plata en las dos monedas.
    for (const r of summary) {
      expect(Math.abs(r.available)).toBeGreaterThan(0)
      expect(Math.abs(r.savings)).toBeGreaterThan(0)
    }
    // Las dos cuentas ocultas tienen saldo y entran al resumen.
    const hidden = ACCOUNTS.filter((a) => a.is_archived).map((a) => a.id)
    expect(buckets.filter((b) => hidden.includes(b.account_id))).toHaveLength(2)
    expect(DATASET.contributions.some((c) => !c.affects_liquid)).toBe(true)
    expect(DATASET.debtPayments.some((p) => p.affects_liquid && p.mep_rate === null)).toBe(true)
  })

  it('el resumen es exactamente la suma del desglose, sin mezclar monedas ni ahorro', () => {
    const buckets = rowsAs(USER, 'select currency, is_savings, amount from get_liquid_by_account();')
    const summary = rowsAs(USER, 'select currency, available, savings from get_liquid_summary();')
    for (const [currency, avail, savings] of summary) {
      const sum = (flag) =>
        buckets.filter((b) => b[0] === currency && b[1] === flag).reduce((s, b) => s + Number(b[2]), 0)
      expect(Math.abs(Number(avail) - sum('f'))).toBeLessThan(CENT)
      expect(Math.abs(Number(savings) - sum('t'))).toBeLessThan(CENT)
    }
  })

  it('sin sesión (anon) no se puede ejecutar', () => {
    expect(() => psql('set role anon; select * from get_liquid_summary();')).toThrow(/permission denied/)
  })
})
