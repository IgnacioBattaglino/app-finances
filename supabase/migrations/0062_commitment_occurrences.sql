-- 0062: qué vence y cuándo, en la base (paso 7 de la mudanza de reglas).
--
-- Hasta acá esta regla vivía solo en el cliente (src/lib/commitmentSchedule.js).
-- La app nativa no puede copiarla: una app que decide por su cuenta qué
-- vencimientos existen es justo lo que la mudanza evita. Esta migración NO
-- cambia la regla ni lo que se guarda: un pendiente sigue sin ser una fila
-- (ADR-019); lo que cambia es dónde se calcula.
--
-- Tres piezas:
--   commitment_due_date(start, frequency, idx)   la fecha de un vencimiento
--   get_commitment_occurrences(p_today, p_until) los vencimientos de cada plan
--   get_commitment_status(p_today)               lo que le queda a cada plan
--
-- La definición ejecutable sigue siendo commitmentSchedule.js (planOccurrences,
-- planRemaining, isFinished): src/lib/commitmentOccurrencesSql.test.js corre
-- las dos con el mismo dataset y exige que den lo mismo.
--
-- `p_today` SIEMPRE lo manda la app: el default es el día de la base (UTC), y
-- entre las 21 y las 24 de Argentina ya es mañana.

-- La fecha del vencimiento número idx (0 = el primero, start_date). Los meses
-- se suman SIEMPRE desde start_date, no desde el vencimiento anterior: un plan
-- del 31 vence el 28 en febrero y vuelve al 31 en marzo.
create or replace function public.commitment_due_date(p_start date, p_frequency text, p_idx int)
returns date
language sql
immutable
set search_path = public
as $$
  select case p_frequency
    when 'weekly' then p_start + 7 * p_idx
    when 'quarterly' then (p_start + make_interval(months => 3 * p_idx))::date
    when 'yearly' then (p_start + make_interval(months => 12 * p_idx))::date
    else (p_start + make_interval(months => p_idx))::date
  end
$$;

-- Los vencimientos de cada plan hasta p_until (por defecto, 12 meses desde hoy),
-- con su estado:
--   confirmed   tiene un gasto (transaction_id)
--   dismissed   se descartó ("no lo pagué y no lo voy a pagar")
--   overdue     venció y sigue sin resolverse
--   pending     todavía no venció
--
-- Dos bordes que vienen de la regla original y se respetan tal cual:
--   · Un plan terminado (ends_on) no genera nada posterior a ese día.
--   · Un cargo resuelto cuya fecha ya no coincide con ningún vencimiento del
--     plan (se editó el plan después de confirmar) no se pierde: sale con
--     idx null y el monto del plan. Lo ya pagado no desaparece del historial.
create or replace function public.get_commitment_occurrences(
  p_today date default current_date,
  p_until date default null
)
returns table (
  commitment_id uuid,
  idx int,
  number int,
  "of" int,
  due_date date,
  amount numeric,
  currency text,
  status text,
  charge_id uuid,
  transaction_id uuid,
  days_late int
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select p_today as today,
           coalesce(p_until, (p_today + interval '12 months')::date) as horizon
  ),
  plans as (
    select c.*,
           -- Cuántos vencimientos genera: las cuotas que faltan desde la
           -- primera cargada; null = suscripción, sin final.
           case when c.installments is null then null
                else c.installments - c.first_installment + 1 end as cnt,
           -- Cota inferior de días entre dos vencimientos, para saber cuántos
           -- índices hay que mirar como mucho.
           case c.frequency when 'weekly' then 7 when 'quarterly' then 89
                            when 'yearly' then 365 else 28 end as min_days,
           (select max(ch.due_date) from commitment_charges ch
             where ch.commitment_id = c.id) as last_charge
    from commitments c
  ),
  candidates as (
    select p.id as commitment_id, p.amount as plan_amount, p.first_amount,
           p.first_installment, p.installments, p.currency, p.ends_on,
           g.i as idx,
           commitment_due_date(p.start_date, p.frequency, g.i) as due_date
    from plans p
    cross join params x
    cross join lateral generate_series(
      0,
      least(
        coalesce(p.cnt, 2147483647),
        greatest(0, (greatest(x.horizon, coalesce(p.last_charge, x.horizon)) - p.start_date) / p.min_days) + 2
      ) - 1
    ) as g(i)
  ),
  joined as (
    select cand.*, ch.id as charge_id, ch.transaction_id, ch.dismissed_at,
           -- Acá se corta la serie: después de terminado el plan, o al pasar
           -- el horizonte en una fecha que no tiene nada resuelto.
           ((cand.ends_on is not null and cand.due_date > cand.ends_on)
             or (cand.due_date > x.horizon and ch.id is null)) as stops
    from candidates cand
    cross join params x
    left join commitment_charges ch
      on ch.commitment_id = cand.commitment_id and ch.due_date = cand.due_date
  ),
  kept as (
    select j.*
    from joined j
    where j.idx < coalesce(
      (select min(s.idx) from joined s where s.commitment_id = j.commitment_id and s.stops),
      2147483647
    )
  ),
  indexed as (
    select k.commitment_id,
           k.idx,
           case when k.installments is null then null
                else k.first_installment + k.idx end as number,
           k.installments as "of",
           k.due_date,
           -- La primera cuota absorbe la diferencia cuando dividir no da exacto.
           case when k.first_amount is not null and k.first_installment + k.idx = 1
                then k.first_amount else k.plan_amount end as amount,
           k.currency,
           case when k.transaction_id is not null then 'confirmed'
                when k.dismissed_at is not null then 'dismissed'
                when k.due_date < x.today then 'overdue'
                else 'pending' end as status,
           k.charge_id,
           k.transaction_id
    from kept k
    cross join params x
  ),
  orphans as (
    select ch.commitment_id,
           null::int as idx,
           null::int as number,
           c.installments as "of",
           ch.due_date,
           c.amount,
           c.currency,
           case when ch.transaction_id is not null then 'confirmed' else 'dismissed' end as status,
           ch.id as charge_id,
           ch.transaction_id
    from commitment_charges ch
    join commitments c on c.id = ch.commitment_id
    where (ch.transaction_id is not null or ch.dismissed_at is not null)
      and not exists (
        select 1 from kept k
        where k.commitment_id = ch.commitment_id and k.due_date = ch.due_date
      )
  )
  select o.commitment_id, o.idx, o.number, o."of", o.due_date, o.amount, o.currency,
         o.status, o.charge_id, o.transaction_id,
         (x.today - o.due_date) as days_late
  from (select * from indexed union all select * from orphans) o
  cross join params x
  order by o.due_date, o.commitment_id, o.idx nulls last;
