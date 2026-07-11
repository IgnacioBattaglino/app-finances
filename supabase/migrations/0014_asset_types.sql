-- 0014: bolsas de activos personalizables (asset_types).
-- Generaliza los 5 tipos fijos de assets.type a bolsas por usuario: crear,
-- renombrar, archivar. El comportamiento pasa a decidirse por flags, nunca
-- por el nombre de la bolsa:
--   valuation_mode: 'contributed' (vale lo aportado, nunca pide valuación,
--     hoy "cash") | 'manual' (valuación periódica, hoy cedear/bond/fund) |
--     'live' (precio por API con identificador por activo, hoy crypto).
--   earns_yield: default sugerido al crear un activo en la bolsa (el flag
--     operativo real sigue siendo assets.yields, por activo, sin cambios).
--   include_in_total: si la bolsa suma al valor total del portafolio.
-- assets.type queda deprecada en esta migración (se relaja, no se borra);
-- la columna se elimina en una migración posterior.

-- 1. Tabla + RLS "own rows" (mismo patrón que categories) + índice por usuario.
create table asset_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  valuation_mode text not null check (valuation_mode in ('contributed', 'manual', 'live')),
  earns_yield boolean not null default true,
  include_in_total boolean not null default true,
  display_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table asset_types enable row level security;

create policy "own rows" on asset_types
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_asset_types_user on asset_types(user_id);

-- 2. handle_new_user(): además de categorías y settings, siembra las 5
--    bolsas default a cada usuario nuevo. user_id explícito (new.id), como
--    ya hace el resto de la función con categories — no se usa el default
--    de la columna en inserts hechos desde una función security definer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Categorías iniciales de gasto e ingreso
  insert into public.categories (name, kind, user_id) values
    ('Comida', 'expense', new.id),
    ('Salidas', 'expense', new.id),
    ('Auto', 'expense', new.id),
    ('Transporte', 'expense', new.id),
    ('Ropa', 'expense', new.id),
    ('Suscripciones', 'expense', new.id),
    ('Regalos', 'expense', new.id),
    ('Otros', 'expense', new.id),
    ('Sueldo', 'income', new.id),
    ('Otros ingresos', 'income', new.id);

  -- Categorías del sistema: las usa la reconciliación del líquido
  insert into public.categories (name, kind, user_id, is_system) values
    ('Ajuste de saldo', 'expense', new.id, true),
    ('Ajuste de saldo', 'income', new.id, true);

  -- Bolsas de activos default
  insert into public.asset_types (user_id, name, valuation_mode, earns_yield, include_in_total, display_order) values
    (new.id, 'Cripto', 'live', true, true, 1),
    (new.id, 'CEDEARs', 'manual', true, true, 2),
    (new.id, 'Renta fija', 'manual', true, true, 3),
    (new.id, 'Fondos', 'manual', true, true, 4),
    (new.id, 'Efectivo USD', 'contributed', false, true, 5);

  -- Fila de settings con valores por defecto
  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;

-- 3. Backfill para usuarios existentes. Idempotente (where not exists):
--    correr esta migración dos veces no duplica bolsas.
insert into public.asset_types (user_id, name, valuation_mode, earns_yield, include_in_total, display_order)
select u.id, v.name, v.valuation_mode, v.earns_yield, true, v.display_order
from auth.users u
cross join (
  values
    ('Cripto', 'live', true, 1),
    ('CEDEARs', 'manual', true, 2),
    ('Renta fija', 'manual', true, 3),
    ('Fondos', 'manual', true, 4),
    ('Efectivo USD', 'contributed', false, 5)
) as v(name, valuation_mode, earns_yield, display_order)
where not exists (
  select 1 from public.asset_types at
  where at.user_id = u.id and at.name = v.name
);

-- 4. assets.asset_type_id: nullable → backfill mapeando desde el type viejo
--    → chequeo de integridad → not null. Mismo patrón que user_id en 0004/0006.
alter table assets add column asset_type_id uuid references asset_types(id);

update assets a set asset_type_id = at.id
from asset_types at
where at.user_id = a.user_id
  and at.name = case a.type
    when 'crypto' then 'Cripto'
    when 'cedear' then 'CEDEARs'
    when 'bond' then 'Renta fija'
    when 'fund' then 'Fondos'
    when 'cash' then 'Efectivo USD'
  end;

do $$
declare
  missing_count int;
begin
  select count(*) into missing_count from assets where asset_type_id is null;
  if missing_count > 0 then
    raise exception 'Backfill incompleto: % activos sin asset_type_id', missing_count;
  end if;
end $$;

alter table assets alter column asset_type_id set not null;
create index idx_assets_asset_type on assets(asset_type_id);

-- 5. Relajar assets.type: deja de ser obligatoria y de estar acotada a los
--    5 valores fijos. La columna NO se borra en esta migración.
alter table assets alter column type drop not null;

do $$
declare
  check_name text;
begin
  select con.conname into check_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'assets'
    and con.contype = 'c'
    and att.attname = 'type';
  if check_name is not null then
    execute format('alter table assets drop constraint %I', check_name);
  end if;
end $$;
