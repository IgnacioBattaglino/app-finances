-- 0037: las categorías del sistema pasan a identificarse por una llave estable.
--
-- EL PROBLEMA, que estaba latente
-- reconcile_liquid (0034, vigente en la 0036) busca la categoría del ajuste
-- así:
--
--   where c.is_system = true and c.kind = v_kind and c.is_archived = false
--   limit 1
--
-- Eso funcionaba porque había UNA sola categoría del sistema por kind: "Ajuste
-- de saldo". En cuanto exista una segunda --y la 0038 necesita una,
-- "Movimiento de ahorro", para los movimientos de las cuentas de ahorro-- ese
-- `limit 1` elige cualquiera de las dos. El ajuste de una reconciliación
-- podría quedar categorizado como movimiento de ahorro, en silencio, sin nada
-- que lo delate hasta que alguien mire la lista de gastos y no entienda.
--
-- LA DECISIÓN
-- La misma que el proyecto ya viene aplicando: buscar por una LLAVE DE MÁQUINA
-- y no por el nombre visible ni por un flag ambiguo. `is_system` sigue
-- significando lo que significaba --"esta categoría la maneja la app, no se
-- renombra ni se borra", y es lo que mira getExpenses para no contarla como
-- gasto--; `system_key` dice CUÁL es.
--
-- Esta migración no cambia ningún número ni ninguna pantalla: agrega la
-- columna, la completa para lo que ya existe, y hace que reconcile_liquid la
-- use. La categoría nueva y su uso llegan en la 0038.

-- ── 1. La columna ─────────────────────────────────────────────────────────
-- Nullable: solo la llevan las del sistema. Las categorías normales del
-- usuario no tienen llave porque no hay código que las busque -- las elige él.
alter table categories add column system_key text;

-- Todas las del sistema que existen hoy son "Ajuste de saldo" (0012).
update categories set system_key = 'balance_adjustment' where is_system = true;

-- Una sola categoría del sistema por llave y kind por usuario. Es el índice el
-- que garantiza que el `limit 1` de reconcile_liquid no pueda volver a ser
-- ambiguo -- no una convención que haya que recordar.
create unique index idx_categories_system_key
  on categories(user_id, system_key, kind)
  where system_key is not null;

-- ── 2. reconcile_liquid busca su categoría por llave ───────────────────────
-- Único cambio respecto de la 0036: el `where` que elige la categoría del
-- ajuste, que ahora va por llave. Todo lo demás --el todo-o-nada, la foto del
-- disponible antes de escribir, la moneda heredada de la cuenta, "Saldo
-- inicial" vs. "Reconciliación de disponible"-- está documentado en la 0034 y
-- la 0036 y no se repite acá.
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
  v_difference  numeric;
  v_is_first    boolean;
  v_kind        text;
  v_currency    text;
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
      v_current  := v_total;
      v_is_first := not v_any_reconciliation;
      v_currency := 'ARS';
    else
      v_current  := round(coalesce((v_buckets ->> v_account_id::text)::numeric, 0), 2);
      v_is_first := not (v_account_id = any (v_reconciled));
      select la.currency into v_currency
        from liquid_accounts la where la.id = v_account_id;
    end if;

    v_difference    := round(v_declared - v_current, 2);
    v_adjustment_id := null;

    -- Menos de un centavo de diferencia no es una diferencia.
    if abs(v_difference) >= 0.01 then
      v_kind := case when v_difference > 0 then 'income' else 'expense' end;

      -- Por la LLAVE, nunca por el nombre visible ni por is_system a secas:
      -- desde la 0037 hay más de una categoría del sistema por kind.
      select c.id into v_category_id
        from categories c
       where c.system_key = 'balance_adjustment' and c.kind = v_kind and c.is_archived = false
       limit 1;

      if v_category_id is null then
        raise exception
          'Falta la categoría del sistema "Ajuste de saldo" (%). Corré el seed de categorías de ajuste.',
          case when v_kind = 'income' then 'ingreso' else 'gasto' end;
      end if;

      insert into transactions (date, kind, category_id, description, amount, currency, account_id)
      values (
        p_date,
        v_kind,
        v_category_id,
        case when v_is_first then 'Saldo inicial' else 'Reconciliación de disponible' end,
        abs(v_difference),
        coalesce(v_currency, 'ARS'),
        v_account_id
      )
      returning id into v_adjustment_id;
    end if;

    insert into liquid_reconciliations (date, declared_amount, adjustment_transaction_id, account_id)
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

revoke all on function public.reconcile_liquid(date, jsonb) from public;
grant execute on function public.reconcile_liquid(date, jsonb) to authenticated;

-- Verificación (correr a mano después de aplicar; la segunda tiene que dar 0):
--
--   select user_id, kind, name, system_key from categories
--    where is_system = true order by user_id, kind;
--   select count(*) from categories where is_system = true and system_key is null;
