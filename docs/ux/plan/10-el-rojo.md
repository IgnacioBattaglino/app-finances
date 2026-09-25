# Bloque 10 de 13 · El rojo vuelve a significar algo

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`) y Supabase. La
  interfaz está en español rioplatense y el código en inglés. Se usa sobre todo
  desde un iPhone, instalada como app.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan. Leé "Sistema visual"
  entero: **todo el color vive en `src/index.css` como variables de `@theme`**,
  el modo oscuro redefine esas variables, y nunca va un hex en un componente.
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 10 de 13 de
  un plan aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.
- **La dirección.** Calma: nada que grite. El usuario tipo arranca de cero.

**Los colores de hoy:**

- **`--color-clay`** es el rojo, con el significado fijo "pérdida, gasto y lo
  destructivo".
- **`--color-gain`** es el verde.
- **La clase `.notice`** es un aviso teñido de `clay`.
- **La clase `.callout`** es una nota neutra en `mist`.

## Skills

- **`impeccable`**: es la principal (color, jerarquía, anti-patrones). Leé
  `reference/craft-floor.md`.
- **`ux-designer`**: que el aviso siga siendo visible y accesible sin ser rojo.
- **`ponytail:ponytail`**.

## El problema

El rojo se usa para cosas que no son alarmas:

- **Una valuación vieja** (aviso rojo en Inversiones, en el detalle de un activo
  y debajo del gráfico de evolución).
- **Un vencimiento atrasado,** que **tiñe de rojo todo el bloque** del
  recordatorio arriba de Inicio.
- **El tinte de color de los grupos de activos** en Inversiones. Un grupo con el
  color "Vino" se ve rosado al lado de una pérdida en rojo, y se lee como
  pérdida.

## Qué hay que hacer

### 1. La regla del rojo

Escribila en `CLAUDE.md`, en "Sistema visual".

**`clay` es plata que se fue, o algo que no se pudo hacer:**

- una pérdida (rendimiento negativo);
- el total de "Gastos" en los renglones del mes y el signo de un gasto en una
  fila de lista;
- una acción destructiva (Eliminar);
- un error que impidió guardar o cargar (`FormError`, `ErrorNotice`).

**Todo lo que es "esto necesita tu atención" deja de ser rojo.**

### 2. Un color de atención

- **Un token nuevo, `--color-attention`:** un ocre apagado, con su versión para
  oscuro (en `:root[data-theme='dark']` **y** en el `@media
  (prefers-color-scheme: dark)`, como todos los tokens).
- **Se usa SOLO como un punto** (unos 8 px, redondo) al lado de algo que pide
  atención. **Nunca** para rellenar un bloque ni para texto largo.
- **Contraste:** como elemento gráfico, tiene que pasar 3:1 contra `card` y
  contra `paper` en los dos modos. Verificalo con números.

### 3. Qué cambia, pantalla por pantalla

**El recordatorio de vencimientos** (`src/components/commitments/DueReminder.jsx`):

- **Vencido:** deja de usar `.notice`. Es la tarjeta de siempre (`surface`).
  Lo que escala es:
  - el **punto de atención** a la izquierda del nombre;
  - el texto de cuándo venció ("venció hace 12 días"), en `ink` y semibold en
    vez de `ink-soft`. Ese número de días que sube solo ya existe, y es lo que
    insiste.
- **Por vencer:** la tarjeta de siempre, sin punto, con el texto en `ink-soft`,
  como hoy.
- **De paso, los dos toques chicos** ("Cambió el monto" y "y N más para
  confirmar") pasan a tener un blanco táctil de 44 px de alto (la clase
  `btn-text` hace eso sin mover el texto).

**Las valuaciones viejas o faltantes:**

- **En la fila de un activo** (`src/components/AssetGroup.jsx`, el texto
  "Valuación desactualizada…"): de `text-clay` a `ink-soft`, con el punto de
  atención delante.
- **En el detalle de un activo** (`src/pages/AssetDetail.jsx`, el párrafo
  "Rendimiento no disponible…"): igual, más el botón "Actualizar valuación" que
  ya tiene.
- **En Inversiones** (`src/pages/Portfolio.jsx`): los avisos "no tiene
  valuación" y "No se pudieron traer los precios" pasan de `.notice` a
  `.callout`.
- **Debajo del gráfico de evolución** (`src/components/PortfolioEvolutionChart.jsx`,
  "tiene una valuación vieja…"): de `.notice` a `.callout`, con el punto.

**Los grupos de activos** (`src/components/AssetGroup.jsx`, más las clases
`.group-tint` y `.group-tint-soft` de `index.css`):

- **El color deja de teñir el encabezado y las filas.** Encabezado y filas
  quedan en la tarjeta de siempre (el encabezado en `mist`, como los grupos sin
  color).
- **El color pasa a ser una marca al lado del nombre del grupo:** un punto de
  10 px, o una barrita vertical corta, del color del grupo. Usá el tono claro
  en oscuro, igual que hoy (`--group-color` / `--group-color-dark`).
- **Borrá `.group-tint` y `.group-tint-soft`,** y sus reglas de modo oscuro.
  **`.group-swatch`** (el selector de color en el detalle del grupo) se queda.

**Revisá además:**

- el total de gastos de Inicio, que desde el bloque 07 tiene que estar en
  `ink`;
- que en toda la app no quede ningún `.notice` o `text-clay` usado para algo
  que no sea de la lista del punto 1. Buscá `notice` y `text-clay` en `src/`.

## Qué se reutiliza

- `.callout`, `.surface` y `btn-text`.
- Las variables de color de grupo que ya existen.

## Qué se borra

- `.group-tint` y `.group-tint-soft`.
- Los `.notice` usados para avisos que no son errores.

## Qué NO tocar

- **Cuándo** algo está vencido o desactualizado: `duePayments`,
  `hasOperationsAfter` y `valuation.outdated`. Solo **cómo se ve**.
- **`gain` y `clay` en ganancias y pérdidas.**
- **Los botones de eliminar.**

## Qué se ve distinto en pantalla

- **Un vencimiento atrasado** es una tarjeta blanca con un puntito ocre y el
  "venció hace N días" en negrita: sin bloque rojo.
- **Las valuaciones viejas** son notas grises con el puntito.
- **Los grupos de Inversiones** son tarjetas blancas con el color en un punto al
  lado del nombre.
- **El rojo que queda** significa pérdida, gasto, borrar o error.

## Cómo se verifica

**Tests:**

- Con `renderToStaticMarkup`: `DueReminder` vencido no tiene la clase `notice`
  y sí el punto (por ejemplo, un elemento con `bg-attention`); uno por vencer no
  tiene el punto.
- Existe `src/components/commitments/DueReminder.test.jsx`: actualizalo.

**Playwright:**

- Capturas a 390 px en claro y en oscuro de Inicio con un vencimiento atrasado
  (creá uno de prueba con fecha pasada o usá uno existente), de Inversiones con
  una valuación vieja (la cuenta de prueba tiene "CEDEARs Cocos"), y del
  detalle de ese activo.
- Medí el contraste del punto contra `card` y `paper` en los dos modos. Tiene
  que pasar 3:1.

**📱 Para Nacho, en el iPhone:**

- ¿El vencimiento atrasado se sigue notando sin gritar?
- ¿Los grupos se distinguen igual por el punto?

## Qué puede salir mal

- **Que el vencimiento atrasado pase desapercibido.** El texto en negrita y el
  número que sube son lo que lo sostiene. Si Nacho lo ve muy débil, el punto
  puede crecer, pero el bloque **no** vuelve a teñirse.
- **Un ocre que en oscuro se confunda con el verde de `gain` o con el rojo.**
  Probalo al lado de los dos.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **`CLAUDE.md`:** la regla del rojo, el token `attention` y el color de grupo
  como marca, en "Sistema visual".
- **`docs/FUNCTIONAL.md`:** en la sección 5 (el recordatorio), el vencido
  escala con el punto y el texto, no con el teñido. En Ajustes/Grupos, el color
  es una marca.
- **El resumen para Nacho** y la lista para el iPhone.
- **El commit:** proponé algo como `feat(ui): el rojo queda para pérdidas,
  gastos, borrar y errores`, y **esperá su OK** antes de commitear.
- **Playwright:** nunca credenciales. Borrá `.playwright-mcp/`.
