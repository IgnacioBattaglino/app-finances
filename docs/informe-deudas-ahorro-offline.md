# Informe: pago de deudas, gastar desde el ahorro y carga sin conexión

Fecha: 2026-09-26. Contexto: `informe-reglas-de-plata.md` y `mudanza-reglas.md`. Datos medidos con el MCP (solo conteos): 1 deuda con 1 pago, ninguna pagada de más, 1 gasto o ingreso cargado en una cuenta de ahorro, 9 movimientos de ahorro "de afuera".

## Decisiones

- **Deudas: B + C + D + E** (bloque 3).
  - B: al cargar una deuda se puede indicar, opcionalmente, a qué cuenta entró la plata y cuánto, en la moneda de la cuenta. Se registra como plata que cambió de lugar (categoría del sistema "Movimiento de deuda"), no como ingreso.
  - Una deuda que ya existía y no indica entrada no registra nada: su monto es lo que falta pagar desde que se usa la app.
  - D: cada pago tiene un campo opcional de intereses. Esa parte es gasto (categoría del sistema "Intereses"); el resto es capital, baja la deuda y no es gasto. Los intereses no pueden superar el pago.
  - C, como red: lo pagado en capital por encima del monto de la deuda también cuenta como intereses.
  - E: renglón "Deudas" = lo que entró por préstamos − lo devuelto de capital. Entra en el balance del período. Se muestra solo si hubo movimiento de deudas.
  - Los pagos de deuda aparecen en Movimientos. Las deudas y los pagos viejos no se tocan.
- **Gastar desde el ahorro** (bloque 3): un gasto en una cuenta de ahorro cuenta en Gastos y resta en Ahorrado por el mismo monto; un ingreso suma en Ingresos y en Ahorrado. Los selectores de gasto e ingreso ofrecen las cuentas de ahorro aparte; los de aporte y pago de deuda, no.
- **Carga sin conexión** (bloque 4, rama propia): id generado por el teléfono con inserción idempotente, `captured_at`, y rechazar movimientos en una cuenta oculta. Va antes del conteo retroactivo.

## Resumen

1. Cuando te prestan, la plata no entra en ningún lado de la app; cuando la devolvés, sale del disponible. El disponible queda bajo hasta que "Contar mi plata" lo corrige, como un ingreso real que no existió.
2. Un pago de deuda no aparece en Movimientos ni en los renglones del período: el balance no lo descuenta.
3. Gastar desde el ahorro tiene una sola regla sin doble conteo: Gastos sube y Ahorrado baja por el mismo monto, así el balance y el disponible no se mueven. Es lo mismo que transferir primero y gastar después.
4. La carga sin conexión casi no pide nada a la base: id del teléfono, "insertar si no existe", la hora de carga real y el rechazo en cuentas ocultas.

## 1. Pago de deuda

**Hoy.** El alta de una deuda no toca ninguna cuenta. Cada pago guarda USD, el MEP congelado y de dónde salió; si salió del disponible, resta de la cuenta. No es gasto ni ahorro y no aparece en Movimientos ni en los renglones.

**¿Cierra?** No, salvo que el préstamo haya llegado en dólares que nunca pasaron por la app. Un préstamo de $1.000.000 a Mercado Pago deja el saldo calculado $1.000.000 abajo; el conteo lo corrige con un "Ajuste de saldo" de ingreso que infla Ingresos, y cuando se devuelve, el balance no lo ve.

| Opción | Pros | Contras |
|---|---|---|
| A. Como hoy | Nada que hacer | Ingreso inflado por el conteo; el balance ignora los pagos |
| B. Registrar la entrada como plata que cambió de lugar | El disponible cierra sin conteos | Hay que pedir el monto en la moneda de la cuenta |
| C. Intereses automáticos: lo pagado por encima del capital | Sin campos nuevos | Los intereses reales se pagan en cada cuota, no al final |
| D. Intereses a mano, por pago | Exacto | Un campo más |
| E. Renglón "Deudas" en el balance | El balance vuelve a ser lo que quedó | Seis renglones en vez de cinco |

## 2. Gastar desde el ahorro

**Hoy.** Los selectores no ofrecen cuentas de ahorro. Un gasto en una cuenta de ahorro cuenta en Gastos y resta del balance, pero no toca Ahorrado: guardar $100 y después gastarlos desde el ahorro baja el balance $200 cuando del disponible salieron $100.

**La regla que cierra:** el gasto cuenta en Gastos y además resta en Ahorrado. Es idéntico a transferir del ahorro a una cuenta común (Ahorrado −100) y gastar desde ahí (Gastos +100): que los dos caminos den igual es la prueba de que no hay doble conteo. Se descartó que no cuente como gasto: es plata que de verdad se gastó.

## 3. Carga sin conexión

**Ya está listo:** la moneda y el dueño los pone la base (0050 y `auth.uid()`), y todas las funciones mudadas leen las tablas, así que un gasto que llega tarde entra en los totales cuando llega.

| Qué | Por qué |
|---|---|
| Id generado por el teléfono, "insertar si no existe" | Un reintento no duplica |
| `captured_at` | `created_at` es la hora de subida; el conteo retroactivo necesita la hora real de carga |
| Rechazar movimientos en una cuenta oculta | La 0054 impide ocultar con saldo, pero la base todavía acepta un movimiento después |

Un rechazo al subir queda en el teléfono, con el mensaje en castellano de la base, para corregirlo y reintentar con el mismo id. Nada de lo aplicado hasta la 0058 cambia; el conteo retroactivo tiene que usar `captured_at`.
