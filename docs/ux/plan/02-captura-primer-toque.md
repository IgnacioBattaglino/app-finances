# Bloque 02 de 13 · Captura: el teclado abre al primer toque

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`) y Supabase. La
  interfaz está en español rioplatense y el código en inglés. Se usa sobre todo
  desde un iPhone, instalada como app.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan. Prestale atención a
  "Convenciones de formularios", sobre todo `FormSheet`, autofocus y el
  teclado.
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 02 de 13 de
  un plan aprobado por Nacho, el dueño.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** Nacho lo prueba en su iPhone.
- **La dirección.** La app tiene que sentirse calma, y en el teléfono tiene que
  responder a la mano. El usuario tipo arranca de cero con sus finanzas.

**Lo que ya existe del bloque 01:**

- una capa de datos con TanStack Query en `src/lib/queryClient.js`,
  persistida en el teléfono;
- `useCategories()` en `src/hooks/useCategories.js`, que devuelve las
  categorías desde la caché, pedidas por adelantado al entrar a la app, y trae
  `addCategory` para el alta al vuelo;
- `useAccounts()`, sobre la misma caché.

Toda escritura a Supabase invalida la caché sola: **no hace falta recargar nada
a mano después de guardar**.

## Skills

- **`apple-design`**: respuesta al toque y foco.
- **`ux-designer`**: el flujo de captura.
- **`impeccable`**: leé `reference/craft-floor.md` antes de editar UI.
- **`ponytail:ponytail`**: borrar lo que sobra.

## El problema (confirmado en el iPhone de Nacho)

El primer "+" de cada visita a Inicio **no abre el teclado**. El segundo sí. Si
se entra a otra pantalla y se vuelve a Inicio, el primero vuelve a fallar.

**La causa,** en `src/pages/Dashboard.jsx`:

- Al tocar "+", si las categorías todavía no estaban cargadas, se abría un
  `FormSheet` provisorio titulado "Nuevo gasto", con un esqueleto adentro.
- Cuando llegaban las categorías, ese sheet se desmontaba y se montaba
  `TransactionFormModal`, con otro título ("Nuevo movimiento").
- El `autoFocus` del monto llegaba **fuera del toque del usuario**, y iOS no
  abre el teclado en ese caso.
- Además, al desmontarse, el sheet viejo devolvía el foco al botón y se lo
  robaba al monto (medido: el monto recibe el foco y lo pierde 4 ms después).

## Qué hay que hacer

1. **El formulario abre en el mismo toque, siempre.**
   - En `Dashboard.jsx`, borrá la rama que abre el `FormSheet` provisorio
     cuando `categories === null`, junto con el estado de categorías, la
     función que las pedía al abrir y su error.
   - `TransactionFormModal` se abre directo.
2. **El formulario no espera a las categorías para nada.** El monto no las
   necesita.
   - `TransactionFormModal` toma las categorías de `useCategories()` por
     adentro, en lugar de recibirlas por prop. Sacá la prop `categories` y
     `onCategoryCreated` de sus tres llamadores: `Dashboard.jsx`,
     `Movements.jsx` y `settings/AccountDetail.jsx`.
   - El alta al vuelo usa `addCategory` del hook.
   - Si las categorías todavía no llegaron (un arranque en frío sin caché), el
     selector de categoría muestra una sola opción deshabilitada "Cargando…".
     El resto del formulario, con el monto ya enfocado, funciona igual.
   - Guardar sigue deshabilitado sin categoría: ya pasa hoy por la regla de
     `missing`.
   - Si la consulta de categorías falló, en lugar del selector va un
     `ErrorNotice` chico (`src/components/form/FormError.jsx`) con Reintentar,
     dentro de la fila de categoría.
3. **El título sigue al segmentado.**
   - Al crear: "Nuevo gasto" o "Nuevo ingreso".
   - Al editar: "Editar gasto" o "Editar ingreso".
   - Hoy el mismo formulario se llama "Nuevo gasto" desde un lado y "Nuevo
     movimiento" desde el otro.
   - Los títulos de las variantes de solo lectura (transferencia, conteo) no
     cambian.
4. **El "+" no se mueve con la pantalla.** Dale a la clase `.fab` de
   `src/index.css` un `view-transition-name` propio (por ejemplo `fab`), igual
   que ya tienen la barra de pestañas y la columna lateral. Así, al cambiar
   entre Inicio y Movimientos, que tienen el "+" en el mismo lugar, el botón
   queda quieto en vez de apagarse y volver a subir.
5. **Movimientos** (`src/pages/Movements.jsx`) ya abría el formulario directo.
   Solo adaptá la prop de categorías. **Conservá** el comportamiento de
   `refreshAfterSave`: si el movimiento guardado cae fuera del período que se
   está mirando, salta a su mes. La recarga de la lista la sigue haciendo su
   `load()` propio hasta el bloque 05.

## Qué se reutiliza

- `TransactionFormModal`, `FormSheet`, `ErrorNotice`.
- `useCategories` del bloque 01.

## Qué se borra

- En `Dashboard.jsx`: el `FormSheet` provisorio con el `ListSkeleton` adentro,
  `categories`, `categoriesError`, `loadCategories` y `openExpenseModal`, que
  queda como un simple `setExpenseModalOpen(true)`.
- Las props `categories` y `onCategoryCreated` de `TransactionFormModal`.

## Qué NO tocar

- **Cómo se guarda un movimiento:** `createTransaction`, `updateTransaction` y
  la lógica de conteos o transferencias.
- **El orden y el contenido de los campos del formulario.** Las pastillas de
  categorías son el bloque 03, no este.
- **El resto de Inicio.** Se rehace en el bloque 07.

## Qué se ve distinto en pantalla

- **Tocar "+" en Inicio abre un solo sheet, a pantalla completa, con el cursor
  en el monto y el teclado numérico abierto.** Pasa en el primer toque, en el
  segundo y siempre.
- **El título dice "Nuevo gasto"** y cambia a "Nuevo ingreso" al tocar el
  segmentado.
- **Al pasar de Inicio a Movimientos**, el "+" no parpadea.

## Cómo se verifica

**Tests:** con `renderToStaticMarkup`, siguiendo el patrón de
`src/pages/Movements.test.jsx`, verificá que el título de `TransactionFormModal`
es "Nuevo gasto" con `defaultKind="expense"` y "Nuevo ingreso" con `"income"`.
Si el hook de categorías complica el render estático, envolvé con un
`QueryClientProvider` de prueba.

**Playwright:**

- **Arranque en frío simulado.** Borrá `localStorage` (`finanzas:cache`) y
  recargá. Activá red lenta con CDP (`Network.emulateNetworkConditions`, 400
  ms de latencia). Entrá a Inicio, tocá "+" y 800 ms después verificá que
  `document.activeElement` es el input del monto (`inputmode="decimal"`) y que
  hay **un solo** `[role="dialog"]`.
- **Repetí** tras ir a Movimientos y volver a Inicio.
- **Con categorías sin cargar** (bloqueá `/rest/v1/categories` con
  `page.route`), el formulario abre igual, con "Cargando…" en el selector y el
  foco en el monto.

**📱 Para Nacho, en el iPhone.** Esto es lo que importa, y Playwright no lo
reproduce:

- Entrar a Inicio y tocar "+": **el teclado abre al primer toque.**
- Ir a otra pestaña, volver a Inicio y tocar "+": abre al primer toque.
- Cerrar la app del todo, abrirla y tocar "+": abre al primer toque.
- Lo mismo desde Movimientos.

## Qué puede salir mal

- **El foco se sigue perdiendo** si queda algún sheet que se desmonta al abrir
  otro. Verificá que no quede ningún camino que monte dos sheets.
- **`FormSheet` devuelve el foco "a donde estaba" al cerrarse.** Está bien que
  lo haga, pero no puede pasar en el medio de una apertura.
- **iOS solo abre el teclado si el `focus()` ocurre dentro del gesto.** El
  formulario tiene que montarse en el mismo render que dispara el toque, sin
  esperar ninguna promesa.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **El resumen para Nacho,** en español: qué cambió y qué probar en el iPhone.
- **El commit:** proponé algo como `fix(capture): el formulario de gasto abre
  con el teclado al primer toque`, y **esperá su OK** antes de commitear.
- **Playwright:** borrá `.playwright-mcp/`. Si la app cae en `/login`, pedile a
  Nacho que se loguee a mano. **Nunca** escribas ni leas credenciales.
