-- 0022: serie histórica del portafolio para el gráfico del dashboard.
-- Un día calendario por fila (incluidos fines de semana), dos magnitudes:
-- cuánto vale el portafolio y cuánto se aportó, ambas acumuladas a esa fecha.
--
-- No cambia nada existente: agrega una función de lectura. Misma forma que
-- get_instrument_series (migración 0018) — generate_series para los días,
-- carry-forward por lateral "último <= ese día", security invoker para que RLS
-- siga filtrando por usuario.
--
-- REGLA: la semántica se replica de src/lib/portfolio.js, no se reinventa.
-- Los números tienen que coincidir con los de la pantalla de Portafolio.
--   - contributed  -> computeContributed:  entradas suman amount_usd completo;
--                     salidas restan solo el capital devuelto
--                     (amount_usd − realized_gain). Redondeo a 2 por activo,
--                     igual que round(total) en esa función.
--   - quantity     -> heldQuantity:        entradas suman quantity, salidas
--                     restan. Redondeo a 8.
--   - posición     -> classifyOperations:  un activo mide su posición en
--                     CANTIDAD si alguna de sus operaciones trae quantity > 0
--                     (usesQuantity), y en APORTADO si ninguna la trae. Ver la
--                     nota sobre la regla de posición cerrada más abajo.
--   - valor        -> valueAsset:          según assets.valuation_mode.
--
-- Diferencias deliberadas con lo que muestra la pantalla hoy (las tres
-- documentadas acá para que nadie las lea como un bug):
--
--   1. INCLUYE ACTIVOS ARCHIVADOS. La pantalla los excluye (getAssets filtra
--      is_archived = false), pero un activo archivado el mes pasado SÍ tuvo
--      valor el mes pasado: excluirlo reescribiría la historia y haría caer el
--      gráfico a pique el día que alguien archiva algo. Por eso la serie los
--      cuenta. Consecuencia: el último punto de la serie NO tiene por qué
--      coincidir con el total de la pantalla si hay archivados con posición o
--      aportado distinto de cero.
--
--   2. PRECIO DE CIERRE, NO EN VIVO. La pantalla pide el precio a Binance en el
--      momento del render; acá se lee el último instrument_prices <= ese día,
--      que lo escribe el cron a las 09:00 ART. El punto de hoy es el cierre
--      conocido, no el tick del segundo en que se abre la pantalla.
--
--   3. include_in_total AFECTA A total_value, NO A contributed. Los activos de
--      bolsas con asset_types.include_in_total = false quedan fuera del valor
--      (mismo criterio que Portfolio.jsx, donde totalableAssets alimenta el
--      total), pero sus aportes SIGUEN sumando a contributed. Es una decisión
--      explícita, no un olvido: contributed acá es "toda la plata que puse",
--      sin recortes. Ojo que la pantalla no hace esta distinción — aplica el
--      mismo filtro a las dos magnitudes.
--      Un activo cuya bolsa no resuelve (asset_type nulo) se INCLUYE: replica
--      el `?.include_in_total !== false` del JS, donde ausente = incluido.

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

  -- Activos del usuario. RLS ("own rows") ya filtra por auth.uid(); acá NO se
  -- filtra is_archived a propósito (ver nota 1 de la cabecera).
  --
  -- counts_in_total: si el activo suma al VALOR del portafolio. El left join +
  -- "is distinct from false" replica el `a.asset_type?.include_in_total !==
  -- false` de Portfolio.jsx: false excluye, true incluye, y bolsa ausente o
  -- flag nulo también incluyen. No afecta a contributed (ver nota 3).
  my_assets as (
    select a.id,
           a.valuation_mode,
           a.instrument_id,
           (at.include_in_total is distinct from false) as counts_in_total
    from assets a
    left join asset_types at on at.id = a.asset_type_id
  ),

  -- ¿Este activo mide su posición en cantidad o en aportado? Mismo criterio que
  -- classifyOperations (portfolio.js): usesQuantity = alguna operación con
  -- quantity > 0. Los activos de precio en vivo registran cantidad; los
  -- manuales normalmente no, y para ellos la posición relevante es el aportado
  -- remanente. Se calcula sobre TODA la historia del activo, no por día — es
  -- una propiedad del activo, igual que en el JS.
  asset_position_basis as (
    select ma.id,
           exists (
             select 1
             from contributions c
             where c.asset_id = ma.id
               and coalesce(c.quantity, 0) > 0
           ) as uses_quantity
    from my_assets ma
  ),

  -- Deltas por (activo, fecha). Agrupar por fecha antes de acumular deja una
  -- fila por día con movimiento, que es lo que después busca el lateral.
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

  -- Acumulado corrido por activo. El frame default con order by (range
  -- unbounded preceding) es exactamente "todo lo anterior más este día".
  ops_cum as (
    select ops.asset_id,
           ops.op_date,
           sum(ops.contributed_delta) over w as contributed_cum,
           sum(ops.quantity_delta) over w as quantity_cum
    from ops
    window w as (partition by ops.asset_id order by ops.op_date)
  ),

  -- Estado de cada activo en cada día: el último acumulado con fecha <= ese
  -- día. Sin operaciones todavía => coalesce a 0 (nunca null: los días
  -- anteriores a la primera operación valen 0, no "sin dato").
  per_asset_day as (
    select days.d as day,
           ma.id as asset_id,
           ma.valuation_mode,
           ma.instrument_id,
           ma.counts_in_total,
           pb.uses_quantity,
           round(coalesce(cum.contributed_cum, 0), 2) as contributed,
           round(coalesce(cum.quantity_cum, 0), 8) as quantity
    from days
    cross join my_assets ma
    join asset_position_basis pb on pb.id = ma.id
    left join lateral (
      select oc.contributed_cum, oc.quantity_cum
      from ops_cum oc
      where oc.asset_id = ma.id
        and oc.op_date <= days.d
      order by oc.op_date desc
      limit 1
    ) cum on true
  ),

  -- Valor de cada activo en cada día (replica valueAsset, ver cabecera).
  valued as (
    select pad.day,
           pad.contributed,
           pad.counts_in_total,
           case
             -- Posición cerrada => 0, aunque queden valuaciones o precios
             -- posteriores dando vueltas. Un activo vaciado no vale su última
             -- valuación vieja. "Cerrada" se mide con la misma vara que
             -- classifyOperations: cantidad si el activo usa cantidad,
             -- aportado si no.
             when (case when pad.uses_quantity then pad.quantity else pad.contributed end) = 0
               then 0

             -- 'live': cantidad acumulada × último precio conocido. Si no hay
             -- precio (activo sin instrument_id, o anterior al arranque de la
             -- serie del instrumento), cae a la última valuación manual — el
             -- mismo fallback 'stale' de valueAsset, que usa la valuación como
             -- valor TOTAL, no como precio unitario. Sin ninguna de las dos, 0.
             when pad.valuation_mode = 'live' then
               coalesce(
                 pad.quantity * (
                   select ip.price
                   from instrument_prices ip
                   where ip.instrument_id = pad.instrument_id
                     and ip.date <= pad.day
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

             -- 'contributed' (hoy: efectivo): vale lo aportado, nunca pide
             -- valuación.
             when pad.valuation_mode = 'contributed' then pad.contributed

             -- 'manual': última valuación <= ese día, TAL CUAL. value_usd ya es
             -- el valor total de la posición: NO se multiplica por cantidad.
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

  -- Un renglón por día siempre: el left join preserva los días aunque el
  -- usuario no tenga ningún activo, y el coalesce evita devolver null.
  -- total_value descarta los activos de bolsas excluidas; contributed los
  -- suma igual (ver nota 3 de la cabecera).
  select days.d as date,
         round(coalesce(sum(case when valued.counts_in_total then valued.value else 0 end), 0), 2) as total_value,
         round(coalesce(sum(valued.contributed), 0), 2) as contributed
  from days
  left join valued on valued.day = days.d
  group by days.d
  order by days.d;
$$;

revoke all on function public.get_portfolio_series(date, date) from public;
grant execute on function public.get_portfolio_series(date, date) to authenticated;
