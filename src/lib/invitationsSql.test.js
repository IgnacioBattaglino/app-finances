// El registro por invitación (migración 0043), corrido contra un Postgres de
// verdad — mismo criterio que accountTransferSql.test.js: lo que garantiza la
// atomicidad acá es el trigger `on_auth_user_created` corriendo en la MISMA
// transacción que crea la fila en auth.users, y eso no se puede probar con un
// mock.
//
// auth.uid() se emula igual que en los otros *Sql.test.js: un GUC de sesión
// (app.current_user_id) fijado en el mismo -c que hace la llamada.
//
// Se aplica el archivo de migración TAL CUAL. Sin Postgres local el test se
// saltea: es una verificación de máquina de desarrollo, no un requisito para
// correr la suite.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DB = `app_finances_invitations_${process.pid}`

function hasPostgres() {
  try {
    execFileSync('pg_isready', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const psql = (sql) =>
  execFileSync('psql', ['-d', DB, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
  })

function psqlExpectingFailure(sql) {
  try {
    psql(sql)
    return null
  } catch (e) {
    return String(e.stderr ?? e.message)
  }
}

const rows = (sql) =>
  psql(sql)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))

const scalar = (sql) => psql(sql).trim()
const count = (table, where = '') => Number(psql(`select count(*) from ${table} ${where};`).trim())

const ADMIN = '10101010-1010-4010-8010-101010101010'
const ADMIN_EMAIL = 'battaglinoignacio@gmail.com'

// Esquema mínimo: solo las tablas y columnas que handle_new_user() toca, con
// los mismos tipos que la base real. auth.users necesita `email` (lo guarda
// used_by_email) y `raw_user_meta_data` (ahí viaja el invite_code, que es lo
// único que un signUp público puede escribir).
const SCHEMA = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb
);

