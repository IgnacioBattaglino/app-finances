-- 0036: la cuenta declara su moneda y si es de ahorro; el movimiento declara
-- la suya.
--
-- Primer paso de un rediseño más grande (cuentas en dólares, cuentas de
-- ahorro, los cuatro números de Inicio). Este archivo NO cambia ningún número
-- ni ninguna pantalla: agrega el dato que falta y lo expone en el cálculo. Al
-- terminar, el disponible tiene que dar exactamente lo mismo que antes,
-- centavo a centavo.
--
-- ── POR QUÉ EL MOVIMIENTO GUARDA SU MONEDA, Y NO LA HEREDA DE SU CUENTA ─────
-- La tentación es no guardar nada y leer la moneda de liquid_accounts al
-- mostrar. No se puede, por dos razones:
--
--   1. account_id es nullable (0032). El balde "sin cuenta" no tendría de
--      dónde sacar la moneda.
--   2. Si mañana una cuenta cambia de moneda, todos sus movimientos pasados
--      cambiarían de significado retroactivamente: un gasto de 50.000 pasaría
--      de ser 50.000 pesos a ser 50.000 dólares porque alguien tocó un
--      selector en Ajustes. La historia no se reescribe -- es el mismo
--      principio que congela el mep_rate en cada aporte y que guarda
--      empties_asset en la fila del retiro (ADR-011).
--
-- ── POR QUÉ SE RENOMBRA amount_ars EN VEZ DE AGREGAR UNA COLUMNA AL LADO ────
-- Un `amount_usd` conviviendo con `amount_ars` serían dos fuentes de verdad
-- para el mismo hecho, y todo consumidor tendría que hacer coalesce entre las
-- dos. Y dejar dólares adentro de una columna llamada amount_ars es peor que
-- una columna muerta: es una que MIENTE por nombre. Este es el momento más
-- barato para renombrarla -- no cambia ninguna pantalla, así que el cambio es
-- mecánico y verificable número contra número.
--
-- ── LA TASA CONGELADA NO VIENE ACÁ, Y NO ES UNA INCOHERENCIA ────────────────
-- contributions y debt_payments guardan amount_usd + mep_rate. transactions
-- pasa a guardar amount + currency, sin tasa. No son dos modelos distintos:
-- son el mismo, que es
--
--     (monto, moneda) + tasa congelada SOLO cuando hubo una conversión real.
--
-- Un aporte en dólares pagado con pesos SÍ convirtió: la tasa es un hecho de
-- ese evento y por eso se congela. Un gasto de 50 dólares pagado desde una
-- cuenta en dólares NO convirtió nada; inventarle una tasa sería fabricar una
-- operación que nunca ocurrió. Cuando haga falta mostrarlo en otra moneda se
-- convierte al mostrar, con la serie diaria del catálogo -- que es lo que ya
-- hace hoy el bloque de Gastos de Inicio (lib/localCurrency.js). Ver ADR-013.

-- ── 1. La cuenta: moneda y marca de ahorro ─────────────────────────────────
-- currency es ISO 4217 validado POR FORMA (tres mayúsculas), no contra una
-- lista cerrada de monedas: la app tiene que poder lanzarse en otro país sin
-- una migración. El símbolo y los decimales de cada moneda los resuelve
-- Intl.NumberFormat en el cliente, así que no hace falta ninguna tabla de
-- catálogo de monedas.
--
-- is_savings: la plata que está guardada, no la del día a día. En este paso
-- SOLO se guarda el dato y se expone en el cálculo; ninguna pantalla lo mira
-- todavía. Las cuentas que ya existen quedan en pesos y como NO ahorro, que
-- es exactamente lo que son hoy: por eso los dos defaults.
alter table liquid_accounts
  add column currency text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  add column is_savings boolean not null default false;

-- ── 2. El movimiento: el monto deja de ser "en pesos" ──────────────────────
alter table transactions rename column amount_ars to amount;

alter table transactions
  add column currency text not null default 'ARS' check (currency ~ '^[A-Z]{3}$');

