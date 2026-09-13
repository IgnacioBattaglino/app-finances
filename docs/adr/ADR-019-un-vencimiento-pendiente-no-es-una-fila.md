# ADR-019: un vencimiento pendiente no es una fila; el plan es configuración y solo se guarda lo que ya se resolvió

Fecha: 2026-09-13
Estado: aceptada
Migraciones: 0045

## Contexto

En toda la app no existía el concepto de **"esto va a pasar"**. Una fecha futura
cuenta exactamente igual que una pasada: ni `debtBalance` (`lib/debts.js`) ni
`get_liquid_by_account` (migración 0039) ni `monthTotals` (`lib/movements.js`)
filtran por fecha — suman todas las filas que encuentran. El relevamiento está
en `docs/ux/deudas-y-gastos-del-mes.md`, sección 4, con la consecuencia medida:

> Si hoy cargás por adelantado los 6 pagos futuros de una cuota, la deuda se ve
> saldada al instante y, si marcaste "de mi disponible", el disponible actual
> también baja de una, como si ya hubieras pagado las 6 cuotas hoy.

Comprar algo en 6 cuotas obligaba entonces a cargar un gasto a mano cada mes.
Funciona, pero la app no sabe que el plan existe: no recuerda, no dice cuánto
falta, y no hay forma de ver cuánta plata ya está comprometida antes de que
empiece el mes. Lo mismo con Netflix o el gimnasio.

La pieza que falta es **una sola**, y construida una vez sirve para cuotas,
suscripciones y cualquier gasto que se repita: un plan que genera movimientos
programados, cada uno con una fecha y un estado, que se vuelven un gasto común
cuando el usuario los confirma.

La regla que manda sobre todo el diseño es innegociable: **un movimiento
pendiente no cuenta en ningún total, ni en el disponible, ni en los gastos del
mes, ni en nada.** Y hay gente usando la app en producción, así que el riesgo
de que un pendiente se cuele en un total no es teórico: es plata mal contada en
la pantalla de alguien.

## Decisión

**Un vencimiento pendiente no es una fila en ninguna tabla.**

El plan (`commitments`) es CONFIGURACIÓN: desde cuándo, cada cuánto, cuántas
veces, hasta cuándo. Los vencimientos se CALCULAN de él, con una función pura
(`lib/commitmentSchedule.js`), igual que el saldo de una deuda se calcula de sus
pagos y el disponible de sus movimientos.

Lo único que se guarda es qué pasó con un vencimiento **cuando se resolvió**
(`commitment_charges`), en una de dos formas:

- **confirmado**: la fila apunta con `transaction_id` al gasto que se creó;
- **descartado**: `dismissed_at` — no lo pagué y no lo voy a pagar.

Es el principio #1 de `ARCHITECTURE.md` aplicado sin excepción: se guardan
EVENTOS y CONFIGURACIÓN, y los totales se calculan al vuelo. Un pendiente
todavía no ocurrió, así que no es un evento.

Corolarios que salen solos de esa decisión, y que son la razón de tomarla:

1. **Un pendiente no puede colarse en ningún total porque no hay ninguna fila
   que pueda colarse.** No hay nada que excluir en `monthTotals`, en
   `getExpenses`, en `groupExpensesByCategory`, en `get_liquid_by_account` ni en
   `movementType`. Ninguna de esas funciones cambió una línea, y por lo tanto
   ninguna puede empezar a contar de más por un descuido futuro. Con una tabla
   de pendientes, en cambio, cada función que suma plata pasaría a necesitar un
   filtro nuevo, y alcanzaría con olvidarse de uno.

