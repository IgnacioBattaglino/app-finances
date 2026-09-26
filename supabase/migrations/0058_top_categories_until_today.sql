-- 0058: las categorías más usadas cuentan los últimos 90 días HASTA HOY.
--
-- La 0057 contaba desde 90 días antes de `p_today` sin tope, igual que la
-- versión JS que se rescató: un movimiento cargado con fecha futura (una cuota
-- anotada por adelantado) sumaba uso sin haber pasado todavía. Se corta en
-- `p_today`, inclusive. La definición JS (categoryUsage) cambió igual, y
-- topCategoriesSql.test.js corre las dos.
--
-- Es la misma función de la 0057 con una condición más en el conteo.

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
      and t.date <= p_today
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

-- `create or replace` conserva los permisos de la 0057; se dicen igual.
revoke all on function public.get_top_categories(text, int, date) from public, anon;
grant execute on function public.get_top_categories(text, int, date) to authenticated;

-- ── Verificación (solo lectura, correr después de aplicar) ─────────────────
-- Tiene que devolver true: la función corta en p_today.
--
--   select position('t.date <= p_today' in prosrc) > 0
--   from pg_proc where oid = 'public.get_top_categories(text, int, date)'::regprocedure;
