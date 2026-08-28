-- 0025: completa assets.instrument_id en los activos que ya existen.
--
-- La columna existe desde la 0018, que la llenó una vez a partir de
-- coingecko_id. Pero la app nunca la escribió: el formulario de activo pedía
-- un coingecko_id a mano y guardaba SOLO eso, así que todo activo creado
-- desde entonces nació sin instrumento. Consecuencia visible: el gráfico de
-- evolución (get_portfolio_series, migración 0022) busca el precio por
-- instrument_id, no lo encontraba, y valuaba ese activo en 0 TODOS los días
-- — mientras la pantalla de Portafolio, que resolvía por coingecko_id, lo
-- mostraba con su valor real. El mismo activo valía dos cosas distintas
-- según dónde se lo mirara, y en el gráfico aparecía como una pérdida total
-- que nunca ocurrió.
--
-- Desde ahora el vínculo lo elige un buscador sobre `instruments` y lo que se
-- guarda es instrument_id (ver lib/instruments.js). Esta migración empareja
-- lo viejo con las dos reglas que no admiten duda:
--
--   1. Por coingecko_id, para cripto. Es el identificador que el formulario
--      pedía, así que empareja exactamente lo que el usuario ya había
--      declarado. Se compara contra instruments.coingecko_id (los de Binance
--      lo conservan desde la 0021) y contra instruments.symbol (los de
--      CoinGecko, donde el symbol ES el id).
--   2. Por ticker, para lo que cotiza en BYMA. `assets.ticker` era
--      informativo; cuando coincide con el símbolo de un instrumento activo
--      es el mismo papel, sin ambigüedad.
--
-- Lo que NO se empareja, a propósito: por NOMBRE. Un activo llamado "AAPL"
-- puede ser el CEDEAR o la acción en dólares, y un activo llamado "CEDEARs
-- Cocos" es una cuenta con varios papeles adentro, no un papel. Enganchar mal
-- es peor que no enganchar: cambiaría un número sin que nadie lo pida. Esos
-- quedan como están y se enganchan a mano desde el formulario, si corresponde.
--
-- NO toca valuation_mode. Un activo de valuación manual enganchado a un
-- instrumento SIGUE valuándose a mano: instrument_id solo se lee cuando el
-- modo es 'live' (tanto en la app como en get_portfolio_series). Es decir,
-- esta migración no cambia ningún número que la app muestre hoy; deja el
-- vínculo listo para el día que el usuario elija "Valuación automática".
--
-- Idempotente: solo escribe donde instrument_id todavía es null, y solo
-- cuando la coincidencia es ÚNICA.

-- Todos los emparejamientos posibles, por cualquiera de las dos reglas.
with matches as (
  select a.id as asset_id, i.id as instrument_id
  from assets a
  join instruments i
    on i.is_active
   and (
     -- 1. cripto por el id de CoinGecko que ya tenía el activo
     (
       a.coingecko_id is not null
       and (
         i.coingecko_id = a.coingecko_id
         or (i.source = 'coingecko' and i.symbol = a.coingecko_id)
       )
     )
     -- 2. papeles de BYMA por ticker
     or (
       a.ticker is not null
       and btrim(a.ticker) <> ''
       and i.source = 'data912'
       and i.symbol = upper(btrim(a.ticker))
     )
   )
  where a.instrument_id is null
),

-- Solo los activos que emparejaron con UN instrumento. Con dos candidatos no
-- hay forma de elegir sin adivinar, y adivinar acá es cambiar plata de lugar:
-- esos quedan sin enganchar, para que los resuelva una persona.
unambiguous as (
  -- array_agg y no min(): Postgres no define min() para uuid. El having de
  -- abajo ya garantiza que hay uno solo, así que tomar el primero es tomar
  -- ese.
  select asset_id, (array_agg(distinct instrument_id))[1] as instrument_id
  from matches
  group by asset_id
  having count(distinct instrument_id) = 1
)

update assets
set instrument_id = u.instrument_id
from unambiguous u
where assets.id = u.asset_id;
