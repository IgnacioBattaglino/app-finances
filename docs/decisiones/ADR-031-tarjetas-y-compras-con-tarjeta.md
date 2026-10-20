# ADR-031: tarjetas y compras con tarjeta
Estado: Aceptada (sin implementar; hay verificaciones pendientes)
Fecha: 2026-10-20

## Contexto
La ADR-019 y la migración 0045 definen la tarjeta con un solo día, `due_day`, y una moneda propia, y solo las compras en cuotas cuelgan de ella. Falta cargar una compra en un pago, ver cuánto se debe y cuánto se va a deber, y avisar con calma cuando el límite se acerca. Ver `docs/producto/investigacion-tarjetas-prestamos-ar.md`.

## Decisión
- **Compra en un pago, en un toque.** La tarjeta aparece como opción al elegir de dónde sale el gasto en Cargar gasto y crea un vencimiento de una cuota (1 de 1) en su próximo resumen. El gasto cuenta al pagar el resumen, igual que las cuotas (como hoy; ver Alternativas).
- **Vista de cada mes.** Se ve lo gastado ese mes (lo pagado); de eso, cuánto son cuotas de compras de meses anteriores y cuánto compras de este mes; y lo comprometido para los meses siguientes. Requiere guardar la fecha de la compra.
- **Tarjeta.** Día de cierre (opcional) y día de pago. Con ambos se calcula a qué resumen va cada compra. La tarjeta **no tiene moneda propia**: la moneda va en cada compra, y el vencimiento de un resumen muestra los totales por moneda lado a lado. El campo de moneda actual de la tarjeta se elimina.
- **Límite.** Campo opcional. El porcentaje usado se calcula contra todo lo que queda por pagar en esa tarjeta (el resumen más las cuotas restantes) y se presenta como estimación, porque el disponible real lo calcula el banco. Aviso tranquilo, sin tono de reto, cuando se acerca al límite (texto y umbrales: capa 3).
- **«Próximos»** permite navegar a los meses siguientes, con el total por moneda y la separación entre cuotas que terminan y suscripciones que siguen.
- **Monto variable** (luz, gas, expensas): «Ya lo pagué» se precarga con el último monto pagado y el plan se puede marcar como «el monto cambia».
- «Ver desde un gasto de qué plan salió» ya está cubierto en el grupo 2 (origen en el detalle de un movimiento). Los avisos con días de anticipación quedan para el grupo 6.

## Consecuencias
- Cambia `payment_cards` (se agrega el día de cierre; sale `currency`) y los planes necesitan la fecha de compra: migraciones nuevas. Si hay planes que usan la moneda de la tarjeta, hay que migrarlos.
- Un día de cierre opcional implica que sin él cada compra usa su propia fecha, como hoy.
- El porcentaje del límite es una estimación y no cuenta como el banco (que consume el límite de cuotas por el monto financiado completo; ver la investigación).
- Pendiente de decisión: pago parcial o mínimo del resumen y percepción de consumos en dólares (no se modelan).

## Alternativas
- Que la compra con tarjeta cuente al comprar y el pago del resumen sea transferencia (Monarch): descartada, la app cuenta el gasto al pagar, como las cuotas y las suscripciones.
- Mantener moneda por tarjeta: descartada, un resumen real tiene saldo en pesos y en dólares con el mismo vencimiento.
- Calcular el disponible de la tarjeta como el banco: descartada, cada banco lo hace distinto.

## Documentos afectados
`docs/ARCHITECTURE.md` (`payment_cards`, `commitments`), `docs/decisiones/ADR-019` (en `docs/adr/`), `docs/producto/capacidades.md`, `docs/producto/para-diseno.md`.
