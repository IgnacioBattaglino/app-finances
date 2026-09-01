-- 0028: orden manual de categorías, y baja real (con oculta como respaldo).
--
-- Dos cambios, uno de esquema y uno de semántica:
--
--   1. `position`: las categorías se ordenaban por nombre (getCategories hacía
--      .order('name')). Ahora el usuario las arrastra para ordenarlas y ese
--      orden manda en los dos lugares donde se listan: Ajustes y el selector
--      de categoría al cargar un gasto/ingreso.
--
--   2. `is_archived` pasa a significar OCULTA, y deja de tener UI propia. El
--      concepto de "archivar/restaurar" desaparece de la pantalla: el usuario
--      elimina una categoría y la app decide sola qué puede hacer -- si no la
--      usa ningún movimiento se borra de verdad (delete), y si la usa alguno
--      la marca oculta, porque borrarla dejaría movimientos sin nombre de
--      categoría. La FK transactions.category_id -> categories(id) (0001) no
--      lleva on delete cascade a propósito, así que la base rechaza el delete
--      con 23503 y el cliente cae a ocultar (ver deleteCategory en
--      lib/categories.js). Nunca quedan movimientos huérfanos.
--      La columna NO se renombra: lo que cambia es qué significa y quién la
--      escribe, no su forma. Renombrarla obligaría a tocar el trigger, las
--      policies y todas las consultas para no ganar nada.
--
-- Una categoría oculta sale del selector y de Ajustes, pero sus movimientos
-- siguen mostrando su nombre: las consultas de gastos parten de transactions y
-- traen el nombre por join, sin filtrar por is_archived.
--
-- Crear una categoría con el nombre+tipo de una oculta la revive en vez de
-- duplicarla (createCategory ya lo hacía contra las archivadas; el mismo
-- código ahora aplica a las ocultas -- es la misma columna).
--
-- RLS: NO hace falta una policy nueva de DELETE. La policy "own rows" de la
-- 0005 es `for all to authenticated using (user_id = auth.uid())`, y `for all`
-- ya cubre delete además de select/insert/update. Verificado: es la única
-- policy sobre categories.

-- ── 1. Columna de orden ─────────────────────────────────────────────────────
-- 0-based, como la renumeración de moveAssetType (lib/assetTypes.js). Sin
-- unique: dos categorías con la misma position son un empate que el orden
-- desempata por nombre, no una inconsistencia que valga bloquear una escritura.
alter table categories add column position int not null default 0;

-- Backfill con el orden que se venía mostrando (alfabético), por usuario y
-- tipo, que es el grupo dentro del cual se arrastra. Las del sistema van al
-- final de su grupo (is_system false ordena antes que true): no se reordenan
-- ni se listan junto a las demás, y así no compiten por las posiciones bajas
-- que la renumeración del cliente reasigna.
update categories c
set position = sub.pos
from (
  select
    id,
    (row_number() over (partition by user_id, kind order by is_system, name) - 1) as pos
  from categories
) sub
where c.id = sub.id;

-- ── 2. handle_new_user: position a las genéricas ────────────────────────────
-- Se copia la versión vigente (0015) y se le agrega position a los dos inserts
-- de categories. El orden es el mismo en el que están listadas -- que es el
-- criterio del diseño, no el alfabético. Las del sistema arrancan en 100 para
-- quedar al final de su grupo sin chocar con la renumeración del cliente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Categorías iniciales de gasto e ingreso, en el orden en que se muestran
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

  -- Categorías del sistema: las usa la reconciliación del líquido
  insert into public.categories (name, kind, user_id, is_system, position) values
    ('Ajuste de saldo', 'expense', new.id, true, 100),
    ('Ajuste de saldo', 'income', new.id, true, 100);

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
