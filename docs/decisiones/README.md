# Decisiones

Acá se registran las decisiones que cambian cómo se hace algo en EnCuenta. **Regla: las decisiones nuevas van acá, desde la ADR-020, y nada se decide en un chat sin quedar escrito.**

Las ADR-001 a 019 siguen en [`docs/adr/`](../adr/): no se mueven porque hay comentarios en el código y en las migraciones que las citan por esa ruta.

## Formato fijo

Un archivo por decisión, `ADR-NNN-titulo-corto.md`, numerado a continuación de la última. Encabezados, en este orden:

```
# ADR-NNN: título corto
Estado: Propuesta | Aceptada | Reemplazada por ADR-MMM
Fecha: AAAA-MM-DD
## Contexto        qué pasaba y qué lo hizo necesario
## Decisión        qué se decide, en pocas frases
## Consecuencias   qué cambia y qué se vuelve más difícil
## Alternativas    qué se descartó y por qué
## Documentos afectados   qué documentos hay que mantener alineados
```

Si la decisión se escribió a posteriori a partir de otros documentos, se agrega una línea `Redactada a partir de: …` con las fuentes, y no se afirma nada que esas fuentes no digan: lo que falta se marca «pendiente de verificar».

## Índice

| ADR | Decisión | Estado |
|---|---|---|
| [001](../adr/ADR-001-supabase-como-backend.md) | Supabase como backend en lugar de Google Sheets | Aceptada |
| [002](../adr/ADR-002-no-materializar-snapshots.md) | No materializar snapshots mensuales del portafolio | Aceptada |
| [003](../adr/ADR-003-target-allocation-jsonb.md) | Distribución objetivo como JSONB en `settings` | Aceptada (sin uso en el código, ver su nota) |
| [004](../adr/ADR-004-migracion-multiusuario.md) | Migración temprana a multiusuario | Aceptada |
| [005](../adr/ADR-005-valuation-mode-por-activo.md) | `valuation_mode` pasa de la bolsa al activo | Aceptada |
| [006](../adr/ADR-006-historial-precios-compartido.md) | Historial de precios diarios como catálogo compartido, alimentado por cron | Aceptada (ver su nota sobre el cron) |
| [007](../adr/ADR-007-instrumento-por-buscador.md) | El vínculo activo↔precio es un instrumento elegido en un buscador | Aceptada |
| [008](../adr/ADR-008-conversion-a-dolares-en-una-vista.md) | La conversión a dólares vive en una sola vista | Aceptada |
| [009](../adr/ADR-009-grupo-de-activo-opcional.md) | El grupo de un activo es opcional | Aceptada |
| [010](../adr/ADR-010-posicion-cerrada-por-aportado-neto.md) | Una posición está cerrada según el aportado neto | Aceptada |
| [011](../adr/ADR-011-empties-asset-persistido.md) | `empties_asset` se guarda en la fila | Aceptada |
| [012](../adr/ADR-012-cuentas-del-disponible.md) | El disponible se subdivide en cuentas y se reconcilia por cuenta | Aceptada |
| [013](../adr/ADR-013-moneda-por-fila-y-conversion-al-mostrar.md) | El movimiento guarda su moneda; la tasa se congela solo si hubo conversión | Aceptada |
| [014](../adr/ADR-014-activos-que-valen-lo-aportado-son-cuentas-de-ahorro.md) | Un activo que vale lo aportado es una cuenta de ahorro | Aceptada |
| [015](../adr/ADR-015-saldos-y-gastos-separados-por-moneda.md) | Saldos y gastos separados por moneda | Aceptada |
| [016](../adr/ADR-016-contar-la-plata-registra-dos-hechos.md) | Contar la plata registra dos hechos: gasto real y reparto | Aceptada |
| [017](../adr/ADR-017-registro-por-invitacion.md) | Registro por invitación, admin sin mail hardcodeado en producción, consumo atómico | Aceptada |
| [018](../adr/ADR-018-rls-versionado-y-confirmado.md) | El estado de RLS queda versionado (ver su nota: hoy son 18 tablas) | Aceptada |
| [019](../adr/ADR-019-un-vencimiento-pendiente-no-es-una-fila.md) | Un vencimiento pendiente no es una fila | Aceptada |
| [020](ADR-020-mudanza-de-reglas-de-plata-a-la-base.md) | Las reglas de plata viven en la base | Aceptada (en ejecución) |
| [021](ADR-021-deudas-intereses-ahorro-y-carga-sin-conexion.md) | Deudas con intereses, gastar desde el ahorro y carga sin conexión | Aceptada (hecha: 0059, 0060) |
| [022](ADR-022-conteo-retroactivo-opcion-a.md) | Conteo retroactivo: preguntar y absorber (opción A) | Aceptada (sin implementar) |
| [023](ADR-023-monorepo-y-apps-nativas.md) | Un solo repo y apps nativas con el contrato en la base | Aceptada (iOS en pausa) |
| [024](ADR-024-archivo-de-ui-polish.md) | La rama `feat/ui-polish` se archiva en una etiqueta | Aceptada |
| [025](ADR-025-voz-y-terminos.md) | Voz y términos: «dinero», «Sobró»/«Faltó» y la app explica sus números | Aceptada |
| [026](ADR-026-contar-disponible.md) | Contar disponible: dos pasos, una moneda por vez, sin ahorro | Aceptada (sin implementar) |
| [027](ADR-027-gasto-cargado-tarde-frente-a-un-conteo.md) | Gasto cargado tarde frente a un conteo: cartel de doble confirmación | Aceptada (sin implementar; cambia ADR-022) |
| [028](ADR-028-inversiones-para-quien-invierte-cada-mes.md) | Inversiones para quien invierte cada mes, todo en dólares | Aceptada (fórmula pendiente) |
