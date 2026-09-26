-- 0057: las categorías más usadas las calcula la base (regla #27 del informe).
--
-- POR QUÉ: la grilla de "las seis más usadas" vuelve en la app nativa, no en
-- la web. La versión que existió en la web (etiqueta archivo/ui-polish) traía
-- 90 días de movimientos al navegador para contarlos; acá es un conteo.
--
-- LA REGLA (la de topCategories, rescatada como definición en
-- lib/categories.js; topCategoriesSql.test.js corre esta función contra ella):
--   · Candidatas: las categorías del usuario de ese tipo, que no sean del
--     sistema ni estén ocultas.
--   · Cuáles ENTRAN lo decide el uso: cuántos movimientos de ese tipo las
--     usaron desde 90 días antes de `p_today`, inclusive (movimientos, no plata:
--     un gasto grande y mensual no le gana a uno chico y diario). Los
--     empates, incluido el 0 a 0 de las que no se usaron, los decide
--     `position` — así, con menos de `p_limit` usadas, se completa con las
--     primeras del orden de Ajustes sin un paso aparte.
--   · En qué ORDEN salen lo decide siempre `position`: cada pastilla queda
--     siempre en el mismo lugar, aunque esta semana se haya usado más otra.
-- `p_today` es parámetro para que los tests sean repetibles.
create or replace function public.get_top_categories(
  p_kind text,
  p_limit int default 6,
  p_today date default current_date
)
returns table (id uuid, name text, kind text, "position" int, uses bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with usage as (
    select t.category_id, count(*) as uses
    from transactions t
    where t.kind = p_kind
      and t.date >= p_today - 90
    group by t.category_id
  ),
  chosen as (
    select c.id, c.name, c.kind, c.position, coalesce(u.uses, 0) as uses
    from categories c
    left join usage u on u.category_id = c.id
    where c.kind = p_kind and not c.is_system and not c.is_archived
    order by coalesce(u.uses, 0) desc, c.position, c.name, c.id
    limit p_limit
  )
  select id, name, kind, position, uses
  from chosen
  order by position, name, id;
$$;

revoke all on function public.get_top_categories(text, int, date) from public, anon;
grant execute on function public.get_top_categories(text, int, date) to authenticated;
