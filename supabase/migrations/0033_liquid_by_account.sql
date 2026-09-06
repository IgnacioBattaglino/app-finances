-- 0033: el disponible por cuenta se suma en la base, no en el cliente.
--
-- Hasta acá `computeCurrentLiquid` (lib/liquid.js) traía las TRES tablas que
-- mueven el disponible enteras --todas las transactions, todas las
-- contributions con affects_liquid, todos los debt_payments-- y las sumaba en
-- JavaScript. Funciona, pero tiene un techo invisible: PostgREST corta
-- cualquier select en 1000 filas y no avisa. Al pasar esa marca el disponible
-- no rompe: empieza a dar un número menor, en silencio, que es la peor forma
-- de fallar para una pantalla de plata.
--
-- Una agregación no tiene ese techo porque nunca devuelve más de una fila por
-- cuenta. Y de paso viajan tres números en vez de miles de filas.
--
-- REGLA: la semántica se replica de computeLiquidByAccount, no se reinventa.
-- Es un cambio de CÓMO se calcula, no de QUÉ se calcula, y el resultado tiene
-- que ser idéntico centavo a centavo para cualquier conjunto de datos. La
-- función JS queda en el repo como referencia ejecutable de la regla, y hay un
-- test que corre esta misma función contra ella (src/lib/liquidSql.test.js).
--
-- La fórmula, tal como está en ARCHITECTURE.md:
--   + ingresos − gastos                        (transactions, ARS)
--   − aportes + retiros, en USD × su MEP       (contributions, affects_liquid)
--   − pagos de deuda, en USD × su MEP          (debt_payments, affects_liquid)
-- agrupado por account_id, con el null como el balde "sin cuenta" (migración
-- 0032): no es una cuenta, pero su plata cuenta para el total.
--
-- security invoker, igual que get_portfolio_series (0022) y get_instrument_series
-- (0018): RLS sigue aplicando con el usuario que llama, así que cada quien suma
-- lo suyo y nada más -- transactions por "own rows", contributions por "own via
-- asset", debt_payments por "own via debt".

create or replace function public.get_liquid_by_account()
returns table (account_id uuid, amount numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select m.account_id, sum(m.delta) as amount
  from (
    -- Ingresos suman, todo lo demás resta. El CHECK de la tabla solo admite
    -- 'expense' e 'income', pero el `else` replica el ternario del JS tal cual:
    -- lo que no es income, resta.
    select t.account_id, case when t.kind = 'income' then t.amount_ars else -t.amount_ars end
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
  group by m.account_id;
$$;

grant execute on function public.get_liquid_by_account() to authenticated;

-- Verificación (correr a mano después de aplicar; el total tiene que ser el
-- mismo número que muestra la pantalla de Inicio):
--
--   select sum(amount) from get_liquid_by_account();
