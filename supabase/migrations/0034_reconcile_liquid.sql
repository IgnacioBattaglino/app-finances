-- 0034: la reconciliación del disponible se guarda ENTERA o no se guarda.
--
-- Hasta acá `reconcile` (lib/liquid.js) hacía hasta TRES escrituras sueltas por
-- cada cuenta declarada --buscar la categoría del sistema, insertar el ajuste
-- en transactions, insertar la fila en liquid_reconciliations-- una atrás de la
-- otra, sin transacción. El cliente de Supabase no puede envolver varios
-- inserts en una: cada llamada es su propia transacción.
--
-- Eso deja el peor final posible para una pantalla de plata: si la escritura
-- número cuatro falla, las tres anteriores YA ESTÁN GUARDADAS, pero la app
-- muestra "no se pudo guardar la reconciliación" -- y el usuario, que le cree,
-- reintenta. El reintento vuelve a comparar contra un disponible que ya
-- incluye el ajuste a medio escribir, y termina con dos ajustes, dos filas de
-- reconciliación y una cuenta cuadrada dos veces.
--
-- REGLA: todo o nada. Todas las cuentas declaradas, sus ajustes y sus filas de
-- reconciliación entran en UNA sola llamada, que es UNA sola transacción. Si
-- algo falla --una cuenta ajena, un monto negativo, la categoría del sistema
-- que no está-- no queda ningún rastro parcial y reintentar es seguro.
--
-- Mismo patrón que create_transfer (0017), que nació del mismo problema: dos
-- escrituras sueltas que podían dejar un retiro huérfano.
--
-- security invoker, igual que create_transfer (0017) y get_liquid_by_account
-- (0033): corre con los permisos de quien llama, así que RLS sigue filtrando
-- todo lo que la función lee (el disponible, las categorías, las
-- reconciliaciones previas) y los defaults `user_id = auth.uid()` completan lo
-- que escribe. El frontend nunca manda user_id, tampoco por acá.
--
-- QUÉ NO CAMBIA: la regla de negocio es la misma que venía aplicando el
-- cliente, movida tal cual.
--   · El disponible calculado de cada cuenta sale de get_liquid_by_account()
--     (0033), no se reimplementa la suma acá.
--   · Una declaración sin cuenta (account_id null) declara el disponible
--     ENTERO, no el balde "sin cuenta": es el camino de antes de la 0032, el
--     que queda si el usuario no tiene ninguna cuenta cargada.
--   · Diferencia por debajo del centavo no genera ajuste, pero la cuenta igual
--     graba su fila: "declaré esto en esta fecha" es el dato que después dice
--     hasta cuándo está conciliada cada cuenta.
--   · El primer ajuste de una cuenta que nunca se reconcilió se llama "Saldo
--     inicial"; los siguientes, "Reconciliación de disponible".

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
  -- El disponible se fotografía ANTES de escribir nada, igual que hacía el
  -- cliente al pedir computeCurrentLiquid() una sola vez: si se recalculara
  -- dentro del loop, el ajuste de la primera cuenta ya estaría contado al
  -- llegar a la segunda.
  v_buckets  jsonb;    -- account_id::text → disponible de esa cuenta
  v_total    numeric;  -- el disponible entero (todos los baldes, huérfanos incluidos)
  v_reconciled uuid[]; -- cuentas que YA tienen alguna reconciliación
  v_any_reconciliation boolean; -- ¿hubo alguna reconciliación, de cualquier cuenta?

  v_declaration jsonb;
  v_account_id  uuid;
  v_declared    numeric;
  v_current     numeric;
  v_difference  numeric;
  v_is_first    boolean;
  v_kind        text;
  v_category_id uuid;
  v_adjustment_id     uuid;
  v_reconciliation_id uuid;

  v_results jsonb := '[]'::jsonb;
begin
  if p_declarations is null or jsonb_typeof(p_declarations) <> 'array' then
    raise exception 'Se esperaba una lista de cuentas declaradas';
  end if;
  if jsonb_array_length(p_declarations) = 0 then
    raise exception 'No hay ninguna cuenta declarada para reconciliar';
  end if;

  -- El balde null de get_liquid_by_account() ("sin cuenta") no entra al mapa
  -- por cuenta --no es una cuenta declarable-- pero sí al total, que suma
  -- TODOS los baldes: su plata existe.
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

  -- jsonb_array_elements respeta el orden del array, así que los ajustes
  -- quedan escritos en el mismo orden en que el usuario ve las cuentas.
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
      -- no haber reconciliado nunca, ninguna cuenta).
      v_current  := v_total;
      v_is_first := not v_any_reconciliation;
    else
      v_current  := round(coalesce((v_buckets ->> v_account_id::text)::numeric, 0), 2);
      v_is_first := not (v_account_id = any (v_reconciled));
    end if;

    v_difference    := round(v_declared - v_current, 2);
    v_adjustment_id := null;

    -- Menos de un centavo de diferencia no es una diferencia.
    if abs(v_difference) >= 0.01 then
      v_kind := case when v_difference > 0 then 'income' else 'expense' end;

      -- Por el flag, nunca por el nombre visible: un rename (que la UI
      -- bloquea, pero podría pasar por fuera) no rompe la reconciliación.
      select c.id into v_category_id
        from categories c
       where c.is_system = true and c.kind = v_kind and c.is_archived = false
       limit 1;

      if v_category_id is null then
        raise exception
          'Falta la categoría del sistema "Ajuste de saldo" (%). Corré el seed de categorías de ajuste.',
          case when v_kind = 'income' then 'ingreso' else 'gasto' end;
      end if;

      insert into transactions (date, kind, category_id, description, amount_ars, account_id)
      values (
        p_date,
        v_kind,
        v_category_id,
        case when v_is_first then 'Saldo inicial' else 'Reconciliación de disponible' end,
        abs(v_difference),
        v_account_id
      )
      returning id into v_adjustment_id;
    end if;

    insert into liquid_reconciliations (date, declared_amount_ars, adjustment_transaction_id, account_id)
    values (p_date, v_declared, v_adjustment_id, v_account_id)
    returning id into v_reconciliation_id;

    v_results := v_results || jsonb_build_object(
      'account_id', v_account_id,
      'reconciliation_id', v_reconciliation_id,
      'adjustment_transaction_id', v_adjustment_id,
      'difference', v_difference
    );
  end loop;

  return v_results;
end;
$$;

-- Solo usuarios autenticados, igual que create_transfer: la app es de registro
-- semi-cerrado y anon no opera.
revoke all on function public.reconcile_liquid(date, jsonb) from public;
grant execute on function public.reconcile_liquid(date, jsonb) to authenticated;

-- Verificación (correr a mano después de aplicar, con una cuenta propia y el
-- monto que ya tiene: no debería generar ningún ajuste, solo la fila de
-- reconciliación):
--
--   select reconcile_liquid(current_date, jsonb_build_array(
--     jsonb_build_object('account_id', '<uuid de la cuenta>', 'declared_amount', <lo que dice la app>)
--   ));