$$;

-- Lo que le queda a cada plan. Para una compra en cuotas: cuántas faltan,
-- cuánto suman, el total de la compra y cuándo vence la última. Para una
-- suscripción esos cuatro son null (no tiene final ni total). `is_finished`:
-- se terminó a mano (ends_on ya pasó) o no le queda ninguna cuota abierta.
create or replace function public.get_commitment_status(p_today date default current_date)
returns table (
  commitment_id uuid,
  remaining_count int,
  remaining_amount numeric,
  total numeric,
  last_due_date date,
  is_finished boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with finite as (
    select c.id, c.ends_on, c.installments, c.first_installment, c.amount, c.first_amount,
           commitment_due_date(c.start_date, c.frequency, c.installments - c.first_installment) as last_due,
           coalesce(open.n, 0)::int as open_count,
           coalesce(open.amount, 0) as open_amount
    from commitments c
    left join lateral (
      select count(*) as n,
             sum(case when c.first_amount is not null and c.first_installment + g.i = 1
                      then c.first_amount else c.amount end) as amount
      from generate_series(0, c.installments - c.first_installment) as g(i)
      left join commitment_charges ch
        on ch.commitment_id = c.id
       and ch.due_date = commitment_due_date(c.start_date, c.frequency, g.i)
      where (c.ends_on is null or commitment_due_date(c.start_date, c.frequency, g.i) <= c.ends_on)
        and ch.transaction_id is null
        and ch.dismissed_at is null
    ) open on true
    where c.installments is not null
  )
  select c.id,
         f.open_count,
         case when f.id is null then null else round(f.open_amount, 2) end,
         case when f.id is null then null
              else round(coalesce(f.first_amount, f.amount) + f.amount * (f.installments - 1), 2) end,
         f.last_due,
         (c.ends_on is not null and c.ends_on < p_today) or coalesce(f.open_count = 0, false)
  from commitments c
  left join finite f on f.id = c.id;
$$;

revoke all on function public.commitment_due_date(date, text, int) from public, anon;
revoke all on function public.get_commitment_occurrences(date, date) from public, anon;
revoke all on function public.get_commitment_status(date) from public, anon;
grant execute on function public.commitment_due_date(date, text, int) to authenticated;
grant execute on function public.get_commitment_occurrences(date, date) to authenticated;
grant execute on function public.get_commitment_status(date) to authenticated;

-- Verificación después de aplicar (solo lectura). Tiene que dar ok = true:
-- existen las tres funciones y anon no puede ejecutar ninguna.
--
--   select count(*) = 3 as ok
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('commitment_due_date', 'get_commitment_occurrences', 'get_commitment_status')
--     and not has_function_privilege('anon', p.oid, 'execute');
