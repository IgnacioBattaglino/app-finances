# ADR-028: Inversiones para quien invierte cada mes
Estado: Aceptada (la fórmula del porcentaje y el texto del (i) quedan pendientes)
Fecha: 2026-10-09

## Contexto
Hay que definir para quién es la pestaña Inversiones y qué muestra, antes de diseñarla.

## Decisión
- Público: quien invierte de forma mensual o anual, no trading. Se saca el período «24 h».
- Todo en dólares, incluidos CEDEARs, fondos comunes y plazos fijos en pesos. El monto en pesos solo aparece en el detalle. Los instrumentos en pesos se convierten al dólar MEP del día del precio, dicho en el (i) del número (no se usa CCL para no inventar ganancias por la diferencia entre los dos dólares).
- Ganancia: dirección decidida, «ganancia sobre lo que pusiste» (sigue cuándo entró cada aporte). Ganancia del período en dólares = valor final − valor inicial − aportes netos del período. La fórmula del porcentaje y el texto del (i) se definen en un informe aparte, con Opus.
- Crear un activo empieza por el buscador (ver `docs/producto/capacidades.md` §4). Retirar absorbe a «Liquidar posición». «Cobrar renta» es un retiro sin vender unidades.
- Catálogo gratis: data912 (también `usa_stocks` y `usa_adrs`), CAFCI para fondos, Binance para cripto. Son fuentes no oficiales: si una falla, el activo muestra su último valor con la fecha. Las consultas las hace el servidor por hora, nunca cada usuario.
- Las cuentas remuneradas (Mercado Pago, Ualá) siguen siendo cuentas, no inversiones: su rendimiento lo captura el conteo.

## Consecuencias
- Cambian las secciones de Inversiones y Formularios de `design/decisiones.md` (no se editan acá).
- La base no calcula hoy la ganancia por período.

## Alternativas
- CCL para convertir instrumentos en pesos: descartado, inventaría ganancias por la diferencia entre los dos dólares.
- Rebalanceo contra distribución objetivo: fuera por ahora.

## Documentos afectados
`PRODUCT.md`, `design/decisiones.md` (Inversiones y Formularios), `docs/ARCHITECTURE.md` cuando se implemente.
