-- 0042: borrar el ajuste de un conteo borra el conteo entero.
--
-- EL PROBLEMA, tal como se ve en pantalla
-- Tocar "Eliminar movimiento" sobre un "Ajuste de saldo" contestaba con el
-- texto crudo de Postgres:
--
--   update or delete on table "transactions" violates foreign key constraint
--   "liquid_reconciliations_adjustment_transaction_id_fkey" ...
--
-- Son dos problemas en uno. Que el texto de una restricción llegue a la
-- pantalla se arregla en el cliente (src/lib/errors.js, una sola regla para
-- toda la app). Que el movimiento NO SE PUEDA BORRAR se arregla acá.
--
-- POR QUÉ NO ALCANZA CON BORRAR LA TRANSACTION
-- El ajuste no es una fila suelta: es una de las cosas que escribió un conteo.
-- Un conteo escribe, en una sola transacción (reconcile_liquid, 0034/0041):
--
--   · una fila de liquid_reconciliations por cuenta declarada -- el testimonio
--     "declaré tanto en esta cuenta este día";
--   · un "Ajuste de saldo" por moneda, por el NETO -- el gasto real;
--   · un "Reparto entre cuentas" por cada cuenta a la que le falte algo para
--     cuadrar -- plata que estaba en otro lado, que no es gasto.
--
-- Esas piezas se sostienen entre sí: los repartos suman exactamente cero y
-- cada cuenta queda en lo declarado (ADR-016). Borrar UNA rompe la aritmética
-- sin avisar -- si se va el ajuste y quedan los repartos, la app sigue
-- moviendo plata entre cuentas por un conteo que ya no existe; si se va un
-- reparto, esa cuenta queda corrida y las demás no. Y la fila de
-- liquid_reconciliations quedaría afirmando "declaré $X" sobre un ajuste que
-- ya no está.
--
-- REGLA: un conteo se borra entero, igual que una transferencia se borra con
-- sus dos patas (deleteAccountTransfer, 0040; deleteTransfer, 0016). Todo lo
-- que escribió, en una sola operación atómica.
--
-- QUÉ NO SE ROMPE AL BORRARLO
-- Nada más lee liquid_reconciliations: la tabla no es referenciada por ninguna
-- FK, no entra en el export y el disponible no se calcula con ella (sale de
-- los movimientos, get_liquid_by_account). Lo único que se pierde es lo que la
-- fila decía, y se pierde bien:
--   · el "Reconciliada el X" de cada cuenta vuelve al conteo anterior, o
--     desaparece si era el único;
--   · el aviso de "esta operación es anterior a la última vez que contaste X"
--     (retroactiveReconciliation) deja de aparecer para ese tramo, que es lo
--     correcto: ya no hay ningún saldo dado por contado ahí;
--   · el próximo ajuste de esa cuenta vuelve a llamarse "Saldo inicial" si no
--     le queda ningún conteo, que es exactamente lo que pasa.

-- ── 1. Qué filas son el mismo conteo ───────────────────────────────────────
-- Hasta acá no había forma de saberlo: cada fila de liquid_reconciliations era
-- independiente aunque varias se hubieran escrito juntas. Mismo patrón que
-- transfer_id en contributions (0016) y en transactions (0040): una columna
-- nullable con un uuid compartido, sin FK -- agrupa, no referencia.
alter table liquid_reconciliations add column batch_id uuid;

create index if not exists liquid_reconciliations_batch_id_idx
  on liquid_reconciliations(batch_id) where batch_id is not null;

-- ── 2. Los conteos ya guardados ────────────────────────────────────────────
-- Esto NO es inferir: `created_at` es `default now()`, que en Postgres es el
-- reloj de la TRANSACCIÓN, no de la fila. Dos filas con el mismo user_id, la
-- misma fecha y el mismo created_at al microsegundo se escribieron en la misma
-- transacción, y desde la 0034 eso es exactamente "el mismo conteo".
--
-- Las filas anteriores a la 0034 --cuando el cliente iteraba y escribía una
-- por una, cada una en su propia transacción-- quedan cada una con su propio
-- batch_id, que es lo que son: escrituras independientes. Lo mismo pasaría si
-- dos conteos distintos cayeran el mismo día, porque tienen created_at
-- distinto.
update liquid_reconciliations r
   set batch_id = g.batch_id
  from (
    select user_id, date, created_at, gen_random_uuid() as batch_id
      from liquid_reconciliations
     group by user_id, date, created_at
  ) g
 where r.user_id is not distinct from g.user_id
   and r.date is not distinct from g.date
   and r.created_at is not distinct from g.created_at;

