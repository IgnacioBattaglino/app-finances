// Paridad entre la vista debt_balances (migración 0049) y la regla JS que
// calculaba el saldo antes (debtBalance / isSettled / summarizeDebts).
//
// La 0049 cambia DÓNDE se calcula el saldo, no QUÉ se calcula: para cualquier
// conjunto de deudas y pagos las dos tienen que dar exactamente lo mismo. Mismo
// patrón que liquidSql.test.js: base scratch, el archivo de migración TAL CUAL,
// el mismo dataset para las dos, y comparación deuda por deuda.
//
// Además prueba la seguridad por usuario: la vista se consulta con el rol
// authenticated y RLS encendido, con las mismas policies que la 0005. Una deuda
// de otro usuario no puede aparecer.
//
// Necesita Postgres 15+ (security_invoker). Sin eso se saltea; el CI corre 15.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  debtBalance,
  isSettled,
  totalPaid,
  summarizeDebts,
  summarizeDebtBalances,
  withBalances,
} from './debts.js'

const DB = `app_finances_debt_balance_${process.pid}`

function postgresVersion() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return Number(
      execFileSync('psql', ['-d', 'postgres', '-A', '-t', '-c', 'show server_version_num'], {
        encoding: 'utf8',
      }).trim(),
    )
  } catch {
    return 0
  }
}
const available = postgresVersion() >= 150000

const psql = (sql) =>
  execFileSync('psql', ['-d', DB, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
  })

const USER = '10101010-1010-4010-8010-101010101010'
const OTHER_USER = '20202020-2020-4020-8020-202020202020'

// Esquema mínimo con los mismos tipos, CHECKs y policies que la base real
// (0001 + 0005). La 0005 no se aplica tal cual porque arranca borrando las
// policies de la 0002, que acá no existen.
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

create table debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  creditor text not null,
  original_amount_usd numeric(14,2) not null,
  start_date date not null,
  created_at timestamptz default now()
);
create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id),
  date date not null,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  mep_rate numeric(10,2),
  affects_liquid boolean not null default true
);
alter table debts enable row level security;
alter table debt_payments enable row level security;
create policy "own rows" on debts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own via debt" on debt_payments for all to authenticated
  using (exists (select 1 from debts d where d.id = debt_payments.debt_id and d.user_id = auth.uid()))
  with check (exists (select 1 from debts d where d.id = debt_payments.debt_id and d.user_id = auth.uid()));
grant select on debts, debt_payments to authenticated, anon;
`

// ── El dataset ──────────────────────────────────────────────────────────────
// Primero los casos que la regla trata distinto, con nombre; después un lote
// determinista (PRNG con semilla fija) para lo que a nadie se le ocurre.
function makeRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}
const cents = (rnd, max) => Math.max(0.01, Math.round(rnd() * max * 100) / 100)
const uuid = (n) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`

function buildDataset() {
  const debts = []
  let n = 0
  const add = (user, original, payments) =>
    debts.push({
      id: uuid(++n),
      user_id: user,
      creditor: `Deuda ${n}`,
      original_amount_usd: original,
      start_date: '2025-01-01',
      payments: payments.map((amount_usd) => ({ amount_usd })),
    })

  add(USER, 1000, []) // sin pagos
  add(USER, 1000, [300, 200]) // pagos parciales
  add(USER, 1000, [1000]) // pagada exacta
  add(USER, 1000, [700, 800]) // pagada de más: saldo 0, no negativo
  add(USER, 1000, [333.33, 333.33, 333.33]) // queda un centavo
  add(USER, 0.01, [0.01]) // la más chica posible
  add(OTHER_USER, 5000, [100]) // de otro usuario: no tiene que aparecer
  add(OTHER_USER, 200, [])

  const rnd = makeRandom(20260925)
  for (let i = 0; i < 60; i++) {
    const original = cents(rnd, 50000)
    const payments = Array.from({ length: Math.floor(rnd() * 9) }, () => cents(rnd, original / 3))
    add(rnd() < 0.8 ? USER : OTHER_USER, original, payments)
  }
  return debts
}

const DATASET = buildDataset()

function seedSql(debts) {
  const debtRows = debts
    .map((d) => `('${d.id}', '${d.user_id}', '${d.creditor}', ${d.original_amount_usd}, '${d.start_date}')`)
    .join(',\n')
  const paymentRows = debts
    .flatMap((d) => d.payments.map((p) => `('${d.id}', '2025-06-01', ${p.amount_usd})`))
    .join(',\n')
  return `
insert into debts (id, user_id, creditor, original_amount_usd, start_date) values ${debtRows};
insert into debt_payments (debt_id, date, amount_usd) values ${paymentRows};`
}

// La vista leída como la lee la app: rol authenticated, con el usuario en sesión.
function viewAs(user) {
  return psql(
    `set app.current_user_id = '${user}'; set role authenticated;
     select debt_id, paid_usd, balance_usd, is_settled from debt_balances;`,
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [debt_id, paid_usd, balance_usd, is_settled] = line.split('\t')
      return { debt_id, paid_usd, balance_usd, is_settled: is_settled === 't' }
    })
}

describe.skipIf(!available)('debt_balances (SQL) contra la regla JS', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0049_debt_balances_view.sql', 'utf8'))
    psql(seedSql(DATASET))
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  for (const user of [USER, OTHER_USER]) {
    const own = DATASET.filter((d) => d.user_id === user)

    it(`${user === USER ? 'usuario' : 'otro usuario'}: ve solo sus deudas, todas`, () => {
      const ids = viewAs(user).map((r) => r.debt_id).sort()
      expect(ids).toEqual(own.map((d) => d.id).sort())
    })

    it(`${user === USER ? 'usuario' : 'otro usuario'}: saldo, pagado y saldada coinciden deuda por deuda`, () => {
      const byId = new Map(viewAs(user).map((r) => [r.debt_id, r]))
      for (const d of own) {
        const row = byId.get(d.id)
        expect({ id: d.id, paid: Number(row.paid_usd), balance: Number(row.balance_usd), settled: row.is_settled })
          .toEqual({ id: d.id, paid: totalPaid(d), balance: debtBalance(d), settled: isSettled(d) })
      }
    })

    it(`${user === USER ? 'usuario' : 'otro usuario'}: los totales de pantalla coinciden con summarizeDebts`, () => {
      const fromView = summarizeDebtBalances(withBalances(own, viewAs(user)))
      const fromJs = summarizeDebts(own)
      const ids = (list) => list.map((d) => d.id)
      expect({
        active: ids(fromView.active),
        settled: ids(fromView.settled),
        totalBalance: fromView.totalBalance,
        totalOriginal: fromView.totalOriginal,
        totalPaid: fromView.totalPaid,
      }).toEqual({
        active: ids(fromJs.active),
        settled: ids(fromJs.settled),
        totalBalance: fromJs.totalBalance,
        totalOriginal: fromJs.totalOriginal,
        totalPaid: fromJs.totalPaid,
      })
    })
  }

  it('los casos de borde están en el dataset (si no, el test no prueba nada)', () => {
    const own = DATASET.filter((d) => d.user_id === USER)
    expect(own.some((d) => d.payments.length === 0)).toBe(true)
    expect(own.some((d) => totalPaid(d) > Number(d.original_amount_usd))).toBe(true)
    expect(own.some((d) => isSettled(d))).toBe(true)
    expect(own.some((d) => !isSettled(d) && d.payments.length > 0)).toBe(true)
  })

  it('sin sesión (anon) la vista no se puede leer', () => {
    expect(() => psql('set role anon; select * from debt_balances;')).toThrow(/permission denied/)
  })
})
