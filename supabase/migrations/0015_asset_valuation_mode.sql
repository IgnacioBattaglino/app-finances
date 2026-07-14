-- 0015: mover valuation_mode de la bolsa (asset_types) al activo (assets).
-- El modo de valuación describe cómo se calcula el valor de UN activo, no
-- una propiedad del grupo: con el diseño de la 0014, mover un activo entre
-- bolsas de distinto modo cambiaba su valuación (ej: un cripto movido a una
-- bolsa manual quedaba "sin valuación"), y una bolsa no podía mezclar modos.
-- Detectado en uso real. Ver ADR-005.
--
-- La bolsa (asset_types) queda como organización + agregación: nombre,
-- orden, rendimiento agrupado, include_in_total, y sigue sugiriendo un
-- default de valuación al crear un activo nuevo (resuelto en la app, no en
-- la base). asset_types.valuation_mode queda deprecada en esta migración
-- (se relaja, no se borra), mismo tratamiento que assets.type en la 0014;
-- se elimina en una migración futura.

-- 1. assets.valuation_mode: nullable primero → backfill desde la bolsa
--    actual de cada activo → chequeo de integridad → not null. Mismo
--    patrón que assets.asset_type_id en la 0014.
alter table assets
  add column valuation_mode text check (valuation_mode in ('contributed', 'manual', 'live'));

update assets a
set valuation_mode = at.valuation_mode
from asset_types at
where at.id = a.asset_type_id
  and a.valuation_mode is null;

do $$
declare
  missing_count int;
begin
  select count(*) into missing_count from assets where valuation_mode is null;
  if missing_count > 0 then
    raise exception 'Backfill incompleto: % activos sin valuation_mode', missing_count;
  end if;
end $$;

alter table assets alter column valuation_mode set not null;

-- 2. Relajar asset_types.valuation_mode: deja de ser obligatoria. La bolsa
--    ya no decide el modo; el check queda como documentación de los valores
--    válidos por si alguna fila vieja lo conserva. La columna NO se borra
--    en esta migración.
alter table asset_types alter column valuation_mode drop not null;

-- 3. handle_new_user(): las 5 bolsas seed dejan de sembrar valuation_mode
--    (columna nullable, sin default → queda null). Se copia la versión
--    vigente (0014) y se modifica solo el insert de asset_types.
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

  -- Bolsas de activos default. valuation_mode ya no se siembra acá: vive en
  -- assets, se elige por activo.
  insert into public.asset_types (user_id, name, earns_yield, include_in_total, display_order) values
    (new.id, 'Cripto', true, true, 1),
    (new.id, 'CEDEARs', true, true, 2),
    (new.id, 'Renta fija', true, true, 3),
    (new.id, 'Fondos', true, true, 4),
    (new.id, 'Efectivo USD', false, true, 5);

  -- Fila de settings con valores por defecto
  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;
