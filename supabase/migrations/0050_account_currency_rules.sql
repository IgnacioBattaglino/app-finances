-- 0050: la base garantiza la moneda de cada movimiento y que no haya plata
-- "sin cuenta".
--
-- POR QUÉ: la moneda de un movimiento la copiaba el cliente (transactionCurrency,
-- lib/transactions.js) y las funciones SQL por su lado (D7 del informe,
-- regla #8). get_liquid_by_account supone que coinciden: una app que se olvide
-- de copiarla escribe pesos en una cuenta en dólares. Además, al editar un
-- movimiento y pasarlo a una cuenta de otra moneda, la app cambiaba el símbolo
-- y dejaba el número: $50.000 pasaba a US$ 50.000 sin aviso.
-- Paso 2 de la mudanza de reglas (docs/mudanza-reglas.md).
--
-- LAS REGLAS (acordadas antes de escribir esto):
--   A. Crear un movimiento: la moneda la pone la base, la de su cuenta. Lo que
--      mande el cliente se ignora.
--   B. No hay movimientos sin cuenta. Todo usuario nace con "Efectivo" y la
--      app deja de ofrecer "Sin cuenta". Vale para todo lo que toca el
--      disponible: transactions, los aportes y pagos de deuda que salen de él
--      (affects_liquid), y los planes de A pagar (al confirmarse escriben un
--      movimiento).
--   C. Editar sin cambiar la cuenta: la moneda no se toca, aunque la cuenta
--      haya cambiado de moneda después. Cambiarla sola se rechaza.
--   C'. Cambiar a una cuenta de la MISMA moneda: pasa.
--   D. Cambiar a una cuenta de OTRA moneda: se rechaza, salvo que la edición
--      mande explícitamente la moneda nueva. La base no puede saber si alguien
--      miró el monto; sí garantiza que la moneda nunca cambie en silencio. Que
--      el monto se revise lo asegura la app (TransactionFormModal lo vacía).
--   E. Una cuenta con historia no cambia de moneda: los aportes y pagos de
--      deuda NO copian la moneda (la cuenta decide cómo se suman, 0039), así
--      que cambiarla reinterpretaría el pasado.
--   Además: la última cuenta del día a día (no oculta, no de ahorro) de un
--   usuario no se puede borrar, ocultar ni pasar a ahorro.
--
-- Datos: al escribir esto, 0 filas violan ninguna de las restricciones
-- (verificado con el MCP). Los 4 conteos viejos sin cuenta (declaraciones del
-- disponible entero, anteriores a la 0032) quedan como están: el CHECK de
-- liquid_reconciliations va `not valid`, rige para las filas nuevas (ADR-012).
--
-- Las funciones son SECURITY INVOKER: leen liquid_accounts a través de RLS,
-- así que una cuenta ajena es "inexistente", igual que en
-- confirm_commitment_charge.

-- ── A, B, C, C', D: la moneda de un movimiento ──────────────────────────────
create or replace function public.transaction_currency_from_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_currency text;
begin
  if new.account_id is null then
    raise exception 'Todo movimiento tiene que tener una cuenta.';
  end if;

  -- C: la cuenta no cambió. La moneda es la de la fila, no la de la cuenta hoy.
  if tg_op = 'UPDATE' and new.account_id = old.account_id then
    if new.currency is distinct from old.currency then
      raise exception 'La moneda de un movimiento sale de su cuenta: no se cambia por separado.';
    end if;
    return new;
  end if;

  select currency into v_currency from liquid_accounts where id = new.account_id;
  if v_currency is null then
    raise exception 'Cuenta inexistente o de otro usuario';
  end if;

  -- D: otra cuenta, otra moneda. Solo con la moneda nueva explícita.
  if tg_op = 'UPDATE' and v_currency <> old.currency and new.currency is distinct from v_currency then
    raise exception 'Esta cuenta está en % y el movimiento estaba en %. Escribí de nuevo el monto, en %: la app no convierte monedas por su cuenta.',
      v_currency, old.currency, v_currency;
  end if;

  -- A y C': la de la cuenta.
  new.currency := v_currency;
  return new;
end;
$$;

create trigger transactions_currency_from_account
  before insert or update of account_id, currency on public.transactions
  for each row execute function public.transaction_currency_from_account();

-- ── B: nada que toque el disponible queda sin cuenta ────────────────────────
alter table public.transactions alter column account_id set not null;
alter table public.commitments alter column account_id set not null;
alter table public.contributions
  add constraint contributions_liquid_needs_account check (not affects_liquid or account_id is not null);
alter table public.debt_payments
  add constraint debt_payments_liquid_needs_account check (not affects_liquid or account_id is not null);
alter table public.liquid_reconciliations
  add constraint liquid_reconciliations_account_required check (account_id is not null) not valid;

-- ── E y la última cuenta del día a día ──────────────────────────────────────
create or replace function public.guard_liquid_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
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

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger liquid_accounts_guard
  before update of currency, is_archived, is_savings or delete on public.liquid_accounts
  for each row execute function public.guard_liquid_account();

-- ── Verificación (solo lectura, correr después de aplicar) ─────────────────
-- Todas las filas tienen que dar 0, salvo "triggers" (2) y "conteos viejos sin
-- cuenta" (los 4 de antes, ni uno más).
--
--   select 'tx sin cuenta' as caso, count(*) from transactions where account_id is null
--   union all select 'tx con moneda distinta de su cuenta', count(*)
--     from transactions t join liquid_accounts a on a.id = t.account_id where t.currency <> a.currency
--   union all select 'aportes del disponible sin cuenta', count(*) from contributions where affects_liquid and account_id is null
--   union all select 'pagos del disponible sin cuenta', count(*) from debt_payments where affects_liquid and account_id is null
--   union all select 'planes sin cuenta', count(*) from commitments where account_id is null
--   union all select 'usuarios sin cuenta del día a día', count(*) from auth.users u
--     where not exists (select 1 from liquid_accounts a where a.user_id = u.id and not a.is_archived and not a.is_savings)
--   union all select 'conteos viejos sin cuenta', count(*) from liquid_reconciliations where account_id is null
--   union all select 'triggers', count(*) from pg_trigger
--     where tgname in ('transactions_currency_from_account', 'liquid_accounts_guard');
