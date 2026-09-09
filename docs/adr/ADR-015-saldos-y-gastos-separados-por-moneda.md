# ADR-015: los saldos y los gastos se muestran separados por moneda; solo la comparación histórica convierte

Fecha: 2026-09-09
Estado: aceptada
Migraciones: 0039

## Contexto

ADR-013 dejó cada movimiento guardando su moneda y anotó, explícitamente, una
deuda para "el paso que habilite cuentas en dólares":

> El día que exista una cuenta en dólares, dos cosas cambian JUNTAS: la
> transaction suma en su propia moneda, y un aporte que sale de una cuenta en
> dólares no se multiplica por el MEP — no convirtió nada.

Ese día llegó y ninguna de las dos estaba hecha. En concreto había **dos
errores encadenados**, uno de escritura y uno de lectura:

1. **La app guardaba mal.** El formulario de movimiento nunca mandaba
   `currency`, así que la base completaba `'ARS'` por default (migración 0036).
   Un gasto cargado desde una cuenta en dólares quedaba escrito como pesos.
2. **La app sumaba mal.** `get_liquid_by_account()` multiplicaba `amount_usd ×
   mep_rate` en TODA contribución y TODO pago de deuda, sin mirar la moneda de
   la cuenta. Y `computeCurrentLiquid` sumaba todos los baldes del día a día en
   un solo número que la pantalla rotulaba "ARS". Cargar US$ 100 en una cuenta
   en dólares sumaba 100 al total en pesos.

El primero es más grave que el segundo: un error de lectura se arregla y los
números vuelven solos; uno de escritura deja filas mintiendo para siempre.

## Decisión

### 1. La moneda se copia al escribir, desde la cuenta

`transactionCurrency` (`lib/transactions.js`) decide la moneda del movimiento y
el formulario la manda con la fila. Sale de la cuenta elegida; sin cuenta es la
local, igual que el balde null de `get_liquid_by_account`.

**Editando, si la cuenta no cambió, manda la moneda que YA TIENE LA FILA.** Es
la regla de "guardar sin tocar nada deja la fila idéntica" y el mismo criterio
que `empties_asset` (ADR-011): el insumo de un hecho pasado se lee de la fila,
no se vuelve a deducir. Cambiar la cuenta sí cambia la moneda — la plata pasó a
estar en otro lado, es otro hecho.

No hay selector de moneda en el formulario: sería una segunda forma de decir lo
mismo, y dejaría elegir una moneda distinta de la de la cuenta, que no es una
operación que la app sepa registrar. Lo que sí cambia es el símbolo del campo
de monto (`$` / `US$`), que es cómo el usuario ve en qué está cargando.

### 2. Un monto en dólares se convierte solo si la cuenta no está en dólares

La regla vive en una función de una línea, `amountInCurrency`
(`lib/currencyTotals.js`), porque la aplican dos módulos del cliente
(`lib/liquid.js` y `lib/movements.js`) y la replica la función SQL. Una tercera
copia suelta era la forma segura de que una de las tres se olvidara.

La condición se escribe como "la cuenta NO es USD", no como "la cuenta es ARS":
`mep_rate` es *moneda local por dólar*, así que el día que la app se lance en
otro país la rama sigue siendo la correcta. Una tercera moneda (una cuenta en
euros) no la resuelve esto ni el resto de la app — no hay tasa congelada que la
exprese — y no se inventa una.

### 3. "Cuánto tengo" se muestra tal cual es. "Cuánto gasté comparado con antes" se convierte

Es la línea que ordena todo lo demás, y explica por qué dos pantallas vecinas
hacen cosas opuestas a propósito:

| | Qué hace | Por qué |
|---|---|---|
| Dinero disponible, Dinero ahorrado, Contar mi plata | separa por moneda | son fotos del presente: convertirlas inventa una precisión que no existe |
| Gastos del mes, totales de Movimientos | separa por moneda | ídem, más que un balance mezclado no responde ninguna pregunta |
| Serie de 12 meses | unifica a dólares, al MEP de cada fecha | comparar meses necesita UNA vara, o la inflación se come la comparación |
| Tarjeta "Total" de Inicio | unifica a dólares, al MEP de hoy | es la única suma de los tres mundos, y ya era así |

