-- 0061: los avisos de seguridad y rendimiento de Supabase (2026-10-08),
-- sin cambiar ninguna regla de acceso.
--
-- 1. Las 15 policies escriben `auth.uid()` directo: Postgres lo recalcula por
--    cada fila que mira. Envuelto en `(select auth.uid())` se calcula una vez
--    por consulta. Mismo significado, mismas filas visibles para cada usuario.
--    `alter policy` cambia solo la condición: es atómico (no hay un instante sin
--    policy) y conserva rol y comando.
-- 2. Seis claves foráneas sin índice: borrar o actualizar la fila apuntada
--    recorría la tabla entera.
-- 3. confirm/unconfirm_commitment_charge no fijaban search_path (todas las demás
--    lo fijan en public). Son SECURITY INVOKER: no cambia qué hacen.
-- 4. handle_new_user (SECURITY DEFINER) era ejecutable por `authenticated` vía
--    la API sin tener por qué. Postgres chequea EXECUTE de una función de
--    trigger al CREAR el trigger, no al dispararlo (mismo argumento que la 0052),
--    así que el alta de usuarios sigue igual.
--
-- No se toca: validate_invite (anon la ejecuta a propósito, ADR-017), pg_net en
-- public, los índices "sin uso" ni los compuestos por período (hay que medirlos
-- con EXPLAIN ANALYZE sobre datos grandes antes; ver docs/pendientes-base.md).
--
-- La protección contra contraseñas filtradas NO es una migración: la prende
-- Nacho en Supabase → Authentication → contraseñas.

-- ── 1. Policies ─────────────────────────────────────────────────────────────
alter policy "own rows" on categories             using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on transactions           using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on assets                 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on debts                  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on settings               using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on liquid_reconciliations using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on asset_types            using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on liquid_accounts        using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on payment_cards          using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on commitments            using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own rows" on commitment_charges     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy "leer la propia marca" on app_admins using (user_id = (select auth.uid()));

alter policy "own via asset" on contributions
  using (exists (select 1 from assets a where a.id = contributions.asset_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from assets a where a.id = contributions.asset_id and a.user_id = (select auth.uid())));
alter policy "own via asset" on asset_valuations
  using (exists (select 1 from assets a where a.id = asset_valuations.asset_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from assets a where a.id = asset_valuations.asset_id and a.user_id = (select auth.uid())));
alter policy "own via debt" on debt_payments
  using (exists (select 1 from debts d where d.id = debt_payments.debt_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from debts d where d.id = debt_payments.debt_id and d.user_id = (select auth.uid())));

-- ── 2. Índices de claves foráneas ───────────────────────────────────────────
create index if not exists idx_transactions_category            on transactions (category_id);
create index if not exists idx_commitment_charges_user          on commitment_charges (user_id);
create index if not exists idx_liquid_recon_adjustment_tx       on liquid_reconciliations (adjustment_transaction_id);
create index if not exists idx_liquid_recon_redistribution_tx   on liquid_reconciliations (redistribution_transaction_id);
create index if not exists idx_invitations_created_by           on invitations (created_by);
create index if not exists idx_invitations_used_by              on invitations (used_by);

-- ── 3. search_path de las funciones de compromisos ──────────────────────────
alter function public.confirm_commitment_charge(uuid, date, date, numeric, uuid, text) set search_path = public;
alter function public.unconfirm_commitment_charge(uuid, date) set search_path = public;

-- ── 4. handle_new_user fuera de la API ──────────────────────────────────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── Verificación combinada (solo lectura, correr DESPUÉS de aplicar) ────────
-- Todas las filas tienen que dar ok = true.
--
-- select 'policies sin envolver' as control,
--        count(*) = 0 as ok
-- from pg_policies
-- where schemaname = 'public'
--   and (coalesce(qual, '') ~ 'auth\.uid\(\)' and coalesce(qual, '') !~ 'SELECT auth\.uid\(\)'
--     or coalesce(with_check, '') ~ 'auth\.uid\(\)' and coalesce(with_check, '') !~ 'SELECT auth\.uid\(\)')
-- union all
-- select 'índices de las 6 FK', count(*) = 6
-- from pg_indexes where schemaname = 'public' and indexname in (
--   'idx_transactions_category','idx_commitment_charges_user','idx_liquid_recon_adjustment_tx',
--   'idx_liquid_recon_redistribution_tx','idx_invitations_created_by','idx_invitations_used_by')
-- union all
-- select 'search_path de las 2 funciones', count(*) = 2
-- from pg_proc where pronamespace = 'public'::regnamespace
--   and proname in ('confirm_commitment_charge','unconfirm_commitment_charge')
--   and proconfig @> array['search_path=public']
-- union all
-- select 'handle_new_user cerrada a authenticated y anon',
--        not has_function_privilege('authenticated','public.handle_new_user()','execute')
--        and not has_function_privilege('anon','public.handle_new_user()','execute')
-- union all
-- select 'validate_invite sigue abierta a anon',
--        has_function_privilege('anon','public.validate_invite(uuid)','execute')
-- union all
-- select 'siguen las 18 policies (15 + invitations + 2 de catálogo)', count(*) = 18
-- from pg_policies where schemaname = 'public';
--
-- Y get_advisors (performance + security): ya no aparecen auth_rls_initplan,
-- unindexed_foreign_keys, function_search_path_mutable ni el aviso de
-- handle_new_user. Siguen validate_invite, pg_net, índices sin uso y, hasta que
-- Nacho lo prenda, contraseñas filtradas.
