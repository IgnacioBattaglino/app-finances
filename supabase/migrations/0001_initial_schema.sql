-- Migración inicial: esquema de app-finances
-- Modelo de datos completo. Ver docs/ARCHITECTURE.md para el detalle de cada tabla.

-- Extensión para gen_random_uuid()
create extension if not exists "pgcrypto";

-- categories: categorías de gasto e ingreso
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- transactions: gastos e ingresos individuales (ARS)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null check (kind in ('expense', 'income')),
  category_id uuid not null references categories(id),
  description text,
  amount_ars numeric(14,2) not null check (amount_ars > 0),
  created_at timestamptz not null default now()
);

-- assets: activos gestionables del portafolio
create table assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('crypto', 'cedear', 'bond', 'fund', 'cash')),
  coingecko_id text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- contributions: aportes a un activo (USD), con MEP congelado
create table contributions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  date date not null,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  quantity numeric(20,8),
  mep_rate numeric(10,2) not null,
  created_at timestamptz not null default now()
);

-- asset_valuations: valor actual manual de cada activo (USD)
create table asset_valuations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  date date not null,
  value_usd numeric(14,2) not null check (value_usd >= 0),
  created_at timestamptz not null default now(),
  unique (asset_id, date)
);

-- debts: deudas
create table debts (
  id uuid primary key default gen_random_uuid(),
  creditor text not null,
  original_amount_usd numeric(14,2) not null check (original_amount_usd > 0),
  start_date date not null,
  created_at timestamptz not null default now()
);

-- debt_payments: pagos de deuda (USD)
create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id),
  date date not null,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  created_at timestamptz not null default now()
);

-- settings: configuración global (una sola fila)
create table settings (
  id int primary key default 1 check (id = 1),
  desired_monthly_income_usd numeric(10,2) not null default 1500,
  safe_withdrawal_rate numeric(5,4) not null default 0.04,
  expected_annual_return numeric(5,4) not null default 0.08,
  birth_date date,
  plan_start_date date,
  projection_window_months int not null default 6,
  target_allocation jsonb not null default '{"crypto":15,"cedear":65,"bond":10,"fund":10,"cash":0}',
  rebalance_threshold numeric(5,4) not null default 0.05,
  updated_at timestamptz not null default now()
);

-- Fila única de settings con valores por defecto
insert into settings (id) values (1);
