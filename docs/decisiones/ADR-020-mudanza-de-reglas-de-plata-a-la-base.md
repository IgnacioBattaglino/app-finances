# ADR-020: las reglas de plata viven en la base

Estado: Aceptada (en ejecución)
Fecha: 2026-09-25 (fecha del informe de origen; la decisión de ejecutarla figura en `docs/traspaso-2026-10.md` §3.1)

Redactada a partir de: `docs/informe-reglas-de-plata.md`, `docs/mudanza-reglas.md` y `docs/traspaso-2026-10.md` §3.1 y §5.1. No agrega nada que esas fuentes no digan.

## Contexto
La app va a tener tres frentes (web, iOS, Android). Hasta entonces casi todas las cuentas de plata se hacían en la web, en JavaScript. El informe encontró reglas que existían dos veces y daban números distintos: el valor de un activo (la tarjeta contra el gráfico, D1), los gastos del mes (Inicio contra Movimientos, D2: `getExpenses` no paginaba y perdía los gastos más nuevos pasadas las 1000 filas) y los gastos por categoría (D3), entre otras (D4 a D11).

## Decisión
Mover las reglas de plata a funciones, vistas y triggers de Supabase, de menor a mayor riesgo, una regla por rama. Las apps se quedan con lo visual (formato, período que se mira) y con sumas instantáneas al cargar un gasto. Se usan Edge Functions en TypeScript solo para pedir precios a servicios externos y para armar la lista de movimientos, donde reusar `movementList.js` sale más barato que reescribirlo en SQL.

Método (`docs/mudanza-reglas.md`): medir los datos primero; migración con trigger, vista o función `get_…` (`security_invoker`, permisos explícitos a `authenticated`, nunca a `anon`); la función JS queda como definición ejecutable y un test de paridad corre el archivo de migración tal cual contra un Postgres; la app lee lo calculado por la base; la versión JS se borra más tarde, en un PR aparte. Las migraciones las aplica Nacho a mano.

El orden y el estado de cada paso están en la tabla «Estado al 2026-10-08» de `docs/informe-reglas-de-plata.md`.

## Consecuencias
- Hay una sola fuente por regla y cualquier app la llama igual; cada escritura se guarda completa o no se guarda.
- Mientras dura la mudanza conviven dos implementaciones (JS y SQL), atadas por tests de paridad que corren en el CI con Postgres.
- Los tests SQL pasan de milisegundos a segundos y las funciones que dependen de «hoy» reciben `p_today`.
- La app nativa depende de que la base tenga cada regla antes de construir su pantalla (`docs/arquitectura-nativa.md` §10).

## Alternativas
El informe evalúa mover las reglas a funciones SQL o a Edge Functions en TypeScript y recomienda SQL salvo en los dos casos de arriba; el destino y el riesgo de cada regla están en la tabla de su sección 3. Las fuentes no registran otras alternativas: pendiente de verificar si se consideró alguna más.

## Documentos afectados
`docs/informe-reglas-de-plata.md`, `docs/mudanza-reglas.md`, `docs/ARCHITECTURE.md` (funciones y vistas nuevas), `docs/pendientes-base.md`.
