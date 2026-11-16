-- 0064: la vista previa de un conteo, y borrar solo el último conteo de cada moneda.
--
-- ══ 1. get_reconciliation_preview ═══════════════════════════════════════════
--
-- "Contar disponible" tiene dos pasos (ADR-026): se cuenta, y antes de guardar
-- se muestra qué se va a registrar — cuánto esperaba la app en cada cuenta y
-- qué movimientos se crean (el ajuste del neto y los repartos). Hasta acá ese
-- cálculo existía solo en el cliente (planReconciliation, lib/liquid.js), que
-- es una segunda copia de la regla que reconcile_liquid aplica al escribir.
--
-- Acá NO hay una tercera copia. La vista previa llama a reconcile_liquid de
-- verdad, mira lo que escribió, y deshace todo: un bloque con su propio punto
-- de guardado que termina siempre en una excepción propia. Lo que se muestra
-- antes de guardar es, por construcción, lo que se va a guardar — no puede
-- desalinearse, porque es el mismo código.
--
-- No escribe nada (todo lo que hace se deshace), pero no puede declararse
-- `stable`: por adentro inserta. Los errores de validación de reconcile_liquid
-- (una cuenta ajena, un monto que falta) salen tal cual, en castellano.
--
-- Devuelve:
--   accounts   una fila por cuenta declarada: lo que la app esperaba, lo
--              contado y la diferencia
--   movements  lo que se registraría, primero los ajustes: tipo (gasto o
--              ingreso), monto, moneda, cuenta y qué es (`system_key`:
--              'balance_adjustment' = dinero que de verdad falta o sobra;
--              'account_transfer' = dinero que estaba en otra cuenta)

create or replace function public.get_reconciliation_preview(
  p_date date,
  p_declarations jsonb  -- [{ "account_id": uuid, "declared_amount": numeric }]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result  jsonb;
  v_preview jsonb;
begin
  begin
    v_result := reconcile_liquid(p_date, p_declarations);

    select jsonb_build_object(
      'accounts', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'account_id', lr.account_id,
                 'name', la.name,
                 'currency', coalesce(la.currency, 'ARS'),
                 'expected', lr.declared_amount - (e.value ->> 'difference')::numeric,
                 'declared', lr.declared_amount,
                 'difference', (e.value ->> 'difference')::numeric
               ) order by e.ordinality)
          from jsonb_array_elements(v_result) with ordinality e
          join liquid_reconciliations lr on lr.id = (e.value ->> 'reconciliation_id')::uuid
          left join liquid_accounts la on la.id = lr.account_id
      ), '[]'::jsonb),
      'movements', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'account_id', t.account_id,
                 'account_name', la.name,
                 'kind', t.kind,
                 'amount', t.amount,
                 'currency', t.currency,
                 'system_key', c.system_key
               ) order by (c.system_key <> 'balance_adjustment'), e.ordinality)
          from jsonb_array_elements(v_result) with ordinality e
          cross join lateral (values
            ((e.value ->> 'adjustment_transaction_id')::uuid),
            ((e.value ->> 'redistribution_transaction_id')::uuid)
          ) as written(id)
          join transactions t on t.id = written.id
          join categories c on c.id = t.category_id
          left join liquid_accounts la on la.id = t.account_id
      ), '[]'::jsonb)
    ) into v_preview;

    -- Siempre: deshace el conteo recién escrito. Las variables de la función
    -- sobreviven a la vuelta atrás; las filas, no.
    raise exception using errcode = 'EC001', message = 'vista previa';
  exception when sqlstate 'EC001' then
    null;
  end;

  return v_preview;
end;
$$;

revoke all on function public.get_reconciliation_preview(date, jsonb) from public, anon;
grant execute on function public.get_reconciliation_preview(date, jsonb) to authenticated;

-- ══ 2. Solo se borra el último conteo de cada moneda ════════════════════════
--
-- delete_reconciliation (0042) dejaba borrar cualquier conteo, también uno con
-- conteos posteriores, y los de después quedaban desfasados (verificado el
-- 2026-10-09, docs/producto/verificaciones-2026-10.md punto 3). ADR-026 pide
-- que la regla viva en la base y no solo en el botón. Es la misma función de
-- la 0042 con ese chequeo antes de borrar; un conteo no se edita: se borra el
-- último y se rehace.

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

  -- 0064: solo se borra el ÚLTIMO conteo de cada moneda. Un conteo posterior
  -- calculó lo que "esperaba" con los ajustes de este adentro: si este se
  -- borra, el de después queda con un ajuste que ya no cierra con nada.
  -- "Posterior" es por cuándo se hizo (created_at), no por su fecha: lo que
  -- importa es qué historial tenía a la vista cada conteo al calcular.
  if exists (
    select 1
      from liquid_reconciliations later
      left join liquid_accounts la on la.id = later.account_id
     where later.id <> all (v_reconciliation_ids)
       and later.created_at > (select max(r.created_at) from liquid_reconciliations r
                                where r.id = any (v_reconciliation_ids))
       and coalesce(la.currency, 'ARS') in (
             select coalesce(a.currency, 'ARS')
               from liquid_reconciliations r
               left join liquid_accounts a on a.id = r.account_id
              where r.id = any (v_reconciliation_ids))
  ) then
    raise exception 'Después de este conteo hiciste otro en la misma moneda. Borrá primero el más nuevo.';
  end if;

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

revoke all on function public.delete_reconciliation(uuid) from public, anon;
grant execute on function public.delete_reconciliation(uuid) to authenticated;

-- Verificación después de aplicar (solo lectura). Tiene que dar ok = true:
--
--   select has_function_privilege('authenticated', 'public.get_reconciliation_preview(date, jsonb)', 'execute')
--      and not has_function_privilege('anon', 'public.get_reconciliation_preview(date, jsonb)', 'execute')
--      and position('Borrá primero el más nuevo' in
--            (select prosrc from pg_proc where proname = 'delete_reconciliation')) > 0 as ok;
