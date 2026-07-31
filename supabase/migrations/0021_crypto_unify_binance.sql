-- 0021: unifica cripto en Binance -- histórico, cron diario y precio en vivo
-- de la app pasan los tres a la misma fuente, sin escalón entre orígenes.
-- Reemplaza un diseño de dos-orígenes para cripto (Binance solo backfill,
-- CoinGecko diario, igual patrón que el MEP) que se descartó ANTES de
-- implementarse: a diferencia del MEP, Binance y CoinGecko son mercados
-- distintos con precios que difieren de verdad (~0,3-1%), así que ese diseño
-- iba a dejar un salto visible en la serie el día que el backfill se junta
-- con lo que ya venía cargando el cron. Ver ADR-006, sección "Cripto:
-- unificado en Binance".
--
-- Piezas:
--   1. instruments.coingecko_id -- guarda el id de CoinGecko de cada
--      instrumento cripto ANTES de pisar symbol, por si en el futuro hace
--      falta (instrumento sin par de Binance, ver el fallback en la Edge
--      Function). Distinta de assets.coingecko_id (deprecada, en transición
--      a instrument_id -- no tiene relación con esta).
--   2. Las 13 monedas sembradas pasan de source='coingecko' (symbol=id de
--      CoinGecko) a source='binance' (symbol=par de Binance, ej. BTCUSDT).
--      Pares verificados uno por uno contra /api/v3/klines antes de esta
--      migración. polygon-ecosystem-token -> POLUSDT (no MATICUSDT: ese par
--      dejó de operar en 2024-09-09, día en que MATIC migró a POL).
--   3. Borra los precios de cripto ya guardados en instrument_prices (todos
--      vienen de CoinGecko): el backfill de Binance los repone completos, sin
--      mezclar dos proveedores en la misma serie. Acotado a kind='crypto' --
--      no toca data912 (stock/cedear/bond) ni mep (currency).

-- ── 1. Guardar el id de CoinGecko antes de pisar symbol ─────────────────────
alter table instruments add column coingecko_id text;

comment on column instruments.coingecko_id is
  'Id de CoinGecko del instrumento cripto (ej. bitcoin), preservado como referencia/fallback aunque source=''binance''. Sin relación con assets.coingecko_id (deprecada).';

update instruments
set coingecko_id = symbol
where source = 'coingecko' and kind = 'crypto' and coingecko_id is null;

-- ── 2. symbol -> par de Binance, source -> 'binance' ────────────────────────
update instruments set source = 'binance', symbol = 'BTCUSDT'  where coingecko_id = 'bitcoin';
update instruments set source = 'binance', symbol = 'ETHUSDT'  where coingecko_id = 'ethereum';
update instruments set source = 'binance', symbol = 'SOLUSDT'  where coingecko_id = 'solana';
update instruments set source = 'binance', symbol = 'ADAUSDT'  where coingecko_id = 'cardano';
update instruments set source = 'binance', symbol = 'XRPUSDT'  where coingecko_id = 'ripple';
update instruments set source = 'binance', symbol = 'DOGEUSDT' where coingecko_id = 'dogecoin';
update instruments set source = 'binance', symbol = 'BNBUSDT'  where coingecko_id = 'binancecoin';
update instruments set source = 'binance', symbol = 'DOTUSDT'  where coingecko_id = 'polkadot';
update instruments set source = 'binance', symbol = 'LTCUSDT'  where coingecko_id = 'litecoin';
update instruments set source = 'binance', symbol = 'LINKUSDT' where coingecko_id = 'chainlink';
update instruments set source = 'binance', symbol = 'AVAXUSDT' where coingecko_id = 'avalanche-2';
update instruments set source = 'binance', symbol = 'TRXUSDT'  where coingecko_id = 'tron';
update instruments set source = 'binance', symbol = 'POLUSDT'  where coingecko_id = 'polygon-ecosystem-token';

-- ── 3. Borrar precios de cripto ya guardados (vienen de CoinGecko) ─────────
delete from instrument_prices
where instrument_id in (select id from instruments where kind = 'crypto');
