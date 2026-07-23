-- 0018: historial de precios diarios, compartido entre todos los usuarios,
-- alimentado por un cron del servidor. Esta migración NO cambia nada visible
-- en la app: crea catálogo + historial + lectura + agenda del cron, y migra
-- los coingecko_id existentes al catálogo, dejando la columna vieja intacta.
--
-- Piezas:
--   1. Extensiones (pg_cron, pg_net) — idempotentes.
--   2. instruments        — catálogo COMPARTIDO (sin user_id).
--   3. instrument_prices  — precios diarios COMPARTIDOS (sin user_id).
--   4. RLS: lectura para authenticated; NADIE tiene policy de escritura, así
--      que el único que escribe es la service_role de la Edge Function (que
--      bypassa RLS). Ese es el mecanismo de "escritura solo desde el cron".
--   5. assets.instrument_id — reemplazo futuro del coingecko_id suelto.
--   6. Migración de datos coingecko_id → instruments (idempotente).
--   7. Semilla del catálogo.
--   8. get_instrument_series — lectura con carry-forward (solo base, sin UI).
--   9. Agenda del cron (pg_cron + pg_net), leyendo URL y secreto del Vault.

-- ── 1. Extensiones ──────────────────────────────────────────────────────────
-- En Supabase pueden estar ya habilitadas desde el dashboard; el "if not
-- exists" las deja igual si ya están. supabase_vault suele venir pre-habilitado
-- (lo usa el paso 9 para leer la URL/secreto del cron sin commitearlos).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 2. instruments (catálogo compartido) ────────────────────────────────────
-- No lleva user_id: es un catálogo global. source es la "fuente lógica"
-- ('coingecko', 'mep', 'pending'), no necesariamente el proveedor HTTP
-- concreto — ver el ADR-006 y el manejo de 'mep' en la Edge Function, que usa
-- dolarapi para el precio diario y argentinadatos para el histórico bajo el
-- mismo instrumento.
create table instruments (
  id uuid primary key default gen_random_uuid(),
  source text not null,               -- 'coingecko' | 'mep' | 'pending' | futuras
  symbol text not null,               -- identificador dentro de esa fuente ('bitcoin', 'AAPL', 'mep')
  name text not null,                 -- nombre para mostrar ('Bitcoin', 'Apple Inc.')
  kind text not null,                 -- 'crypto'|'stock'|'etf'|'bond'|'cedear'|'currency'
  currency text not null,             -- moneda del precio: 'USD' | 'ARS'
  is_active boolean not null default true,  -- si el cron lo consulta
  created_at timestamptz not null default now(),
  unique (source, symbol)
);

-- ── 3. instrument_prices (precios diarios compartidos) ──────────────────────
create table instrument_prices (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references instruments (id) on delete cascade,
  date date not null,
  price numeric(20,8) not null,
  fetched_at timestamptz not null default now(),
  unique (instrument_id, date)        -- permite upsert idempotente por (instrumento, día)
);

create index instrument_prices_instrument_date_idx
  on instrument_prices (instrument_id, date desc);

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
-- Lectura para cualquier usuario autenticado. Ninguna policy de INSERT/UPDATE/
-- DELETE => authenticated y anon NO pueden escribir. La Edge Function del cron
-- escribe con la service_role key, que bypassa RLS por completo: es el único
-- escritor. anon no lee (las policies son solo "to authenticated").
alter table instruments enable row level security;
alter table instrument_prices enable row level security;

create policy "instruments readable by authenticated"
  on instruments for select to authenticated using (true);

create policy "instrument_prices readable by authenticated"
  on instrument_prices for select to authenticated using (true);

-- ── 5. assets.instrument_id ─────────────────────────────────────────────────
-- Nullable. Reemplaza a futuro al coingecko_id suelto, pero la columna vieja
-- NO se borra en esta migración (se elimina cuando el código nuevo esté
-- verificado en producción). Por ahora el frontend sigue leyendo coingecko_id.
alter table assets
  add column instrument_id uuid references instruments (id);

create index assets_instrument_id_idx on assets (instrument_id);

-- ── 6. Migración de datos: coingecko_id → instruments ───────────────────────
-- Set-based, cubre a TODOS los usuarios (el catálogo es compartido), sin
-- enumerarlos. Idempotente: el on conflict no pisa lo que ya sembró el paso 7,
-- y el update solo toca assets que aún no apuntan a un instrumento.
insert into instruments (source, symbol, name, kind, currency)
select distinct 'coingecko', coingecko_id, coingecko_id, 'crypto', 'USD'
from assets
where coingecko_id is not null
on conflict (source, symbol) do nothing;

update assets a
set instrument_id = i.id
from instruments i
where i.source = 'coingecko'
  and i.symbol = a.coingecko_id
  and a.instrument_id is null;

