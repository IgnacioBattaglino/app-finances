# ADR-023: un solo repo y apps nativas con el contrato en la base

Estado: Aceptada (iOS en pausa)
Fecha: 2026-09-29 (decisiones tomadas ese día)

Redactada a partir de: `docs/arquitectura-nativa.md` (secciones 1 a 10 y la tabla «Decisiones tomadas») y `docs/traspaso-2026-10.md` §3.3. Solo se resumen las decisiones de esa tabla.

## Contexto
La app va a tener un frente iOS y uno Android además de la web, y las reglas de plata viven en Supabase (ADR-020). Una app de la tienda no se actualiza cuando uno quiere: un iPhone puede quedarse semanas con una versión vieja, y una función de la base que cambia de forma rompe a esos teléfonos.

## Decisión
1. **Un solo repo** con `ios/`, `android/`, `contract/` y `design/` (la web queda donde está), y una copia de trabajo (`git worktree`) por instancia de Claude Code.
2. **iOS 18** como mínimo; SwiftUI puro; una sola dependencia externa, el SDK oficial de Supabase.
3. **Tipos de Swift escritos a mano**, con un test contra respuestas reales de la base.
4. **Contrato** = funciones `get_*`, vistas y unas pocas tablas, listadas en `contract/README.md`. Nunca se cambia la forma de una función publicada de manera incompatible: se crea `<nombre>_v2`. Foto del contrato y respuestas de muestra en el CI; versión mínima de la app en una fila `app_config`.
5. **Letra** que sigue el tamaño elegido en el iPhone (Dynamic Type).
6. **Face ID** al abrir y a los 5 minutos en segundo plano, apagable en Ajustes.
7. **Registro y «olvidé mi contraseña» en la web** en la primera versión; **borrar la cuenta dentro de la app desde el inicio** (lo exige Apple).
8. **Distribución:** solo el iPhone de Nacho hasta pagar la cuenta de Apple; después TestFlight.
9. **Supabase:** Free por ahora y Pro antes de invitar a alguien nuevo / al ir a producción real (el texto de `arquitectura-nativa.md` y el del traspaso lo formulan distinto; ver `docs/ESTADO.md`).
10. **Notificaciones:** locales primero, push después.
11. **Orden de construcción:** cargar un gasto (con y sin conexión), totales y saldos; luego, a medida que la base lo permita, la lista, el conteo, A pagar e Inversiones.

## Consecuencias
- Un cambio de regla toca la base, el contrato y cada app en el mismo PR.
- Dos instancias en la misma carpeta se pisarían: de ahí el worktree por instancia.
- Falta en la base lo que la app va a pedir: `delete_account`, `app_config`, la lista armada en el servidor, la vista previa del conteo y los vencimientos en SQL (`docs/pendientes-base.md`).
- El frente iOS está **en pausa**: existe solo el proyecto de Xcode con la pantalla vacía, y se retoma cuando cierren el diseño y la base (`docs/traspaso-2026-10.md` §3.3).
- `contract/` y `design/tokens.json` todavía no existen en el repo (existe `design/decisiones.md`, un borrador de Claude Design).

## Alternativas
Según la propuesta: un repo por app (el contrato y los colores se copian entre repos y la desalineación es el estado natural); un repo de la base aparte más las apps (mucha ceremonia para una sola persona). Para los tipos, usar `supabase gen types --lang swift` como punto de partida. Para la persistencia sin conexión, SwiftData, GRDB o PowerSync (la propuesta elige archivos JSON atómicos).

## Documentos afectados
`docs/arquitectura-nativa.md`, `docs/pendientes-base.md`, `CLAUDE.md` (línea del mapa sobre `ios/`), `docs/mudanza-reglas.md`.
