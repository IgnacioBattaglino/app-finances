-- Historial de reconciliaciones de saldo líquido.
-- El usuario declara su líquido real (efectivo + cuentas) cada tanto;
-- la app calcula la diferencia contra lo esperado y la registra como ajuste.
create table liquid_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  date date not null,
  declared_amount_ars numeric(14,2) not null check (declared_amount_ars >= 0),
  adjustment_transaction_id uuid references transactions(id),
  created_at timestamptz not null default now()
);
alter table liquid_reconciliations enable row level security;
create policy "own rows" on liquid_reconciliations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index idx_liquid_recon_user_date on liquid_reconciliations(user_id, date);
