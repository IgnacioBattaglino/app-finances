// Paridad entre get_commitment_occurrences / get_commitment_status (migración
// 0062) y la regla JS que decide qué vence y cuándo (commitmentSchedule.js).
//
// La 0062 cambia DÓNDE se calcula, no QUÉ: para cualquier conjunto de planes y
// cargos las dos tienen que dar exactamente lo mismo. Mismo patrón que
// debtBalanceSql.test.js: base scratch, los archivos de migración TAL CUAL
// (0045 crea las tablas, 0062 las funciones), el mismo dataset para las dos y
// comparación fila por fila.
//
// Sin Postgres local se saltea; el CI lo corre.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  planOccurrences,
  planRemaining,
  isFinished,
  duePayments,
  addDays,
  addMonths,
} from './commitmentSchedule.js'

const DB = `app_finances_occurrences_${process.pid}`

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
    maxBuffer: 64 * 1024 * 1024,
  })

const rows = (sql) =>
  psql(sql)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))

const USER = '10101010-1010-4010-8010-101010101010'
const OTHER_USER = '20202020-2020-4020-8020-202020202020'
const CATEGORY = 'cccccccc-0000-4000-8000-000000000001'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const TODAY = '2026-11-16'

// Lo mínimo que la 0045 necesita para crearse (las tablas a las que apunta).
const SCHEMA = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
exception when duplicate_object or unique_violation then null;
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
insert into auth.users values ('${USER}'), ('${OTHER_USER}');
create table categories (
  id uuid primary key default gen_random_uuid(), user_id uuid, name text not null,
  kind text not null, is_system boolean not null default false, system_key text
);
create table liquid_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null,
  currency text not null default 'ARS', is_savings boolean not null default false
);
create table transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(),
  date date not null, kind text not null, category_id uuid not null references categories(id),
  description text, amount numeric(14,2) not null, currency text not null default 'ARS',
  account_id uuid references liquid_accounts(id), transfer_id uuid, created_at timestamptz not null default now()
);
insert into categories (id, user_id, name, kind) values ('${CATEGORY}', '${USER}', 'Hogar', 'expense');
insert into liquid_accounts (id, user_id, name) values ('${ACCOUNT}', '${USER}', 'Efectivo');
`

// ── Dataset ─────────────────────────────────────────────────────────────────
// Bordes con nombre + un lote aleatorio con semilla fija.

let seq = 0
const uuid = (prefix) => `${prefix}-0000-4000-8000-${String(++seq).padStart(12, '0')}`

function plan(name, fields) {
  return {
    id: uuid('dddddddd'),
    name,
    kind: fields.installments == null ? 'subscription' : 'installments',
    currency: 'ARS',
    amount: 1000,
    first_amount: null,
    installments: null,
    first_installment: 1,
    frequency: 'monthly',
    ends_on: null,
    ...fields,
  }
}

const EDGES = [
  plan('cuotas simples', { installments: 6, start_date: '2026-09-10' }),
  plan('día 31: febrero se acorta y marzo vuelve', { installments: 12, start_date: '2026-01-31' }),
  plan('primera cuota distinta', { installments: 3, start_date: '2026-10-05', amount: 33333.33, first_amount: 33333.34 }),
  plan('compra ya empezada (4 de 6)', { installments: 6, first_installment: 4, start_date: '2026-10-20', first_amount: 500 }),
  plan('terminada a mano', { installments: 12, start_date: '2026-06-15', ends_on: '2026-10-01' }),
  plan('una cuota (1 de 1)', { installments: 1, start_date: '2026-12-01' }),
  plan('todavía no empezó', { installments: 3, start_date: '2027-03-01' }),
  plan('suscripción mensual', { start_date: '2025-01-15', amount: 5999.99, currency: 'USD' }),
  plan('suscripción semanal', { start_date: '2026-10-01', frequency: 'weekly' }),
  plan('suscripción trimestral', { start_date: '2025-11-30', frequency: 'quarterly' }),
  plan('suscripción anual 29 de febrero', { start_date: '2024-02-29', frequency: 'yearly' }),
  plan('suscripción dada de baja', { start_date: '2026-01-10', ends_on: '2026-08-10' }),
]

// Generador determinístico (mulberry32): mismo lote en cada corrida.
function rng(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = rng(20261116)
const pick = (list) => list[Math.floor(random() * list.length)]
const int = (min, max) => min + Math.floor(random() * (max - min + 1))

const RANDOM = Array.from({ length: 60 }, (_, i) => {
  const installments = random() < 0.6 ? int(1, 24) : null
  const start = addDays('2025-06-01', int(0, 700))
  return plan(`aleatorio ${i}`, {
    installments,
    first_installment: installments ? int(1, installments) : 1,
    start_date: start,
    frequency: pick(['monthly', 'monthly', 'weekly', 'quarterly', 'yearly']),
    amount: int(100, 500000) / 100,
    // La base solo admite una primera cuota distinta en compras en cuotas.
    first_amount: installments && random() < 0.3 ? int(100, 500000) / 100 : null,
    ends_on: random() < 0.2 ? addDays(start, int(0, 400)) : null,
    currency: pick(['ARS', 'ARS', 'USD']),
  })
})

const PLANS = [...EDGES, ...RANDOM]

// Cargos: se resuelven algunos vencimientos reales de cada plan (confirmado,
// descartado, o "vuelto a pendiente": fila con los dos campos en null), más
// huérfanos — cargos en una fecha que el plan no genera.
const CHARGES = []
const TRANSACTIONS = []
for (const p of PLANS) {
  const reference = planOccurrences({ plan: p, charges: [], today: TODAY, until: addMonths(TODAY, 30) })
  for (const o of reference) {
    const roll = random()
    if (roll > 0.35) continue
    const charge = { id: uuid('eeeeeeee'), commitment_id: p.id, due_date: o.dueDate, transaction_id: null, dismissed_at: null }
    if (roll < 0.2) {
      charge.transaction_id = uuid('ffffffff')
      TRANSACTIONS.push(charge.transaction_id)
    } else if (roll < 0.3) {
      charge.dismissed_at = '2026-11-01T12:00:00Z'
    }
    CHARGES.push(charge)
  }
  if (random() < 0.25) {
    const orphan = { id: uuid('eeeeeeee'), commitment_id: p.id, due_date: addDays(p.start_date, -3), transaction_id: null, dismissed_at: null }
    const roll = random()
    if (roll < 0.5) {
      orphan.transaction_id = uuid('ffffffff')
      TRANSACTIONS.push(orphan.transaction_id)
    } else if (roll < 0.8) {
      orphan.dismissed_at = '2026-11-01T12:00:00Z'
    } // si no: huérfano sin resolver, que no debe aparecer
    CHARGES.push(orphan)
  }
}

const q = (v) => (v == null ? 'null' : `'${v}'`)
const SEED = `
insert into transactions (id, user_id, date, kind, category_id, amount, account_id) values
${TRANSACTIONS.map((id) => `('${id}', '${USER}', '2026-01-01', 'expense', '${CATEGORY}', 1, '${ACCOUNT}')`).join(',\n')};
insert into commitments (id, user_id, kind, name, category_id, account_id, currency, amount, first_amount, installments, first_installment, frequency, start_date, ends_on) values
${PLANS.map((p) => `('${p.id}', '${USER}', '${p.kind}', ${q(p.name)}, '${CATEGORY}', '${ACCOUNT}', '${p.currency}', ${p.amount}, ${p.first_amount ?? 'null'}, ${p.installments ?? 'null'}, ${p.first_installment}, '${p.frequency}', '${p.start_date}', ${q(p.ends_on)})`).join(',\n')};
insert into commitment_charges (id, user_id, commitment_id, due_date, transaction_id, dismissed_at) values
${CHARGES.map((c) => `('${c.id}', '${USER}', '${c.commitment_id}', '${c.due_date}', ${q(c.transaction_id)}, ${q(c.dismissed_at)})`).join(',\n')};
-- Un plan de otro usuario: no puede aparecer nunca.
insert into commitments (id, user_id, kind, name, category_id, account_id, amount, installments, start_date)
values ('99999999-0000-4000-8000-000000000001', '${OTHER_USER}', 'installments', 'Ajeno', '${CATEGORY}', '${ACCOUNT}', 100, 3, '2026-11-01');
`

const asUser = (sql) => `set role authenticated; set app.current_user_id = '${USER}'; ${sql}`
const num = (v) => (v === '' ? null : Number(v))

function sqlOccurrences(today, until) {
  return rows(
    asUser(
      `select commitment_id, coalesce(idx::text,''), coalesce(number::text,''), coalesce("of"::text,''),
              due_date, amount, currency, status, coalesce(charge_id::text,''), days_late
       from get_commitment_occurrences('${today}', ${q(until)})`,
    ),
  ).map(([planId, idx, number, of, dueDate, amount, currency, status, chargeId, daysLate]) => ({
    planId, index: num(idx), number: num(number), of: num(of), dueDate, amount: Number(amount), currency, status,
    chargeId: chargeId || null, daysLate: Number(daysLate),
  }))
}

function jsOccurrences(today, until) {
  return PLANS.flatMap((p) =>
    planOccurrences({ plan: p, charges: CHARGES.filter((c) => c.commitment_id === p.id), today, until }),
  ).map((o) => ({
    planId: o.planId, index: o.index, number: o.number, of: o.of, dueDate: o.dueDate, amount: o.amount,
    currency: o.currency, status: o.status, chargeId: o.charge?.id ?? null,
  }))
}

const byKey = (a, b) => {
  const ka = `${a.planId}|${a.dueDate}|${a.index ?? 'z'}`
  const kb = `${b.planId}|${b.dueDate}|${b.index ?? 'z'}`
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

describe.skipIf(!available)('qué vence y cuándo (SQL, migración 0062)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0045_commitments.sql', 'utf8'))
    psql(readFileSync('supabase/migrations/0062_commitment_occurrences.sql', 'utf8'))
    // Lo que Supabase da por defecto: authenticated lee las tablas, y RLS filtra.
    psql('grant select on all tables in schema public to authenticated;')
    psql(SEED)
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  it('el dataset tiene los bordes que importan', () => {
    expect(CHARGES.some((c) => c.transaction_id)).toBe(true)
    expect(CHARGES.some((c) => c.dismissed_at)).toBe(true)
    expect(CHARGES.some((c) => !c.transaction_id && !c.dismissed_at)).toBe(true)
    expect(PLANS.some((p) => p.ends_on && p.installments == null)).toBe(true)
    expect(PLANS.some((p) => p.first_installment > 1 && p.first_amount != null)).toBe(true)
    const all = jsOccurrences(TODAY, undefined)
    expect(all.some((o) => o.index == null)).toBe(true) // huérfanos resueltos
    for (const status of ['pending', 'overdue', 'confirmed', 'dismissed']) {
      expect(all.some((o) => o.status === status)).toBe(true)
    }
  })

  // Tres "hoy" y cuatro horizontes: el default (12 meses), una semana (lo que
  // usa el recordatorio), fin de mes, y uno anterior al comienzo de casi todo.
  const cases = [
    [TODAY, undefined],
    [TODAY, addDays(TODAY, 7)],
    [TODAY, '2026-11-30'],
    [TODAY, '2025-01-01'],
    ['2026-02-28', undefined],
    ['2027-12-31', addMonths('2027-12-31', 24)],
  ]
  it.each(cases)('los vencimientos coinciden fila por fila (hoy %s, hasta %s)', (today, until) => {
    const fromSql = sqlOccurrences(today, until).sort(byKey)
    const fromJs = jsOccurrences(today, until).sort(byKey)
    expect(fromSql.length).toBe(fromJs.length)
    expect(fromSql.map(({ daysLate, ...o }) => o)).toEqual(fromJs)
  })

  it('el recordatorio (duePayments) sale de filtrar lo que devuelve la base', () => {
    const limit = addDays(TODAY, 7)
    const fromSql = sqlOccurrences(TODAY, limit)
      .filter((o) => (o.status === 'pending' || o.status === 'overdue') && o.dueDate <= limit)
      .map((o) => `${o.planId}|${o.dueDate}|${o.amount}|${o.daysLate}`)
      .sort()
    const chargesByPlan = new Map(PLANS.map((p) => [p.id, CHARGES.filter((c) => c.commitment_id === p.id)]))
    const fromJs = duePayments({ plans: PLANS, chargesByPlan, today: TODAY })
      .map((o) => `${o.planId}|${o.dueDate}|${o.amount}|${o.daysLate}`)
      .sort()
    expect(fromJs.length).toBeGreaterThan(0)
    expect(fromSql).toEqual(fromJs)
  })

  it.each([TODAY, '2026-02-28', '2028-06-01'])('lo que le queda a cada plan coincide (hoy %s)', (today) => {
    const fromSql = new Map(
      rows(
        asUser(
          `select commitment_id, coalesce(remaining_count::text,''), coalesce(remaining_amount::text,''),
                  coalesce(total::text,''), coalesce(last_due_date::text,''), is_finished
           from get_commitment_status('${today}')`,
        ),
      ).map(([id, count, amount, total, last, finished]) => [
        id,
        { count: num(count), amount: num(amount), total: num(total), lastDueDate: last || null, finished: finished === 't' },
      ]),
    )
    expect(fromSql.size).toBe(PLANS.length)
    for (const p of PLANS) {
      const charges = CHARGES.filter((c) => c.commitment_id === p.id)
      const remaining = planRemaining({ plan: p, charges, today })
      expect(fromSql.get(p.id), p.name).toEqual({
        count: remaining?.count ?? null,
        amount: remaining?.amount ?? null,
        total: remaining?.total ?? null,
        lastDueDate: remaining?.lastDueDate ?? null,
        finished: isFinished({ plan: p, charges, today }),
      })
    }
  })

  it('anon no puede ejecutar ninguna de las funciones', () => {
    for (const fn of ['get_commitment_occurrences(date, date)', 'get_commitment_status(date)', 'commitment_due_date(date, text, int)']) {
      expect(psql(`select has_function_privilege('anon', 'public.${fn}', 'execute')`).trim()).toBe('f')
    }
  })

  it('un plan de otro usuario no aparece (RLS)', () => {
    const ids = rows(asUser(`select distinct commitment_id from get_commitment_occurrences('${TODAY}', null)`)).flat()
    expect(ids).not.toContain('99999999-0000-4000-8000-000000000001')
    expect(ids.length).toBeGreaterThan(0)
  })
})