-- ── 3. La reconciliación declara un monto, no "un monto en pesos" ──────────
-- Misma mentira que amount_ars y por el mismo motivo: desde que la
-- reconciliación es POR CUENTA (0032) y una cuenta puede tener su moneda, lo
-- que se declara está en la moneda de esa cuenta. No lleva columna de moneda
-- propia: la fila ya apunta a la cuenta que declaró, y una reconciliación es
-- una foto del presente de esa cuenta -- no un evento histórico que haya que
-- poder leer sin ella.
alter table liquid_reconciliations rename column declared_amount_ars to declared_amount;

-- Los CHECK que nacieron inline en la 0001 y la 0009 se llaman por su columna
-- (transactions_amount_ars_check, liquid_reconciliations_declared_amount_ars_check).
-- Renombrar la columna no los renombra, y un CHECK violado mostraría el nombre
-- de una columna que ya no existe. Se renombran con guarda: si en alguna base
-- el constraint tiene otro nombre, la migración no se cae por un detalle
-- cosmético.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'transactions_amount_ars_check') then
    execute 'alter table transactions rename constraint transactions_amount_ars_check to transactions_amount_check';
  end if;
  if exists (select 1 from pg_constraint where conname = 'liquid_reconciliations_declared_amount_ars_check') then
    execute 'alter table liquid_reconciliations rename constraint liquid_reconciliations_declared_amount_ars_check to liquid_reconciliations_declared_amount_check';
  end if;
end $$;

-- ── 4. get_liquid_by_account: mismo monto, más contexto ────────────────────
-- La suma NO cambia: las mismas tres fuentes, las mismas reglas, los mismos
-- baldes que la 0033. Lo único que se agrega son dos columnas que describen la
-- cuenta de cada balde, para que la capa de arriba pueda armar los cuatro
-- números del rediseño (disponible / ahorro / invertido / total) sin volver a
-- consultar las cuentas y sin decidir nada por su cuenta.
--
-- NO CONVIERTE A DÓLARES, a propósito. La vista instrument_prices_usd (0026)
-- convierte precios HISTÓRICOS, día por día, y por eso vive en la base: si
-- cada lector convirtiera por su lado, el mismo activo valdría distinto según
-- dónde se lo mire. El disponible es lo contrario: una FOTO DE HOY, que se
-- expresa en otra unidad a la cotización de hoy. Esa conversión ya tiene un
-- único lugar declarado en el cliente (lib/localCurrency.js, que lee el mismo
-- instrumento MEP del mismo catálogo con el mismo carry-forward); hacerla acá
-- adentro abriría un TERCER lugar que lee cotizaciones, que es justo lo que la
-- 0026 vino a cerrar. Ver ADR-013.
--
-- El balde null ("sin cuenta") y una fila que apunta a una cuenta que ya no
-- está no tienen cuenta de dónde leer: se leen como ARS y no-ahorro, que es
-- exactamente lo que son -- movimientos en pesos que nadie asignó.
--
-- SUPUESTO VIGENTE, que este paso no rompe y el siguiente tiene que resolver:
-- el monto de cada balde está en pesos POR CONSTRUCCIÓN (las transactions en
-- pesos, y los aportes y pagos convertidos con su mep_rate congelado), y hoy
-- todas las cuentas son ARS, así que `currency` describe la suma con verdad.
-- El día que exista una cuenta en dólares, dos cosas cambian JUNTAS: la
-- transaction suma en su propia moneda, y un aporte que sale de una cuenta en
-- dólares no se multiplica por el MEP -- no convirtió nada. Está documentado
-- en ADR-013 para que no se pierda.
--
-- El tipo de retorno cambia, así que hay que dropear antes: create or replace
-- no puede cambiar la forma de la tabla que devuelve una función.
drop function if exists public.get_liquid_by_account();

