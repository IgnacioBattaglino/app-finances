-- 0060: lo que la base necesita para la carga sin conexión de la app nativa
-- (bloque 4; decisiones en docs/informe-deudas-ahorro-offline.md, sección 3).
--
-- El teléfono guarda gastos e ingresos nuevos sin señal y los sube después.
-- Tres cosas:
--
--   1. EL ID LO GENERA EL TELÉFONO. No hace falta ningún cambio: `id` tiene
--      un default pero acepta uno enviado, y la subida es "insertar, y si ese
--      id ya existe, no hacer nada" (PostgREST: `on_conflict=id` con
--      `Prefer: resolution=ignore-duplicates`, un INSERT ... ON CONFLICT DO
--      NOTHING). Así un reintento después de un corte no duplica el gasto.
--      offlineCaptureSql.test.js lo prueba con RLS.
--
--   2. CUÁNDO SE CARGÓ DE VERDAD: `transactions.captured_at`. `created_at` es
--      la hora en que la fila llegó a la base, que para un gasto cargado sin
--      señal es la hora de la subida. Lo que necesita saber "¿esto se cargó
--      antes o después de contar la plata?" (el conteo retroactivo) tiene que
--      mirar esta columna.
--        · La manda el teléfono; si no viene, es now() (la web no la manda).
--        · Un reloj de teléfono adelantado no puede fecharla en el futuro: se
--          corta en now().
--        · Es de la fila, no de la edición: editar un movimiento no la cambia.
--        · Las filas que ya existen la completan con su created_at (68 al
--          medir), que para ellas es exactamente eso.
--
--   3. NO ENTRA NADA NUEVO A UNA CUENTA OCULTA. La 0054 impide ocultar una
--      cuenta con saldo, pero la base todavía aceptaba un movimiento en ella
--      después — y su saldo dejaba de ser 0. Sin conexión es mucho más
--      probable: se carga en el subte, en la compu se oculta la cuenta, y
--      después sube. Se rechaza con un mensaje en castellano: el teléfono deja
--      el movimiento en su cola para que el usuario elija otra cuenta y
--      reintente con el mismo id. Vale para gastos e ingresos, aportes y
--      pagos de deuda, al crear y al mudar un movimiento a esa cuenta.
--      Al medir: 0 movimientos en las 2 cuentas ocultas.
--
--   4. UN MOVIMIENTO DE UNA CUENTA OCULTA NO SE EDITA en lo que mueve su saldo:
--      monto, fecha, tipo, moneda, tasa, origen, intereses ni cuenta (sacarlo
--      de la cuenta oculta también le cambia el saldo). La app nativa permite
--      editar movimientos, y cualquiera de esos cambios rompería el saldo cero
--      que exige la 0054. La descripción sí se puede cambiar. Qué columnas
--      cuenta cada tabla va como argumento del trigger.

-- ══ 1. captured_at ══════════════════════════════════════════════════════════
alter table public.transactions add column captured_at timestamptz;
update public.transactions set captured_at = created_at;
alter table public.transactions alter column captured_at set default now();
alter table public.transactions alter column captured_at set not null;

create or replace function public.transaction_captured_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.captured_at := old.captured_at;
  else
    new.captured_at := least(coalesce(new.captured_at, now()), now());
  end if;
  return new;
end;
$$;

create trigger transactions_captured_at
  before insert or update of captured_at on public.transactions
  for each row execute function public.transaction_captured_at();

-- ══ 2. Una cuenta oculta no recibe movimientos nuevos ═══════════════════════
-- Los argumentos del trigger (tg_argv) son las columnas de esa tabla que
-- mueven el saldo de la cuenta: si una cambia en un movimiento de una cuenta
-- oculta, se rechaza.
create or replace function public.reject_hidden_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_column text;
begin
  if tg_op = 'UPDATE'
     and old.account_id is not null
     and exists (select 1 from liquid_accounts where id = old.account_id and is_archived) then
    foreach v_column in array tg_argv loop
      if to_jsonb(new) -> v_column is distinct from to_jsonb(old) -> v_column then
        raise exception 'Este movimiento es de una cuenta que ya no está disponible: no se puede cambiar su monto, fecha, tipo ni cuenta.';
      end if;
    end loop;
  end if;

  if new.account_id is not null
     and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id)
     and exists (select 1 from liquid_accounts where id = new.account_id and is_archived) then
    raise exception 'Esa cuenta ya no está disponible: elegí otra.';
  end if;
  return new;
end;
$$;

create trigger transactions_reject_hidden_account
  before insert or update on public.transactions
  for each row execute function public.reject_hidden_account('amount', 'date', 'kind', 'currency', 'account_id');
create trigger contributions_reject_hidden_account
  before insert or update on public.contributions
  for each row execute function public.reject_hidden_account('amount_usd', 'mep_rate', 'direction', 'affects_liquid', 'date', 'account_id');
create trigger debt_payments_reject_hidden_account
  before insert or update on public.debt_payments
  for each row execute function public.reject_hidden_account('amount_usd', 'interest_usd', 'mep_rate', 'affects_liquid', 'date', 'account_id');

revoke all on function public.transaction_captured_at() from public, anon;
revoke all on function public.reject_hidden_account() from public, anon;

-- ── Verificación (solo lectura, correr después de aplicar) ─────────────────
-- Cada fila tiene que coincidir con la columna `esperado`.
--
--   select 'movimientos sin captured_at' as chequeo, count(*)::text as resultado, '0' as esperado
--   from transactions where captured_at is null
--   union all
--   select 'captured_at distinto de created_at en lo que ya existía', count(*)::text, '0'
--   from transactions where captured_at <> created_at
--   union all
--   select 'triggers nuevos', count(*)::text, '4'
--   from pg_trigger where tgname in ('transactions_captured_at', 'transactions_reject_hidden_account',
--     'contributions_reject_hidden_account', 'debt_payments_reject_hidden_account')
--   union all
--   select 'movimientos en cuentas ocultas', (
--     (select count(*) from transactions t join liquid_accounts a on a.id = t.account_id where a.is_archived)
--   + (select count(*) from contributions c join liquid_accounts a on a.id = c.account_id where a.is_archived)
--   + (select count(*) from debt_payments p join liquid_accounts a on a.id = p.account_id where a.is_archived))::text, '0';
