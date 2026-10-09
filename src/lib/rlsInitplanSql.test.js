// La migración 0061: las policies pasan a `(select auth.uid())`, y el
// aislamiento entre usuarios queda EXACTAMENTE igual. Esquema mínimo con las
// mismas policies que la base real (las que listó pg_policies el 2026-10-09),
// la 0061 TAL CUAL, y dos usuarios. Incluye el caso provocado: B intenta leer,
// escribir y borrar lo de A.
//
// Además: los 6 índices, el search_path de las dos funciones de compromisos y
// que handle_new_user ya no la ejecuta `authenticated` pero el trigger sigue
// andando.
//
// Sin Postgres local el test se saltea; el CI corre uno.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DB = `app_finances_rls_initplan_${process.pid}`
const MIGRATION = '0061_security_performance_advisories.sql'

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

function rejection(sql) {
  try {
    psql(sql)
    return null
  } catch (e) {
    return String(e.stderr ?? e.message)
  }
}

const A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const B = 'bbbbbbbb-0000-4000-8000-00000000000b'

// Como un usuario de la API: rol authenticated + usuario en sesión.
const as = (user, sql) => psql(`set role authenticated; set app.current_user_id = '${user}'; ${sql}`)
const count = (user, table) => Number(as(user, `select count(*) from ${table};`).trim().split('\n').pop())

const ROOT = [
  'categories', 'transactions', 'assets', 'debts', 'settings', 'liquid_reconciliations',
  'asset_types', 'liquid_accounts', 'payment_cards', 'commitments', 'commitment_charges',
]
// hija → [tabla madre, columna que apunta]
const CHILD = {
  contributions: ['assets', 'asset_id'],
  asset_valuations: ['assets', 'asset_id'],
  debt_payments: ['debts', 'debt_id'],
}
const ALL = [...ROOT, ...Object.keys(CHILD), 'app_admins']

const own = (c) => `(${c} = auth.uid())`
const SCHEMA = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
exception when duplicate_object or unique_violation then null; -- carrera entre archivos en paralelo
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
exception when duplicate_object or unique_violation then null;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'gotrue_stub') then create role gotrue_stub; end if;
exception when duplicate_object or unique_violation then null;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

${ROOT.map((t) => `create table ${t} (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid());`).join('\n')}
alter table transactions add column category_id uuid;
alter table liquid_reconciliations add column adjustment_transaction_id uuid, add column redistribution_transaction_id uuid;
${Object.entries(CHILD).map(([t, [, col]]) => `create table ${t} (id uuid primary key default gen_random_uuid(), ${col} uuid not null);`).join('\n')}
create table app_admins (user_id uuid primary key);
create table invitations (id uuid primary key default gen_random_uuid(), created_by uuid, used_by uuid);

${ALL.map((t) => `alter table ${t} enable row level security;`).join('\n')}
alter table invitations enable row level security;

-- Las policies como están hoy en producción (sin envolver).
${ROOT.map((t) => `create policy "own rows" on ${t} for all to authenticated using ${own('user_id')} with check ${own('user_id')};`).join('\n')}
create policy "leer la propia marca" on app_admins for select to authenticated using ${own('user_id')};
${Object.entries(CHILD)
  .map(
    ([t, [parent, col]]) => `create policy "${parent === 'assets' ? 'own via asset' : 'own via debt'}" on ${t} for all to authenticated
  using (exists (select 1 from ${parent} p where p.id = ${t}.${col} and p.user_id = auth.uid()))
  with check (exists (select 1 from ${parent} p where p.id = ${t}.${col} and p.user_id = auth.uid()));`,
  )
  .join('\n')}

grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on ${ALL.join(', ')} to authenticated;

-- Funciones: las de compromisos sin search_path, handle_new_user con el
-- default de Supabase (EXECUTE para authenticated).
create function public.confirm_commitment_charge(p_commitment_id uuid, p_due_date date, p_date date, p_amount numeric, p_account_id uuid, p_description text)
  returns uuid language sql as $$ select p_commitment_id $$;
create function public.unconfirm_commitment_charge(p_commitment_id uuid, p_due_date date)
  returns void language sql as $$ select $$;
create table stub_users (id uuid primary key default gen_random_uuid());
create table stub_seeded (user_id uuid);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public
  as $$ begin insert into stub_seeded values (new.id); return new; end $$;
grant execute on function public.handle_new_user() to authenticated;
create trigger on_stub_user after insert on stub_users for each row execute function public.handle_new_user();
grant insert on stub_users to gotrue_stub;
`

// Una fila de A y una de B en cada tabla (se carga como dueño, sin RLS).
const SEED = `
${ROOT.map(
  (t) => `insert into ${t} (id, user_id) values
  ('${A.replace(/^aaaaaaaa/, 'a1a1a1a1')}', '${A}'), ('${B.replace(/^bbbbbbbb/, 'b1b1b1b1')}', '${B}');`,
).join('\n')}
${Object.entries(CHILD)
  .map(
    ([t, [, col]]) => `insert into ${t} (${col}) values ('${A.replace(/^aaaaaaaa/, 'a1a1a1a1')}'), ('${B.replace(/^bbbbbbbb/, 'b1b1b1b1')}');`,
  )
  .join('\n')}
