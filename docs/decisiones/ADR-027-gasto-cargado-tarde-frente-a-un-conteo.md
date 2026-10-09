# ADR-027: gasto cargado tarde frente a un conteo
Estado: Aceptada (cambia la presentación de ADR-022; sin implementar)
Fecha: 2026-10-09

## Contexto
ADR-022 resolvió el gasto cargado después de un conteo con un interruptor dentro del formulario. En la revisión de capacidades se decidió otra presentación.

## Decisión
Al guardar un gasto con fecha igual o anterior a un conteo que generó ajuste en esa cuenta y moneda, aparece un cartel de doble confirmación (no un interruptor dentro del formulario): «Al contar el 20/9 se registró un ajuste de saldo de $ 20.000 en Mercado Pago. ¿Este gasto es parte de ese ajuste?» [Sí] [No]. Si es sí, el ajuste baja. Para un ingreso es simétrico (sobrante). No aparece si el conteo no tuvo diferencia en esa cuenta y moneda, ni si la moneda es otra. Motivo: son pocos casos y conviene la doble confirmación.

**Pendientes de confirmar:**
- (a) Botón «Cargar un gasto que faltaba» en el detalle de un conteo, que crea el gasto ya vinculado.
- (b) Dejar afuera de la primera versión el caso «gasto mayor que la diferencia» (en ese caso no se pregunta y se sugiere volver a contar), lo que cambiaría la ADR-022.

## Consecuencias
- Reemplaza el interruptor de ADR-022 por el cartel. El resto de ADR-022 (alcance, conteos desde la 0041, uso de `captured_at`) sigue igual, salvo lo que cambie (b) si se confirma.

## Alternativas
- Interruptor apagado por defecto dentro del formulario (ADR-022): reemplazado por el cartel.

## Documentos afectados
`docs/decisiones/ADR-022-conteo-retroactivo-opcion-a.md`, `docs/informe-conteo-retroactivo.md`, `docs/producto/capacidades.md`.