-- ── 7. Semilla del catálogo ─────────────────────────────────────────────────
-- Cripto (coingecko, is_active=true): las más comunes. Las que ya usen los
-- usuarios ya se insertaron en el paso 6; el on conflict evita duplicarlas.
insert into instruments (source, symbol, name, kind, currency, is_active) values
  ('coingecko', 'bitcoin',       'Bitcoin',      'crypto', 'USD', true),
  ('coingecko', 'ethereum',      'Ethereum',     'crypto', 'USD', true),
  ('coingecko', 'solana',        'Solana',       'crypto', 'USD', true),
  ('coingecko', 'cardano',       'Cardano',      'crypto', 'USD', true),
  ('coingecko', 'ripple',        'XRP',          'crypto', 'USD', true),
  ('coingecko', 'dogecoin',      'Dogecoin',     'crypto', 'USD', true),
  ('coingecko', 'binancecoin',   'BNB',          'crypto', 'USD', true),
  ('coingecko', 'polkadot',      'Polkadot',     'crypto', 'USD', true),
  ('coingecko', 'litecoin',      'Litecoin',     'crypto', 'USD', true),
  ('coingecko', 'chainlink',     'Chainlink',    'crypto', 'USD', true),
  ('coingecko', 'avalanche-2',   'Avalanche',    'crypto', 'USD', true),
  ('coingecko', 'tron',          'TRON',         'crypto', 'USD', true),
  ('coingecko', 'matic-network', 'Polygon',      'crypto', 'USD', true)
on conflict (source, symbol) do nothing;

-- Dólar MEP: instrumento propio con source lógica 'mep' (kind currency, en ARS).
-- La Edge Function resuelve el proveedor según el modo: dolarapi (diario, la
-- misma fuente que usan hoy los formularios) y argentinadatos (backfill).
insert into instruments (source, symbol, name, kind, currency, is_active) values
  ('mep', 'mep', 'Dólar MEP', 'currency', 'ARS', true)
on conflict (source, symbol) do nothing;

-- Acciones / ETFs frecuentes: source 'pending' = placeholder documentado, aún
-- NO elegimos proveedor. is_active=false => el cron nunca las consulta. Cuando
-- se elija proveedor, se actualiza el source con un update y se activan.
insert into instruments (source, symbol, name, kind, currency, is_active) values
  ('pending', 'AAPL',  'Apple Inc.',        'stock', 'USD', false),
  ('pending', 'MELI',  'MercadoLibre',      'stock', 'USD', false),
  ('pending', 'GOOGL', 'Alphabet',          'stock', 'USD', false),
  ('pending', 'AMZN',  'Amazon',            'stock', 'USD', false),
  ('pending', 'SPY',   'S&P 500 (SPY ETF)', 'etf',   'USD', false)
on conflict (source, symbol) do nothing;

-- ── 8. Lectura con carry-forward (solo base, sin UI todavía) ────────────────
-- Dado un activo y un rango [p_from, p_to], devuelve la serie diaria: cada día
-- sin precio hereda el último conocido (carry-forward). Activos con instrumento
-- (precio en vivo) leen instrument_prices; los de valuación manual (sin
-- instrument_id) caen a su última asset_valuation hasta esa fecha, misma regla.
-- SECURITY INVOKER: RLS sigue aplicando. Un activo ajeno no matchea en assets
-- (RLS "own rows") => la serie sale toda en null, sin fuga.
create or replace function public.get_instrument_series(
  p_asset_id uuid,
  p_from date,
  p_to date
)
returns table (date date, price numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ),
  a as (
    select instrument_id from assets where id = p_asset_id
  )
  select
    days.d as date,
    coalesce(
      -- 1) precio del instrumento referenciado (activos de precio en vivo)
      (select ip.price
         from instrument_prices ip
         where ip.instrument_id = (select instrument_id from a)
           and ip.date <= days.d
         order by ip.date desc
         limit 1),
      -- 2) fallback: última valuación manual del activo hasta esa fecha
      (select av.value_usd
         from asset_valuations av
         where av.asset_id = p_asset_id
           and av.date <= days.d
         order by av.date desc
         limit 1)
    ) as price
  from days
  order by days.d;
$$;

revoke all on function public.get_instrument_series(uuid, date, date) from public;
grant execute on function public.get_instrument_series(uuid, date, date) to authenticated;

-- ── 9. Agenda del cron ──────────────────────────────────────────────────────
-- pg_cron corre en la TZ del server, que en Supabase es UTC. Argentina es
-- UTC−3 FIJO (sin horario de verano), así que 09:00 ART = 12:00 UTC todo el
-- año => '0 12 * * *'. Si Argentina volviera a tener DST, esto habría que
-- revisarlo.
--
-- La URL de la Edge Function y el secreto de autorización se leen del Vault
-- (supabase_vault), NO se commitean acá. Antes de correr esta migración, cargá
-- ambos secretos con el snippet que viene en las instrucciones (se corre una
-- sola vez, no se commitea con valores reales):
--     vault: 'edge_refresh_prices_url'  -> https://<ref>.supabase.co/functions/v1/refresh_prices
--     vault: 'cron_secret'              -> el mismo valor que CRON_SECRET en la Edge Function
--
-- Idempotente: si ya existe un job con este nombre, lo desagenda antes de
-- volver a agendarlo (así re-correr la migración no acumula jobs ni falla).
do $$
begin
  perform cron.unschedule('refresh-prices-daily')
  where exists (select 1 from cron.job where jobname = 'refresh-prices-daily');
end $$;

select cron.schedule(
  'refresh-prices-daily',
  '0 12 * * *',  -- 12:00 UTC = 09:00 ART (UTC−3 fijo)
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_refresh_prices_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
