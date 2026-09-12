-- 0041: contar la plata registra DOS hechos distintos, no uno solo.
--
-- ── EL BUG, visto en pantalla ──────────────────────────────────────────────
-- Al "Contar mi plata" con varias cuentas, Movimientos mostró un "Gastos" del
-- mes de $1.118.364 con "Ajuste de saldo $711.478" arriba del desglose por
-- categoría: un gasto que no ocurrió. El relevamiento completo está en
-- docs/ux/reconciliacion-y-transferencias.md.
--
-- La causa es que hasta acá reconcile_liquid era un loop puramente POR CUENTA,
-- sin ningún concepto de "total": cada cuenta se comparaba solo contra sí
-- misma y cada diferencia se escribía como un gasto o un ingreso real. Pero
-- contar la plata produce dos hechos a la vez, y sumarlos en uno es lo que
-- inventa números. Si tenías $1.000 en efectivo y $500 en Mercado Pago y
-- contás $800 y $400:
--
--   · Faltan $300 EN TOTAL. Eso sí es un gasto real que no cargaste.
--   · De esos $300, $200 salieron del bolsillo y $100 de Mercado Pago. Eso es
--     el REPARTO: dice dónde estaba la plata, no que hayas gastado de más.
--
-- Y el caso peor: mover plata de una cuenta a otra sin registrarlo (el
-- efectivo baja $5.000, Mercado Pago sube $5.000) se anotaba como un gasto de
-- $5.000 MÁS un ingreso de $5.000. Dos hechos que nunca existieron, sobre un
-- total que no se movió un peso.
--
-- ── LO QUE SE ESCRIBE DESDE ACÁ ────────────────────────────────────────────
--   a) UN movimiento "Ajuste de saldo" por moneda, por el NETO del total. Es
--      el gasto (o ingreso) que de verdad ocurrió, y cuenta como tal en todas
--      las pantallas.
--   b) Un movimiento "Transferencia de cuenta" (la categoría del sistema que
--      nace en esta migración) por cada cuenta a la que le falte algo para
--      cuadrar. No cuenta en ninguna estadística: es plata que cambió de
--      lugar, el mismo contrato que ya tenían las transferencias entre
--      cuentas.
--
-- ── LA ARITMÉTICA, QUE ES LO QUE HACE QUE ESTO CIERRE ──────────────────────
-- Cada cuenta declarada tiene que moverse exactamente lo suyo:
--
--     diff(cuenta) = declarado − calculado
--
-- y el neto de una moneda es, POR DEFINICIÓN, la suma de esos diff: las
-- cuentas que no se declararon no se tocan, así que entran al total con el
-- saldo que ya tenían y no lo mueven (por eso el universo del neteo puede ser
-- "todas las cuentas de esa moneda" sin tener que sumarlas: las no declaradas
-- aportan cero). De ahí:
--
--     neto(moneda) = Σ diff(cuenta de esa moneda)
--
-- El movimiento del neto se anota en UNA de las cuentas declaradas (la
-- "ancla", ver más abajo). A esa cuenta el ajuste ya la movió `neto`, así que
-- le falta `diff − neto`; a las demás les falta `diff` entero. Eso es el
-- reparto, y la suma de todos los repartos es Σ diff − neto = 0: no crea ni
-- destruye plata, solo la corre de cuenta. Por eso cada cuenta queda EXACTA en
-- lo declarado y el total queda exacto, sin resto — que es la propiedad que la
-- reconciliación no puede perder nunca.
--
-- El neteo es POR MONEDA y jamás entre monedas: pesos y dólares no se restan
-- (ADR-015). Cuentas de ahorro y del día a día SÍ se netean entre sí cuando
-- comparten moneda — plata que pasó del bolsillo al ahorro sin registrarse es
-- exactamente el reparto que esto no quiere contar como gasto.
--
-- La misma regla, en JavaScript, es planReconciliation (src/lib/liquid.js):
-- la usa el preview del modal para que lo que se ve antes de guardar y lo que
-- se escribe salgan del mismo cálculo, y src/lib/reconcileSql.test.js corre
-- esta función contra ella. Mismo patrón que computeLiquidByAccount y
-- get_liquid_by_account.
--
-- ── QUÉ NO CAMBIA ──────────────────────────────────────────────────────────
-- El todo-o-nada de la 0034, la foto del disponible tomada ANTES de escribir
-- nada, la validación de pertenencia de cada cuenta, la moneda heredada de la
-- cuenta, "Saldo inicial" vs. "Reconciliación de disponible", y la fila de
-- liquid_reconciliations por cada cuenta declarada tenga o no ajuste. Todo eso
-- está documentado en la 0034 / 0036 / 0037 y no se repite acá.
--
-- Y con UNA sola cuenta declarada el resultado es idéntico al de antes: su
-- diff es el neto, el resto da cero y se escribe un único "Ajuste de saldo",
-- igual que siempre.