2. **"Confirmado" es un estado calculado**, no una columna: es tener
   `transaction_id`. Con `on delete set null` en esa FK, borrar el gasto desde
   Movimientos devuelve el vencimiento a pendiente **solo**, sin trigger y sin
   ningún código que se acuerde de hacerlo. Es el mismo comportamiento que ya
   tienen las deudas ("editar o borrar un pago devuelve la deuda a la lista de
   activas sola") y el mismo criterio que `isSettled`.

3. **Una cuota confirmada es un gasto común.** Una fila de `transactions` con la
   categoría de USUARIO que eligió el plan: indistinguible de una cargada a
   mano para los totales del mes, para el desglose por categoría y para el
   disponible. No es un pago de deuda, así que la regla que deja los pagos de
   deuda fuera de los totales del mes no se toca. Y **`movementType` no gana un
   tipo nuevo**: una cuota confirmada cae en `expense`, que es lo que es. El
   número de cuota viaja en la descripción ("Heladera · cuota 2 de 6"), que es
   texto y no un tipo.

4. **Cancelar y terminar son la misma operación**, así que son una sola columna
   (`ends_on`) y un solo botón. Una suscripción que se da de baja y un plan de
   cuotas que se corta hacen exactamente lo mismo: dejar de generar
   vencimientos a partir de una fecha. Lo ya confirmado queda intacto; un
   vencimiento anterior a esa fecha que no se confirmó sigue pendiente, porque
   de verdad se debe. Terminar es neutro y reversible; **eliminar** (rojo,
   permanente) existe solo para un plan que nunca cobró nada, igual que una
   categoría se borra de verdad solo si ningún movimiento la usa.

## Alternativas consideradas

**Materializar los vencimientos como filas.** Al crear un plan de 6 cuotas se
escriben 6 filas con estado `pending`, y confirmar cambia el estado. Es lo más
directo de leer en la base y lo más fácil de consultar.

Se descartó por dos razones. La primera: una suscripción no termina nunca, así
que no hay una cantidad finita de filas que escribir — haría falta una ventana
rodante y un proceso que la extienda, o sea escribir en la base al leer una
pantalla. La segunda, y la que decidió: cada función que suma plata pasaría a
necesitar un filtro `status <> 'pending'`, y la regla "un pendiente no cuenta en
ningún total" dejaría de ser una propiedad estructural para ser una convención
que hay que recordar en cinco lugares. Con usuarios reales en producción, esa
diferencia es la que importa.

**Modelar una compra en cuotas como una deuda.** Encaja conceptualmente (le
debés al banco) y la tabla ya existe. Se descartó porque los pagos de deuda
están deliberadamente fuera de "Gastos del mes" y del desglose por categoría
(`docs/ux/deudas-y-gastos-del-mes.md`, sección 2), que es exactamente lo
contrario de lo que se busca: una cuota SÍ es un gasto de este mes. Cambiar esa
regla para que las cuotas entren se llevaría puesta la separación de los tres
mundos. Las deudas se mudan de lugar (a la pestaña Compromisos) pero no de
comportamiento.

**Guardar la moneda del plan y convertirla al confirmar.** Se descartó: la fila
de `transactions` hereda la moneda de su cuenta, y `get_liquid_by_account` suma
el monto en el balde de esa cuenta dando por sentado que está en esa moneda.
Convertir al confirmar metería una cotización en el medio de una operación que
no convirtió nada. Si la cuenta elegida está en otra moneda que el plan, el
formulario pide el monto de nuevo — no hay ninguna conversión en toda la
sección, que es además lo que se pidió explícitamente.

## Consecuencias

- Ninguna tabla existente se modifica y ninguna función existente se redefine.
  El disponible, los totales de Movimientos, el Balance y "En qué se fue" dan
  exactamente lo mismo antes y después de la migración, con o sin planes
  cargados.
- El "comprometido este mes" es un cálculo, no un dato: se puede mirar cualquier
  mes, incluso uno futuro, sin haber guardado nada.
- Editar un plan puede mover las fechas de sus vencimientos y dejar un cargo ya
  confirmado sin ninguna ocurrencia que le corresponda. `planOccurrences` los
  muestra igual, al final: desaparecerlos dejaría al plan pidiendo de nuevo una
  cuota que ya se pagó, que es el error más caro posible acá.
- Un plan que arranca en la cuota 4 de 6 no inventa las tres anteriores como
  confirmadas: se pagaron afuera de la app y la app no tiene con qué afirmar
  cuándo ni cuánto. Mismo criterio que `empties_asset` en ADR-011.
- Confirmar son dos escrituras (el gasto y la marca), así que va por una función
  de Postgres en una sola transacción — mismo problema y mismo remedio que
  `create_transfer` (0017) y `reconcile_liquid` (0034). El `unique
  (commitment_id, due_date)` es lo que hace imposible cobrar dos veces el mismo
  vencimiento, incluso con dos pestañas abiertas.