create or replace function public.get_liquid_by_account()
returns table (account_id uuid, currency text, is_savings boolean, amount numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select m.account_id,
         coalesce(la.currency, 'ARS')   as currency,
         coalesce(la.is_savings, false) as is_savings,
         sum(m.delta)                   as amount
  from (
    -- Ingresos suman, todo lo demás resta. El CHECK de la tabla solo admite
    -- 'expense' e 'income', pero el `else` replica el ternario del JS tal cual:
    -- lo que no es income, resta.
    select t.account_id, case when t.kind = 'income' then t.amount else -t.amount end
    from transactions t

    union all

    -- Solo lo que sale del bolsillo. affects_liquid = false son cargas
    -- iniciales, tenencias previas y las dos patas de una transferencia: nunca
    -- pasaron por los pesos.
    --
    -- Un aporte con affects_liquid = true debería tener siempre su MEP
    -- congelado (la app lo exige desde la 0024), pero si faltara, el JS calcula
    -- Number(null) = 0 y suma cero. Acá se excluye la fila, que da lo mismo:
    -- un balde que no existe se lee como 0 río abajo.
    select c.account_id,
           case when c.direction = 'out' then c.amount_usd * c.mep_rate
                else -c.amount_usd * c.mep_rate
           end
    from contributions c
    where c.affects_liquid = true
      and c.mep_rate is not null

    union all

    -- `is distinct from false` y no `= true` por la misma razón que el JS mira
    -- `!== false`: solo un false explícito excluye (pagado con dólares que ya
    -- tenías). Los pagos sin MEP congelado --anteriores a la 0010-- quedan
    -- fuera del cálculo, igual que en el JS: no hay con qué pasarlos a pesos.
    select p.account_id, -p.amount_usd * p.mep_rate
    from debt_payments p
    where p.affects_liquid is distinct from false
      and p.mep_rate is not null
  ) as m(account_id, delta)
  -- El join es contra la PK, así que cada balde sigue siendo UNA fila: currency
  -- e is_savings entran al group by porque el planner no deduce solo que
  -- account_id las determina, no porque puedan multiplicar filas.
  left join liquid_accounts la on la.id = m.account_id
  group by m.account_id, la.currency, la.is_savings;
$$;

grant execute on function public.get_liquid_by_account() to authenticated;

-- ── 5. reconcile_liquid: las mismas cuentas, con los nombres nuevos ────────
-- Copia literal de la 0034 salvo tres líneas: los dos nombres de columna que
-- cambiaron y la moneda del ajuste. El ajuste hereda la moneda de la cuenta
-- que se está reconciliando -- es plata de esa cuenta, no puede estar en otra
-- moneda. Una declaración sin cuenta (el camino de antes de la 0032, para el
-- usuario que no tiene ninguna) ajusta en ARS, igual que el balde sin cuenta
-- de get_liquid_by_account. Hoy todas las cuentas son ARS, así que esto no
-- mueve ningún número; queda correcto para cuando dejen de serlo.
--
-- Todo lo demás --el todo-o-nada, la foto del disponible antes de escribir, la
-- categoría del sistema buscada por flag, "Saldo inicial" vs.
-- "Reconciliación de disponible", la validación de pertenencia de cada
-- cuenta-- está documentado en la 0034 y no se repite acá.
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
      -- Sin cuenta, se declara el disponible entero (y "es la primera vez" es
      -- no haber reconciliado nunca, ninguna cuenta).
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

-- Verificación (correr a mano después de aplicar; los dos números tienen que
-- ser los mismos que antes de la migración, y currency/is_savings tienen que
-- dar 'ARS'/false en todas las filas):
--
--   select account_id, currency, is_savings, amount from get_liquid_by_account()
--   order by amount desc;
--   select sum(amount) from get_liquid_by_account();

-- ── Vuelta atrás ───────────────────────────────────────────────────────────
-- Un rename deja a la app vieja sin la columna que busca, así que la migración
-- y el deploy tienen que ir juntos. Si algo sale mal en el medio, esto deshace
-- todo (probado en un Postgres local, no escrito de memoria). Correrlo ENTERO
-- y en este orden -- la 0033 no se puede recrear antes de que la columna
-- vuelva a llamarse amount_ars:
--
--   drop function if exists public.get_liquid_by_account();
--   alter table transactions rename column amount to amount_ars;
--   alter table transactions drop column currency;
--   alter table liquid_reconciliations rename column declared_amount to declared_amount_ars;
--   alter table liquid_accounts drop column currency, drop column is_savings;
--   alter table transactions rename constraint transactions_amount_check
--     to transactions_amount_ars_check;
--   alter table liquid_reconciliations rename constraint liquid_reconciliations_declared_amount_check
--     to liquid_reconciliations_declared_amount_ars_check;
--
-- y después volver a correr, tal cual, 0033_liquid_by_account.sql y
-- 0034_reconcile_liquid.sql, que redefinen las dos funciones como estaban.
