-- RLS multiusuario: cada usuario accede solo a sus propios datos.
-- Reemplaza las políticas "authenticated full access" de la migración 0002.

-- Eliminar las políticas anteriores
drop policy "authenticated full access" on categories;
drop policy "authenticated full access" on transactions;
drop policy "authenticated full access" on assets;
drop policy "authenticated full access" on contributions;
drop policy "authenticated full access" on asset_valuations;
drop policy "authenticated full access" on debts;
drop policy "authenticated full access" on debt_payments;
drop policy "authenticated full access" on settings;

-- Tablas raíz: dueño directo por user_id
create policy "own rows" on categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own rows" on transactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own rows" on assets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own rows" on debts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own rows" on settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Tablas hijas: el dueño se hereda por la relación
create policy "own via asset" on contributions
  for all to authenticated
  using (exists (select 1 from assets a where a.id = contributions.asset_id and a.user_id = auth.uid()))
  with check (exists (select 1 from assets a where a.id = contributions.asset_id and a.user_id = auth.uid()));

create policy "own via asset" on asset_valuations
  for all to authenticated
  using (exists (select 1 from assets a where a.id = asset_valuations.asset_id and a.user_id = auth.uid()))
  with check (exists (select 1 from assets a where a.id = asset_valuations.asset_id and a.user_id = auth.uid()));

create policy "own via debt" on debt_payments
  for all to authenticated
  using (exists (select 1 from debts d where d.id = debt_payments.debt_id and d.user_id = auth.uid()))
  with check (exists (select 1 from debts d where d.id = debt_payments.debt_id and d.user_id = auth.uid()));
