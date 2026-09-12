# ADR-016: contar la plata registra dos hechos distintos — el gasto real y el reparto entre cuentas

Fecha: 2026-09-12
Estado: aceptada
Migraciones: 0041, 0042 (el borrado)

## Contexto

Al "Contar mi plata" con varias cuentas, Movimientos mostró un "Gastos" del mes
de $1.118.364 con "Ajuste de saldo $711.478" arriba del desglose por categoría:
un gasto que no ocurrió. El relevamiento completo del mecanismo está en
`docs/ux/reconciliacion-y-transferencias.md`.

La causa es que `reconcile_liquid` era un loop puramente **por cuenta**, sin
ningún concepto de "total": cada cuenta se comparaba solo contra sí misma y
cada diferencia se escribía como un gasto o un ingreso real. Pero contar la
plata produce **dos hechos a la vez**, y sumarlos en uno es lo que inventa
números. Si tenías $1.000 en efectivo y $500 en Mercado Pago y contás $800 y
$400:

- Faltan **$300 en total**. Eso sí es un gasto real que no cargaste.
- De esos $300, $200 salieron del bolsillo y $100 de Mercado Pago. Eso es el
  **reparto**: dice dónde estaba la plata, no que hayas gastado de más.

Y el caso peor: mover plata de una cuenta a otra sin registrarlo (el efectivo
baja $5.000, Mercado Pago sube $5.000) se anotaba como un gasto de $5.000 **más**
un ingreso de $5.000. Dos hechos que nunca existieron, sobre un total que no se
movió un peso.

Encima, las dos pantallas que muestran esos movimientos no se ponían de
acuerdo: Inicio escondía los ajustes enteros (`!is_system`, así que ni la plata
que de verdad faltó se veía) y Movimientos los contaba enteros, reparto
incluido. Ninguna de las dos hacía lo correcto, y cada una fallaba para el lado
opuesto.

## Decisión

### 1. Una reconciliación escribe dos cosas distintas

- **El neto, por moneda**: UN movimiento con la categoría del sistema "Ajuste
  de saldo" por la diferencia del total de esa moneda, gasto si bajó e ingreso
  si subió. Es el gasto que de verdad ocurrió y cuenta como tal en todas las
  pantallas. Si el total no cambió, no se escribe.
- **El reparto**: un movimiento con la categoría nueva "Transferencia de
  cuenta" por lo que le falte a cada cuenta para quedar en lo declarado. No
  cuenta en ninguna estadística.

### 2. La aritmética que hace que esto cierre

Cada cuenta declarada tiene que moverse exactamente lo suyo:

    diff(cuenta) = declarado − calculado

y el neto de una moneda es, **por definición**, la suma de esos `diff`: las
cuentas que no se declararon no se tocan, así que entran al total con el saldo
que ya tenían y no lo mueven. De ahí:

    neto(moneda) = Σ diff(cuenta de esa moneda)

El movimiento del neto se anota en UNA de las cuentas declaradas (la "ancla").
A esa cuenta el ajuste ya la movió `neto`, así que le falta `diff − neto`; a las
demás les falta `diff` entero. Eso es el reparto, y la suma de todos los
repartos es `Σ diff − neto = 0`: no crea ni destruye plata, solo la corre de
cuenta. Por eso **cada cuenta queda exacta en lo declarado y el total queda
exacto, sin resto** — la propiedad que la reconciliación no puede perder.

Con una sola cuenta declarada el resultado es idéntico al de antes: su `diff`
es el neto, el resto da cero y se escribe un único "Ajuste de saldo".

### 3. El neteo es por moneda, y nada más

Pesos y dólares no se restan (ADR-015). Cuentas de ahorro y del día a día **sí**
se netean entre sí cuando comparten moneda: plata que pasó del bolsillo al
ahorro sin registrarse es exactamente el reparto que esto no quiere contar como
gasto.

El universo del neteo es el total de **todas** las cuentas de esa moneda,
declaradas o no. No hace falta sumarlas para calcularlo —una cuenta que se deja
en blanco aporta cero— pero es lo que la regla significa: para vaciar una
cuenta hay que declarar 0 explícitamente.

### 4. Dónde se anota el neto, como regla explícita

El neto es un hecho del total, no de una cuenta, pero un movimiento tiene que
colgar de algún lado. **Se consideró y se descartó colgarlo de ninguna**
(`account_id` null): si el ajuste no está en una cuenta, los repartos tendrían
que sumar `neto` en vez de cero para que cada cuenta cuadre, y el total quedaría
contando ese neto dos veces —en el balde "sin cuenta" y en los repartos—. Se
podía compensar con una fila extra en el mismo balde que lo neutralizara, pero
eso cuesta dos filas fijas (el caso más común pasaba de 1 movimiento a 3) y usa
el balde "sin cuenta" —un residuo histórico de movimientos que nadie asignó—
para algo que no es.

El orden de preferencia es explícito y **total**: nada puede depender del orden
en que la base devuelva las filas ni en que el cliente mande las declaraciones.

1. La cuenta que deja **menos resto** sin explicar (`|diff − neto|` más chico).
   Es la que mejor explica el faltante, y cuando una sola cuenta cambió y las
   demás coinciden, su `diff` ES el neto: el resto da cero y no se escribe
   ningún reparto.
2. Una cuenta del día a día antes que una de ahorro.
3. El orden de la pantalla (`position`), después el nombre, después el id.

### 5. Una categoría nueva: "Transferencia de cuenta"

