-- 0039: un aporte que sale de una cuenta EN DÓLARES no se multiplica por el
-- MEP, porque no convirtió nada.
--
-- Es la deuda que la 0036 dejó anotada en su propio comentario y en ADR-013:
--
--     "El día que exista una cuenta en dólares, dos cosas cambian JUNTAS: la
--      transaction suma en su propia moneda, y un aporte que sale de una
--      cuenta en dólares no se multiplica por el MEP -- no convirtió nada."
--
-- La primera mitad la resolvió el frontend (transactionCurrency en
-- lib/transactions.js: el movimiento copia la moneda de su cuenta al
-- escribirse). Esta migración resuelve la segunda.
--
-- ── EL ERROR CONCRETO QUE ARREGLA ──────────────────────────────────────────
-- Hasta acá, TODA contribución con affects_liquid y todo pago de deuda entraba
-- a su balde como `amount_usd * mep_rate`, sin mirar en qué moneda está la
-- cuenta. Con una cuenta en dólares eso mezclaba dos unidades dentro del mismo
-- balde: un aporte de US$ 100 desde una cuenta en dólares restaba 150.000
-- (pesos) de un saldo que está en dólares.
--
-- ── LA REGLA ───────────────────────────────────────────────────────────────
-- El saldo de cada balde está en la moneda de SU cuenta. Entonces:
--
--   * transactions: el monto ya está en la moneda de la fila (columna
--     `currency`, migración 0036), que es la de su cuenta porque el frontend
--     la copia al escribir. Entra tal cual, como siempre.
--
--   * contributions y debt_payments: guardan un monto en DÓLARES más el tipo
--     de cambio congelado del día (ADR-013). Si la cuenta es en dólares, la
--     operación no convirtió nada y el monto entra tal cual. Si no, entra
--     convertido a la moneda local con SU tasa congelada -- exactamente lo que
--     se venía haciendo, que era correcto mientras todas las cuentas eran ARS.
--
-- `mep_rate` es "cuántos pesos vale un dólar", así que la rama de conversión
-- solo tiene sentido para la moneda local. Por eso la condición se escribe
-- como "la cuenta NO es USD" y no como "la cuenta es ARS": el día que la app
-- se lance en otro país, la moneda local cambia de nombre pero la tasa
-- congelada sigue siendo local-por-dólar, y esta rama sigue siendo la
-- correcta. Una tercera moneda (una cuenta en euros) no la resuelve ni esta
-- función ni el resto de la app -- no hay tasa congelada que la exprese --, y
-- no se inventa una acá.
--
-- ── QUÉ NO CAMBIA ──────────────────────────────────────────────────────────
-- Con TODAS las cuentas en pesos --el estado real de hoy-- esta función
-- devuelve exactamente lo mismo que la de la 0036, balde por balde y al
-- centavo: la rama nueva no se toca nunca. Los baldes siguen siendo los
-- mismos, el balde null y el huérfano se siguen leyendo como ARS/no-ahorro, y
-- las tres fuentes, sus filtros y sus signos quedan igual.
--
-- No hay DDL: ni una tabla, ni una columna, ni un índice. El dato ya estaba
-- bien guardado desde la 0036 y la 0038; lo que faltaba era leerlo.
--
-- El tipo de retorno NO cambia respecto de la 0036, así que alcanza con
-- `create or replace` -- no hace falta dropear.

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
         -- La única línea que esta migración cambia. `in_usd` dice si el monto
         -- de la fila está en dólares (contributions y debt_payments) o ya en
         -- la moneda de su cuenta (transactions); la moneda del balde decide
         -- si hace falta convertirlo.
         sum(
           case when m.in_usd and coalesce(la.currency, 'ARS') <> 'USD'
                  then m.delta * m.mep_rate
                else m.delta
           end
         ) as amount
  from (
    -- Ingresos suman, todo lo demás resta. El CHECK de la tabla solo admite
    -- 'expense' e 'income', pero el `else` replica el ternario del JS tal cual:
    -- lo que no es income, resta. El monto ya está en la moneda de la fila, así
    -- que no lleva tasa (in_usd = false, aunque la fila sea de una cuenta en
    -- dólares: lo que el flag dice es "hay que convertirlo", no "es un dólar").
    select t.account_id,
           case when t.kind = 'income' then t.amount else -t.amount end,
           null::numeric,
           false
    from transactions t

    union all

    -- Solo lo que sale del bolsillo. affects_liquid = false son cargas
    -- iniciales, tenencias previas y las dos patas de una transferencia: nunca
    -- pasaron por el disponible.
    --
    -- Un aporte con affects_liquid = true debería tener siempre su MEP
    -- congelado (la app lo exige desde la 0024), pero si faltara, el JS calcula
    -- Number(null) = 0 y suma cero. Acá se excluye la fila, que da lo mismo:
    -- un balde que no existe se lee como 0 río abajo.
    select c.account_id,
           case when c.direction = 'out' then c.amount_usd else -c.amount_usd end,
           c.mep_rate,
           true
    from contributions c
    where c.affects_liquid = true
      and c.mep_rate is not null

    union all

    -- `is distinct from false` y no `= true` por la misma razón que el JS mira
    -- `!== false`: solo un false explícito excluye (pagado con dólares que ya
    -- tenías). Los pagos sin MEP congelado --anteriores a la 0010-- quedan
    -- fuera del cálculo, igual que en el JS: no hay con qué pasarlos a la
    -- moneda local, y para una cuenta en dólares tampoco haría falta, pero
    -- excluirlos siempre mantiene una sola regla en vez de dos.
    select p.account_id, -p.amount_usd, p.mep_rate, true
    from debt_payments p
    where p.affects_liquid is distinct from false
      and p.mep_rate is not null
  ) as m(account_id, delta, mep_rate, in_usd)
  -- El join es contra la PK, así que cada balde sigue siendo UNA fila: currency
  -- e is_savings entran al group by porque el planner no deduce solo que
  -- account_id las determina, no porque puedan multiplicar filas.
  left join liquid_accounts la on la.id = m.account_id
  group by m.account_id, la.currency, la.is_savings;
$$;

grant execute on function public.get_liquid_by_account() to authenticated;

-- Verificación (correr a mano después de aplicar). Con todas las cuentas en
-- pesos los dos números tienen que ser IDÉNTICOS a los de antes de aplicarla:
--
--   select account_id, currency, is_savings, amount from get_liquid_by_account()
--   order by amount desc;
--   select sum(amount) from get_liquid_by_account();
--
-- Y este tiene que dar 0 filas mientras no exista ninguna cuenta en dólares:
--
--   select id, name from liquid_accounts where currency <> 'ARS';

-- ── Vuelta atrás ───────────────────────────────────────────────────────────
-- Volver a correr, tal cual, el bloque `create or replace function
-- public.get_liquid_by_account()` de 0036_account_currency_and_savings.sql.
-- No hay estado que revertir: esta migración no escribe ni una fila.
