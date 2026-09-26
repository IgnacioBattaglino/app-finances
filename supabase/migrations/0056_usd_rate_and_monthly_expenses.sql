-- 0056: la cotización del dólar de un día y la serie mensual de gastos en
-- dólares las calcula la base. Paso del bloque 2 de la mudanza (regla #12 del
-- informe; arregla D5).
--
-- POR QUÉ (D5): "la cotización vigente ese día" estaba escrita en JS
-- (lib/localCurrency.js), que además cacheaba la ventana de fechas de la
-- PRIMERA llamada e ignoraba el `from` de las siguientes: quien pidiera fechas
-- anteriores recibía en silencio la cotización más vieja que tuviera. La serie
-- de 12 meses traía los gastos al navegador para convertirlos uno por uno.
--
-- LA DEFINICIÓN EJECUTABLE sigue en JS: rateOn (lib/localCurrency.js) y
-- monthlyUsdTotals (lib/expensesSummary.js). monthlyUsdSql.test.js corre estas
-- funciones contra ellas.

-- ── La cotización de un día ────────────────────────────────────────────────
-- Pesos por dólar (el MEP del catálogo, source='mep'), vigente en `p_date`: la
-- última conocida ese día o antes (carry-forward), la misma búsqueda que la
-- vista instrument_prices_usd (0026). A diferencia de la vista, si `p_date` es
-- anterior a toda la serie devuelve la cotización más vieja en vez de null —
-- es lo que hacía el JS, y lo que necesita quien convierte un monto que sí
-- existe. Null solo si no hay ninguna cotización cargada.
create or replace function public.get_usd_rate(p_date date default current_date)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  with mep as (
    select ip.date, ip.price
    from instrument_prices ip
    join instruments i on i.id = ip.instrument_id
    where i.source = 'mep' and i.symbol = 'mep'
  )
  select coalesce(
    (select price from mep where date <= p_date order by date desc limit 1),
    (select price from mep order by date asc limit 1)
  );
$$;

-- ── Gastos por mes, en dólares ─────────────────────────────────────────────
-- Una fila por cada mes entre `p_from` y `p_to` (incluidos los que no tuvieron
-- gastos, con 0). Cada gasto real (los mismos de get_expenses_by_category,
-- 0055) se convierte con la cotización de SU día; uno en dólares va tal cual.
-- `expense_count` dice cuántos gastos tuvo el mes: Inicio solo muestra el
-- gráfico con al menos dos meses con datos.
create or replace function public.get_monthly_expenses_usd(p_from date, p_to date)
returns table (month date, total_usd numeric, expense_count bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from transaction_movement_types m
    where m.kind = 'expense' and m.movement_type in ('expense', 'balance_adjustment')
      and m.date between p_from and p_to and m.currency <> 'USD'
  ) and get_usd_rate(p_to) is null then
    raise exception 'No hay cotizaciones cargadas para convertir a dólares.';
  end if;

  return query
  select mo.month::date,
         round(coalesce(sum(case when e.currency = 'USD' then e.amount else e.amount / get_usd_rate(e.date) end), 0), 2),
         count(e.amount)
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') as mo(month)
  left join transaction_movement_types e
    on date_trunc('month', e.date) = mo.month
   and e.kind = 'expense' and e.movement_type in ('expense', 'balance_adjustment')
   and e.date between p_from and p_to
  group by mo.month
  order by mo.month;
end;
$$;

revoke all on function public.get_usd_rate(date) from public, anon;
revoke all on function public.get_monthly_expenses_usd(date, date) from public, anon;
grant execute on function public.get_usd_rate(date) to authenticated;
grant execute on function public.get_monthly_expenses_usd(date, date) to authenticated;
