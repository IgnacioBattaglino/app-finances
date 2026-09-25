# Plan de implementación del frontend: índice

Etapa 4 de 5. Es el plan para llevar a código lo que aprobaste de
`docs/ux/propuesta-frontend.md`, con tus decisiones. No tiene código.

**Cómo se usa:**

- **Cada bloque es un archivo** de esta carpeta, pegable tal cual como primer
  mensaje de una sesión nueva de Sonnet. Trae su propio contexto: qué hacer,
  qué no tocar, qué skills usar y cómo se verifica.
- **Cada bloque deja la app andando** y termina esperando tu OK para commitear,
  después de que lo pruebes en el iPhone.
- **La verificación va en tres niveles** separados: tests, Playwright, y lo que
  solo vale en tu iPhone.

## Los 13 bloques

| # | Archivo | Qué resuelve | Talla | Depende de |
|---|---|---|---|---|
| 01 | `01-datos-base.md` | La caché compartida y persistida en el teléfono, la invalidación en cada escritura, el borrado al cerrar sesión, y categorías y cuentas | M | — |
| 02 | `02-captura-primer-toque.md` | El "+" abre con teclado al primer toque. Un solo sheet, y el título que sigue a Gasto/Ingreso | S | 01 |
| 03 | `03-pastillas-de-categoria.md` | Las seis categorías más usadas (últimos 90 días) como pastillas, en un lugar fijo | S | 02 |
| 04 | `04-navegacion.md` | Volver retrocede, las pestañas no apilan, la barra superior fija con el título que se achica, las zonas seguras, transiciones con sentido, "A pagar" en la barra y en el título, y se borra `/objetivo` | L | — |
| 05 | `05-pestanas-sin-parpadeo.md` | Las pestañas y Deudas: datos en caché, esqueletos con forma, guardar sin vaciar, el scroll al volver, A pagar sin datos falsos | L | 01 |
| 06 | `06-detalles-y-ajustes-sin-parpadeo.md` | Los detalles y Ajustes con el mismo trato. Se borra `ListSkeleton` | M | 05 |
| 07 | `07-inicio-calmo.md` | Inicio en una pantalla, y las mudanzas: gráficos a Inversiones, la serie a Movimientos y el total a Mi plata | M | 04, 05 |
| 08 | `08-movimientos.md` | Cinco renglones con "Te sobró", Invertido y Ahorrado con flecha, el resumen plegado y la fila de ahorro. **Roza los totales: no cambia ningún cálculo** | M | 04, 07 |
| 09 | `09-cuentas-e-inversiones.md` | Contar y transferir desde una cuenta, y el orden de Inversiones que no salta | S | 07 |
| 10 | `10-el-rojo.md` | El rojo solo para pérdidas, gastos, borrar y errores. El punto de atención y el color de grupo como marca | S | 07 |
| 11 | `11-sheet-que-se-agarra.md` | El sheet entero: sale de verdad (sin copia), se agarra desde cualquier lado y a pantalla completa, hereda la velocidad, se puede frenar, el velo acompaña. El resorte | L | 03 |
| 12 | `12-horizontal-arranque-y-reordenar.md` | El teléfono horizontal con layout de teléfono, botones según el puntero, el arranque en oscuro sin destello, y reordenar que se asienta | M | 04, 07, 11 |
| 13 | `13-volver-deslizando.md` | Volver deslizando desde el borde. **Último, y se puede cortar solo** | L | 04, 06, 11 |

## Orden para mandarlos

**01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13**

**Por qué este orden:**

- **Primero la base (01) y lo que confirmaste roto en tu iPhone (02).**
- **Después la pantalla que más mirás (03).**
- **Después la navegación entera (04),** que no depende de los datos y se nota
  enseguida.
- **Después el grueso contra el parpadeo (05 y 06),** y sobre eso el rediseño
  de Inicio y sus mudanzas (07 a 10).
- **Al final, el sheet que se agarra (11),** lo chico del final (12) y el gesto
  de volver (13).

## Qué se puede hacer en paralelo sin pisarse

Tu revisión en el iPhone es secuencial igual, así que el paralelo solo ahorra
tiempo de Sonnet. Estos pares tocan archivos distintos:

- **02/03 ∥ 04.** Los primeros tocan `TransactionFormModal.jsx`,
  `Dashboard.jsx` (el formulario) y los hooks del 01. El 04 toca `BackLink`,
  `PageHeader`, `SettingsPage`, `Layout`, `App.jsx` y los encabezados.
  - **Cuidado:** comparten `Dashboard.jsx` y `Movements.jsx` en partes
    distintas: el 02 toca el formulario y el 04 el encabezado y el botón de
    Ajustes. El segundo en terminar resuelve el merge.
- **08 ∥ 09.** El 08 toca `Movements.jsx`, `movements.js` y sus tests. El 09
  toca `AccountDetail.jsx`, `LiquidModal.jsx`, `AccountTransferModal.jsx` y
  `Portfolio.jsx`.

**Los que NO:**

- **05 con cualquiera:** toca casi todas las pantallas.
- **11 con 02 o 03:** el mismo formulario.
- **10 con 09:** los dos tocan `Portfolio.jsx`.

## Si hay que cortar

- **El 13 está pensado para cortarse.** Vive en un solo archivo nuevo más una
  línea en `Layout.jsx`. Arranca preguntándote si tu app instalada ya vuelve
  sola deslizando desde el borde, y tiene un punto de corte: si al completar el
  gesto se ve un salto, se borra.
- **Ningún otro bloque depende del 13.**

## Decisiones que el plan ya incorpora

- **Los totales del mes no cambian de cálculo.** Invertido y Ahorrado se ven
  con flecha, sin rojo y sin signo. "Balance" pasa a "Te sobró" (08).
- **Inicio de una sola pantalla,** con el ahorro como línea dentro de
  Disponible (07).
- **La caché se guarda en el teléfono y se borra al cerrar sesión.** TanStack
  Query (01).
- **Las pastillas son las seis más usadas.**
  - **El período lo decidí yo: los últimos 90 días,** contando cantidad de
    movimientos y no plata.
  - **El uso decide cuáles están; el orden de Ajustes decide dónde está cada
    una,** para que el pulgar la encuentre siempre en el mismo lugar (03).
- **"A pagar" en la barra y en el título** de la pantalla, y en los volver que
  llevan ahí. Las rutas no cambian (04).
- **Volver deslizando va, último, y se puede cortar** (13).
- **El rendimiento de Inversiones no se toca.** El gráfico se muda tal cual
  (07).

## Diferencias con la propuesta

Son decisiones de implementación, no de producto:

- **Refrescar después de guardar.** Toda escritura invalida todo lo tuyo,
  enganchado una sola vez en el `fetch` de Supabase, en vez de un mapa de qué
  toca cada escritura. No se puede armar mal ni olvidar una escritura futura, y
  refresca lo mismo que la app refresca hoy.
- **El "+"** deja de moverse con la transición dándole un nombre propio (una
  línea de CSS), en vez de mudarlo fuera de las pantallas. El resultado en
  pantalla es el mismo.

## Lo que ningún bloque toca

- **El cálculo de ningún monto,** las conversiones y las migraciones.
- **`docs/ux/textos.md`.** Los únicos textos nuevos son los que decidiste: "A
  pagar", "Te sobró", "Ahorro" y "Retiro de ahorro".