-- El admin ya existe ANTES de que exista el trigger (igual que en la base
-- real: tu cuenta se creó mucho antes de esta migración), así que este insert
-- no pasa por handle_new_user y no necesita invitación.
insert into auth.users (id, email) values ('${ADMIN}', '${ADMIN_EMAIL}');

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  is_system boolean not null default false,
  system_key text,
  position int not null default 0
);
create table asset_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text,
  earns_yield boolean,
  include_in_total boolean,
  display_order int
);
create table liquid_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  position int not null default 0
);
create table settings (
  user_id uuid primary key
);
`

const asAdmin = (sql) => `set app.current_user_id = '${ADMIN}'; ${sql}`

function createInvite() {
  return psql(asAdmin(`insert into invitations default values returning id;`)).trim()
}

function signupSql(email, inviteCode) {
  const metadata = inviteCode === undefined ? 'null' : `jsonb_build_object('invite_code', '${inviteCode}')`
  return `insert into auth.users (email, raw_user_meta_data) values ('${email}', ${metadata}) returning id;`
}

const signup = (email, inviteCode) => psql(signupSql(email, inviteCode)).trim()
const signupExpectingFailure = (email, inviteCode) => psqlExpectingFailure(signupSql(email, inviteCode))

const available = hasPostgres()

describe.skipIf(!available)('registro por invitación (SQL, migración 0043)', () => {
  beforeAll(() => {
    execFileSync('createdb', [DB])
    psql(SCHEMA)
    psql(readFileSync('supabase/migrations/0043_signup_invitations.sql', 'utf8'))
    // La 0043 no crea el trigger (ya existe desde la 0007): se agrega acá,
    // después de sembrar el admin, para no exigirle invitación a ese insert.
    psql(`create trigger on_auth_user_created
            after insert on auth.users
            for each row execute function public.handle_new_user();`)
  })

  afterAll(() => {
    if (available) execFileSync('dropdb', ['--if-exists', DB])
  })

  beforeEach(() => {
    psql(`truncate invitations cascade;`)
    psql(`delete from auth.users where id != '${ADMIN}';`)
    psql(`truncate categories, asset_types, liquid_accounts, settings;`)
  })

  it('la migración te marca a vos como admin, buscándote por email', () => {
    expect(count('app_admins', `where user_id = '${ADMIN}'`)).toBe(1)
  })

  it('is_admin() es true para el admin y false para cualquier otro', () => {
    expect(scalar(asAdmin(`select is_admin();`))).toBe('t')
    expect(
      scalar(`set app.current_user_id = '20202020-2020-4020-8020-202020202020'; select is_admin();`),
    ).toBe('f')
  })

  it('validate_invite: not_found para un id que no existe', () => {
    expect(scalar(`select validate_invite(gen_random_uuid());`)).toBe('not_found')
  })

  it('validate_invite: valid para una invitación recién creada', () => {
    const id = createInvite()
    expect(scalar(`select validate_invite('${id}');`)).toBe('valid')
  })

  it('crear una invitación completa created_by y expires_at solos, sin que el cliente los mande', () => {
    const id = createInvite()
    const [createdBy, expiresInDays] = rows(
      `select created_by, (expires_at - created_at) from invitations where id = '${id}';`,
    )[0]
    expect(createdBy).toBe(ADMIN)
    expect(expiresInDays).toMatch(/^7 day/)
  })

  it('registrarse con una invitación válida crea la cuenta y consume la invitación', () => {
    const id = createInvite()
    const userId = signup('amigo@example.com', id)

    expect(count('auth.users', `where id = '${userId}'`)).toBe(1)

    const [usedAt, usedBy, usedByEmail] = rows(
      `select (used_at is not null)::text, used_by, used_by_email from invitations where id = '${id}';`,
    )[0]
    expect(usedAt).toBe('true')
    expect(usedBy).toBe(userId)
    expect(usedByEmail).toBe('amigo@example.com')

    expect(scalar(`select validate_invite('${id}');`)).toBe('used')
  })

  it('un usuario nuevo arranca sembrado y sin ningún dato ajeno', () => {
    const id = createInvite()
    const userId = signup('amigo@example.com', id)

    expect(count('categories', `where user_id = '${userId}'`)).toBe(16) // 10 genéricas + 6 del sistema
    expect(count('asset_types', `where user_id = '${userId}'`)).toBe(5)
    expect(count('liquid_accounts', `where user_id = '${userId}'`)).toBe(1)
    expect(count('settings', `where user_id = '${userId}'`)).toBe(1)
  })

  it('la misma invitación no sirve una segunda vez, y no queda ningún rastro parcial', () => {
    const id = createInvite()
    signup('primero@example.com', id)

    const err = signupExpectingFailure('segundo@example.com', id)
    expect(err).toMatch(/ya fue usada/)
    expect(count('auth.users', `where email = 'segundo@example.com'`)).toBe(0)
    expect(count('categories', `where user_id in (select id from auth.users where email = 'segundo@example.com')`)).toBe(0)

    // La invitación sigue apuntando al primero, no al segundo intento.
    expect(scalar(`select used_by_email from invitations where id = '${id}';`)).toBe('primero@example.com')
  })

  it('rechaza una invitación vencida', () => {
    const id = createInvite()
    psql(`update invitations set expires_at = now() - interval '1 minute' where id = '${id}';`)
    const err = signupExpectingFailure('tarde@example.com', id)
    expect(err).toMatch(/venció/)
    expect(count('auth.users', `where email = 'tarde@example.com'`)).toBe(0)
  })

  it('rechaza una invitación anulada', () => {
    const id = createInvite()
    psql(asAdmin(`update invitations set revoked_at = now() where id = '${id}';`))
    const err = signupExpectingFailure('anulada@example.com', id)
    expect(err).toMatch(/anulada/)
    expect(count('auth.users', `where email = 'anulada@example.com'`)).toBe(0)
  })

  it('la base rechaza marcar como anulada una invitación ya usada', () => {
    const id = createInvite()
    signup('ya-registrado@example.com', id)
    const err = psqlExpectingFailure(asAdmin(`update invitations set revoked_at = now() where id = '${id}';`))
    expect(err).toMatch(/invitations_not_used_and_revoked/)
  })

  it('rechaza un registro sin ningún código de invitación', () => {
    const err = signupExpectingFailure('sin-invitacion@example.com', undefined)
    expect(err).toMatch(/necesita una invitación/)
    expect(count('auth.users', `where email = 'sin-invitacion@example.com'`)).toBe(0)
  })

  it('rechaza un código inventado (uuid con buen formato, pero que no existe)', () => {
    const err = signupExpectingFailure('inventado@example.com', '99999999-9999-4999-8999-999999999999')
    expect(err).toMatch(/no es válida/)
    expect(count('auth.users', `where email = 'inventado@example.com'`)).toBe(0)
  })

  it('rechaza un código con formato inválido, sin romper con un error crudo de Postgres', () => {
    const err = psqlExpectingFailure(
      `insert into auth.users (email, raw_user_meta_data)
       values ('roto@example.com', jsonb_build_object('invite_code', 'no-es-un-uuid'));`,
    )
    expect(err).toMatch(/no es válida/)
    expect(count('auth.users', `where email = 'roto@example.com'`)).toBe(0)
  })
})
