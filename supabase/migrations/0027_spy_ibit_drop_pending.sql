-- 0027: SPY e IBIT como CEDEARs de data912, y baja de los placeholders
-- 'pending'. No cambia el modelo: solo catálogo (ver ADR-006).
--
-- Piezas:
--   1. Borra las 5 filas source='pending' que la 0018 sembró como placeholder
--      de "esto todavía no tiene proveedor de precios" y que la 0019 dejó
--      inactivas. Ya no son un pendiente: lo que representaban (AAPL, MELI,
--      GOOGL, AMZN en USD, SPY como ETF) se resolvió por el lado de BYMA, con
--      instrumentos 'data912' en ARS que la vista instrument_prices_usd
--      convierte a dólares (0026). La 0019 eligió desactivar en vez de borrar
--      por prudencia; a esta altura son ruido en el buscador de instrumentos
--      del formulario de activo y en cualquier consulta al catálogo.
--      Verificado antes de escribir esta migración: ninguna las referencia
--      desde assets.instrument_id, y ninguna tiene filas en instrument_prices
--      (nunca las tuvieron: is_active=false las dejó siempre fuera del cron),
--      así que el on delete cascade de instrument_prices no arrastra nada.
--   2. Semilla de dos CEDEARs nuevos, con el mismo criterio que la 0019:
--      currency='ARS' (el precio de mercado en BYMA está en pesos) y el ticker
--      BASE, sin los sufijos de liquidación C/D. Ambos verificados contra
--      /live/arg_cedears antes de escribir esta migración.
--
-- OJO con IBIT: está en el panel en vivo (el cron diario le va a guardar
-- precio desde la primera corrida), pero data912 NO tiene su serie histórica
-- -- /historical/cedears/IBIT responde HTTP 200 con {"Error": ...}, no un
-- array. data912Backfill ya contempla exactamente ese caso: loguea y saltea
-- ese ticker solo, sin romper la corrida. Consecuencia práctica: IBIT arranca
-- sin historia y la va construyendo día a día. SPY sí tiene serie completa
-- (~870 ruedas desde 2023-01-31).
--
-- SPY convive un instante con la fila 'pending' del mismo símbolo: el unique
-- es (source, symbol), así que ('data912','SPY') y ('pending','SPY') no
-- chocan. Igual la de 'pending' se va en el paso 1, que corre antes.

-- ── 1. Baja de los placeholders 'pending' ───────────────────────────────────
delete from instruments where source = 'pending';

-- ── 2. CEDEARs nuevos (kind='cedear', panel data912 arg_cedears) ────────────
insert into instruments (source, symbol, name, kind, currency, is_active) values
  ('data912', 'SPY',  'SPDR S&P 500 ETF',     'cedear', 'ARS', true),
  ('data912', 'IBIT', 'iShares Bitcoin Trust', 'cedear', 'ARS', true)
on conflict (source, symbol) do nothing;