La serie de 12 meses tenía además el mismo error al revés: convertía **cada**
gasto con `localCurrencyToUsd`, así que un gasto ya en dólares se dividía por
el MEP una segunda vez. Pasa a usar `toUsd`, que para pesos es idénticamente lo
de antes. No es un cambio de la regla: es la regla, cumplida.

### 4. Dos monedas son dos hechos pares, no un número con una nota al pie

Cuando una tarjeta tiene saldo en dos monedas, los dos montos van **del mismo
tamaño**, uno debajo del otro, cada uno con su símbolo. Es la doctrina que ya
ordenaba Inicio un nivel más arriba (disponible, ahorrado, invertido y deudas
del mismo peso porque ninguna manda sobre las otras), bajada un nivel. Poner el
segundo más chico afirmaría una jerarquía que la app no puede sostener: quien
tiene casi todo en dólares leería su plata al revés.

Con dos montos **desaparece el chip de moneda del encabezado**: cada monto ya
trae su símbolo, y el chip pasaría a nombrar una sola de las dos — sería la
etiqueta equivocada, no una de más.

### 5. La moneda extranjera en cero no se muestra

Es el caso NORMAL, no el raro: los dólares se compran para guardarlos, no para
gastarlos en el día a día, así que casi todos los meses el gasto en dólares es
exactamente 0. Una línea "US$ 0" fija debajo de cada número convertiría esa
normalidad en ruido permanente — mismo criterio con el que "Deudas" no aparece
sin deudas.

La consecuencia buscada es más fuerte que ahorrar una línea: **con datos solo
en pesos, todo se ve exactamente igual que antes de este cambio.**

### 6. Un desglose se compara consigo mismo: una lista por moneda

"En qué se fue" (Movimientos) y el desglose de Gastos de Inicio pasan a ser una
lista por moneda en vez de una sola lista con dos montos por fila. Un desglose
se lee por la proporción entre sus filas —la barra de cada categoría se dibuja
contra la más grande— y una proporción entre pesos y dólares no significa nada.

Por lo mismo, la comparación contra el mes anterior se calcula sobre la moneda
local: un solo porcentaje no puede describir dos monedas, y dos porcentajes en
una línea de 13px no se leen. Cuando además hubo gastos en otra moneda, la
frase lo aclara ("…a esta altura, en pesos") — una palabra de más, y solo en el
caso raro.

## Consecuencias

- **Con datos solo en pesos no se mueve un centavo, y está verificado corriendo
  las dos versiones.** `liquidSql.test.js` levanta un Postgres local, aplica la
  0033 y la 0036, mete un dataset de cientos de filas, fotografía la salida de
  la función vieja, aplica la 0039 y exige que la nueva devuelva lo mismo
  carácter por carácter. Contra la cuenta test real: el total, el desglose por
  cuenta, los cuatro totales de cada mes con datos y el desglose por categoría
  dan idénticos a la fórmula anterior.
- **La 0039 no escribe ni una fila.** Es solo `create or replace function`: el
  dato ya estaba bien guardado desde la 0036 y la 0038, lo que faltaba era
  leerlo. Se revierte volviendo a correr el bloque de la 0036.
- **"Dinero ahorrado" deja de depender de la tarjeta Total.** Antes convertía a
  dólares y no se podía dibujar hasta que llegara esa conversión; ahora se
  resuelve con el mismo dato que sus líneas.
- **Las filas viejas quedan como están.** Un movimiento anterior a la 0036 no
  tiene `currency` y se lee como pesos, que es lo que es. No se backfillea nada
  — mismo criterio que `empties_asset` (ADR-011) y que `account_id` en las
  reconciliaciones anteriores a la 0032.
- **Queda una inconsistencia conocida entre lo escrito y lo leído.** Si alguien
  cambia la moneda de una cuenta por fuera de la app, sus movimientos viejos
  siguen en la moneda con la que se escribieron (correcto, ADR-013) pero el
  balde de esa cuenta se expresa en la moneda nueva, así que la suma mezclaría
  dos unidades. La app lo evita bloqueando el cambio de moneda de una cuenta
  con movimientos; la función SQL no inventa una tasa para arreglarlo.
- **Lo que NO es esto**: no hay transferencias entre cuentas, ni cuentas en una
  tercera moneda, ni conversión en el desglose por cuenta. Una cuenta en euros
  se puede crear, pero sus aportes se convertirían con el MEP, que no es su
  tasa — el día que haga falta, la tasa congelada tiene que dejar de asumir que
  el par es local↔dólar.
