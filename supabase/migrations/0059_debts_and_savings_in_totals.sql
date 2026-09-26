-- 0059: deudas y gastos desde el ahorro en los totales del período, y el tipo
-- de cada movimiento suma "Movimiento de deuda". Bloque 3 de la mudanza
-- (regla #1 del informe; decisiones en docs/informe-deudas-ahorro-offline.md).
--
-- DEUDAS
--   · B, la entrada del préstamo (opcional): al cargar una deuda se puede
--     decir a qué cuenta entró y cuánto, en la moneda de la cuenta. Se guarda
--     como un ingreso con la categoría del sistema "Movimiento de deuda"
--     (plata que cambió de lugar, no un ingreso) y `transactions.debt_id`. Una
--     deuda sin entrada no registra nada: su monto es lo que falta pagar desde
--     que se usa la app, y ningún total lo necesita (ver el renglón "Deudas").
--   · D, intereses a mano: `debt_payments.interest_usd`, opcional. Esa parte
--     es gasto (categoría del sistema "Intereses"); el resto es capital, baja
--     la deuda y no es gasto. No puede superar el pago.
--   · C, la red: lo pagado en capital por encima del monto de la deuda también
--     es interés (vista debt_payment_parts).
--   · E, el renglón "Deudas": lo que entró por préstamos − lo devuelto de
--     capital, y entra en el balance con su signo.
--   Solo cuentan los pagos que salieron del disponible con su tasa congelada:
--   los mismos que resta get_liquid_by_account. Un pago "de afuera" (dólares
--   que ya tenías) baja la deuda pero no toca ningún renglón, igual que un
--   aporte "de afuera" no suma a Invertido.
--   Las deudas y los pagos viejos no se tocan: interest_usd nace en null, y
--   al medir no había ninguna deuda pagada de más.
--
-- GASTAR DESDE EL AHORRO
--   Un gasto, ingreso o movimiento de deuda en una cuenta de ahorro cuenta en
--   su renglón Y en Ahorrado, con el signo que deja el balance igual: gastar
--   $100 desde el ahorro es Gastos +100 y Ahorrado −100. Es exactamente lo
--   mismo que transferir primero del ahorro a una cuenta común y gastar desde
--   ahí; que los dos caminos den igual es lo que garantiza que no se cuenta
--   dos veces. El disponible no cambia: el ahorro ya está afuera (0051).
--
-- LA DEFINICIÓN EJECUTABLE sigue en JS: monthTotals y periodLines
-- (lib/movements.js), groupExpensesByCategory (lib/transactions.js),
-- paymentParts / debtBalance (lib/debts.js) y movementType
-- (lib/systemCategories.js). periodTotalsSql.test.js corre todo contra ellas.

-- ══ 1. Las dos categorías del sistema nuevas ════════════════════════════════
-- Una por usuario existente, y el sembrado de los nuevos (handle_new_user).
insert into public.categories (user_id, name, kind, is_system, system_key, position)
select u.id, v.name, v.kind, true, v.key, v.position
from auth.users u
cross join (values
  ('Movimiento de deuda', 'income',  'debt_movement', 103),
  ('Intereses',           'expense', 'debt_interest', 104)
) as v(name, kind, key, position)
on conflict (user_id, system_key, kind) where system_key is not null do nothing;

-- La misma función de la 0048, con las dos categorías de arriba en el
-- sembrado de las del sistema.
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
    ('Transferencia de cuenta', 'income',  new.id, true, 'account_transfer',   102),
    ('Movimiento de deuda',     'income',  new.id, true, 'debt_movement',      103),
    ('Intereses',               'expense', new.id, true, 'debt_interest',      104);

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

revoke all on function public.handle_new_user() from public, anon;

-- ══ 2. La entrada del préstamo y los intereses ══════════════════════════════
-- Una entrada por deuda como mucho. Borrar la deuda borra su entrada: es parte
-- del mismo registro, como los movimientos de un conteo (y una deuda con
-- pagos igual no se puede borrar).
alter table public.transactions
  add column debt_id uuid references public.debts(id) on delete cascade;
create unique index transactions_one_inflow_per_debt on public.transactions(debt_id) where debt_id is not null;

alter table public.debt_payments
  add column interest_usd numeric(14,2) check (interest_usd >= 0);

-- Los intereses no pueden superar el pago. Trigger y no solo CHECK para que el
-- mensaje llegue en castellano; el CHECK queda como garantía declarativa.
alter table public.debt_payments
  add constraint debt_payments_interest_within_amount check (interest_usd is null or interest_usd <= amount_usd);

create or replace function public.guard_debt_payment_interest()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.interest_usd is not null and new.interest_usd > new.amount_usd then
    raise exception 'Los intereses no pueden ser más que el pago.';
  end if;
  return new;
end;
$$;

create trigger debt_payments_interest_guard
  before insert or update of amount_usd, interest_usd on public.debt_payments
  for each row execute function public.guard_debt_payment_interest();

revoke all on function public.guard_debt_payment_interest() from public, anon;

-- ══ 3. El tipo de cada movimiento suma 'debt_movement' ══════════════════════
-- Mismas columnas que la 0055; un `when` más, antes del `else`.
create or replace view public.transaction_movement_types
with (security_invoker = true)
as
select t.id, t.date, t.kind, t.amount, t.currency, t.account_id, t.category_id, t.transfer_id,
       case
         when t.transfer_id is not null            then 'account_transfer'
         when c.system_key = 'balance_adjustment'  then 'balance_adjustment'
         when c.system_key = 'account_transfer'    then 'reconciliation_split'
         when c.system_key = 'savings_movement'    then 'savings_movement'
         when c.system_key = 'debt_movement'       then 'debt_movement'
         else t.kind
       end as movement_type
from public.transactions t
join public.categories c on c.id = t.category_id;

-- ══ 4. Capital e intereses de cada pago ═════════════════════════════════════
-- En orden (fecha, alta, id): el capital de un pago es lo que no son
-- intereses a mano; lo que de ese capital cruza el monto de la deuda es
-- interés también (la red). La suma del capital nunca pasa el monto original.
create view public.debt_payment_parts
with (security_invoker = true)
as
with p as (
  select p.id, p.debt_id, p.date, p.account_id, p.affects_liquid, p.mep_rate, p.amount_usd,
         coalesce(p.interest_usd, 0) as manual_interest,
         p.amount_usd - coalesce(p.interest_usd, 0) as manual_capital,
         d.original_amount_usd,
         coalesce(sum(p.amount_usd - coalesce(p.interest_usd, 0)) over (
           partition by p.debt_id order by p.date, p.created_at, p.id
           rows between unbounded preceding and 1 preceding), 0) as capital_before
  from public.debt_payments p
  join public.debts d on d.id = p.debt_id
)
select p.id, p.debt_id, p.date, p.account_id, p.affects_liquid, p.mep_rate, p.amount_usd,
       p.manual_interest + x.excess as interest_usd,
       p.manual_capital - x.excess  as capital_usd
from p
cross join lateral (
  select greatest(0, p.capital_before + p.manual_capital - p.original_amount_usd)
       - greatest(0, p.capital_before - p.original_amount_usd) as excess
) x;

-- El saldo de una deuda baja por el capital, no por los intereses. Mismas
-- columnas que la 0049.
create or replace view public.debt_balances
with (security_invoker = true)
as
select
  d.id                                                                      as debt_id,
  coalesce(sum(p.amount_usd - coalesce(p.interest_usd, 0)), 0)              as paid_usd,
  greatest(d.original_amount_usd - coalesce(sum(p.amount_usd - coalesce(p.interest_usd, 0)), 0), 0) as balance_usd,
  coalesce(sum(p.amount_usd - coalesce(p.interest_usd, 0)), 0) >= d.original_amount_usd as is_settled
from public.debts d
left join public.debt_payments p on p.debt_id = d.id
group by d.id;

revoke all on public.debt_balances from public, anon;
grant select on public.debt_balances to authenticated;

-- ══ 5. Los gastos reales, en un solo lugar ══════════════════════════════════
-- Lo que suma "Gastos": los gastos y ajustes de las transactions, más los
-- intereses de los pagos de deuda (en la moneda de la cuenta de la que
-- salieron, con la regla de la 0039). La leen get_period_totals,
-- get_expenses_by_category y get_monthly_expenses_usd, así que las tres no
-- pueden dar distinto.
create view public.expense_lines
with (security_invoker = true)
as
select m.currency, m.date, m.amount, m.category_id, m.account_id
from public.transaction_movement_types m
where m.kind = 'expense' and m.movement_type in ('expense', 'balance_adjustment')
union all
select a.currency, pp.date,
       case when a.currency = 'USD' then pp.interest_usd else pp.interest_usd * pp.mep_rate end,
       c.id, pp.account_id
from public.debt_payment_parts pp
join public.liquid_accounts a on a.id = pp.account_id
join public.debts d on d.id = pp.debt_id
join public.categories c on c.user_id = d.user_id and c.system_key = 'debt_interest' and c.kind = 'expense'
where pp.affects_liquid and pp.mep_rate is not null and pp.interest_usd > 0;

revoke all on public.debt_payment_parts from public, anon;
revoke all on public.expense_lines from public, anon;
grant select on public.debt_payment_parts, public.expense_lines to authenticated;

-- ══ 6. Guardar una deuda con su entrada, en una sola transacción ════════════
-- Crear o editar la deuda y su entrada son dos escrituras: sueltas, un fallo
-- entre las dos deja una deuda sin la plata que dice que entró (o al revés), y
-- el reintento la duplica. Mismo remedio que create_transfer (0017).
--   · p_id null crea; si no, edita.
--   · p_inflow_account_id null: sin entrada (y si había una, se borra).
--   · p_inflow_amount: en la moneda de la cuenta. La moneda la pone la base
--     (0050); al cambiar a una cuenta de otra moneda se manda explícita, que
--     es lo que la regla D de la 0050 pide (el formulario pide el monto de
--     nuevo).
create or replace function public.save_debt(
  p_id uuid,
  p_creditor text,
  p_original_amount_usd numeric,
  p_start_date date,
  p_inflow_account_id uuid default null,
  p_inflow_amount numeric default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_currency text;
begin
  if nullif(btrim(p_creditor), '') is null then
    raise exception 'Falta a quién le debés.';
  end if;

  if p_id is null then
    insert into debts (creditor, original_amount_usd, start_date)
    values (btrim(p_creditor), p_original_amount_usd, p_start_date)
    returning id into v_id;
  else
    update debts
       set creditor = btrim(p_creditor), original_amount_usd = p_original_amount_usd, start_date = p_start_date
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Deuda inexistente o de otro usuario';
    end if;
  end if;

  if p_inflow_account_id is null then
    delete from transactions where debt_id = v_id;
    return v_id;
  end if;

  if not (p_inflow_amount > 0) then
    raise exception 'Falta cuánto entró.';
  end if;
  select currency into v_currency from liquid_accounts where id = p_inflow_account_id;
  if v_currency is null then
    raise exception 'Cuenta inexistente o de otro usuario';
  end if;

  update transactions
     set account_id = p_inflow_account_id, currency = v_currency, amount = p_inflow_amount,
         date = p_start_date, description = 'Préstamo de ' || btrim(p_creditor)
   where debt_id = v_id;
  if not found then
    insert into transactions (date, kind, category_id, description, amount, account_id, debt_id)
    values (p_start_date, 'income', system_category_id('debt_movement', 'income'),
            'Préstamo de ' || btrim(p_creditor), p_inflow_amount, p_inflow_account_id, v_id);
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_debt(uuid, text, numeric, date, uuid, numeric) from public, anon;
grant execute on function public.save_debt(uuid, text, numeric, date, uuid, numeric) to authenticated;

-- ══ 7. Los renglones del período ════════════════════════════════════════════
-- Cambian las columnas de salida (suman `debts` y `debt_movements`), así que
-- la función se reemplaza entera.
drop function public.get_period_totals(date, date);

create function public.get_period_totals(p_from date default null, p_to date default null)
returns table (
  currency text, expenses numeric, incomes numeric, invested numeric, saved numeric,
  debts numeric, debt_movements bigint, balance numeric
)
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
  -- `mirror`: la fila está en una cuenta de ahorro y lo que suma a su renglón
  -- se refleja en Ahorrado, para que el balance no cambie.
  lines (currency, expense, income, invested, saved, debts, debt_move, mirror) as (
    -- Gastos reales (incluidos los intereses)
    select e.currency, e.amount, 0, 0, 0, 0, 0, a.is_savings
    from expense_lines e
    join liquid_accounts a on a.id = e.account_id
    where (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to)

    union all

    -- Ingresos reales
    select t.currency, 0, t.amount, 0, 0, 0, 0, t.is_savings
    from t
    where t.kind = 'income' and t.movement_type in ('income', 'balance_adjustment')

    union all

    -- El reparto de un conteo que cayó en una cuenta de ahorro
    select t.currency, 0, 0, 0, case when t.kind = 'income' then t.amount else -t.amount end, 0, 0, false
    from t
    where t.movement_type = 'reconciliation_split' and t.is_savings

    union all

    -- Transferencias con exactamente una pata de ahorro (la pata del día a día)
    select t.currency, 0, 0, 0, case when t.kind = 'expense' then t.amount else -t.amount end, 0, 0, false
    from t
    join pairs p on p.transfer_id = t.transfer_id
    where not t.is_savings

    union all

    -- Aportes y retiros que tocan el disponible
    select a.currency, 0, 0,
           case when s.savings_account_id is null then x.signed else 0 end,
           case when s.savings_account_id is not null then x.signed else 0 end,
           0, 0, false
    from contributions c
    join liquid_accounts a on a.id = c.account_id
    join assets s on s.id = c.asset_id
    cross join lateral (
      select (case when a.currency = 'USD' then c.amount_usd else c.amount_usd * coalesce(c.mep_rate, 0) end)
             * (case when c.direction = 'out' then -1 else 1 end) as signed
    ) x
    where c.affects_liquid
      and (p_from is null or c.date >= p_from) and (p_to is null or c.date <= p_to)

    union all

    -- Lo que entró por un préstamo
    select t.currency, 0, 0, 0, 0, case when t.kind = 'income' then t.amount else -t.amount end, 1, t.is_savings
    from t
    where t.movement_type = 'debt_movement'

    union all

    -- Lo devuelto de capital (los intereses ya están en expense_lines)
    select a.currency, 0, 0, 0, 0,
           -(case when a.currency = 'USD' then pp.capital_usd else pp.capital_usd * pp.mep_rate end),
           1, a.is_savings
    from debt_payment_parts pp
    join liquid_accounts a on a.id = pp.account_id
    where pp.affects_liquid and pp.mep_rate is not null
      and (p_from is null or pp.date >= p_from) and (p_to is null or pp.date <= p_to)
  )
  select currency,
         round(sum(expense), 2),
         round(sum(income), 2),
         round(sum(invested), 2),
         round(sum(saved) + sum(case when mirror then income - expense + debts else 0 end), 2),
         round(sum(debts), 2),
         sum(debt_move)::bigint,
         round(sum(income) - sum(expense) - sum(invested) - sum(saved)
               - sum(case when mirror then income - expense + debts else 0 end) + sum(debts), 2)
  from lines
  group by currency
  order by currency;
$$;

revoke all on function public.get_period_totals(date, date) from public, anon;
grant execute on function public.get_period_totals(date, date) to authenticated;

-- Los gastos por categoría y la serie en dólares leen expense_lines: los
-- intereses aparecen en "Intereses" y en la serie, igual que en Gastos.
create or replace function public.get_expenses_by_category(p_from date default null, p_to date default null)
returns table (currency text, category_id uuid, category_name text, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select e.currency, e.category_id, c.name, round(sum(e.amount), 2)
  from expense_lines e
  join categories c on c.id = e.category_id
  where (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to)
  group by e.currency, e.category_id, c.name
  order by e.currency, sum(e.amount) desc;
$$;

create or replace function public.get_monthly_expenses_usd(p_from date, p_to date)
returns table (month date, total_usd numeric, expense_count bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from expense_lines e
    where e.date between p_from and p_to and e.currency <> 'USD'
  ) and get_usd_rate(p_to) is null then
    raise exception 'No hay cotizaciones cargadas para convertir a dólares.';
  end if;

  return query
  select mo.month::date,
         round(coalesce(sum(case when e.currency = 'USD' then e.amount else e.amount / get_usd_rate(e.date) end), 0), 2),
         count(e.amount)
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') as mo(month)
  left join expense_lines e
    on date_trunc('month', e.date) = mo.month
   and e.date between p_from and p_to
  group by mo.month
  order by mo.month;
end;
$$;

-- ── Verificación (solo lectura, correr después de aplicar) ─────────────────
-- Ver la consulta combinada del bloque 3 (la da el chat que acompaña esta
-- rama): categorías sembradas por usuario, vistas con security_invoker,
-- permisos, y que ningún pago viejo cambió de capital.
