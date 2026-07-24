-- 0019: data912 como segunda fuente de precios para instruments -- acciones
-- argentinas, CEDEARs y bonos soberanos (BYMA). No cambia el modelo (ver
-- ADR-006 para el diseño del catálogo compartido): solo agrega semilla.
--
-- Piezas:
--   1. Desactiva los placeholders 'pending' sembrados en la 0018 (is_active
--      queda en false -- ya estaba, este update es explícito e idempotente).
--      No se borran: data912 resuelve ese caso de uso para el universo BYMA,
--      pero un update es más seguro que un delete y el catálogo puede convivir
--      con filas inactivas, que es justo para lo que está esa columna.
--   2. Semilla source='data912': acciones argentinas líderes, CEDEARs más
--      operados y bonos soberanos principales. Todos currency='ARS' (el precio
--      de mercado en BYMA está en pesos). Los símbolos son el ticker BASE de
--      data912, sin los sufijos de liquidación C/D (ver informe de
--      reconocimiento): la misma especie a otro tipo de cambio implícito, no
--      otro instrumento. Verificados uno por uno contra /live/arg_stocks,
--      /live/arg_cedears y /live/arg_bonds antes de escribir esta migración.
--
-- No incluye bonos corporativos (ONs): data912 no tiene histórico para ellos
-- (panel /live/arg_corp, kind 'corp_bond' en la Edge Function) y no hay una
-- selección "principal" obvia como con los soberanos; se agregan más adelante
-- si hace falta.

-- ── 1. Placeholders 'pending' → inactivos, no se borran ─────────────────────
update instruments set is_active = false where source = 'pending';

-- ── 2. Semilla data912 ────────────────────────────────────────────────────────

-- Acciones argentinas líderes (kind='stock', panel data912 arg_stocks).
insert into instruments (source, symbol, name, kind, currency, is_active) values
  ('data912', 'GGAL',  'Grupo Financiero Galicia',      'stock', 'ARS', true),
  ('data912', 'YPFD',  'YPF',                            'stock', 'ARS', true),
  ('data912', 'PAMP',  'Pampa Energía',                  'stock', 'ARS', true),
  ('data912', 'BMA',   'Banco Macro',                    'stock', 'ARS', true),
  ('data912', 'ALUA',  'Aluar',                          'stock', 'ARS', true),
  ('data912', 'CEPU',  'Central Puerto',                 'stock', 'ARS', true),
  ('data912', 'TXAR',  'Ternium Argentina',              'stock', 'ARS', true),
  ('data912', 'COME',  'Sociedad Comercial del Plata',   'stock', 'ARS', true),
  ('data912', 'CRES',  'Cresud',                         'stock', 'ARS', true),
  ('data912', 'TGSU2', 'Transportadora de Gas del Sur',  'stock', 'ARS', true)
on conflict (source, symbol) do nothing;

-- CEDEARs más operados (kind='cedear', panel data912 arg_cedears).
insert into instruments (source, symbol, name, kind, currency, is_active) values
  ('data912', 'AAPL',  'Apple Inc. (CEDEAR)',    'cedear', 'ARS', true),
  ('data912', 'MSFT',  'Microsoft (CEDEAR)',     'cedear', 'ARS', true),
  ('data912', 'GOOGL', 'Alphabet (CEDEAR)',      'cedear', 'ARS', true),
  ('data912', 'AMZN',  'Amazon (CEDEAR)',        'cedear', 'ARS', true),
  ('data912', 'TSLA',  'Tesla (CEDEAR)',         'cedear', 'ARS', true),
  ('data912', 'MELI',  'MercadoLibre (CEDEAR)',  'cedear', 'ARS', true),
  ('data912', 'KO',    'Coca-Cola (CEDEAR)',     'cedear', 'ARS', true),
  ('data912', 'NVDA',  'NVIDIA (CEDEAR)',        'cedear', 'ARS', true),
  ('data912', 'DISN',  'Disney (CEDEAR)',        'cedear', 'ARS', true),
  ('data912', 'VIST',  'Vista Energy (CEDEAR)',  'cedear', 'ARS', true)
on conflict (source, symbol) do nothing;

-- Bonos soberanos principales (kind='bond', panel data912 arg_bonds).
insert into instruments (source, symbol, name, kind, currency, is_active) values
  ('data912', 'AL30', 'Bonar 2030 (Ley Argentina)', 'bond', 'ARS', true),
  ('data912', 'AL29', 'Bonar 2029 (Ley Argentina)', 'bond', 'ARS', true),
  ('data912', 'GD30', 'Global 2030 (Ley NY)',       'bond', 'ARS', true),
  ('data912', 'GD35', 'Global 2035 (Ley NY)',       'bond', 'ARS', true),
  ('data912', 'AE38', 'Bonar 2038 (Ley Argentina)', 'bond', 'ARS', true)
on conflict (source, symbol) do nothing;
