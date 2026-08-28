-- 0026: la conversión a dólares de los precios del catálogo pasa a vivir en UN
-- SOLO lugar: la vista instrument_prices_usd.
--
-- EL PROBLEMA
-- El portafolio se mide en dólares, pero el catálogo guarda cada precio en la
-- moneda en que cotiza el instrumento (instruments.currency): las cripto en
-- USD, y todo lo de BYMA — acciones argentinas, bonos y CEDEARs — en ARS.
-- Convertir era responsabilidad de quien leyera, y había DOS lectores que lo
-- resolvían distinto:
--
--   - la app (lib/portfolioPrices.js) convertía con el MEP;
--   - get_portfolio_series (migración 0022) NO convertía: multiplicaba las
--     unidades por el precio en pesos y devolvía eso como si fueran dólares.
--
-- Resultado medido con datos reales: con 10 unidades de GGAL a $7.070, la
-- tarjeta "Dinero invertido" decía US$ 2.043,71 y el gráfico de evolución
-- justo debajo dibujaba US$ 72.690,27 — el mismo portafolio valuado 35 veces
-- más alto, porque 10 × 7.070 pesos se contaban como 70.700 dólares.
--
-- Había un tercer lector con el mismo defecto latente: get_instrument_series
-- (migración 0018), que hoy no consume nadie desde la app pero devolvía
-- precios sin convertir igual. Se corrige también, para que no muerda el día
-- que se use.
--
-- LA DECISIÓN
-- Mientras la conversión sea responsabilidad de cada lector, siempre va a
-- haber uno que se olvide. Así que deja de ser responsabilidad de nadie: esta
-- vista devuelve el precio YA en dólares y es el único lugar del sistema donde
-- se divide por la cotización. Los tres lectores pasan a leerla.
--
-- Las cripto no entran en juego: ya cotizan en dólares (currency = 'USD') y la
-- vista las devuelve tal cual. El precio EN VIVO de cripto sigue viniendo de
-- Binance directo al navegador, sin pasar por acá — tampoco necesita
-- conversión, así que no abre un segundo camino.
--
-- POR QUÉ EL MEP, Y QUÉ SE ESTÁ APROXIMANDO
-- Se convierte al dólar MEP, que es la misma cotización con la que la app
-- traduce todo lo demás (aportes, pagos de deuda, gastos en dólares).
--
-- Es una aproximación conocida y aceptada: los CEDEARs y las acciones con ADR
-- arbitran en la práctica contra el CCL (contado con liquidación), no contra
-- el MEP. Los dos suelen moverse juntos y la brecha entre ellos es chica
-- comparada con la del oficial, pero no son el mismo número. Se elige el MEP
-- a propósito, por coherencia: tener dos cotizaciones distintas conviviendo
-- haría que un mismo activo valga distinto según por dónde se lo mire, que es
-- exactamente el problema que esta migración viene a cerrar. Si algún día se
-- agrega el CCL al catálogo, el cambio es de UNA línea acá adentro.
--
-- CONVERSIÓN DÍA POR DÍA, NO AL DÓLAR DE HOY
-- Cada precio se convierte con la cotización de SU fecha, no con la de hoy. Un
-- cierre del 15 de junio vale lo que valía en dólares el 15 de junio; traerlo
-- al dólar de hoy reescribiría la historia y haría que el gráfico se moviera
-- entero cada vez que salta el dólar. Es el mismo criterio que ya usa el resto
-- de la app, donde cada aporte congela el MEP de su día.
--
-- El MEP se busca con carry-forward (la última cotización conocida en esa
-- fecha o antes), igual que get_instrument_series: el cron lo escribe todos
-- los días, pero un hueco no puede dejar sin valor a todo un día.
--
-- SIN RATIOS DE CONVERSIÓN
-- No hace falta ninguna tabla de ratios de CEDEAR. El precio en pesos de un
-- CEDEAR ya tiene adentro el tipo de cambio y el ratio contra el papel
-- original: para valuar una posición alcanza con unidades × precio en pesos ÷
-- cotización del dólar. El ratio solo haría falta para responder "cuántas
-- acciones subyacentes tengo", que no es una pregunta que la app haga.