-- ── 3. reconcile_liquid sella cada conteo con su batch ─────────────────────
-- Copia de la 0041 con tres líneas nuevas: el uuid del conteo, la columna en
-- el insert y el dato en lo que devuelve. El neteo --qué es gasto, qué es
-- reparto, en qué cuenta va el ajuste-- está documentado en la 0041 y en el
-- ADR-016, y no cambia acá.
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
  -- El identificador de ESTE conteo: lo comparten todas sus filas, y es lo que
  -- después permite borrarlo entero (ver delete_reconciliation). Mismo patrón
  -- que contributions.transfer_id (0016) y transactions.transfer_id (0040).
  v_batch_id uuid := gen_random_uuid();

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
      date, declared_amount, adjustment_transaction_id, redistribution_transaction_id, account_id,
      batch_id
    )
    values (p_date, v_declared, v_adjustment_id, v_redistribution_id, v_account_id, v_batch_id)
    returning id into v_reconciliation_id;

    v_results := v_results || jsonb_build_object(
      'batch_id', v_batch_id,
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

-- ── 4. Borrar un conteo entero, en una sola operación ──────────────────────
-- Recibe el ID de UN movimiento --el que el usuario está mirando cuando toca
-- "Eliminar"-- y borra el conteo al que pertenece: todas sus filas de
-- liquid_reconciliations y todos los movimientos que escribió (el ajuste del
-- neto y los repartos de cada cuenta).
--
-- Va en una función y no en dos DELETE desde el cliente por lo de siempre:
-- supabase-js no puede abrir una transacción, así que un fallo entre el primer
-- delete y el segundo dejaría el conteo a medio borrar -- el testimonio sin
-- sus movimientos, o al revés. Mismo problema y mismo remedio que
-- create_transfer (0017) y reconcile_liquid (0034).
--
-- El orden importa: primero las filas de liquid_reconciliations, que son las
-- que apuntan a los movimientos, y recién después los movimientos. Al revés la
-- FK lo rechazaría, que es justamente el error que originó todo esto.
--
-- SECURITY INVOKER: RLS ("own rows" en las dos tablas) ya filtra todo lo que
-- lee y lo que borra, así que un movimiento de otro usuario simplemente no
-- existe acá. Solo authenticated puede ejecutarla.
create or replace function public.delete_reconciliation(p_transaction_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_date date;
  v_reconciliation_ids uuid[];
  v_transaction_ids uuid[];
  v_deleted_movements int;
begin
  -- La fila del conteo que escribió este movimiento, sea como ajuste o como
  -- reparto. Si no hay ninguna, este movimiento no es parte de un conteo y
  -- quien llama tiene que borrarlo como cualquier otro.
  select r.batch_id, r.date into v_batch_id, v_date
    from liquid_reconciliations r
   where r.adjustment_transaction_id = p_transaction_id
      or r.redistribution_transaction_id = p_transaction_id
   limit 1;

  if not found then
    raise exception 'Este movimiento no es parte de un conteo';
  end if;

  -- Con batch, el conteo entero; sin batch --una fila anterior a esta
  -- migración que quedó sin agrupar-- solo la suya, que es todo lo que se
  -- puede saber que fue escrito junto.
  select array_agg(r.id) into v_reconciliation_ids
    from liquid_reconciliations r
   where (v_batch_id is not null and r.batch_id = v_batch_id)
      or (v_batch_id is null
          and (r.adjustment_transaction_id = p_transaction_id
               or r.redistribution_transaction_id = p_transaction_id));

  -- Todo lo que esas filas escribieron. Una misma fila puede tener los dos:
  -- la cuenta ancla lleva el ajuste del neto y, si le quedó resto, también su
  -- reparto.
  select array_agg(t) into v_transaction_ids
    from (
      select unnest(array[r.adjustment_transaction_id, r.redistribution_transaction_id]) as t
        from liquid_reconciliations r
       where r.id = any (v_reconciliation_ids)
    ) s
   where t is not null;

  delete from liquid_reconciliations where id = any (v_reconciliation_ids);

  delete from transactions where id = any (coalesce(v_transaction_ids, '{}'::uuid[]));
  get diagnostics v_deleted_movements = row_count;

  return jsonb_build_object(
    'date', v_date,
    'deleted_movements', v_deleted_movements,
    'deleted_reconciliations', coalesce(array_length(v_reconciliation_ids, 1), 0)
  );
end;
$$;

revoke all on function public.delete_reconciliation(uuid) from public;
grant execute on function public.delete_reconciliation(uuid) to authenticated;

-- Verificación (correr a mano después de aplicar):
--
--   -- Ninguna fila quedó sin agrupar:
--   select count(*) from liquid_reconciliations where batch_id is null;
--   -- Cuántas filas tiene cada conteo (una por cuenta declarada):
--   select batch_id, date, count(*) from liquid_reconciliations
--    group by batch_id, date order by date desc limit 10;
