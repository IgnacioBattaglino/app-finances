# ADR-021: deudas con intereses, gastar desde el ahorro y carga sin conexión

Estado: Aceptada (hecha: migraciones 0059 y 0060)
Fecha: 2026-09-26 (fecha del informe de origen)

Redactada a partir de: `docs/informe-deudas-ahorro-offline.md` (decisiones y secciones 1 a 3) y, para el estado, `docs/ARCHITECTURE.md` (migraciones 0059 y 0060) y `docs/mudanza-reglas.md`.

## Contexto
Cuando te prestaban plata, no entraba en ningún lado de la app; al devolverla, salía del disponible y el balance no la veía, así que el disponible quedaba bajo hasta que «Contar mi plata» lo corregía con un ingreso que no había existido. Gastar desde una cuenta de ahorro no tocaba «Ahorrado» y el balance bajaba el doble. Y la carga sin conexión pedía poco a la base.

## Decisión
- **Deudas (B + C + D + E).** B: al cargar una deuda se puede indicar a qué cuenta entró la plata y cuánto; se registra como plata que cambió de lugar (categoría del sistema «Movimiento de deuda»), no como ingreso. Una deuda que ya existía y no indica entrada no registra nada. D: cada pago tiene un campo opcional de intereses; esa parte es gasto (categoría «Intereses»), el resto es capital; los intereses no pueden superar el pago. C, como red: lo pagado en capital por encima del monto de la deuda también cuenta como intereses. E: renglón «Deudas» = lo que entró por préstamos − lo devuelto de capital, dentro del balance del período; se muestra solo si hubo movimiento. Los pagos aparecen en Movimientos; las deudas y pagos viejos no se tocan.
- **Gastar desde el ahorro.** Un gasto en una cuenta de ahorro cuenta en Gastos y resta en Ahorrado por el mismo monto; un ingreso suma en Ingresos y en Ahorrado. Es lo mismo que transferir primero y gastar después. Los selectores de gasto e ingreso ofrecen las cuentas de ahorro aparte; los de aporte y pago de deuda, no.
- **Carga sin conexión.** El teléfono genera el `id` y la subida es «insertar si no existe»; se agrega `captured_at` (la hora real de carga, que usa el conteo retroactivo); y la base rechaza movimientos en una cuenta oculta. Un rechazo queda en el teléfono con el mensaje en castellano para corregirlo y reintentar con el mismo id.

## Consecuencias
- El disponible cierra sin necesidad de conteos para los préstamos; el balance vuelve a ser lo que quedó.
- Seis renglones en el resumen del período en vez de cinco (el sexto solo aparece con movimiento de deudas).
- Un pago «de afuera» (dólares que ya tenías) baja la deuda y no toca ningún renglón.
- Implementado en las migraciones 0059 y 0060; en la app nativa el renglón «Deudas» se lee con palabras («Te prestaron $ X» / «Pagaste de deudas $ X»), según `docs/mudanza-reglas.md`.

## Alternativas
Para deudas, según la tabla del informe: A (dejar como estaba: ingreso inflado por el conteo y balance que ignora los pagos). Sobre C, el informe anota que los intereses reales se pagan en cada cuota y no al final, y por eso se suma D (a mano). Para gastar desde el ahorro se descartó que no cuente como gasto: es plata que de verdad se gastó.

## Documentos afectados
`docs/ARCHITECTURE.md` (sección de la 0059 y de la 0060), `docs/FUNCTIONAL.md` (sección 5.1 y Movimientos), `docs/informe-deudas-ahorro-offline.md`.
