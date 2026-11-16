-- 0063: borrar la propia cuenta, y la versión mínima de las apps.
--
-- ══ 1. delete_my_account() ══════════════════════════════════════════════════
--
-- Apple exige que una app que crea cuentas deje borrarlas desde adentro (guía
-- 5.1.1(v)), y es además lo que corresponde: los datos son de la persona.
--
-- Es una función SQL y no una Edge Function (lo que proponía
-- docs/pendientes-base.md): hace lo mismo sin sumar una pieza que desplegar ni
-- tocar la clave service_role. SECURITY DEFINER porque tiene que borrar la
-- fila de auth.users, pero solo puede borrar a QUIEN LA LLAMA: no recibe
-- ningún parámetro, y todo se filtra por auth.uid().
--
-- Todo en una transacción (la de la llamada): o se va la cuenta entera, o no
-- se va nada. El orden es el que piden las claves foráneas — ninguna tiene
-- `on delete cascade` desde auth.users, a propósito ("nada se borra si tiene
-- historia"); acá es justamente la historia lo que se pide borrar.
--
-- El administrador no puede borrarse desde la app: dejaría el sistema sin
-- nadie que pueda invitar. Se hace a mano, por SQL, como se lo nombró.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Hay que iniciar sesión para borrar la cuenta.';
  end if;
  if exists (select 1 from app_admins where user_id = v_user) then
    raise exception 'La cuenta de administración no se borra desde la app.';
  end if;

  -- La única regla que se salta: "la última cuenta del día a día no se borra"
  -- protege a alguien que SIGUE usando la app. Vale solo dentro de esta
  -- transacción (ver guard_liquid_account, más abajo).
  perform set_config('encuenta.deleting_account', 'on', true);

  -- Lo que apunta a movimientos y a planes.
  delete from commitment_charges where user_id = v_user;
  delete from liquid_reconciliations where user_id = v_user;
  delete from commitments where user_id = v_user;

  -- Lo que cuelga de deudas y de activos.
  delete from debt_payments where debt_id in (select id from debts where user_id = v_user);
  delete from contributions where asset_id in (select id from assets where user_id = v_user);
  delete from asset_valuations where asset_id in (select id from assets where user_id = v_user);

  delete from transactions where user_id = v_user;
  delete from debts where user_id = v_user;
  delete from assets where user_id = v_user;
  delete from asset_types where user_id = v_user;
  delete from payment_cards where user_id = v_user;
  delete from categories where user_id = v_user;
  delete from liquid_accounts where user_id = v_user;
  delete from settings where user_id = v_user;

  -- La invitación con la que entró queda como "usada", sin decir por quién.
  update invitations set used_by = null, used_by_email = null where used_by = v_user;

  -- Por último la persona. Sus sesiones e identidades se van con ella (esas
  -- claves, que son de Supabase, sí llevan cascade).
  delete from auth.users where id = v_user;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- La misma función de la 0054, con una sola línea nueva: mientras se está
-- borrando la cuenta entera, la regla de "la última cuenta" no aplica. La marca
-- solo la pone delete_my_account y dura lo que su transacción; un cliente no
-- puede ponerla (set_config no está expuesto por la API).
create or replace function public.guard_liquid_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if tg_op = 'DELETE' and coalesce(current_setting('encuenta.deleting_account', true), '') = 'on' then
    return old;
  end if;

  -- E: una cuenta con historia no cambia de moneda.
  if tg_op = 'UPDATE' and new.currency is distinct from old.currency and (
       exists (select 1 from transactions where account_id = old.id)
    or exists (select 1 from contributions where account_id = old.id)
    or exists (select 1 from debt_payments where account_id = old.id)
    or exists (select 1 from liquid_reconciliations where account_id = old.id)
  ) then
    raise exception 'Esta cuenta ya tiene movimientos: su moneda no se puede cambiar.';
  end if;

  -- La última cuenta del día a día no se borra, no se oculta ni pasa a ahorro.
  if not old.is_archived and not old.is_savings
     and (tg_op = 'DELETE' or new.is_archived or new.is_savings)
     and not exists (
       select 1 from liquid_accounts
       where user_id = old.user_id and id <> old.id and not is_archived and not is_savings
     ) then
    raise exception 'Es tu única cuenta para el día a día. Creá otra antes de eliminar esta o pasarla a ahorro.';
  end if;

  -- 0054: una cuenta con saldo no se oculta.
  if tg_op = 'UPDATE' and new.is_archived and not old.is_archived then
    select round(b.amount, 2) into v_balance
    from get_liquid_by_account() b
    where b.account_id = old.id;

    if abs(coalesce(v_balance, 0)) >= 0.01 then
      raise exception 'Esta cuenta todavía tiene plata. Vaciala con un ajuste de saldo o pasá la plata a otra cuenta antes de eliminarla.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.guard_liquid_account() from public, anon;

-- ══ 2. app_config: la versión mínima de cada app ═══════════════════════════
--
-- Una app de la tienda no se actualiza cuando uno quiere. Si algún día un
-- cambio de contrato es incompatible, la app lee esto al abrir y dice
-- "Actualizá EnCuenta" en vez de romperse. Una sola fila; se edita a mano.

create table if not exists public.app_config (
  id boolean primary key default true check (id),
  min_ios_version text not null default '0.1.0',
  min_android_version text not null default '0.1.0',
  updated_at timestamptz not null default now()
);

insert into public.app_config (id) values (true) on conflict do nothing;

alter table public.app_config enable row level security;
revoke all on public.app_config from public, anon, authenticated;
grant select on public.app_config to authenticated;

drop policy if exists "leer la configuración" on public.app_config;
create policy "leer la configuración" on public.app_config
  for select to authenticated using (true);

-- Verificación después de aplicar (solo lectura). Las tres tienen que dar true:
--
--   select
--     has_function_privilege('authenticated', 'public.delete_my_account()', 'execute') as authenticated_puede,
--     not has_function_privilege('anon', 'public.delete_my_account()', 'execute') as anon_no_puede,
--     (select count(*) = 1 from public.app_config) as una_fila_de_config;
--
-- Y esta tiene que dar CERO filas: una tabla de public con `user_id` que
-- delete_my_account no nombra es una tabla que dejaría datos de alguien que
-- pidió irse. Si aparece una (porque se creó después), hay que sumarla.
--
--   select c.table_name
--   from information_schema.columns c
--   join information_schema.tables t using (table_schema, table_name)
--   where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
--     and position(c.table_name in (select prosrc from pg_proc where proname = 'delete_my_account')) = 0;
