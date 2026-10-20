# ADR-029: cierre de pendientes de la capa 1, grupos 1 a 4, y términos
Estado: Aceptada (sin implementar)
Fecha: 2026-10-20

## Contexto
Las ADR-025, 027 y 028 dejaron pendientes de confirmar en los grupos 1 a 4 de `docs/producto/capacidades.md`. El 2026-10-20 se resolvieron.

## Decisión
- **Términos.** La pestaña se llama «Mi dinero». «Cuenta» es el término solo para las cuentas del dinero. La sección de Ajustes con el nombre y el email se llama «Perfil». Cierra el pendiente de ADR-025.
- **Monedas.** Primera versión: solo pesos y dólares en pantalla (la base admite más).
- **Detalle de un conteo.** Botón «Cargar un gasto que faltaba»: crea el gasto ya vinculado a ese conteo. Cierra el pendiente (a) de ADR-027.
- **Gasto cargado tarde, mayor que la diferencia del conteo.** No se vincula ni se absorbe. Sale un cartel de aviso con dos opciones, «Cargar de todas formas» o «Cancelar». Se elimina de ADR-022 la absorción entera (el gasto mayor que la diferencia que daba vuelta el ajuste). Completa ADR-027 en lugar de dejar fuera el caso (pendiente (b)).
- **Movimientos.** Sin filtro por categoría ni por Deudas en la Lista. Cuánto se gastó en una categoría en un período se ve tocando la categoría en el Resumen.
- **Inversiones.** La lista (grupos y activos) se ordena en forma manual, arrastrando, o por valor de mayor a menor. No hay otros modos. El detalle de un grupo muestra su valor en el tiempo y la ganancia del período, con la misma fórmula que el total y el activo (ADR-028). No hay pantalla para comparar grupos.
- **Regla de negocio.** Todo movimiento sale de una cuenta o entra a una. No hay movimientos sin cuenta.

## Consecuencias
- ADR-022 queda con una excepción: su regla de «si el gasto es mayor que la diferencia, se absorbe entero» deja de valer. Al implementarla, el caso es un aviso, no una escritura en el ajuste.
- La web tiene 5 modos de orden y filtro por categoría en Movimientos: ambos se reducen en el diseño nuevo (la web solo recibe arreglos).
- Los textos del cartel y de los pendientes de diseño pasan a `docs/producto/para-diseno.md`.

## Alternativas
- Absorber siempre, dando vuelta el ajuste (ADR-022): descartada, deja un ajuste que el usuario no reconoce.
- No preguntar y sugerir volver a contar (pendiente (b) de ADR-027): descartada a favor del aviso con elección.
- Mantener el filtro por categoría en la Lista: descartado; lo cubre tocar la categoría en el Resumen.

## Documentos afectados
`docs/producto/capacidades.md`, `docs/producto/para-diseno.md`, ADR-022 y 027, `docs/informe-conteo-retroactivo.md`, `PRODUCT.md` (nombre de la pestaña, cuando se alinee).