-- ══ 1. La categoría del sistema "Transferencia de cuenta" ══════════════════
-- Nace porque 'savings_movement' MIENTE en la mitad de sus usos: transferir de
-- Efectivo a Mercado Pago no es un ahorro, la plata sigue siendo líquida. La
-- llave nueva se queda con las dos cosas que son "plata que cambió de lugar
-- entre dos cuentas" —el reparto de una reconciliación y las transferencias—,
-- y 'savings_movement' queda solo para lo que de verdad es ahorro: los aportes
-- y retiros de una cuenta de ahorro (SavingsMovementModal), que entran o salen
-- desde afuera y no tienen otra cuenta del otro lado.
--
-- position 102: después de las dos que ya viven en 100 y 101, y bien lejos de
-- los números bajos que reasigna la renumeración de reorderCategories.
insert into public.categories (user_id, name, kind, is_system, system_key, position)
select u.id, 'Transferencia de cuenta', k.kind, true, 'account_transfer', 102
from auth.users u
cross join (values ('expense'), ('income')) as k(kind)
where not exists (
  select 1 from public.categories c
  where c.user_id = u.id and c.system_key = 'account_transfer' and c.kind = k.kind
);

-- ── handle_new_user: los usuarios nuevos nacen con las seis ────────────────
-- Copia de la versión vigente (0038) con dos filas más en el insert de
-- categorías del sistema. Todo lo demás queda igual.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
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
    ('Transferencia de cuenta', 'income',  new.id, true, 'account_transfer',   102);

  insert into public.asset_types (user_id, name, earns_yield, include_in_total, display_order) values
    (new.id, 'Cripto', true, true, 1),
    (new.id, 'CEDEARs', true, true, 2),
    (new.id, 'Renta fija', true, true, 3),
    (new.id, 'Fondos', true, true, 4),
    (new.id, 'Efectivo USD', false, true, 5);

  insert into public.liquid_accounts (user_id, name, position) values
    (new.id, 'Efectivo', 0);

  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;

-- ══ 2. Las transferencias que ya están cargadas cambian de etiqueta ════════
-- Es un cambio MECÁNICO de categoría, no una reinterpretación: la fila con
-- transfer_id ya era una transferencia entre dos cuentas, solo que anotada con
-- la llave equivocada. No toca ningún monto, ningún saldo y ninguna cuenta.
--
-- El criterio es `transfer_id is not null`, que es exactamente "esta fila es
-- una de las dos patas de una transferencia" (la escribe create_account_
-- transfer y nadie más, 0040). Los aportes y retiros de una cuenta de ahorro
-- no lo llevan —son una sola fila, sin otra cuenta del otro lado— y por eso
-- quedan donde están, que es lo que corresponde.
--
-- Los ajustes de saldo viejos NO se tocan, a propósito: separarlos en neto y
-- reparto sería decidir retroactivamente qué fue gasto y qué fue reparto sin
-- saber qué pasó ese día. Siguen contando enteros como gasto o ingreso, que es
-- lo que la app venía diciendo de ellos.
update public.transactions t
set category_id = nueva.id
from public.categories vieja, public.categories nueva
where t.transfer_id is not null
  and t.category_id = vieja.id
  and vieja.system_key = 'savings_movement'
  and nueva.user_id = vieja.user_id
  and nueva.kind = vieja.kind
  and nueva.system_key = 'account_transfer';

