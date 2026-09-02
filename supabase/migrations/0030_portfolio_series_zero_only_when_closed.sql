-- 0030: un activo vale 0 en el gráfico solo si su posición está cerrada, no
-- porque en algún momento futuro se haya cargado una cantidad.
--
-- EL PROBLEMA
-- get_portfolio_series (0022, vigente en la 0026) decidía "esta posición está
-- cerrada" mirando la cantidad o el aportado según un flag por activo:
--
--   asset_position_basis.uses_quantity =
--     exists (select 1 from contributions c
--             where c.asset_id = ma.id and coalesce(c.quantity, 0) > 0)
--
--   -- y después, primera regla de la cascada valued:
--   when (case when uses_quantity then quantity else contributed end) = 0
--     then 0
--
-- Ese exists no tiene cota de fecha: es un flag GLOBAL del activo, calculado
-- sobre toda su historia y aplicado por igual a todos los días de la serie,
-- incluidos los anteriores a que esa cantidad existiera. En cuanto UNA sola
-- operación trae quantity, el activo pasa a medirse en cantidad desde siempre,
-- y todos los días previos —donde la cantidad acumulada todavía es 0— quedan
-- valiendo 0 aunque el aportado acumulado ya fuera > 0.
--
-- Dicho de otro modo: cargar una operación con cantidad reescribía hacia atrás
-- la historia del activo, borrando el valor de todos los días anteriores.
--
-- Medido en la cuenta test: "USDs fisicos" tiene tres aportes (100 el
-- 2026-05-02, 458,72 el 2026-07-05, 195,87 el 2026-07-08) y solo el último
-- trae cantidad. El activo valía 0 hasta el 2026-07-07 con 558,72 dólares
-- aportados, y el 2026-07-08 aparecía de golpe con 754,59. Ese es el escalón
-- vertical más grande del gráfico: total 439,11 -> 1192,04 en un día.
--
-- LA DECISIÓN
-- La pregunta "¿esta posición está cerrada?" no se responde con la cantidad:
-- la cantidad es un dato OPCIONAL de la contribución (hay aportes que no la
-- traen), así que su ausencia significa "no lo sé", no "no tengo nada". El
-- aportado acumulado neto, en cambio, existe siempre y ya descuenta los
-- retiros — es el único que distingue "todavía no compré" de "ya vendí todo".
--
-- Entonces: un activo vale 0 únicamente cuando su aportado acumulado al día D
-- es 0. Con aportado > 0, cada modo valúa como sabe, y un live que ese día
-- todavía no tiene cantidad cae al aportado en vez de a 0 — que es lo que vale
-- una posición recién comprada de la que no sabemos las unidades.
--
-- Con esto asset_position_basis se queda sin lectores y desaparece: el flag
-- global era el bug, no un dato que haga falta conservar.
--
-- Lo que NO cambia:
--
--   * Liquidación total: al vaciar el activo el aportado neto vuelve a 0, así
--     que la primera regla lo sigue dejando en 0 desde ese día. La cascada
--     nueva no lo resucita.
--   * Retiro parcial: el aportado queda > 0 y el activo sigue valuando por su
--     modo, igual que antes.
--   * Un live con cantidad en todas sus compras: nunca pasa por la rama nueva
--     (la cantidad acumulada es > 0 desde el primer día con aportado), así que
--     da exactamente lo mismo que hoy.
--   * contributed y manual: intactos. Un manual sin valuaciones hasta ese día
--     sigue valiendo 0 aunque tenga aportado — es otro efecto, con su propia
--     decisión detrás (la serie no inventa una valuación que el usuario no
--     cargó), y no se toca acá.
--   * Todo lo demás de la 0022 y la 0026 sigue igual y sigue documentado allá:
--     se incluyen los archivados, el precio es el último CIERRE y no el vivo,
--     include_in_total afecta a las dos columnas, y el precio sale de
--     instrument_prices_usd ya convertido a dólares.
--
-- Por qué la guarda es <= 0 y no = 0: el aportado neto se acumula restando
-- retiros, y ahora es él quien puede terminar SIENDO el valor del activo (la
-- rama live sin cantidad). Un residuo negativo por redondeo o por un retiro
-- cargado de más pintaría un valor negativo en el gráfico, cuando antes la
-- guarda por cantidad lo dejaba en 0. Una posición sobre-retirada vale 0, no
-- menos que nada.
create or replace function public.get_portfolio_series(
  p_from date,
  p_to date
)
returns table (date date, total_value numeric, contributed numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ),

  my_assets as (
    select a.id,
           a.valuation_mode,
           a.instrument_id,
           (at.include_in_total is distinct from false) as counts_in_total
    from assets a
    left join asset_types at on at.id = a.asset_type_id
  ),

  ops as (
    select c.asset_id,
           c.date as op_date,
           sum(case when c.direction = 'out'
                    then -(c.amount_usd - coalesce(c.realized_gain, 0))
                    else c.amount_usd
               end) as contributed_delta,
           sum(case when c.direction = 'out'
                    then -coalesce(c.quantity, 0)
                    else coalesce(c.quantity, 0)
               end) as quantity_delta
    from contributions c
    join my_assets ma on ma.id = c.asset_id
    group by c.asset_id, c.date
  ),

  ops_cum as (
    select ops.asset_id,
           ops.op_date,
           sum(ops.contributed_delta) over w as contributed_cum,
           sum(ops.quantity_delta) over w as quantity_cum
    from ops
    window w as (partition by ops.asset_id order by ops.op_date)
  ),

  per_asset_day as (
    select days.d as day,
           ma.id as asset_id,
           ma.valuation_mode,
           ma.instrument_id,
           ma.counts_in_total,
           round(coalesce(cum.contributed_cum, 0), 2) as contributed,
           round(coalesce(cum.quantity_cum, 0), 8) as quantity
    from days
    cross join my_assets ma
    left join lateral (
      select oc.contributed_cum, oc.quantity_cum
      from ops_cum oc
      where oc.asset_id = ma.id
        and oc.op_date <= days.d
      order by oc.op_date desc
      limit 1
    ) cum on true
  ),

  valued as (
    select pad.day,
           pad.contributed,
           pad.counts_in_total,
           case
             -- Posición cerrada o todavía inexistente. Es la única condición
             -- que pone un activo en 0 (ver cabecera).
             when pad.contributed <= 0
               then 0

             -- Un live que a ese día todavía no tiene cantidad acumulada vale
             -- lo aportado. Es el caso del aporte sin cantidad: la posición
             -- existe, lo que falta es el dato de unidades para valuarla a
             -- precio de mercado.
             when pad.valuation_mode = 'live' and pad.quantity = 0
               then pad.contributed

             -- El precio sale de la vista, YA en dólares (migración 0026). Un
             -- price_usd nulo (instrumento en pesos sin cotización del dólar
             -- hasta ese día) cae a la valuación manual por el coalesce, igual
             -- que un instrumento sin precio.
             when pad.valuation_mode = 'live' then
               coalesce(
                 pad.quantity * (
                   select ip.price_usd
                   from instrument_prices_usd ip
                   where ip.instrument_id = pad.instrument_id
                     and ip.date <= pad.day
                     and ip.price_usd is not null
                   order by ip.date desc
                   limit 1
                 ),
                 (
                   select av.value_usd
                   from asset_valuations av
                   where av.asset_id = pad.asset_id
                     and av.date <= pad.day
                   order by av.date desc
                   limit 1
                 ),
                 0
               )

             when pad.valuation_mode = 'contributed' then pad.contributed

             else coalesce(
               (
                 select av.value_usd
                 from asset_valuations av
                 where av.asset_id = pad.asset_id
                   and av.date <= pad.day
                 order by av.date desc
                 limit 1
               ),
               0
             )
           end as value
    from per_asset_day pad
  )

  select days.d as date,
         round(coalesce(sum(case when valued.counts_in_total then valued.value else 0 end), 0), 2) as total_value,
         round(coalesce(sum(case when valued.counts_in_total then valued.contributed else 0 end), 0), 2) as contributed
  from days
  left join valued on valued.day = days.d
  group by days.d
  order by days.d;
$$;

revoke all on function public.get_portfolio_series(date, date) from public;
grant execute on function public.get_portfolio_series(date, date) to authenticated;