`system_key = 'account_transfer'`. Nace porque `'savings_movement'` mentía en la
mitad de sus usos: transferir de Efectivo a Mercado Pago no es un ahorro, la
plata sigue siendo líquida. La llave nueva se queda con las dos cosas que son
"plata que cambió de lugar entre dos cuentas" —el reparto de una reconciliación
y las transferencias entre cuentas—, y `'savings_movement'` queda solo para lo
que de verdad es ahorro: los aportes y retiros de una cuenta de ahorro, que
entran o salen desde afuera y no tienen otra cuenta del otro lado.

### 6. Las pantallas aplican una sola regla

`src/lib/systemCategories.js` es el único lugar que decide qué significa cada
categoría del sistema, y los cuatro consumidores (los totales del mes y el
desglose de Movimientos, el bloque de Gastos de Inicio y su desglose) preguntan
ahí:

- El **ajuste de un conteo** cuenta como gasto o ingreso en todas las
  pantallas. Contarlo entero ahora es contarlo bien: lleva solo el neto.
- El **reparto y las transferencias** no cuentan en ningún total ni en ningún
  desglose por categoría, en ninguna pantalla. Sí aparecen en el historial de
  cada cuenta, que es donde la pregunta es "qué pasó acá".

Y `getTransactions` deja de esconder un "Ajuste de saldo" por estar en una
cuenta de ahorro. La premisa de esconder esas cuentas es que ahí no hay gastos
reales, y el neteo crea justo ese caso: si contaste tu cuenta de ahorro y
faltaba plata, esa plata falta de verdad. Sin la excepción, un gasto real
quedaría invisible en Movimientos y en Inicio solo por la cuenta en la que el
neteo lo anotó.

## Qué se migra de lo ya cargado, y qué no

- **Las transferencias históricas sí**, a la categoría nueva. Es un cambio
  mecánico de etiqueta: no toca montos, saldos, cuentas ni fechas. El criterio
  es `transfer_id is not null`, que es exactamente "esta fila es una de las dos
  patas de una transferencia".
- **Los ajustes de saldo viejos no.** Separarlos en neto y reparto sería
  decidir retroactivamente qué fue gasto y qué fue reparto sin saber qué pasó
  ese día. Siguen contando enteros, que es lo que la app venía diciendo de
  ellos. Mismo criterio que `empties_asset` (ADR-011) y que las
  reconciliaciones sin cuenta anteriores a la 0032 (ADR-012): lo que no se
  sabe no se infiere.

## Consecuencias

- Un conteo de una sola cuenta —el caso más frecuente— escribe exactamente lo
  mismo que antes: un solo movimiento.
- Un conteo de varias cuentas puede escribir hasta un movimiento de ajuste por
  moneda más uno de reparto por cuenta. Es más ruido en el historial de cada
  cuenta, a cambio de que los totales del mes digan la verdad.
- La regla vive en dos lados y tiene que seguir dando lo mismo:
  `planReconciliation` (`src/lib/liquid.js`), que es la definición ejecutable y
  la que el modal usa para el preview, y `reconcile_liquid` en la base, que es
  la que escribe. `src/lib/reconcileSql.test.js` corre la función SQL contra la
  de JS en un Postgres local y exige que coincidan — mismo patrón que
  `computeLiquidByAccount` / `get_liquid_by_account`. Si las dos se separaran,
  el usuario vería una cosa antes de guardar y otra después.
- `liquid_reconciliations` gana `redistribution_transaction_id`:
  `adjustment_transaction_id` sigue significando lo mismo (el ajuste del neto, y
  por eso ahora lo lleva una sola fila por moneda) y el reparto es un
  movimiento distinto, con otra categoría y otro significado.

## Addendum (0042): un conteo se borra entero

Lo que esta decisión convirtió en un conjunto de filas que se sostienen entre
sí también cambia qué significa borrar una de ellas. Los repartos suman cero y
cada cuenta queda en lo declarado **porque están todas**: si se borra el ajuste
del neto y quedan los repartos, la app sigue moviendo plata entre cuentas por
un conteo que ya no existe; si se borra un reparto, esa cuenta queda corrida y
las demás no. Y la fila de `liquid_reconciliations` quedaría afirmando "declaré
$X" sobre un ajuste que ya no está.

Por eso borrar cualquiera de esos movimientos borra **el conteo entero** —sus
filas de `liquid_reconciliations` y todos los movimientos que escribió—, en una
sola operación atómica (`delete_reconciliation`). Es la misma regla que ya
aplican las dos patas de una transferencia.

Para saber qué filas son el mismo conteo, `liquid_reconciliations` gana
`batch_id`. Lo ya guardado se agrupa por `(user_id, date, created_at)`, que no
es una inferencia: `created_at` es `default now()`, el reloj de la transacción.

Nada más lee esta tabla, así que perder una de sus filas no rompe ningún
cálculo: el disponible sale de los movimientos, no de acá. Lo que se pierde es
lo que la fila decía, y se pierde bien — el "Reconciliada el X" de esa cuenta
vuelve al conteo anterior, el aviso de "esta operación es anterior a la última
vez que contaste X" deja de aparecer para ese tramo (ya no hay ningún saldo
dado por contado ahí) y el próximo ajuste vuelve a llamarse "Saldo inicial" si
no le queda ningún conteo. **Lo que sí queda mal es el saldo**, hasta que el
usuario vuelva a contar: por eso la confirmación del borrado lo dice.