-- ══ 3. La búsqueda de una categoría del sistema, en un solo lugar ══════════
-- Tres funciones repetían el mismo select con el mismo riesgo (buscar por
-- nombre o por is_system a secas, que desde la 0037 ya no distingue una de
-- otra) y ahora serían cuatro. El error tiene que seguir nombrando la
-- categoría como la ve el usuario, así que la traducción de llave a nombre
-- vive acá y no en cada llamador.
--
-- STABLE y SECURITY INVOKER: solo lee, y lee a través de RLS — la categoría
-- que encuentra es siempre la del usuario que llama.
create or replace function public.system_category_id(p_system_key text, p_kind text)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
    from categories c
   where c.system_key = p_system_key and c.kind = p_kind and c.is_archived = false
   limit 1;

  if v_id is null then
    raise exception 'Falta la categoría del sistema "%" (%). Corré el seed de categorías de ajuste.',
      case p_system_key
        when 'balance_adjustment' then 'Ajuste de saldo'
        when 'savings_movement'   then 'Movimiento de ahorro'
        when 'account_transfer'   then 'Transferencia de cuenta'
        else p_system_key
      end,
      case when p_kind = 'income' then 'ingreso' else 'gasto' end;
  end if;

  return v_id;
end;
$$;

revoke all on function public.system_category_id(text, text) from public;
grant execute on function public.system_category_id(text, text) to authenticated;

-- ══ 4. La reconciliación enlaza también su reparto ═════════════════════════
-- adjustment_transaction_id sigue significando lo mismo (el ajuste del neto, y
-- por eso ahora lo lleva UNA sola fila por moneda: la de la cuenta ancla). El
-- reparto es un movimiento distinto, con otra categoría y otro significado, y
-- por eso va en su propia columna en vez de compartir la primera: una fila que
-- apunta a "algo que se escribió" sin decir qué es no se puede leer después.
alter table liquid_reconciliations
  add column redistribution_transaction_id uuid references transactions(id);

-- ══ 5. create_account_transfer usa la llave nueva ══════════════════════════
-- Único cambio respecto de la 0040: la llave de la categoría (y la búsqueda,
-- que pasa por system_category_id). Los dos montos separados, el transfer_id
-- compartido, la validación de pertenencia y las descripciones con el nombre
-- de la otra cuenta están documentados en la 0040 y no se repiten.
create or replace function public.create_account_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_date date,
  p_from_amount numeric,
  p_to_amount numeric
)
returns setof transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transfer_id uuid := gen_random_uuid();
  v_from liquid_accounts;
  v_to   liquid_accounts;
  v_cat_out uuid;
  v_cat_in  uuid;
begin
  if p_from_account_id = p_to_account_id then
    raise exception 'El origen y el destino tienen que ser cuentas distintas';
  end if;

  select * into v_from from liquid_accounts where id = p_from_account_id and user_id = auth.uid();
  if not found then
    raise exception 'Cuenta de origen inexistente o de otro usuario';
  end if;

  select * into v_to from liquid_accounts where id = p_to_account_id and user_id = auth.uid();
  if not found then
    raise exception 'Cuenta de destino inexistente o de otro usuario';
  end if;

  if coalesce(p_from_amount, 0) <= 0 or coalesce(p_to_amount, 0) <= 0 then
    raise exception 'El monto de la transferencia tiene que ser mayor a cero';
  end if;

  v_cat_out := system_category_id('account_transfer', 'expense');
  v_cat_in  := system_category_id('account_transfer', 'income');

  return query
  insert into transactions (date, kind, category_id, description, amount, currency, account_id, transfer_id)
  values
    (p_date, 'expense', v_cat_out, 'Transferencia a ' || v_to.name,   p_from_amount, v_from.currency, p_from_account_id, v_transfer_id),
    (p_date, 'income',  v_cat_in,  'Transferencia de ' || v_from.name, p_to_amount,   v_to.currency,   p_to_account_id,   v_transfer_id)
  returning *;
end;
$$;

