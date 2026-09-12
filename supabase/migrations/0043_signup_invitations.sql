-- 0043: registro por invitación.
--
-- Hasta acá "registro semi-cerrado" quería decir "yo doy de alta la cuenta a
-- mano en el dashboard de Supabase". Esta migración reemplaza esa disciplina
-- manual por una regla que hace cumplir la BASE: de acá en más, la única
-- forma de que exista una fila nueva en auth.users es que la acompañe una
-- invitación válida — una sola vez, vencida a los 7 días si no se usa. Ver
-- ADR-017.
--
-- Tres piezas:
--   1. app_admins: la marca de administrador, sin mail hardcodeado en ningún
--      lugar que corra en runtime.
--   2. invitations: el link de un solo uso.
--   3. handle_new_user() aprende a exigir y consumir la invitación, en la
--      MISMA transacción que crea el usuario — no hay forma de que quede una
--      invitación quemada sin cuenta, ni una cuenta sin invitación.

-- ══ 1. app_admins: quién es administrador ═══════════════════════════════════
-- Por qué una tabla y no una columna en `settings` (que ya tiene una fila por
-- usuario): `settings` tiene RLS "own rows" `for all`, que incluye UPDATE — si
-- `is_admin` viviera ahí, cualquier usuario podría hacerse admin a sí mismo
-- con un `update settings set is_admin = true`. Esta tabla en cambio NO TIENE
-- NINGUNA POLICY DE ESCRITURA: ni siquiera el propio admin puede insertarse
-- vía la API. La única puerta es SQL corrido a mano (esta migración, o vos
-- desde el SQL Editor) — exactamente la misma disciplina que ya usás para dar
-- de alta una cuenta hoy, aplicada a un solo campo en vez de a un usuario
-- entero.
create table app_admins (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);

alter table app_admins enable row level security;

-- Un usuario puede leer SI ES admin (para que el frontend decida si muestra
-- el link a la pantalla de invitaciones — comodidad, no protección). No puede
-- leer la lista de administradores ajena: el `using` ya lo impide, aunque acá
-- solo importaría si hubiera más de un admin.
create policy "leer la propia marca" on app_admins
  for select to authenticated
  using (user_id = auth.uid());

-- Te marca a vos por email, buscándolo en auth.users — no se hardcodea tu
-- user_id (que no conozco de antemano) ni se deja el email suelto en ninguna
-- función que corra en producción. Si por lo que sea no encuentra el usuario
-- (proyecto nuevo, email distinto), avisa y sigue: la migración no depende de
-- que esto encuentre a alguien para terminar de aplicarse.
do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id from auth.users where email = 'battaglinoignacio@gmail.com';
  if v_admin_id is null then
    raise notice 'No se encontró ningún usuario con ese email. Insertá tu fila en app_admins a mano después de correr esta migración.';
  else
    insert into app_admins (user_id) values (v_admin_id) on conflict do nothing;
  end if;
end $$;

-- STABLE + SECURITY INVOKER: corre con los permisos de quien llama, y lee a
-- través de la policy de arriba — así que un usuario que consulta is_admin()
-- solo puede ver SU PROPIA fila, nunca la de otro (no que importe hoy con un
-- admin, pero es la misma disciplina que el resto de la base).
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists(select 1 from app_admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ══ 2. invitations: el link de un solo uso ══════════════════════════════════
-- `id` ES el código de la invitación (no hace falta una columna aparte): 122
-- bits de azar, viaja entero en la URL (?invite=<uuid>), nadie lo tipea a
-- mano. `used_by_email` guarda una copia del email de quien la usó para poder
-- mostrar "usada por fulano@mail.com" en la pantalla de admin sin tener que
-- leer auth.users (que PostgREST no expone).
create table invitations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id),
  used_by_email text,
  revoked_at timestamptz,
  -- Un estado no puede ser las dos cosas a la vez: anular es una acción sobre
  -- una invitación TODAVÍA VIVA (la pantalla de admin ni siquiera ofrece el
  -- botón sobre una ya usada), y si algo raro lo intentara igual, la base lo
  -- rechaza en vez de dejar una fila que diga usada Y anulada.
  constraint invitations_not_used_and_revoked check (used_at is null or revoked_at is null)
);

alter table invitations enable row level security;

-- Una sola policy, para todo (select/insert/update): esta tabla es
-- exclusivamente una herramienta de administración, así que "sos admin" es
-- toda la regla que hace falta — igual que "own rows" es toda la regla en las
-- tablas de datos del usuario. Un usuario que no es admin no tiene NINGÚN
-- acceso: ni para verlas, ni para crear una, ni para anular la de otro.
create policy "solo admin" on invitations
  for all to authenticated
  using (is_admin())
  with check (is_admin());

create index idx_invitations_created_at on invitations(created_at desc);

