# ADR-013: el movimiento guarda su moneda; la tasa se congela solo si hubo conversión

Fecha: 2026-09-08
Estado: aceptada
Migración: 0036

## Contexto

Hasta acá la app tenía una sola moneda para la vida diaria: `transactions`
guardaba `amount_ars` y no había nada que decidir. El rediseño de cuentas
rompe ese supuesto — una cuenta va a poder estar en dólares — y con él aparecen
tres preguntas que hay que contestar juntas, porque una respuesta mala en
cualquiera contamina a las otras dos:

1. ¿Dónde vive la moneda de un movimiento?
2. ¿Se le congela una tasa, como ya hacen `contributions` y `debt_payments`?
3. ¿Quién convierte a dólares para mostrar, y dónde vive esa conversión?

## Decisión

### 1. La moneda es una columna de la fila, no se deriva de la cuenta

`transactions` guarda `amount` + `currency`. `liquid_accounts` guarda su propia
`currency`, y el formulario la copia a la fila al escribirla — no la referencia.

Derivarla de la cuenta al leer parecía más barato y es incorrecto por dos
motivos independientes:

- `account_id` es **nullable** (migración 0032). El balde "sin cuenta" no
  tendría de dónde leerla.
- Si una cuenta cambia de moneda, todos sus movimientos pasados cambiarían de
  significado retroactivamente: un gasto de 50.000 pasaría de ser 50.000 pesos
  a ser 50.000 dólares porque alguien tocó un selector en Ajustes. La historia
  no se reescribe. Es el mismo principio que congela el MEP en cada aporte y
  que guarda `empties_asset` en la fila del retiro (ADR-011).

Por eso, además, `amount_ars` se **renombra** a `amount` en vez de convivir con
un `amount_usd` al lado: dos columnas para el mismo hecho son dos fuentes de
verdad y obligan a un `coalesce` en cada lector, y dejar dólares adentro de una
columna llamada `amount_ars` es peor que una columna muerta — es una que miente
por nombre.

`currency` es ISO 4217 validado por FORMA (`^[A-Z]{3}$`), no contra una lista
cerrada: la app tiene que poder lanzarse en otro país sin una migración. No hay
tabla de catálogo de monedas porque no hace falta ninguna — el símbolo y los
decimales de cada moneda los resuelve `Intl.NumberFormat`.

### 2. La tasa congelada solo existe donde hubo una conversión real

`contributions` y `debt_payments` guardan `amount_usd` + `mep_rate`;
`transactions` guarda `amount` + `currency` y **ninguna tasa**. No son dos
modelos distintos: son el mismo, que es

> (monto, moneda) + tasa congelada SOLO cuando hubo una conversión real.

Un aporte en dólares pagado con pesos SÍ convirtió: la tasa de ese día es un
hecho del evento, y por eso se congela y no se recalcula nunca. Un gasto de 50
dólares pagado desde una cuenta en dólares NO convirtió nada; inventarle una
tasa sería fabricar una operación que no ocurrió, y encima una que después
alguien leería como si hubiera pasado.

Cuando ese gasto haya que mostrarlo en otra moneda, se convierte AL MOSTRAR,
con la cotización de su fecha (carry-forward). Es exactamente lo que ya hace
hoy el bloque de Gastos de Inicio con la serie diaria del catálogo.

### 3. La conversión a dólares vive en el cliente, no en la función SQL

`get_liquid_by_account()` devuelve monto **nativo** + `currency` + `is_savings`,
y no convierte nada.

La tentación era copiar `instrument_prices_usd` (ADR-008), que convierte dentro
de la base. Pero esa vista resuelve otro problema: convierte precios
**históricos**, día por día, y vive en la base justamente porque tres lectores
distintos convertían distinto y el mismo activo valía dos cosas según dónde se
lo mirara. El disponible es lo contrario: una **foto de hoy**, que se expresa en
otra unidad a la cotización de hoy. No hay historia que preservar.

Y "un solo lugar que convierte" acá significa el cliente, porque ese lugar ya
existe y ya está declarado como tal: `lib/localCurrency.js`, que lee el mismo
instrumento MEP del mismo catálogo con el mismo carry-forward. Meter la
conversión adentro de la función SQL abriría un TERCER sitio que lee
cotizaciones, que es justo lo que ADR-008 vino a cerrar. Se sigue el criterio
de la 0026, no su implementación.

Tres consecuencias prácticas apoyan lo mismo:

- Los cuatro números del rediseño (disponible / ahorro / invertido / total)
  necesitan igual el monto nativo — "disponible" se muestra en pesos. Si SQL
  convirtiera, habría que devolver las dos columnas de todos modos.
- Nada de lo que motivó llevar la suma a Postgres (el corte silencioso de
  PostgREST en 1000 filas, migración 0033) aplica a la conversión: es un rate
  por moneda, no miles de filas.
- `liquidSql.test.js` corre la función en un Postgres scratch. Si dependiera de
  `instruments`/`instrument_prices`, habría que sembrar cotizaciones y el test
  de la fórmula del disponible pasaría a ser, a medias, un test de FX.

La extensión natural para una tercera moneda es una función
`toUsd(amount, currency, date)` en `localCurrency.js`: devuelve tal cual si es
USD, usa el MEP si es ARS, y para cualquier otra pide su instrumento al
catálogo. Sigue siendo un solo lugar.

## Consecuencias

- **Este paso no cambia ningún número.** Todas las cuentas quedan en ARS y como
  no-ahorro; el rename no toca datos; la función suma exactamente lo mismo. Es
  preparación, verificada comparando el disponible real antes y después.
- **`is_savings` se guarda pero no se muestra.** La marca existe y la función la
  devuelve; ninguna pantalla la mira todavía. Se decide acá para no tener que
  volver a migrar cuando lleguen los cuatro números.
- **Deuda conocida y nombrada: un aporte desde una cuenta en dólares.** Hoy
  `get_liquid_by_account` pasa los aportes y pagos a pesos multiplicándolos por
  su `mep_rate` congelado, y suma eso junto con las transactions. Con todas las
  cuentas en ARS el resultado es correcto por construcción. El día que exista
  una cuenta en dólares, **dos cosas tienen que cambiar juntas**:
  1. cada transaction suma en su propia moneda, no todas en el mismo balde; y
  2. un aporte que sale de una cuenta en dólares **no se multiplica por el
     MEP** — no convirtió nada, así que resta `amount_usd` directo, y su
     `mep_rate` deja de ser un insumo del disponible (sigue siendo el precio
     de compra del activo, que es otra cosa).
  Es la misma regla de la sección 2 aplicada del otro lado. Está anotado acá
  porque es el tipo de detalle que, si no queda escrito, se descubre cuando los
  números ya están mal en pantalla.
- **Lo que NO es esto**: no es multi-moneda de punta a punta. El portafolio
  sigue en USD, las deudas en USD, y la app sigue teniendo una "moneda local"
  con una sola cotización (el MEP). Esta decisión abre la puerta a cuentas en
  otra moneda; no la cruza.