revoke all on function public.create_account_transfer(uuid, uuid, date, numeric, numeric) from public;
grant execute on function public.create_account_transfer(uuid, uuid, date, numeric, numeric) to authenticated;

-- ══ 6. reconcile_liquid, con el neteo ══════════════════════════════════════
-- Pasa a tener DOS pasadas sobre las declaraciones, y esa es toda la
-- diferencia de forma con la 0037:
--
--   1. Describir y validar cada una (cuánto tiene, cuánto declara, de qué
--      moneda es, si es la primera vez). No escribe nada: el neto de una
--      moneda no se sabe hasta haber mirado todas sus cuentas.
--   2. Escribir, ya sabiendo el neto de cada moneda y cuál es su ancla.
--
-- Sigue siendo UNA transacción, así que el todo-o-nada de la 0034 vale igual:
-- una cuenta ajena o un monto inválido en la pasada 1 rechaza sin haber
-- escrito una sola fila.
create or replace function public.reconcile_liquid(
  p_date date,
  p_declarations jsonb  -- [{ "account_id": uuid|null, "declared_amount": numeric }]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_buckets  jsonb;
  v_total    numeric;
  v_reconciled uuid[];
  v_any_reconciliation boolean;

  v_declaration jsonb;
  v_account_id  uuid;
  v_declared    numeric;
  v_current     numeric;
  v_is_first    boolean;
  v_currency    text;
  v_is_savings  boolean;
  v_position    int;
  v_name        text;

  -- Las declaraciones ya descritas, en el orden en que llegaron. El índice de
  -- cada una dentro de este array es su identidad (lo que apunta v_anchors):
  -- account_id no sirve como llave porque puede ser null.
  v_rows    jsonb := '[]'::jsonb;
  v_nets    jsonb;  -- moneda → neto del total de esa moneda
  v_anchors jsonb;  -- moneda → índice de la declaración que lleva el ajuste

  v_row jsonb;
  v_idx bigint;
  v_diff       numeric;
  v_net        numeric;
  v_is_anchor  boolean;
  v_remainder  numeric;
  v_kind       text;
  v_adjustment_id     uuid;
  v_redistribution_id uuid;
  v_reconciliation_id uuid;

  v_results jsonb := '[]'::jsonb;
begin
  if p_declarations is null or jsonb_typeof(p_declarations) <> 'array' then
    raise exception 'Se esperaba una lista de cuentas declaradas';
  end if;
  if jsonb_array_length(p_declarations) = 0 then
    raise exception 'No hay ninguna cuenta declarada para reconciliar';
  end if;

  select coalesce(
           jsonb_object_agg(b.account_id::text, b.amount)
             filter (where b.account_id is not null),
           '{}'::jsonb),
         round(coalesce(sum(b.amount), 0), 2)
    into v_buckets, v_total
    from get_liquid_by_account() b;

  v_reconciled := array(
    select distinct r.account_id from liquid_reconciliations r where r.account_id is not null
  );
  v_any_reconciliation := exists (select 1 from liquid_reconciliations);

  -- ── Pasada 1: describir y validar, sin escribir ──────────────────────────
  for v_declaration in select value from jsonb_array_elements(p_declarations) loop
    v_account_id := nullif(v_declaration ->> 'account_id', '')::uuid;
    v_declared   := (v_declaration ->> 'declared_amount')::numeric;

    if v_declared is null then
      raise exception 'Falta el monto declarado de una de las cuentas';
    end if;

    -- Pertenencia explícita, mismo criterio que create_transfer (0017): el
    -- select ya viene filtrado por RLS, así que una cuenta de otro usuario
    -- simplemente no existe acá. La FK de transactions.account_id no alcanza
    -- --las claves foráneas no miran RLS-- y este chequeo corre ANTES de
    -- cualquier insert, así que rechaza sin escribir nada.
    if v_account_id is not null
       and not exists (select 1 from liquid_accounts la where la.id = v_account_id) then
      raise exception 'Cuenta inexistente o de otro usuario';
    end if;

    if v_account_id is null then
      -- Sin cuenta, se declara el disponible entero (y "es la primera vez" es
      -- no haber reconciliado nunca, ninguna cuenta). Es el camino de antes de
      -- la 0032, el que queda si el usuario no tiene ninguna cuenta cargada:
      -- una sola declaración, en la moneda local, que netea contra sí misma.
      v_current    := v_total;
      v_is_first   := not v_any_reconciliation;
      v_currency   := 'ARS';
      v_is_savings := false;
      v_position   := -1;
      v_name       := '';
    else
      v_current  := round(coalesce((v_buckets ->> v_account_id::text)::numeric, 0), 2);
      v_is_first := not (v_account_id = any (v_reconciled));
      select la.currency, la.is_savings, la.position, la.name
        into v_currency, v_is_savings, v_position, v_name
        from liquid_accounts la where la.id = v_account_id;
    end if;

    v_rows := v_rows || jsonb_build_object(
      'account_id', v_account_id,
      'declared',   v_declared,
      'diff',       round(v_declared - v_current, 2),
      'currency',   coalesce(v_currency, 'ARS'),
      'is_savings', coalesce(v_is_savings, false),
      'position',   coalesce(v_position, 0),
      'name',       coalesce(v_name, ''),
      'is_first',   v_is_first
    );
  end loop;

  -- ── El neto de cada moneda ───────────────────────────────────────────────
  -- Nada se suma entre monedas: el group by ES la regla.
  select coalesce(jsonb_object_agg(s.currency, s.net), '{}'::jsonb) into v_nets
    from (select r ->> 'currency' as currency,
                 round(sum((r ->> 'diff')::numeric), 2) as net
            from jsonb_array_elements(v_rows) r
           group by 1) s;

  -- ── EN QUÉ CUENTA SE ANOTA EL NETO ───────────────────────────────────────
  -- El neto es un hecho del total, no de una cuenta, pero un movimiento tiene
  -- que colgar de algún lado: si colgara de ninguna, los repartos tendrían que
  -- sumar `neto` en vez de cero para que las cuentas cuadren, y el total
  -- quedaría contando ese neto dos veces.
  --
  -- El orden de preferencia es explícito y TOTAL — nada acá puede depender del
  -- orden en que la base devuelva las filas:
  --
  --   1. La cuenta que deja MENOS resto sin explicar (|diff − neto| más
  --      chico). Es la que mejor explica el faltante, y cuando una sola cuenta
  --      cambió y las demás coinciden, su diff ES el neto: el resto da cero y
  --      no se escribe ningún reparto. El caso más común queda con un solo
  --      movimiento, igual que antes de esta migración.
  --   2. Una cuenta del día a día antes que una de ahorro (false < true). Solo
  --      desempata: la visibilidad del gasto ya no depende de esto --
  --      Movimientos lista los ajustes de saldo aunque estén en una cuenta de
  --      ahorro-- pero un gasto real se lee mejor en la cuenta con la que se
  --      vive.
  --   3. El orden de la pantalla (position), y después el nombre y el id:
  --      tres desempates que hacen la elección determinística hasta el final.
  select coalesce(jsonb_object_agg(s.currency, s.idx), '{}'::jsonb) into v_anchors
    from (select r ->> 'currency' as currency,
                 (array_agg(idx order by
                    abs(round((r ->> 'diff')::numeric
                              - (v_nets ->> (r ->> 'currency'))::numeric, 2)),
                    (r ->> 'is_savings')::boolean,
                    (r ->> 'position')::int,
                    r ->> 'name',
                    coalesce(r ->> 'account_id', '')
                 ))[1] as idx
            from jsonb_array_elements(v_rows) with ordinality as e(r, idx)
           group by 1) s;

  -- ── Pasada 2: escribir ───────────────────────────────────────────────────
  for v_row, v_idx in
    select r, idx from jsonb_array_elements(v_rows) with ordinality as e(r, idx)
  loop
    v_account_id := nullif(v_row ->> 'account_id', '')::uuid;
    v_declared   := (v_row ->> 'declared')::numeric;
    v_diff       := (v_row ->> 'diff')::numeric;
    v_currency   := v_row ->> 'currency';
    v_net        := (v_nets ->> v_currency)::numeric;

    -- Menos de un centavo de neto no es una diferencia: no hay ajuste en
    -- ninguna cuenta de esa moneda, y a cada una le falta su diff entero (que
    -- entre todas sigue sumando cero).
    v_is_anchor := abs(v_net) >= 0.01 and (v_anchors ->> v_currency)::bigint = v_idx;

    v_adjustment_id     := null;
    v_redistribution_id := null;

    -- (a) El gasto o ingreso que de verdad ocurrió, por el neto de la moneda.
    if v_is_anchor then
      v_kind := case when v_net > 0 then 'income' else 'expense' end;
      insert into transactions (date, kind, category_id, description, amount, currency, account_id)
      values (
        p_date,
        v_kind,
        system_category_id('balance_adjustment', v_kind),
        case when (v_row ->> 'is_first')::boolean then 'Saldo inicial'
             else 'Reconciliación de disponible' end,
        abs(v_net),
        v_currency,
        v_account_id
      )
      returning id into v_adjustment_id;
    end if;

    -- (b) Lo que le falta a ESTA cuenta para quedar en lo declarado. No es un
    -- gasto ni un ingreso: es plata que estaba en otra cuenta.
    v_remainder := round(v_diff - case when v_is_anchor then v_net else 0 end, 2);
    if abs(v_remainder) >= 0.01 then
      v_kind := case when v_remainder > 0 then 'income' else 'expense' end;
      insert into transactions (date, kind, category_id, description, amount, currency, account_id)
      values (
        p_date,
        v_kind,
        system_category_id('account_transfer', v_kind),
        'Reparto entre cuentas',
        abs(v_remainder),
        v_currency,
        v_account_id
      )
      returning id into v_redistribution_id;
    end if;

    insert into liquid_reconciliations (
      date, declared_amount, adjustment_transaction_id, redistribution_transaction_id, account_id
    )
    values (p_date, v_declared, v_adjustment_id, v_redistribution_id, v_account_id)
    returning id into v_reconciliation_id;

    v_results := v_results || jsonb_build_object(
      'account_id', v_account_id,
      'reconciliation_id', v_reconciliation_id,
      'adjustment_transaction_id', v_adjustment_id,
      'redistribution_transaction_id', v_redistribution_id,
      'difference', v_diff,
      'net', v_net
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.reconcile_liquid(date, jsonb) from public;
grant execute on function public.reconcile_liquid(date, jsonb) to authenticated;

-- ── Verificación (correr a mano después de aplicar) ────────────────────────
-- 1. Las seis categorías del sistema, con sus llaves, para tu usuario:
--
--   select kind, name, system_key, position from categories
--    where is_system order by system_key, kind;
--
-- 2. Ninguna pata de transferencia quedó con la llave vieja (tiene que dar 0):
--
--   select count(*) from transactions t join categories c on c.id = t.category_id
--    where t.transfer_id is not null and c.system_key = 'savings_movement';
--
-- 3. El disponible por cuenta NO se movió: esta migración no toca montos.
--    Correr antes y después, y comparar centavo a centavo:
--
--   select account_id, currency, is_savings, amount from get_liquid_by_account()
--    order by amount desc;

-- ── Vuelta atrás ───────────────────────────────────────────────────────────
-- La categoría nueva puede quedar donde está (una categoría de más no rompe
-- nada), pero las transferencias tienen que volver a su llave vieja o el
-- código anterior las contaría como gasto. Correr ENTERO:
--
--   update public.transactions t set category_id = vieja.id
--     from public.categories nueva, public.categories vieja
--    where t.transfer_id is not null and t.category_id = nueva.id
--      and nueva.system_key = 'account_transfer'
--      and vieja.user_id = nueva.user_id and vieja.kind = nueva.kind
--      and vieja.system_key = 'savings_movement';
--   alter table liquid_reconciliations drop column redistribution_transaction_id;
--
-- y después volver a correr, tal cual, 0037_categories_system_key.sql y
-- 0040_account_transfers.sql, que redefinen las dos funciones como estaban
-- (system_category_id queda sin llamadores, inofensiva).
