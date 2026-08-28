# ADR-008 — La conversión a dólares vive en una sola vista, no en cada lector

Fecha: 2026-08-27
Estado: aceptado

## Contexto

El portafolio se mide en dólares, pero el catálogo compartido guarda cada
precio en la moneda en que cotiza el instrumento (`instruments.currency`): las
cripto en USD, y todo lo de BYMA —acciones argentinas, bonos y CEDEARs— en ARS.

Hasta ahora convertir era responsabilidad de quien leyera, y había **dos
lectores que lo resolvían distinto**:

- la app (`lib/portfolioPrices.js`) convertía con el MEP en vivo;
- `get_portfolio_series` (migración 0022) no convertía: multiplicaba las
  unidades por el precio en pesos y devolvía eso como si fueran dólares.

Mientras el buscador de instrumentos (ADR-007) solo permitía enganchar cripto,
la diferencia no se veía: todo cotizaba en dólares y dividir por nada era lo
mismo que no dividir. Al abrir el buscador a los papeles de BYMA, apareció de
golpe.

Medido con datos reales en un recorrido de prueba, con 10 unidades de GGAL a
$ 7.070: la tarjeta "Dinero invertido" decía **US$ 2.043,71** y el gráfico de
evolución, en la misma pantalla y unos centímetros más abajo, dibujaba
**US$ 72.690,27**. El mismo portafolio valuado 35 veces más alto, porque
10 × 7.070 pesos se contaban como 70.700 dólares.

Había un **tercer** lector con el mismo defecto latente:
`get_instrument_series` (migración 0018), que hoy no consume nadie desde la app
pero devolvía precios sin convertir igual.

## Decisión

La conversión deja de ser responsabilidad de cada lector y pasa a no ser
responsabilidad de nadie: la vista **`instrument_prices_usd`** (migración 0026)
devuelve el precio ya en dólares, y es el único lugar del sistema donde se
divide por la cotización del dólar. Los tres lectores pasan a leerla.

La alternativa evidente era arreglar `get_portfolio_series` para que convirtiera
igual que la app. Se descartó: deja dos implementaciones de la misma regla, y
mientras haya dos siempre va a haber una que se olvide — que es exactamente
cómo apareció este problema. Con la vista, un lector nuevo no *puede*
equivocarse, porque no tiene el precio en pesos a mano para multiplicar.

Detalles de la decisión:

- **Las cripto no entran en juego.** Ya cotizan en dólares y la vista las
  devuelve tal cual. Su precio EN VIVO sigue viniendo de Binance directo al
  navegador, sin pasar por la vista: tampoco necesita conversión, así que no
  abre un segundo camino.
- **Se convierte con el MEP.** Es la misma cotización con la que la app traduce
  todo lo demás (aportes, pagos de deuda, gastos en dólares).
- **Día por día, no al dólar de hoy.** Cada precio se convierte con la
  cotización de SU fecha. Traer todo al dólar de hoy reescribiría la historia y
  haría que el gráfico entero se moviera cada vez que salta el dólar. Es el
  mismo criterio que ya usa el resto de la app, donde cada aporte congela el
  MEP de su día.
- **Sin cotización, NULL.** Un instrumento en pesos sin ningún MEP hasta esa
  fecha no tiene valor expresable en dólares. La vista devuelve null y cada
  lector cae a la valuación manual, igual que si la API estuviera caída. No se
  inventa un número.

## La aproximación que se acepta

Los CEDEARs y las acciones con ADR arbitran en la práctica contra el **CCL**
(contado con liquidación), no contra el MEP. Los dos suelen moverse juntos y la
brecha entre ellos es chica comparada con la del oficial, pero no son el mismo
número: valuar un CEDEAR al MEP tiene un error del orden de esa brecha.

Se elige el MEP igual, a propósito y por coherencia: tener dos cotizaciones
distintas conviviendo haría que un mismo activo valga distinto según por dónde
se lo mire, que es justamente el problema que este ADR viene a cerrar. Un error
chico y uniforme es preferible a dos números que no cierran entre sí.

Si algún día se agrega el CCL al catálogo, el cambio es de una línea adentro de
la vista.

## Sin ratios de conversión

No hace falta ninguna tabla de ratios de CEDEAR. El precio en pesos de un CEDEAR
ya tiene adentro el tipo de cambio y el ratio contra el papel original: para
valuar una posición alcanza con `unidades × precio en pesos ÷ cotización`. El
ratio solo haría falta para responder "cuántas acciones subyacentes tengo", que
no es una pregunta que la app haga.

## Verificación

Se probó la migración en un Postgres local contra un volcado de solo lectura de
los datos reales, reproduciendo el escenario exacto del bug (10 unidades de
GGAL). El valor del activo calculado por el camino de la app (cantidad ×
`price_usd` del último cierre) y el que devuelve `get_portfolio_series` dan
**45,66 los dos**. El total de la serie pasó de 72.690,27 a 1.141,15.

También se verificó: carry-forward del MEP cuando falta el del día, `price_usd`
nulo cuando no hay ninguna cotización, que una cripto se sigue valuando aunque
no haya MEP, y que la vista no agrega ni pierde filas respecto de la tabla base.
