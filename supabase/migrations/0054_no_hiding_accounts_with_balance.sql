-- 0054: no se puede ocultar una cuenta con saldo distinto de cero.
--
-- POR QUÉ: ocultar una cuenta (is_archived, lo que hace "Eliminar" cuando la
-- cuenta tiene movimientos) la saca de las listas, pero su plata sigue
-- sumando al total (0051). Con saldo, el desglose por cuenta de Inicio dejaba
-- de sumar el total sin explicar por qué: antes lo tapaba la línea "Sin
-- cuenta", que se fue en la 0051. Al escribir esto, las 2 cuentas ocultas que
-- existen tienen saldo 0 (verificado con el MCP), así que nada queda violando
-- la regla.
--
-- La app ya vaciaba la cuenta antes de eliminarla ("Sí, vaciar y eliminar":
-- un conteo que declara 0, con su ajuste de saldo); ahora además ofrece pasar
-- la plata a otra cuenta. Esta regla hace que la base lo exija, para
-- cualquier app.
--
-- Borrar de verdad no necesita la regla: una cuenta solo se borra si nada la
-- referencia, y sin movimientos su saldo es 0.
--
-- "Distinto de cero" es al centavo: un aporte convertido con su tasa puede
-- dejar fracciones de centavo que ningún ajuste puede escribir (el monto de un
-- movimiento tiene dos decimales). Mismo umbral que la app (hasBalance) y que
-- reconcile_liquid.
--
-- Es la misma función de la 0050, con un chequeo más al final.

create or replace function public.guard_liquid_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance numeric;
begin
  -- E: una cuenta con historia no cambia de moneda.
  if tg_op = 'UPDATE' and new.currency is distinct from old.currency and (
       exists (select 1 from transactions where account_id = old.id)
    or exists (select 1 from contributions where account_id = old.id)
    or exists (select 1 from debt_payments where account_id = old.id)
    or exists (select 1 from liquid_reconciliations where account_id = old.id)
  ) then
    raise exception 'Esta cuenta ya tiene movimientos: su moneda no se puede cambiar.';
  end if;

  -- La última cuenta del día a día no se borra, no se oculta ni pasa a ahorro.
  if not old.is_archived and not old.is_savings
     and (tg_op = 'DELETE' or new.is_archived or new.is_savings)
     and not exists (
       select 1 from liquid_accounts
       where user_id = old.user_id and id <> old.id and not is_archived and not is_savings
     ) then
    raise exception 'Es tu única cuenta para el día a día. Creá otra antes de eliminar esta o pasarla a ahorro.';
  end if;

  -- 0054: una cuenta con saldo no se oculta.
  if tg_op = 'UPDATE' and new.is_archived and not old.is_archived then
    select round(b.amount, 2) into v_balance
    from get_liquid_by_account() b
    where b.account_id = old.id;

    if abs(coalesce(v_balance, 0)) >= 0.01 then
      raise exception 'Esta cuenta todavía tiene plata. Vaciala con un ajuste de saldo o pasá la plata a otra cuenta antes de eliminarla.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- La 0052 cerró el default para funciones nuevas, pero `create or replace`
-- conserva los permisos de la función: se dice igual, explícito.
revoke all on function public.guard_liquid_account() from public, anon;
