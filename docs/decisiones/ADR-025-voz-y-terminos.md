# ADR-025: voz y términos
Estado: Aceptada
Fecha: 2026-10-09

## Contexto
En la revisión de la capa 1 de la especificación (`docs/producto/capacidades.md`) se fijaron términos y un principio de voz para todo lo que lee la persona.

## Decisión
- «Dinero» reemplaza a «plata» en todo lo que lee la persona y en los documentos vivos. No se renombran código, rutas, migraciones ni ADR viejas.
- En el Resumen de Movimientos: «Sobró» / «Faltó», sin «Te».
- Principio nuevo, agregado a `PRODUCT.md` §7 como principio 6: «La app explica sus números, no enseña finanzas.» Los (i) justifican un número de la app (cómo se calcula, a qué dólar se convirtió), nunca explican qué es un instrumento.
- Pendientes de confirmar: el nombre «Mi dinero» para la pestaña y «cuenta» como término único.

## Consecuencias
- La limpieza de textos («plata» → «dinero») es una tarea del roadmap; no se hace con esta decisión.
- Los textos nuevos ya se escriben con «dinero».

## Alternativas
- Dejar «plata»: descartado, se eligió «dinero».
- Nombre «Billetera» para la pestaña: no recomendado frente a «Mi dinero» (pendiente de confirmar).

## Documentos afectados
`PRODUCT.md` (§7), `docs/producto/capacidades.md`, y la limpieza de textos en el código y los documentos vivos (roadmap).