-- ── La vista ────────────────────────────────────────────────────────────────
-- Devuelve el precio en dólares y TAMBIÉN el nativo: el formulario de activo
-- muestra "$ 7.070" como confirmación de que elegiste el papel correcto, y ese
-- número se reconoce en pesos, no traducido.
--
-- price_usd es NULL cuando el instrumento cotiza en pesos y no hay ninguna
-- cotización del dólar hasta esa fecha. Null y no un número inventado: quien
-- lee decide qué hacer con un precio que no se puede expresar en dólares (los
-- lectores caen a la valuación manual, igual que si la API estuviera caída).
--
-- Sobre permisos: más abajo se le pone security_invoker (la vista se ejecuta
-- con los permisos de quien consulta, no del dueño), que es lo correcto y lo
-- que recomienda Supabase. Se aplica condicionalmente porque esa opción existe
-- desde Postgres 15. En 14 la vista queda con los permisos del dueño, lo que
-- acá no expone nada: las dos tablas que lee son catálogo COMPARTIDO, con
-- SELECT para authenticated y ninguna policy de escritura, y el grant de abajo
-- es solo de SELECT y solo a authenticated. No hay datos de ningún usuario
-- detrás de esta vista.
create or replace view public.instrument_prices_usd as
with fx as (
  select id
  from instruments
  where source = 'mep' and symbol = 'mep'
)
select
  ip.instrument_id,
  ip.date,
  ip.price                as price_native,
  i.currency              as native_currency,
  case
    when i.currency = 'USD' then ip.price
    when rate.price > 0    then ip.price / rate.price
    else null
  end                     as price_usd
from instrument_prices ip
join instruments i on i.id = ip.instrument_id
left join lateral (
  select mp.price
  from instrument_prices mp
  where mp.instrument_id = (select id from fx)
    and mp.date <= ip.date
    and i.currency <> 'USD'   -- las que ya están en dólares no buscan cotización
  order by mp.date desc
  limit 1
) rate on true;

-- security_invoker solo existe desde Postgres 15; en 14 se omite (ver arriba).
do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.instrument_prices_usd set (security_invoker = true)';
  end if;
end $$;

comment on view public.instrument_prices_usd is
  'Precios del catálogo ya convertidos a USD al MEP del día de cada precio. Único lugar del sistema donde se divide por la cotización (migración 0026).';

grant select on public.instrument_prices_usd to authenticated;

-- ── get_portfolio_series pasa a leer la vista ───────────────────────────────
-- Único cambio respecto de la 0022: el subselect de precio ahora sale de
-- instrument_prices_usd (price_usd) en vez de instrument_prices (price). Todo
-- el resto de la semántica —incluir archivados, precio de cierre y no en vivo,
-- include_in_total afectando a las dos columnas— queda igual y sigue
-- documentada en la 0022, no se repite acá.
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

  valued as (
    select pad.day,
           pad.contributed,
           pad.counts_in_total,
           case
             when (case when pad.uses_quantity then pad.quantity else pad.contributed end) = 0
               then 0

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

-- ── get_instrument_series también ──────────────────────────────────────────
-- Hoy no la consume la app, pero devolvía precios sin convertir con la misma
-- lógica rota. Se alinea ahora para que no reintroduzca el problema el día que
-- alguien la use. Misma firma y misma forma que en la 0018: un día por fila,
-- carry-forward, security invoker.
create or replace function public.get_instrument_series(
  p_asset_id uuid,
  p_from date,
  p_to date
)
returns table (date date, price numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ),
  target as (
    select a.id, a.instrument_id
    from assets a
    where a.id = p_asset_id
  )
  select days.d as date,
         coalesce(
           (
             select ip.price_usd
             from instrument_prices_usd ip, target t
             where ip.instrument_id = t.instrument_id
               and ip.date <= days.d
               and ip.price_usd is not null
             order by ip.date desc
             limit 1
           ),
           (
             select av.value_usd
             from asset_valuations av, target t
             where av.asset_id = t.id
               and av.date <= days.d
             order by av.date desc
             limit 1
           )
         ) as price
  from days
  order by days.d;
$$;

revoke all on function public.get_instrument_series(uuid, date, date) from public;
grant execute on function public.get_instrument_series(uuid, date, date) to authenticated;
