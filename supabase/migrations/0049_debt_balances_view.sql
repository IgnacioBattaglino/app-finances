-- 0049: el saldo de cada deuda lo calcula la base (vista debt_balances).
--
-- POR QUÉ: la regla "saldo = original − pagos, con piso en 0; saldada si no
-- queda nada" vivía solo en JS (debtBalance / summarizeDebts, lib/debts.js) y
-- la repetía cada pantalla que la mostraba. Una app nativa tendría que
-- copiarla al pie de la letra. Acá queda en un solo lugar, al lado de los
-- datos. Es el paso 1 de la mudanza de reglas (docs/informe-reglas-de-plata.md,
-- regla #24; receta en docs/mudanza-reglas.md).
--
-- La versión JS sigue en el repo como DEFINICIÓN EJECUTABLE: debtBalanceSql.test.js
-- corre esta vista contra ella. Mismo criterio que get_liquid_by_account (0033).
--
-- SEGURIDAD: security_invoker = true, así la vista se ejecuta con los permisos
-- de quien consulta y aplican las mismas policies de siempre ("own rows" en
-- debts, "own via debt" en debt_payments). Sin esa opción una vista corre con
-- los permisos de su dueño, que no pasa por RLS: devolvería las deudas de
-- TODOS los usuarios. Por eso NO es condicional como en la 0026 (que solo leía
-- catálogo compartido): en un Postgres anterior al 15 esta migración falla, a
-- propósito, en vez de crear una vista que filtra datos ajenos.
--
-- No se guarda nada: es una vista, se calcula en cada lectura (principio 1 del
-- modelo de datos). Una deuda sin pagos sale igual, con 0 pagado (left join).

create view public.debt_balances
with (security_invoker = true)
as
select
  d.id                                                           as debt_id,
  coalesce(sum(p.amount_usd), 0)                                 as paid_usd,
  greatest(d.original_amount_usd - coalesce(sum(p.amount_usd), 0), 0) as balance_usd,
  coalesce(sum(p.amount_usd), 0) >= d.original_amount_usd        as is_settled
from public.debts d
left join public.debt_payments p on p.debt_id = d.id
group by d.id;

comment on view public.debt_balances is
  'Saldo de cada deuda: original − pagos, con piso en 0, y si está saldada. Calculado, nunca guardado (migración 0049).';

revoke all on public.debt_balances from public, anon;
grant select on public.debt_balances to authenticated;

-- ── Verificación (solo lectura, correr después de aplicar) ─────────────────
-- 1) La vista tiene security_invoker. Tiene que devolver una fila con
--    {security_invoker=true}.
--
--   select relname, reloptions from pg_class where relname = 'debt_balances';
--
-- 2) Cada deuda, con el saldo recalculado a mano al lado del de la vista. La
--    columna "coincide" tiene que ser true en todas las filas.
--
--   select d.creditor, d.original_amount_usd, b.paid_usd, b.balance_usd, b.is_settled,
--          b.balance_usd = greatest(d.original_amount_usd
--            - coalesce((select sum(amount_usd) from debt_payments p where p.debt_id = d.id), 0), 0)
--            as coincide
--   from debts d join debt_balances b on b.debt_id = d.id
--   order by d.start_date desc;
