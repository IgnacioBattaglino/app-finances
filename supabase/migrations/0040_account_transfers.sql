-- 0040: transferencia atómica entre cuentas del disponible/ahorro.
--
-- MISMO PROBLEMA Y MISMO REMEDIO QUE create_transfer (0017) PARA ACTIVOS
-- Mover plata de una cuenta a otra es un evento de DOS lados: sale de una,
-- entra a la otra. Las dos filas tienen que entrar juntas o no entrar
-- ninguna -- si la segunda escritura fallara después de la primera, quedaría
-- plata que salió de una cuenta y nunca entró a la otra.
--
-- transactions no tenía forma de vincular dos filas entre sí (a diferencia de
-- contributions, que lleva transfer_id desde la 0016): hasta ahora nunca hizo
-- falta, cada gasto o ingreso es un hecho independiente. Se agrega acá, mismo
-- patrón: columna nullable, la ponen las dos patas de una transferencia y
-- nadie más.
alter table transactions add column transfer_id uuid;

create index if not exists transactions_transfer_id_idx
  on transactions(transfer_id) where transfer_id is not null;

-- LOS DOS MONTOS VAN SEPARADOS, NO UNO SOLO CON UNA TASA
-- transactions no congela tasas (ADR-013: guarda monto + moneda, nunca monto +
-- tasa, porque la mayoría de sus filas no convirtieron nada). Cuando las dos
-- cuentas están en la misma moneda, el cliente manda el mismo número en los
-- dos parámetros. Cuando difieren, el par de montos EXACTOS que efectivamente
-- salieron y entraron ya es el registro completo de la conversión que
-- ocurrió -- no hace falta una columna de tasa nueva para reconstruirla
-- después, porque nada la vuelve a leer (a diferencia del mep_rate de un
-- aporte, que si hace falta para el disponible).
--
-- LA CATEGORÍA: "Movimiento de ahorro" (system_key = 'savings_movement',
-- 0037/0038) -- no es un gasto ni un ingreso real, es plata que cambió de
-- cuenta. getExpenses ya la excluye por ser is_system; monthTotals
-- (lib/movements.js) aprende a excluirla por su llave en este mismo commit.
--
-- La descripción la decide la función, con el nombre de la OTRA cuenta -- el
-- formulario no pide texto libre, y es la misma información que "Saldo
-- inicial"/"Reconciliación de disponible" en reconcile_liquid (0034): un dato
-- que ya se sabe, no algo que haya que preguntar.
--
-- SECURITY INVOKER: RLS ("own rows" en liquid_accounts) ya bloquearía leer o
-- insertar en una cuenta ajena. La validación explícita de pertenencia agrega
-- un error claro y corre ANTES de cualquier insert, mismo criterio que
-- create_transfer y reconcile_liquid.
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

  -- Por la llave, nunca por el nombre visible ni por is_system a secas
  -- (mismo criterio que reconcile_liquid desde la 0037).
  select c.id into v_cat_out from categories c
   where c.system_key = 'savings_movement' and c.kind = 'expense' and c.is_archived = false
   limit 1;
  select c.id into v_cat_in from categories c
   where c.system_key = 'savings_movement' and c.kind = 'income' and c.is_archived = false
   limit 1;

  if v_cat_out is null or v_cat_in is null then
    raise exception 'Falta la categoría del sistema "Movimiento de ahorro". Corré el seed de categorías de ajuste.';
  end if;

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

-- Verificación (correr a mano después de aplicar):
--
--   select create_account_transfer(
--     (select id from liquid_accounts where name = 'Efectivo' limit 1),
--     (select id from liquid_accounts where is_savings limit 1),
--     current_date, 1000, 1000
--   );
--   select * from transactions where transfer_id is not null order by created_at desc limit 2;
--   -- Las dos filas comparten transfer_id, una 'expense' y una 'income',
--   -- cada una con la moneda de su cuenta.
