# Bloque 03 de 13 · Las categorías frecuentes como pastillas

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`) y Supabase. La
  interfaz está en español rioplatense y el código en inglés. Se usa sobre todo
  desde un iPhone, instalada como app.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan. Para este bloque importan
  las secciones "Sistema visual" y "Convenciones de formularios".
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 03 de 13 de
  un plan aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.
- **La dirección.** La app tiene que sentirse **calma** y responder a la mano.
  El usuario tipo arranca de cero con sus finanzas.

**Lo que ya existe:**

- el formulario de gasto (`src/components/TransactionFormModal.jsx`) abre con
  el monto enfocado y el teclado abierto al primer toque (bloque 02);
- toma las categorías de `useCategories()` (`src/hooks/useCategories.js`), que
  sale de una caché compartida y trae `addCategory`.

## Skills

- **`impeccable`**: es la principal. Leé `reference/craft-floor.md` antes de
  tocar nada. Nacho lo pidió explícito: **"que quede lindo: es la pantalla que
  más miro"**.
- **`apple-design`**: la respuesta al toque y que el teclado no se cierre.
- **`ux-designer`**: accesibilidad del grupo de opciones.
- **`ponytail:ponytail`**: nada de abstracciones nuevas si no hacen falta.

## El problema

Cargar un gasto es la acción más frecuente de la app. El monto ya es
protagonista, pero la categoría es un `<select>` nativo: un toque, la rueda de
iOS, elegir y cerrar. Son cuatro gestos para el dato que más se repite, todos
los días.

## Qué hay que hacer

Debajo de la tarjeta del monto, antes de la lista de campos (cuenta, fecha,
descripción), va una grilla con **las seis categorías que más usa Nacho** del
tipo que se está cargando (gasto o ingreso).

### Cuáles son las seis (decidido)

- **Cuáles entran: las que tienen más movimientos en los últimos 90 días.** Se
  cuenta la **cantidad de movimientos**, no la plata: lo que importa es cuántas
  veces se toca cada una, no cuánto se gasta. Un alquiler que pesa mucho pero
  se carga una vez por mes no le gana el lugar al café de todos los días.
- **Por qué 90 días.**
  - 30 días es poco: un mes atípico (vacaciones, una mudanza) daría vuelta la
    grilla.
  - Un año o todo el historial es mucho: arrastra hábitos que ya no existen,
    como una categoría que se dejó de usar hace meses.
  - Noventa días son unos tres ciclos de cobro y gasto: alcanza para que lo
    ocasional no desplace a lo frecuente, y es lo bastante corto para seguir un
    cambio de hábito.
- **Empates:** decide el orden que el usuario les dio en Ajustes (`position`).
- **Si hay menos de seis usadas en ese período** (usuario nuevo, o poco uso de
  ingresos), se completa con las primeras por `position` que falten.
- **Se excluyen** las del sistema (`is_system`) y las ocultas, igual que hoy el
  selector.
- **En qué orden se muestran: el de Ajustes, no el de uso.** La frecuencia
  decide **cuáles** están; el orden de Ajustes decide **dónde** está cada una.
  Así la pastilla de "Comida" está siempre en el mismo lugar y el pulgar la
  encuentra sin mirar, aunque esta semana se haya usado más "Transporte". Si la
  grilla se reordenara por uso, cambiaría de lugar sola y habría que leerla cada
  vez.
- **La grilla se calcula al abrir el formulario y no cambia mientras está
  abierto.** Crear una categoría al vuelo o elegir otra no la reacomoda.

### De dónde sale el uso

- **Una consulta nueva y liviana:** `getCategoryUsage()` en
  `src/lib/categories.js`. Trae solo `category_id` y `kind` de `transactions`
  de los últimos 90 días, paginada con `fetchAllPages` (`src/lib/pagination.js`),
  y devuelve **un array** de `{ category_id, kind, count }`.
- **Un hook, `useCategoryUsage()`,** sobre la caché compartida del bloque 01.
  Se persiste en el teléfono y se invalida sola en cada escritura.
- **Cuenta cuántas veces se usó cada categoría, no suma plata:** no es lógica
  de negocio, pero tampoco toca ningún cálculo existente.
- **La elección de las seis** es una función pura:
  `topCategories(categories, usage, kind, n = 6)`, con tests.
- **Si el uso todavía no llegó** (arranque en frío sin caché), la grilla usa
  las seis primeras por `position` mientras tanto. Cuando llega el uso **no se
  reacomoda en el medio de una carga**: se aplica la próxima vez que se abra el
  formulario.

**Diseño (el piso; `impeccable` puede subirlo sin romper las reglas de
`CLAUDE.md`):**

- **La grilla.** Tres columnas iguales y hasta dos filas, con un espacio chico
  y parejo entre pastillas. Una grilla y no una tira que se envuelve: nombres de
  largo distinto en una tira se leen como etiquetas sueltas, y en grilla se
  leen como un teclado de opciones ordenado y quieto.
- **La pastilla.**
  - Alto mínimo de 44 px; forma de pastilla (radio completo).
  - Fondo `card` con la sombra de tarjeta (`--shadow-surface`), porque el
    fondo del sheet es `paper`.
  - Texto `text-subhead`, centrado; un nombre largo se corta con puntos
    suspensivos, nunca en dos líneas.
- **La elegida.** Fondo `accent` y texto blanco en semibold, el mismo lenguaje
  que el chip activo de `src/components/form/FilterChips.jsx`.
- **El cambio de color al elegir** es instantáneo o muy corto
  (`--duration-fast`). Nada rebota ni se agranda.
- **La respuesta al tocar.** Al apoyar el dedo, la pastilla se achica apenas
  (el mismo `scale` que `.btn:active`) y vuelve al soltar.
- **Debajo de la grilla, una fila más, "Otra categoría",** dentro de la misma
  lista agrupada de campos.
  - Tiene el nombre a la izquierda y, a la derecha, el valor con chevron.
  - Es la puerta al resto: tocarla abre el `<select>` nativo de hoy, con todas
    las categorías del tipo más "+ Nueva categoría" (la opción que ya existe).
  - El `<select>` puede ser el control real, transparente y estirado sobre la
    fila, para que el toque abra la rueda de iOS directo.
  - **Si la elegida no está entre las seis,** ninguna pastilla aparece marcada
    y la fila muestra el nombre de la elegida a la derecha, en tinta normal y
    no en gris.
- **Con menos de seis categorías,** la grilla muestra las que hay. **Sin
  ninguna** (usuario nuevo), no hay grilla: queda solo la fila, con "+ Nueva
  categoría".
- **Al cambiar el segmentado Gasto/Ingreso,** la grilla muestra las de ese
  tipo. Si la elegida no es del nuevo tipo, se limpia (lo que ya hace
  `changeKind`).
- **El alta al vuelo** ("+ Nueva categoría") sigue funcionando igual:
  `InlineCreate`, y la nueva queda elegida. Como todavía no tiene usos, se ve
  elegida en la fila "Otra categoría", no en la grilla.
- **Mientras las categorías no llegaron** (arranque en frío), la grilla muestra
  seis pastillas vacías del mismo tamaño, en `mist`, sin latir, y la fila dice
  "Cargando…". Nada salta cuando llegan.

**El teclado no se cierra.** Si el monto está enfocado con el teclado abierto,
tocar una pastilla **no** tiene que sacarle el foco. Hay que prevenir la acción
por defecto del `pointerdown` o del `mousedown` de la pastilla, así elegir la
categoría mientras se tipea el monto no hace saltar el sheet. La fila "Otra
categoría" sí abre la rueda, y ahí es correcto que el teclado se cierre.

**Accesibilidad:**

- La grilla es un `role="radiogroup"` con `aria-label="Categoría"`, y cada
  pastilla un `role="radio"` con `aria-checked`. El tabulado entra a la
  elegida, o a la primera si no hay ninguna.
- Las pastillas y la fila son el mismo dato, así que un lector de pantalla no
  tiene que anunciar dos controles de categoría sin contexto. La fila se llama
  "Otra categoría".

## Qué se reutiliza

- `useCategories`, el `<select>`, `InlineCreate` y la lógica de `changeKind`,
  `categoryId` y `creatingCategory` que ya está en `TransactionFormModal.jsx`.
- Tokens y clases de `src/index.css`: `card`, `accent`, `mist`,
  `text-subhead`, `--shadow-surface` y `--duration-fast`.

## Qué se borra

- La fila actual "Categoría" con el `<select>` a la derecha. La reemplazan la
  grilla y la fila "Otra categoría".

## Qué NO tocar

- **Qué se guarda:** `categoryId` sigue siendo el mismo dato.
- **El resto del formulario:** el monto, la cuenta, la fecha, la descripción,
  los avisos y el borrado.
- **La administración de categorías** en Ajustes.
- **Colores hex sueltos:** nunca en el componente. Si falta un token, se agrega
  en `@theme` de `src/index.css`.

## Qué se ve distinto en pantalla

- **Debajo del monto aparecen las seis categorías que más usás, a un toque.**
  Siempre en el mismo lugar.
- **La elegida se pinta del color de la app.**
- **El resto de las categorías sigue a mano** en "Otra categoría".

## Cómo se verifica

**Tests** de `topCategories`:

- entran las 6 con más movimientos;
- se muestran en orden de `position`, no de uso;
- los empates los decide `position`;
- con 2 usadas se completa con las primeras por `position` hasta 6;
- sin uso, son las 6 primeras por `position`;
- las del sistema y las ocultas no entran;
- con `kind` ingreso cuenta solo los ingresos;
- con 3 categorías en total da 3, y con 0 da 0.

**Tests** con `renderToStaticMarkup` (patrón de `src/pages/Movements.test.jsx`):
la grilla dibuja un `role="radio"` por categoría, y no hay grilla sin
categorías.

**Playwright:**

- Capturas a 390 × 844 y a 320 × 568, en claro y en oscuro (Ajustes →
  Apariencia).
- Con nombres largos, confirmá que nada se sale de su pastilla.
- Tocá una pastilla con el monto enfocado y verificá que
  `document.activeElement` sigue siendo el monto.
- Guardá un gasto usando una pastilla y otro usando "Otra categoría".

**📱 Para Nacho, en el iPhone:**

- Con el teclado abierto, tocar una pastilla: el teclado **no se cierra** y el
  sheet no salta.
- Las pastillas se aciertan con el pulgar sin tocar la de al lado.
- Cómo se ve, en claro y en oscuro. Es la pantalla que más mira: que la mire
  con calma.
- "Otra categoría" abre la rueda nativa, y lo elegido ahí se ve en la fila.

## Qué puede salir mal

- **El truco de no robar el foco** se comporta distinto en iOS y en escritorio.
  Si en iOS no funciona prevenir el `pointerdown`, probá con `touchstart` y
  documentá cuál quedó.
- **Nombres muy largos o muy cortos:** revisá con categorías reales de Nacho,
  no solo con las de la cuenta de prueba.
- **La cuenta de prueba tiene pocos movimientos,** así que la grilla va a salir
  casi toda del relleno por `position`. La elección por uso se valida con los
  tests de `topCategories`, y en el iPhone con los datos reales de Nacho.
- **Que la grilla cambie de un día para otro** y Nacho no encuentre una
  pastilla. Por eso el orden visible es el de Ajustes: lo único que puede
  cambiar es qué seis están, y eso cambia despacio con una ventana de 90 días.
- **Que se vea como botones de un formulario web.** Es el riesgo de estética.
  Por eso `impeccable` y su craft-floor van antes de escribir.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **Documentación:** actualizá `docs/FUNCTIONAL.md`, sección 2 (Movimientos),
  donde describe el selector de categoría.
- **El resumen para Nacho,** en español, con capturas descriptas y la lista
  para el iPhone.
- **El commit:** proponé algo como `feat(capture): las seis categorías más
  usadas como pastillas`, y **esperá su OK** antes de commitear.
- **Playwright:** si la app cae en `/login`, pedile a Nacho que se loguee a
  mano. Nunca credenciales. Borrá `.playwright-mcp/`.
