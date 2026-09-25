-- 0048: los usuarios nuevos ya no arrancan con el grupo "Efectivo USD".
--
-- POR QUÉ: era el único grupo sembrado con `earns_yield = false`, un supuesto
-- ("efectivo en dólares no rinde") que es una regla de plata escondida en un
-- seed, y un usuario nuevo no tiene por qué heredarla. Los grupos son solo un
-- punto de partida: se crean desde el modal de activo ("+ Nuevo grupo").
--
-- ALCANCE: SOLO cambia el sembrado de usuarios que se registren de ahora en
-- más. NO toca ningún grupo, activo ni dato de un usuario existente: el
-- "Efectivo USD" que ya tengan (con o sin activos adentro) queda como está.
--
-- Es una redefinición de handle_new_user() idéntica a la de la 0043 (misma
-- exigencia y consumo de la invitación, mismas categorías, misma cuenta
-- "Efectivo", mismos settings) con una sola línea menos.

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

  -- El sembrado de la 0043, salvo el grupo "Efectivo USD" (ver el encabezado).
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
    (new.id, 'Fondos', true, true, 4);

  insert into public.liquid_accounts (user_id, name, position) values
    (new.id, 'Efectivo', 0);

  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;

-- Verificación (correr a mano después de aplicar):
--
--   -- la función ya no menciona el grupo:
--   select prosrc like '%Efectivo USD%' as todavia_lo_siembra
--     from pg_proc where proname = 'handle_new_user'; -- false
--
--   -- los usuarios existentes conservan el suyo (no debería cambiar):
--   select count(*) from asset_types where name = 'Efectivo USD';
