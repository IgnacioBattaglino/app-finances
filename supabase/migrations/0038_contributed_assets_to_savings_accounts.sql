-- 0038: los activos "Vale lo que pusiste" dejan de ser activos y pasan a ser
-- cuentas de ahorro.
--
-- EL RAZONAMIENTO
-- Un activo con valuation_mode = 'contributed' vale exactamente lo que
-- aportaste y nunca cambia de valor. Eso no es una inversión: es plata
-- guardada. Desde la 0036 el lugar correcto para la plata guardada existe --
-- una cuenta con is_savings = true-- así que el modo deja de tener razón de
-- ser y sus activos se mudan.
--
-- NO SE TOCA 'manual'. Un auto o un depto tampoco cotizan, pero SÍ cambian de
-- valor: la valuación periódica sigue siendo un modo válido y no entra acá.
--
-- ── CÓMO SE CONVIERTE CADA FILA ────────────────────────────────────────────
-- Una contribution con affects_liquid = true ya es un evento de DOS lados
-- guardado en una sola fila: "entraron 400 dólares al activo" y "salieron
-- 400 × MEP pesos de la cuenta Y". El disponible lee un lado, el portafolio
-- lee el otro.
--
-- Después de esta migración el evento sigue teniendo dos lados: los pesos
-- salieron de la cuenta Y (igual que antes) y los dólares entraron a la cuenta
-- de ahorro Z. El lado en pesos YA ESTÁ ESCRITO y es correcto. Así que las
-- filas de contributions NO SE TOCAN: lo único que falta es el lado en
-- dólares, que hoy no existe como movimiento de ninguna cuenta, y eso es lo
-- que esta migración escribe -- una transaction por operación, en USD, con su
-- fecha original.
--
-- Por qué no convertir también el lado en pesos (borrar la contribution y
-- escribir un gasto en pesos + un ingreso en dólares), que sería el modelo más
-- prolijo:
--
--   1. MOVERÍA EL DISPONIBLE. La base multiplica amount_usd × mep_rate en
--      numeric y suma sin redondear; una transaction es numeric(14,2), así que
--      habría que redondear fila por fila, y la suma de redondeos no es el
--      redondeo de la suma. La deriva es de centésimas de centavo, pero "da lo
--      mismo" no puede depender de que los números tengan suerte.
--   2. PERDERÍA EL TIPO DE CAMBIO CONGELADO. El mep_rate de cada aporte es un
--      hecho del evento (ADR-013). Dos transactions sueltas lo dejan implícito
--      y sin forma de recuperarlo.
--   3. REESCRIBIRÍA LA HISTORIA VISIBLE. Esas operaciones dejarían de ser
--      "Inversión" en Movimientos y pasarían a Gastos, cambiando el balance de
--      meses ya cerrados. Y las patas de transferencia quedarían HUÉRFANAS: la
--      contraparte vive en un activo que sobrevive, y borrar un lado dejaría
--      un transfer_id con una sola pata (getTransferPair mostraría un vínculo
--      roto).
--
-- Al no borrar nada, las patas de transferencia no necesitan ningún trato
-- especial: las dos siguen existiendo con su transfer_id compartido, y el
-- activo que sobrevive no se entera.
--
-- ── QUÉ PASA CON EL ACTIVO VIEJO ───────────────────────────────────────────
-- Nada se borra: es la doctrina del proyecto ("nada se borra si tiene
-- historia") y acá además es lo que hace que todo lo de arriba funcione. El
-- activo queda archivado y con savings_account_id apuntando a la cuenta en la
-- que se convirtió. Sus contributions y sus asset_valuations quedan donde
-- están.
--
-- Requiere la 0037: los movimientos nuevos necesitan la categoría del sistema
-- "Movimiento de ahorro", y esa categoría solo se puede distinguir de "Ajuste
-- de saldo" por la llave que agrega la 0037.

-- ── 1. La categoría del sistema para los movimientos de ahorro ─────────────
-- transactions.category_id es NOT NULL, así que los movimientos migrados
-- necesitan una categoría. Que sea del sistema no es cosmético: getExpenses
-- filtra is_system, así que un retiro de una cuenta de ahorro NO va a contarse
-- como gasto en el bloque de Inicio.
insert into public.categories (user_id, name, kind, is_system, system_key, position)
select u.id, 'Movimiento de ahorro', k.kind, true, 'savings_movement', 101
from auth.users u
cross join (values ('expense'), ('income')) as k(kind)
where not exists (
  select 1 from public.categories c
  where c.user_id = u.id and c.system_key = 'savings_movement' and c.kind = k.kind
);

-- ── 2. handle_new_user: los usuarios nuevos nacen con las cuatro ───────────
-- Copia de la versión vigente (0032) con el insert de categorías del sistema
-- ampliado y con la llave de la 0037 en las cuatro. Todo lo demás queda igual.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Categorías iniciales de gasto e ingreso, en el orden en que se muestran
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

  -- Categorías del sistema. Se buscan por system_key (0037), nunca por nombre
  -- ni por el flag is_system solo, que ya no distingue una de otra.
  insert into public.categories (name, kind, user_id, is_system, system_key, position) values
    ('Ajuste de saldo',      'expense', new.id, true, 'balance_adjustment', 100),
    ('Ajuste de saldo',      'income',  new.id, true, 'balance_adjustment', 100),
    ('Movimiento de ahorro', 'expense', new.id, true, 'savings_movement',   101),
    ('Movimiento de ahorro', 'income',  new.id, true, 'savings_movement',   101);

  -- Bolsas de activos default. valuation_mode ya no se siembra acá: vive en
  -- assets, se elige por activo.
  insert into public.asset_types (user_id, name, earns_yield, include_in_total, display_order) values
    (new.id, 'Cripto', true, true, 1),
    (new.id, 'CEDEARs', true, true, 2),
    (new.id, 'Renta fija', true, true, 3),
    (new.id, 'Fondos', true, true, 4),
    (new.id, 'Efectivo USD', false, true, 5);

  -- Cuenta inicial del disponible (0032). Una sola: el usuario que no quiere
  -- pensar en cuentas carga todo acá sin tocar el selector.
  insert into public.liquid_accounts (user_id, name, position) values
    (new.id, 'Efectivo', 0);

  -- Fila de settings con valores por defecto
  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;

-- ── 3. El vínculo activo → cuenta en la que se convirtió ───────────────────
-- Nullable: solo lo llevan los activos migrados. No es "el activo tiene una
-- cuenta asociada" -- es "esto DEJÓ DE SER un activo, y acá está en qué se
-- convirtió". Por eso es el criterio de exclusión de get_portfolio_series más
-- abajo, y no un proxy como `valuation_mode = 'contributed'`: excluye
-- exactamente los que se migraron, ni uno más.
alter table assets add column savings_account_id uuid references liquid_accounts(id);

create index idx_assets_savings_account on assets(savings_account_id);

-- ── 4. Guardas: parar antes de escribir, no a mitad de camino ──────────────
-- Si el nombre del activo choca con una cuenta que ya existe, la migración
-- ABORTA con un mensaje claro en vez de inventar un sufijo. Renombrar por
-- nuestra cuenta una cuenta del usuario es peor que parar: el nombre lo elige
-- él, a mano, y después se corre esto de nuevo.
do $$
declare
  v_conflict text;
begin
  select string_agg(format('%s (usuario %s)', a.name, a.user_id), ', ')
    into v_conflict
    from assets a
   where a.valuation_mode = 'contributed'
     and a.savings_account_id is null
     and exists (
       select 1 from liquid_accounts la
        where la.user_id = a.user_id and lower(la.name) = lower(a.name)
     );

  if v_conflict is not null then
    raise exception
      'Hay activos cuyo nombre ya lo usa una cuenta: %. Renombrá uno de los dos y volvé a correr la migración.',
      v_conflict;
  end if;

  -- Y dos activos del mismo usuario con el mismo nombre generarían dos cuentas
  -- indistinguibles. Mismo criterio: para y que decida una persona.
  select string_agg(format('%s (usuario %s)', name, user_id), ', ')
    into v_conflict
    from (
      select a.user_id, a.name
        from assets a
       where a.valuation_mode = 'contributed' and a.savings_account_id is null
       group by a.user_id, a.name
      having count(*) > 1
    ) dup;

  if v_conflict is not null then
    raise exception
      'Hay activos repetidos que generarían cuentas indistinguibles: %. Renombrá uno y volvé a correr la migración.',
      v_conflict;
  end if;
end $$;

-- ── 5. La migración de datos ───────────────────────────────────────────────
-- Un loop y no un insert masivo a propósito: hay que crear una cuenta, saber
-- su id, y recién ahí escribir sus movimientos. Con dos activos del mismo
-- usuario y el mismo nombre no se podría mapear de vuelta desde un `returning`
-- -- por eso además la guarda de arriba.
--
-- OJO CON user_id: esta migración la corre el rol postgres desde el editor de
-- Supabase, donde auth.uid() es null. Los defaults `user_id = auth.uid()` de
-- liquid_accounts y transactions completarían NULL, así que el user_id se pasa
-- EXPLÍCITO, tomado del activo. Es la única parte del sistema donde el
-- frontend no está en el medio y esa regla no aplica sola.
do $$
declare
  v_asset    record;
  v_account  uuid;
  v_cat_in   uuid;
  v_cat_out  uuid;
  v_position int;
  v_assets   int := 0;
  v_moves    int := 0;
  v_inserted int;
begin
  for v_asset in
    select a.id, a.user_id, a.name, a.is_archived
      from assets a
     where a.valuation_mode = 'contributed'
       and a.savings_account_id is null
     order by a.user_id, a.name
  loop
    select c.id into v_cat_in
      from categories c
     where c.user_id = v_asset.user_id and c.system_key = 'savings_movement' and c.kind = 'income';
    select c.id into v_cat_out
      from categories c
     where c.user_id = v_asset.user_id and c.system_key = 'savings_movement' and c.kind = 'expense';

    if v_cat_in is null or v_cat_out is null then
      raise exception 'Falta la categoría del sistema "Movimiento de ahorro" del usuario %', v_asset.user_id;
    end if;

    -- Al final de la lista del usuario, igual que una cuenta creada a mano: no
    -- se mete entre las que ya ordenó ni le roba el primer lugar a la que los
    -- formularios preseleccionan.
    select coalesce(max(la.position), -1) + 1 into v_position
      from liquid_accounts la where la.user_id = v_asset.user_id;

    -- La cuenta nace archivada si el activo lo estaba: no tiene sentido
    -- ofrecer en un selector una cuenta que corresponde a algo que ya no usás.
    insert into liquid_accounts (user_id, name, position, currency, is_savings, is_archived)
    values (v_asset.user_id, v_asset.name, v_position, 'USD', true, v_asset.is_archived)
    returning id into v_account;

    -- Un movimiento por operación, con SU fecha original. Un aporte entra
    -- (income) y un retiro sale (expense) -- incluidas las patas de
    -- transferencia, que son entradas y salidas como cualquier otra desde el
    -- punto de vista de la cuenta. amount_usd siempre es positivo y el signo
    -- lo pone el kind, igual que en cualquier transaction.
    insert into transactions (user_id, date, kind, category_id, amount, currency, account_id)
    select v_asset.user_id,
           c.date,
           case when c.direction = 'out' then 'expense' else 'income' end,
           case when c.direction = 'out' then v_cat_out else v_cat_in end,
           c.amount_usd,
           'USD',
           v_account
      from contributions c
     where c.asset_id = v_asset.id;

    get diagnostics v_inserted = row_count;

    update assets
       set savings_account_id = v_account,
           is_archived = true
     where id = v_asset.id;

    v_assets := v_assets + 1;
    v_moves  := v_moves + v_inserted;
  end loop;

  raise notice 'Migrados % activos a cuentas de ahorro, con % movimientos.', v_assets, v_moves;
end $$;

-- ── 6. get_portfolio_series deja de contarlos ──────────────────────────────
-- La función incluye los archivados A PROPÓSITO (el portafolio de ayer incluía
-- lo que hoy está archivado), así que archivar no alcanza: hay que excluir
-- explícitamente lo que dejó de ser un activo.
--
-- Único cambio respecto de la 0030: el `where a.savings_account_id is null` de
-- my_assets. Toda la semántica de la cascada --posición cerrada por aportado
-- neto, live sin cantidad, precio de instrument_prices_usd, include_in_total
-- afectando a las dos columnas-- queda igual y sigue documentada en la 0022,
-- la 0026 y la 0030.
--
-- CONSECUENCIA ESPERADA, no efecto colateral: las dos líneas del gráfico bajan
-- la misma cantidad desde la primera operación de cada activo migrado. La
-- ganancia en dólares no cambia (se resta lo mismo arriba y abajo), pero el
-- PORCENTAJE de rendimiento sube, porque el denominador se achica: una bolsa
-- de dólares quietos estaba diluyendo el promedio de lo que sí rinde.
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
    where a.savings_account_id is null
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
             -- que pone un activo en 0 (ver la 0030).
             when pad.contributed <= 0
               then 0

             -- Un live que a ese día todavía no tiene cantidad acumulada vale
             -- lo aportado: la posición existe, lo que falta es el dato de
             -- unidades para valuarla a precio de mercado.
             when pad.valuation_mode = 'live' and pad.quantity = 0
               then pad.contributed

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

             -- Sigue existiendo por si quedara algún activo 'contributed' sin
             -- migrar (un alta hecha entre esta migración y el paso que saca
             -- el modo del formulario). Los migrados ya no llegan hasta acá:
             -- my_assets los dejó afuera.
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

-- Verificación (correr a mano después de aplicar):
--
--   -- 1. Qué se migró, y que el neto de la cuenta sea el aportado del activo.
--   select a.name, la.currency, la.is_savings, la.is_archived,
--          round(sum(case when t.kind = 'income' then t.amount else -t.amount end), 2) as neto_cuenta,
--          round((select sum(case when c.direction = 'out' then -c.amount_usd else c.amount_usd end)
--                   from contributions c where c.asset_id = a.id), 2) as aportado_activo
--     from assets a
--     join liquid_accounts la on la.id = a.savings_account_id
--     left join transactions t on t.account_id = la.id
--    group by a.id, a.name, la.currency, la.is_savings, la.is_archived;
--
--   -- 2. El disponible en pesos NO se movió: nada de lo que lo alimenta se tocó.
--   select account_id, currency, is_savings, amount from get_liquid_by_account()
--    order by is_savings, amount desc;
--
--   -- 3. No quedó ningún activo 'contributed' sin migrar.
--   select count(*) from assets where valuation_mode = 'contributed' and savings_account_id is null;
