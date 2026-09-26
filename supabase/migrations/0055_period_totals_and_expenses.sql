-- 0055: los cinco renglones de un período y los gastos por categoría los
-- calcula la base. Paso del bloque 2 de la mudanza (reglas #9, #10 y #11 del
-- informe; arregla D2 y D3).
--
-- POR QUÉ:
--   · D2: getExpenses (Inicio) no paginaba. Pasando las 1000 filas, el corte
--     de PostgREST se llevaba los gastos MÁS NUEVOS: el mes en curso era lo
--     primero que desaparecía de Inicio. Una suma en la base devuelve una
--     fila por moneda, nunca 1000.
--   · D3: "gastos por categoría" estaba escrito dos veces (Movimientos e
--     Inicio), con criterios distintos para decidir qué es un gasto real.
--     Ahora hay una sola definición, la vista de abajo, y las dos pantallas
--     leen la misma función.
--
-- LA DEFINICIÓN EJECUTABLE sigue en JS: monthTotals (lib/movements.js) y
-- groupExpensesByCategory (lib/transactions.js). periodTotalsSql.test.js corre
-- estas funciones contra ellas.

-- ── El tipo de cada movimiento ─────────────────────────────────────────────
-- Una sola traducción de movementType (lib/systemCategories.js) para toda la
-- base. El orden de los `when` es el mismo que el del JS y no es casual: una
-- pata de transferencia (transfer_id) es transferencia aunque su categoría
-- dijera otra cosa.
--   · 'account_transfer'     transferencia entre cuentas (dos patas)
--   · 'balance_adjustment'   el NETO de un conteo: un gasto o ingreso real
--   · 'reconciliation_split' el reparto de un conteo: plata que cambió de lugar
--   · 'savings_movement'     aporte o retiro "de afuera" de una cuenta de ahorro
--   · 'expense' / 'income'   todo lo demás
create view public.transaction_movement_types
with (security_invoker = true)
as
select t.id, t.date, t.kind, t.amount, t.currency, t.account_id, t.category_id, t.transfer_id,
       case
         when t.transfer_id is not null            then 'account_transfer'
         when c.system_key = 'balance_adjustment'  then 'balance_adjustment'
         when c.system_key = 'account_transfer'    then 'reconciliation_split'
         when c.system_key = 'savings_movement'    then 'savings_movement'
         else t.kind
       end as movement_type
from public.transactions t
join public.categories c on c.id = t.category_id;

comment on view public.transaction_movement_types is
  'El tipo de cada movimiento (la traducción de movementType): la única definición en la base de qué es un gasto o ingreso real (migración 0055).';

revoke all on public.transaction_movement_types from public, anon;
grant select on public.transaction_movement_types to authenticated;

-- ── Los cinco renglones de un período ──────────────────────────────────────
-- Por moneda: Gastos, Ingresos, Invertido, Ahorrado y lo que quedó (balance).
-- `p_from` / `p_to` inclusivos y opcionales: sin ninguno es el historial
-- entero, que es el rango "Todo" de Movimientos.
--
--   · Gastos e ingresos: los reales (expense, income y el ajuste de un
--     conteo). Lo que solo cambió de lugar no cuenta.
--   · Ahorrado: el reparto de un conteo que cayó en una cuenta de ahorro, las
--     transferencias con exactamente una pata en una cuenta de ahorro (con el
--     signo de la pata del día a día; una pata sin su hermana se ignora), y
--     los aportes a activos que la 0038 convirtió en cuentas de ahorro.
--   · Invertido: los aportes y retiros que tocan el disponible. Un aporte
--     entra a su cuenta en pesos multiplicado por su tasa congelada, y a una
--     en dólares tal cual (0039). Sin tasa, en pesos suma 0 — igual que el JS
--     (D4 del informe, hoy 0 filas: el formulario la exige).
--   · Balance: ingresos − gastos − invertido − ahorrado.
create or replace function public.get_period_totals(p_from date default null, p_to date default null)
returns table (currency text, expenses numeric, incomes numeric, invested numeric, saved numeric, balance numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select m.*, a.is_savings
    from transaction_movement_types m
    join liquid_accounts a on a.id = m.account_id
    where (p_from is null or m.date >= p_from) and (p_to is null or m.date <= p_to)
  ),
  pairs as (
    select transfer_id
    from t
    where movement_type = 'account_transfer'
    group by transfer_id
    having count(*) = 2 and count(*) filter (where is_savings) = 1
  ),
  lines (currency, expense, income, invested, saved) as (
    select t.currency,
           case when t.kind = 'expense' then t.amount else 0 end,
           case when t.kind = 'income' then t.amount else 0 end,
           0, 0
    from t
    where t.movement_type in ('expense', 'income', 'balance_adjustment')

    union all

    select t.currency, 0, 0, 0, case when t.kind = 'income' then t.amount else -t.amount end
    from t
    where t.movement_type = 'reconciliation_split' and t.is_savings

    union all

    select t.currency, 0, 0, 0, case when t.kind = 'expense' then t.amount else -t.amount end
    from t
    join pairs p on p.transfer_id = t.transfer_id
    where not t.is_savings

    union all

    select a.currency, 0, 0,
           case when s.savings_account_id is null then x.signed else 0 end,
           case when s.savings_account_id is not null then x.signed else 0 end
    from contributions c
    join liquid_accounts a on a.id = c.account_id
    join assets s on s.id = c.asset_id
    cross join lateral (
      select (case when a.currency = 'USD' then c.amount_usd else c.amount_usd * coalesce(c.mep_rate, 0) end)
             * (case when c.direction = 'out' then -1 else 1 end) as signed
    ) x
    where c.affects_liquid
      and (p_from is null or c.date >= p_from) and (p_to is null or c.date <= p_to)
  )
  select currency,
         round(sum(expense), 2),
         round(sum(income), 2),
         round(sum(invested), 2),
         round(sum(saved), 2),
         round(sum(income) - sum(expense) - sum(invested) - sum(saved), 2)
  from lines
  group by currency
  order by currency;
$$;

-- ── Gastos por categoría de un período ─────────────────────────────────────
-- Los gastos reales (los mismos que suma "Gastos" arriba), por moneda y por
-- categoría. Pesos y dólares no se suman: una fila por (moneda, categoría).
create or replace function public.get_expenses_by_category(p_from date default null, p_to date default null)
returns table (currency text, category_id uuid, category_name text, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select m.currency, m.category_id, c.name, round(sum(m.amount), 2)
  from transaction_movement_types m
  join categories c on c.id = m.category_id
  where m.kind = 'expense'
    and m.movement_type in ('expense', 'balance_adjustment')
    and (p_from is null or m.date >= p_from) and (p_to is null or m.date <= p_to)
  group by m.currency, m.category_id, c.name
  order by m.currency, sum(m.amount) desc;
$$;

revoke all on function public.get_period_totals(date, date) from public, anon;
revoke all on function public.get_expenses_by_category(date, date) from public, anon;
grant execute on function public.get_period_totals(date, date) to authenticated;
grant execute on function public.get_expenses_by_category(date, date) to authenticated;
