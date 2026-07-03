-- Políticas RLS para app-finances (single-user)
-- Regla: solo usuarios autenticados acceden a los datos. El rol anon no accede a nada.
-- Ver docs/adr para la decisión de diseño de acceso.

-- categories
create policy "authenticated full access" on categories
  for all to authenticated using (true) with check (true);

-- transactions
create policy "authenticated full access" on transactions
  for all to authenticated using (true) with check (true);

-- assets
create policy "authenticated full access" on assets
  for all to authenticated using (true) with check (true);

-- contributions
create policy "authenticated full access" on contributions
  for all to authenticated using (true) with check (true);

-- asset_valuations
create policy "authenticated full access" on asset_valuations
  for all to authenticated using (true) with check (true);

-- debts
create policy "authenticated full access" on debts
  for all to authenticated using (true) with check (true);

-- debt_payments
create policy "authenticated full access" on debt_payments
  for all to authenticated using (true) with check (true);

-- settings
create policy "authenticated full access" on settings
  for all to authenticated using (true) with check (true);
