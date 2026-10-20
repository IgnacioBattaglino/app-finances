# ADR-030: deudas y préstamos
Estado: Aceptada (sin implementar; falta el informe previo de impacto)
Fecha: 2026-10-20

## Contexto
La ADR-021 dejó las deudas en dólares, con una entrada de préstamo opcional dentro del formulario de la deuda, un pago que puede salir «de afuera» y un Balance que suma el renglón Deudas. Hace falta que una deuda en pesos exista, que un préstamo de un banco o fintech se pueda cargar como lo que es, y que el resumen de Movimientos sea más simple. Ver `docs/producto/investigacion-tarjetas-prestamos-ar.md`.

## Decisión
- **Moneda propia.** Cada deuda tiene su moneda (pesos o dólares) y su saldo en esa moneda. Si se paga desde una cuenta de otra moneda, la app pide el monto debitado, como en las suscripciones (no convierte).
- **Dos entradas separadas.** «Registrar un préstamo que recibí» (siempre pide la cuenta donde entró el dinero) y «Cargar una deuda que ya tenía» (solo el saldo).
- **El pago siempre sale de una cuenta.** Se saca la opción «de afuera»; los pagos viejos «de afuera» se conservan.
- **Sobró / Faltó = ingresos − gastos − invertido, sin deudas.** Hoy el Balance suma el renglón Deudas (ADR-021). Antes de cambiarlo, Code confirma con un informe que el cambio es chico (`get_period_totals`, `monthTotals` y el test de paridad). Si el renglón Deudas se muestra o no en el Resumen queda para la capa 2.
- **Préstamos en cuotas fijas (banco o fintech).** Se cargan con lo recibido, el monto de la cuota y la cantidad de cuotas. La app calcula los intereses totales (total a devolver − recibido) y los reparte parejo entre las cuotas como gasto de la categoría Intereses. Generan vencimientos en A pagar con el mismo mecanismo de las suscripciones. Es una aproximación, no la tabla del banco. Las deudas informales (familia, amigos) siguen como hoy.
- **Fuera de la primera versión:** préstamos UVA y dinero que el usuario presta a otros.
- «Estimar cuándo se termina de pagar» queda cubierto por la cuota.

## Consecuencias
- Cambia ADR-021: el Balance deja de sumar Deudas y el pago deja de tener «de afuera» (migraciones nuevas, no escritas acá).
- Las deudas en dólares dejan de ser lo único que existe: `debts`, `debt_payments` y `debt_balances` necesitan moneda, y el cálculo del disponible debe respetarla (ADR-013 y 015).
- Repartir los intereses parejo es una aproximación declarada: el banco los carga más al principio.
- «Deudas» deja de ser un mundo propio en `PRODUCT.md`: pendiente de decidir.

## Alternativas
- Pagar un préstamo como transferencia y el interés como gasto aparte (Bluecoins): es el modelo más cercano a lo elegido.
- Tabla de amortización real del banco: descartada, la app no la tiene ni debe pedirla.
- Mantener «de afuera»: descartado, rompe la regla de que todo movimiento sale de una cuenta o entra a una (ADR-029).

## Documentos afectados
`docs/ARCHITECTURE.md` (debts, debt_payments, `debt_balances`, `get_period_totals`), `docs/decisiones/ADR-021-deudas-intereses-ahorro-y-carga-sin-conexion.md`, `docs/informe-deudas-ahorro-offline.md`, `PRODUCT.md`, `docs/producto/capacidades.md`.
