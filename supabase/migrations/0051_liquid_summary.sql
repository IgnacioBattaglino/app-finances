-- 0051: el resumen del disponible lo calcula la base (get_liquid_summary), y
-- get_liquid_by_account deja de contemplar plata "sin cuenta".
--
-- POR QUÉ: el total del disponible y del ahorro, por moneda, lo armaba el
-- cliente (computeCurrentLiquid, lib/liquid.js) sumando los baldes de
-- get_liquid_by_account. Una app nativa tendría que copiar esa suma y sus dos
-- reglas: nunca mezclar monedas, nunca sumar ahorro al disponible. Paso 3 de
-- la mudanza de reglas (docs/mudanza-reglas.md, regla #6 del informe).
--
-- QUÉ ES CADA TOTAL:
--   · disponible(moneda) = suma de las cuentas del día a día (is_savings false)
--     de esa moneda.
--   · ahorro(moneda)     = suma de las cuentas de ahorro de esa moneda.
--   Las cuentas OCULTAS (is_archived) cuentan en las dos: ocultar una cuenta
--   no hace desaparecer su plata. Al escribir esto, las 2 cuentas ocultas que
--   existen tienen saldo 0.
--   Se define sobre get_liquid_by_account(), no con una suma paralela: el
--   total y el desglose por cuenta no pueden divergir.
--
-- SIN "SIN CUENTA": desde la 0050 todo movimiento que toca el disponible
-- tiene cuenta (NOT NULL y CHECK), y la FK impide una cuenta huérfana. El
-- left join y los coalesce que leían esos dos casos como pesos no-ahorro
-- quedan muertos, así que get_liquid_by_account pasa a un join común. Al
-- escribir esto: 0 baldes sin cuenta, 0 huérfanos (verificado con el MCP).
-- La regla de la suma no cambia en nada más.
--
-- La definición ejecutable sigue en JS (summarizeLiquid y
-- computeLiquidByAccount, lib/liquid.js): liquidSummarySql.test.js corre las
-- dos funciones contra ellas.

create or replace function public.get_liquid_by_account()
returns table (account_id uuid, currency text, is_savings boolean, amount numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select m.account_id,
         la.currency,
         la.is_savings,
         -- Los montos de contributions y debt_payments están en dólares
         -- (in_usd): entran convertidos con su tasa congelada solo si la cuenta
         -- no es en dólares (0039, ADR-015).
         sum(
           case when m.in_usd and la.currency <> 'USD' then m.delta * m.mep_rate
                else m.delta
           end
         ) as amount
  from (
    select t.account_id,
           case when t.kind = 'income' then t.amount else -t.amount end,
           null::numeric,
           false
    from transactions t

    union all

    -- Solo lo que sale del bolsillo: affects_liquid = false son cargas
    -- iniciales, tenencias previas y las patas de una transferencia.
    select c.account_id,
           case when c.direction = 'out' then c.amount_usd else -c.amount_usd end,
           c.mep_rate,
           true
    from contributions c
    where c.affects_liquid = true
      and c.mep_rate is not null

    union all

    -- Los pagos sin MEP congelado (anteriores a la 0010) quedan fuera.
    select p.account_id, -p.amount_usd, p.mep_rate, true
    from debt_payments p
    where p.affects_liquid is distinct from false
      and p.mep_rate is not null
  ) as m(account_id, delta, mep_rate, in_usd)
  join liquid_accounts la on la.id = m.account_id
  group by m.account_id, la.currency, la.is_savings;
$$;

create or replace function public.get_liquid_summary()
returns table (currency text, available numeric, savings numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select b.currency,
         round(coalesce(sum(b.amount) filter (where not b.is_savings), 0), 2) as available,
         round(coalesce(sum(b.amount) filter (where b.is_savings), 0), 2)     as savings
  from get_liquid_by_account() b
  group by b.currency
  order by b.currency;
$$;

comment on function public.get_liquid_summary() is
  'Por moneda: el disponible (cuentas del día a día) y el ahorro, por separado. Nunca mezcla monedas ni suma ahorro al disponible (migración 0051).';

-- `from public, anon` y no solo `public`: Supabase tiene privilegios por
-- defecto que le dan EXECUTE directamente a anon en toda función nueva de
-- public, y revocárselo a public no se lo saca.
revoke all on function public.get_liquid_summary() from public, anon;
grant execute on function public.get_liquid_summary() to authenticated;

-- ── Verificación (solo lectura, correr después de aplicar) ─────────────────
-- 1) El desglose por cuenta no cambió: la huella tiene que ser la misma que la
--    tomada con la función vieja antes de aplicar (9 baldes,
--    f25edb26da7e1a404d4a360c39a3bcd0 — sin montos a la vista). Vale solo si
--    nadie cargó ni editó nada entre esa medición y la aplicación.
--
--   select count(*) as baldes,
--          md5(string_agg(account_id::text || '|' || currency || '|' || is_savings || '|'
--                         || round(amount, 2)::text, ',' order by account_id)) as huella
--   from get_liquid_by_account();
--
-- 2) El resumen es exactamente la suma del desglose, por moneda. Tiene que dar
--    0 (el editor SQL ve a todos los usuarios juntos; la igualdad vale igual).
--
--   select count(*) from get_liquid_summary() g
--   full join (select currency,
--                     round(coalesce(sum(amount) filter (where not is_savings), 0), 2) as a,
--                     round(coalesce(sum(amount) filter (where is_savings), 0), 2) as s
--              from get_liquid_by_account() group by currency) x using (currency)
--   where g.available is distinct from x.a or g.savings is distinct from x.s;
--
-- 3) Permisos: authenticated ejecuta, anon no.
--
--   select has_function_privilege('authenticated', 'public.get_liquid_summary()', 'execute'),
--          has_function_privilege('anon', 'public.get_liquid_summary()', 'execute');
