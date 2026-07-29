-- 0020: corrige el id de CoinGecko para Polygon -- MATIC migró 1:1 a POL en
-- septiembre 2024 (aviso oficial de CoinGecko en la ficha del coin). El id
-- viejo 'matic-network' sigue "existiendo" (no tira 404, sigue respondiendo
-- 200) pero quedó zombie: confirmado a mano contra la API real antes de esta
-- migración, su /market_chart no tiene historia real hace tiempo (un solo
-- punto, fechado 2025-10-17, precio 0.0) y su /simple/price devuelve un valor
-- congelado desde 2026-02-03 (last_updated_at no avanza). El id nuevo,
-- 'polygon-ecosystem-token', sí tiene historia activa y actualizada al día.
--
-- Es un update, no un insert nuevo: mismo instrumento (mismo id de fila,
-- misma moneda ARS/USD sin cambios), solo corrige a qué id de CoinGecko
-- apunta. El historial ya guardado bajo el id viejo (instrument_prices sigue
-- enlazado por instrument_id, que no cambia) queda asociado al mismo activo,
-- ahora con el símbolo correcto -- no se borra ni se migra ese historial.
update instruments
set symbol = 'polygon-ecosystem-token',
    name = 'Polygon'
where source = 'coingecko' and symbol = 'matic-network';
