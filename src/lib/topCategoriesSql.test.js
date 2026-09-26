// Paridad de la migración 0057: get_top_categories contra su definición en JS
// (categoryUsage + topCategories, rescatadas de la etiqueta archivo/ui-polish).
//
// Base scratch, la migración TAL CUAL, el mismo dataset a las dos. RLS
// encendido y otro usuario cuyas categorías y movimientos no pueden contar.
// Sin Postgres local el test se saltea; el CI corre uno.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { categoryUsage, topCategories } from './categories.js'

const DB = `app_finances_top_categories_${process.pid}`

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
const asUser = (user, sql) => psql(`set app.current_user_id = '${user}'; set role authenticated; ${sql}`)

const USER = '10101010-1010-4010-8010-101010101010'
const OTHER = '20202020-2020-4020-8020-202020202020'
const uid = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const TODAY = '2026-09-26'
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Categorías: nueve de gasto (dos con la misma posición, para el desempate
// por nombre), una del sistema, una oculta, cuatro de ingreso, y una del otro
// usuario que se usa muchísimo.
const CATEGORIES = []
{
  let n = 0
  const add = (user_id, name, kind, position, extra = {}) =>
    CATEGORIES.push({ id: uid('c', ++n), user_id, name, kind, position, is_system: false, is_archived: false, ...extra })
  ;['Comida', 'Alquiler', 'Transporte', 'Salidas', 'Cafetería', 'Farmacia', 'Regalos', 'Ropa'].forEach((name, i) =>
    add(USER, name, 'expense', i),
  )
  add(USER, 'Kiosco', 'expense', 3) // empata con Salidas en posición
  add(USER, 'Ajuste de saldo', 'expense', 0, { is_system: true })
  add(USER, 'Vieja', 'expense', 1, { is_archived: true })
  ;['Sueldo', 'Freelance', 'Venta', 'Intereses'].forEach((name, i) => add(USER, name, 'income', i))
  add(OTHER, 'Ajena', 'expense', 0)
}

function makeRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function buildTransactions() {
  const rnd = makeRandom(20260926)
  const rows = []
  let n = 0
  const tx = (category, date) =>
    rows.push({ id: uid('d', ++n), user_id: category.user_id, category_id: category.id, kind: category.kind, date })
  const own = CATEGORIES.filter((c) => c.user_id === USER)
  for (let i = 0; i < 300; i++) {
    // Pesos desparejos: algunas categorías se usan mucho más que otras.
    const category = own[Math.floor(Math.pow(rnd(), 1.8) * own.length)]
    tx(category, addDays(TODAY, -Math.floor(rnd() * 130) + 3)) // de 127 días atrás a 3 adelante
  }
  // Los bordes de la ventana: 90 días atrás cuenta, 91 no.
  const regalos = own.find((c) => c.name === 'Regalos')
  for (let i = 0; i < 40; i++) tx(regalos, addDays(TODAY, -91))
  tx(own.find((c) => c.name === 'Ropa'), addDays(TODAY, -90))
  // Uso del sistema y de la oculta: cuentan en el conteo, pero no son candidatas.
  for (let i = 0; i < 50; i++) tx(own.find((c) => c.is_system), TODAY)
  for (let i = 0; i < 50; i++) tx(own.find((c) => c.is_archived), TODAY)
  const ajena = CATEGORIES.find((c) => c.user_id === OTHER)
  for (let i = 0; i < 80; i++) tx(ajena, TODAY)
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
create table categories (id uuid primary key, user_id uuid not null, name text not null, kind text not null,
  position int not null default 0, is_system boolean not null default false, is_archived boolean not null default false);
create table transactions (id uuid primary key, user_id uuid not null, category_id uuid not null references categories(id),
  kind text not null, date date not null);
alter table categories enable row level security;
alter table transactions enable row level security;
create policy "own rows" on categories for all to authenticated using (user_id = auth.uid());
create policy "own rows" on transactions for all to authenticated using (user_id = auth.uid());
grant select on all tables in schema public to authenticated;
`

function seedSql() {
  const values = (rows, f) => rows.map(f).join(',\n')
  return `
insert into categories values ${values(CATEGORIES, (c) =>
    `('${c.id}', '${c.user_id}', '${c.name}', '${c.kind}', ${c.position}, ${c.is_system}, ${c.is_archived})`)};
insert into transactions values ${values(TRANSACTIONS, (t) => `('${t.id}', '${t.user_id}', '${t.category_id}', '${t.kind}', '${t.date}')`)};`
}

// La definición, con los datos que ve el usuario: sus categorías en el orden
// de getCategories (position, después nombre) y sus movimientos.
function fromJs(user, kind, n) {
  const categories = CATEGORIES.filter((c) => c.user_id === user).sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  )
  const usage = categoryUsage(TRANSACTIONS.filter((t) => t.user_id === user), TODAY)
  return topCategories(categories, usage, kind, n).map((c) => c.name)
}

const fromSql = (user, kind, n) =>
  asUser(user, `select name from get_top_categories('${kind}', ${n}, '${TODAY}');`).split('\n').filter(Boolean)

describe.skipIf(!available)('0057: las categorías más usadas (SQL) vs topCategories (JS)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0057_top_categories.sql', 'utf8'))
    psql(seedSql())
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  for (const kind of ['expense', 'income']) {
    for (const n of [3, 6, 20]) {
      it(`${kind}, las ${n} más usadas: mismas categorías y en el mismo orden`, () => {
        expect(fromSql(USER, kind, n)).toEqual(fromJs(USER, kind, n))
      })
    }
  }

  it('nunca aparecen una del sistema, una oculta ni una ajena', () => {
    const names = fromSql(USER, 'expense', 20)
    for (const name of ['Ajuste de saldo', 'Vieja', 'Ajena']) expect(names).not.toContain(name)
  })

  it('el borde de la ventana: 90 días atrás cuenta, 91 no', () => {
    const uses = asUser(USER, `select name, uses from get_top_categories('expense', 20, '${TODAY}');`)
      .split('\n').filter(Boolean).map((l) => l.split('\t'))
    const usesOf = (name) => Number(uses.find(([n]) => n === name)[1])
    const count = (name, from) =>
      TRANSACTIONS.filter((t) => t.category_id === CATEGORIES.find((c) => c.name === name).id && t.date >= from).length
    expect(usesOf('Regalos')).toBe(count('Regalos', addDays(TODAY, -90))) // las 40 de 91 días atrás no suman
    expect(usesOf('Ropa')).toBe(count('Ropa', addDays(TODAY, -90)))
  })

  it('sin movimientos en la ventana, salen las primeras por posición (el relleno)', () => {
    // La ventana es "desde 90 días antes, sin tope", igual que la definición:
    // con `p_today` en el futuro queda vacía.
    expect(asUser(USER, `select name from get_top_categories('income', 2, '2030-01-01');`).split('\n').filter(Boolean)).toEqual([
      'Sueldo',
      'Freelance',
    ])
  })

  it('sin sesión (anon) no se puede ejecutar', () => {
    expect(() => psql(`set role anon; select * from get_top_categories('expense');`)).toThrow(/permission denied/)
  })
})