insert into app_admins values ('${A}'), ('${B}');
`
const A_ID = A.replace(/^aaaaaaaa/, 'a1a1a1a1')

const unwrapped = () =>
  Number(
    psql(`select count(*) from pg_policies where schemaname = 'public'
      and (coalesce(qual,'') ~ 'auth\\.uid\\(\\)' and coalesce(qual,'') !~ 'SELECT auth\\.uid\\(\\)'
        or coalesce(with_check,'') ~ 'auth\\.uid\\(\\)' and coalesce(with_check,'') !~ 'SELECT auth\\.uid\\(\\)');`).trim(),
  )
const can = (role, fn) => psql(`select has_function_privilege('${role}', '${fn}', 'execute');`).trim() === 't'

describe.skipIf(!available)('0061: policies envueltas, índices y funciones (SQL)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(SEED)
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  it('antes: las 15 policies están sin envolver y cada usuario ya ve solo lo suyo', () => {
    expect(unwrapped()).toBe(15)
    for (const t of ALL) expect(count(A, t), t).toBe(1)
  })

  it('aplica la migración tal cual', () => {
    psql(readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8'))
    expect(unwrapped()).toBe(0)
  })

  it.each(ALL)('%s: cada usuario ve solo su fila, y un tercero ninguna', (t) => {
    expect(count(A, t)).toBe(1)
    expect(count(B, t)).toBe(1)
    expect(count('cccccccc-0000-4000-8000-00000000000c', t)).toBe(0)
  })

  it('anon no lee nada', () => {
    for (const t of ALL) expect(rejection(`set role anon; select * from ${t};`), t).toMatch(/permission denied/)
  })

  // El caso provocado: B apunta a lo de A.
  it.each(ROOT)('%s: B no puede leer, modificar ni borrar la fila de A', (t) => {
    expect(as(B, `select count(*) from ${t} where id = '${A_ID}';`).trim().split('\n').pop()).toBe('0')
    expect(as(B, `update ${t} set user_id = user_id where id = '${A_ID}' returning 1;`).trim().split('\n')[0]).toBe('')
    expect(as(B, `delete from ${t} where id = '${A_ID}' returning 1;`).trim().split('\n')[0]).toBe('')
    expect(psql(`select count(*) from ${t} where user_id = '${A}';`).trim()).toBe('1')
  })

  it.each(ROOT)('%s: B no puede insertar una fila a nombre de A, ni quedarse con una de A', (t) => {
    expect(rejection(`set role authenticated; set app.current_user_id = '${B}'; insert into ${t} (user_id) values ('${A}');`)).toMatch(/row-level security/)
    expect(rejection(`set role authenticated; set app.current_user_id = '${B}'; update ${t} set user_id = '${A}' where user_id = '${B}';`)).toMatch(/row-level security/)
  })

  it.each(Object.entries(CHILD))('%s: B no puede colgar filas del activo/deuda de A', (t, [, col]) => {
    expect(rejection(`set role authenticated; set app.current_user_id = '${B}'; insert into ${t} (${col}) values ('${A_ID}');`)).toMatch(/row-level security/)
    expect(as(B, `delete from ${t} where ${col} = '${A_ID}' returning 1;`).trim().split('\n')[0]).toBe('')
  })

  it('app_admins: B no puede marcarse admin ni ver la marca de A (no hay policy de escritura)', () => {
    expect(rejection(`set role authenticated; set app.current_user_id = '${B}'; insert into app_admins values ('${B}');`)).toMatch(/row-level security/)
    expect(as(B, `select count(*) from app_admins where user_id = '${A}';`).trim().split('\n').pop()).toBe('0')
  })

  it('el dueño sí escribe lo suyo (la policy no quedó más cerrada)', () => {
    for (const t of ROOT) {
      as(A, `insert into ${t} (user_id) values ('${A}');`)
      expect(count(A, t), t).toBe(2)
      as(A, `delete from ${t} where id <> '${A_ID}';`)
    }
  })

  it('crea los 6 índices de claves foráneas', () => {
    const names = psql(`select indexname from pg_indexes where schemaname = 'public' and indexname like any (array['idx_transactions_category','idx_commitment_charges_user','idx_liquid_recon_%_tx','idx_invitations_%by']) order by 1;`)
      .trim()
      .split('\n')
    expect(names).toHaveLength(6)
  })

  it('las dos funciones de compromisos fijan search_path', () => {
    const n = psql(`select count(*) from pg_proc where proname in ('confirm_commitment_charge','unconfirm_commitment_charge') and proconfig @> array['search_path=public'];`).trim()
    expect(n).toBe('2')
  })

  it('handle_new_user: authenticated y anon ya no la ejecutan, y el trigger sigue sembrando', () => {
    expect(can('authenticated', 'public.handle_new_user()')).toBe(false)
    expect(can('anon', 'public.handle_new_user()')).toBe(false)
    psql('set role gotrue_stub; insert into stub_users default values;')
    expect(psql('select count(*) from stub_seeded;').trim()).toBe('1')
  })
})
