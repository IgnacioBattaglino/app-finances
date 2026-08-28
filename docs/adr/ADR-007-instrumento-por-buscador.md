# ADR-007 — El vínculo activo↔precio es un instrumento elegido, no un identificador escrito

Fecha: 2026-08-27
Estado: aceptado

## Contexto

Un activo de valuación automática necesita saber a qué papel de mercado
corresponde para poder traer su precio. Desde la primera versión, ese vínculo
era `assets.coingecko_id`: un campo de texto libre en el formulario de activo
donde el usuario escribía de memoria un identificador interno de CoinGecko
("bitcoin", "polygon-ecosystem-token").

Eso tenía tres problemas, y los tres eran silenciosos:

1. **Nadie completaba `assets.instrument_id`.** La migración 0018 creó el
   catálogo compartido (`instruments` / `instrument_prices`) y llenó esa
   columna una vez, pero el formulario siguió guardando solo `coingecko_id`.
   Todo activo creado después nació sin instrumento. Como el gráfico de
   evolución (`get_portfolio_series`, migración 0022) busca el precio por
   `instrument_id`, esos activos valían **0 todos los días** en el gráfico —
   mientras la pantalla de Portafolio, que resolvía por `coingecko_id`, los
   mostraba con su valor real. El mismo activo valía dos cosas distintas según
   dónde se lo mirara. Peor: como la línea de "aportado" sí los contaba, el
   gráfico mostraba una pérdida total que nunca había ocurrido.

2. **Un error de tipeo no avisaba nada.** El campo era libre y opcional: un id
   mal escrito guardaba igual y el activo quedaba sin precio para siempre, sin
   ningún error. Quedó evidencia real en la base de pruebas (un activo con
   `coingecko_id = 'moneda-inexistente-zz'`).

3. **Pedía vocabulario de la implementación.** Escribir "polygon-ecosystem-token"
   exige saber cómo nombra CoinGecko a las cosas, lo contrario de la convención
   de formularios del proyecto (cada campo se nombra con la pregunta que
   responde, en el idioma del usuario).

Además obligaba a mantener a mano, dentro de `lib/prices.js`, un mapa fijo
`coingecko_id → par de Binance` que tenía que quedar en sync con la semilla de
la migración 0021.

## Decisión

El formulario de activo elige el instrumento de un **buscador sobre
`instruments`** (por nombre o por símbolo) y guarda `instrument_id`. No se
puede escribir un identificador libre: o se elige uno del catálogo, o el activo
usa valuación manual.

Consecuencias del cambio:

- **`instrument_id` es el único vínculo que se lee.** Lo usan tanto el precio de
  la pantalla como el gráfico de evolución, así que las dos vistas no pueden
  volver a divergir: es el mismo dato.
- **El par de Binance sale del instrumento** (`instruments.symbol`), no de un
  mapa fijo en el código. Un instrumento nuevo se agrega en una migración, en
  un solo lugar.
- **Guardar un activo de valuación automática sin instrumento ya no es posible**
  (el formulario lo exige). Antes se podía, y era la forma de nacer roto.
- **Cambiar un activo a otro modo lo desengancha** (`instrument_id` vuelve a
  null): un vínculo colgado sería un precio que el historial interpretaría
  aunque la pantalla no.

## El precio sigue siendo en vivo

Enganchar por instrumento **no** convierte el portafolio en precios de cierre.
La resolución (ver `lib/portfolioPrices.js`) mantiene dos orígenes:

- **En vivo** cuando la fuente cotiza desde el navegador (cripto: Binance con
  fallback a CoinGecko). Es lo que Portafolio muestra, y se mantiene así a
  propósito: la pantalla dice cuánto vale tu plata ahora.
- **Último cierre guardado por el cron** para lo que no tiene precio en vivo
  desde el navegador (acciones argentinas, CEDEARs y bonos de BYMA), y como red
  para lo que sí lo tiene pero la API falló.

Los instrumentos que cotizan en pesos se convierten a USD al MEP del día. Sin
MEP no se inventa un valor: el activo cae a su valuación manual, igual que si
la API estuviera caída. Un precio en otra moneda sumado al total sería un
número inventado, que es exactamente lo que este ADR viene a evitar.

Esto amplía la valuación automática más allá de cripto: cualquiera de los
instrumentos del catálogo sirve.

## Alternativas descartadas

- **Validar el `coingecko_id` escrito contra la API antes de guardar.** Arregla
  el error de tipeo pero no el problema de fondo: seguiría sin completar
  `instrument_id`, y el gráfico seguiría valuando en 0.
- **Que el gráfico resuelva por `coingecko_id` como la pantalla.** Alinea las
  dos vistas por el lado equivocado: deja el catálogo compartido sin uso y no
  sirve para nada que no sea cripto.
- **Emparejar por `ticker` en tiempo de lectura, sin guardar el vínculo.** Un
  ticker no es único entre fuentes (AAPL es el CEDEAR en BYMA y la acción en
  dólares) y adivinar en cada render es adivinar distinto según qué instrumentos
  existan ese día.

## Migración de lo existente

La 0025 completa `instrument_id` en los activos que ya existían, con dos reglas
que no admiten duda: por `coingecko_id` (cripto) y por `ticker` contra los
símbolos de BYMA. Solo escribe cuando la coincidencia es única, y **no toca
`valuation_mode`** — un activo manual enganchado sigue valuándose a mano hasta
que el usuario elija lo contrario, así que la migración no cambia ningún número
que la app muestre.

Lo que no empareja sin ambigüedad queda como está, para que lo resuelva una
persona desde el formulario: enganchar mal es peor que no enganchar, porque
cambia un número sin que nadie lo pida.

`assets.coingecko_id` queda deprecada pero no se borra: la 0025 la usa para
emparejar, y hasta verificar el resultado en producción conviene conservarla.