-- Consultar si un código es válido tiene que funcionar SIN sesión (la
-- pantalla de registro se abre sin login, es la que da el primer login) — por
-- eso es SECURITY DEFINER: bypassa la policy de arriba, pero solo devuelve un
-- estado ('valid'/'used'/'expired'/'revoked'/'not_found'), nunca la fila
-- entera. Quien la llama no puede enterarse de quién la creó, ni de qué otras
-- invitaciones existen.
create or replace function public.validate_invite(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row invitations;
begin
  select * into v_row from invitations where id = p_id;
  if not found then return 'not_found'; end if;
  if v_row.revoked_at is not null then return 'revoked'; end if;
  if v_row.used_at is not null then return 'used'; end if;
  if v_row.expires_at < now() then return 'expired'; end if;
  return 'valid';
end;
$$;

revoke all on function public.validate_invite(uuid) from public;
grant execute on function public.validate_invite(uuid) to anon, authenticated;

-- ══ 3. handle_new_user(): exige y consume la invitación ═════════════════════
-- El código viaja en `raw_user_meta_data` porque es el único metadato que el
-- cliente público puede escribir al llamar `signUp` (vía `options.data`):
-- `raw_app_meta_data` solo lo puede tocar un llamador con la service_role
-- key, así que no serviría para algo que manda el navegador del invitado.
--
-- POR QUÉ ACÁ Y NO EN OTRO LADO: este trigger corre AFTER INSERT en
-- auth.users, en la MISMA transacción con la que Supabase Auth crea la
-- cuenta. Un `raise exception` acá aborta esa transacción entera — la cuenta
-- nunca llega a existir. Es la única forma de que "consumir la invitación" y
-- "crear el usuario" sean atómicos sin poder envolver las dos cosas nosotros
-- mismos (la creación del usuario la hace GoTrue, no una función nuestra).
--
-- `select ... for update` bloquea la fila de la invitación hasta el commit:
-- si dos pestañas mandan el mismo link al mismo tiempo, la segunda espera a
-- que la primera termine y la encuentra ya usada — no hay ventana para que
-- las dos pasen la validación y se creen dos cuentas con un solo link.
--
-- SIN EXCEPCIONES: no hay ningún camino que salte este chequeo, ni siquiera
-- para vos. Si alguna vez querés darte de alta a otra persona a mano, te
-- generás una invitación y la usás — es más simple y más seguro que mantener
-- una puerta trasera "si sos admin, no hace falta invitación", que sería
-- otro hardcodeo disfrazado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite_code uuid;
  v_invite invitations;
begin
  begin
    v_invite_code := nullif(new.raw_user_meta_data ->> 'invite_code', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Esta invitación no es válida.';
  end;

  if v_invite_code is null then
    raise exception 'Esta cuenta necesita una invitación válida.';
  end if;

  select * into v_invite from invitations where id = v_invite_code for update;

  if not found then
    raise exception 'Esta invitación no es válida.';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'Esta invitación fue anulada.';
  end if;
  if v_invite.used_at is not null then
    raise exception 'Esta invitación ya fue usada.';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Esta invitación venció.';
  end if;

  update invitations
     set used_at = now(), used_by = new.id, used_by_email = new.email
   where id = v_invite_code;

  -- El sembrado de siempre (idéntico a la 0041): categorías, bolsas de
  -- activos, cuenta "Efectivo" y settings. Un usuario nuevo arranca usable y
  -- sin ningún dato ajeno.
  insert into public.categories (name, kind, user_id, position) values
    ('Comida', 'expense', new.id, 0),
    ('Salidas', 'expense', new.id, 1),
    ('Auto', 'expense', new.id, 2),
    ('Transporte', 'expense', new.id, 3),
    ('Ropa', 'expense', new.id, 4),
    ('Suscripciones', 'expense', new.id, 5),
    ('Regalos', 'expense', new.id, 6),
    ('Otros', 'expense', new.id, 7),
    ('Sueldo', 'income', new.id, 0),
    ('Otros ingresos', 'income', new.id, 1);

  insert into public.categories (name, kind, user_id, is_system, system_key, position) values
    ('Ajuste de saldo',         'expense', new.id, true, 'balance_adjustment', 100),
    ('Ajuste de saldo',         'income',  new.id, true, 'balance_adjustment', 100),
    ('Movimiento de ahorro',    'expense', new.id, true, 'savings_movement',   101),
    ('Movimiento de ahorro',    'income',  new.id, true, 'savings_movement',   101),
    ('Transferencia de cuenta', 'expense', new.id, true, 'account_transfer',   102),
    ('Transferencia de cuenta', 'income',  new.id, true, 'account_transfer',   102);

  insert into public.asset_types (user_id, name, earns_yield, include_in_total, display_order) values
    (new.id, 'Cripto', true, true, 1),
    (new.id, 'CEDEARs', true, true, 2),
    (new.id, 'Renta fija', true, true, 3),
    (new.id, 'Fondos', true, true, 4),
    (new.id, 'Efectivo USD', false, true, 5);

  insert into public.liquid_accounts (user_id, name, position) values
    (new.id, 'Efectivo', 0);

  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;

-- Verificación (correr a mano después de aplicar):
--
--   select is_admin(); -- true, logueado como vos
--   select validate_invite(gen_random_uuid()); -- 'not_found'
--   insert into invitations default values returning id; -- guardá el id
--   select validate_invite('<ese id>'); -- 'valid'
