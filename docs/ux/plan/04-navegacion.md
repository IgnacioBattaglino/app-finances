# Bloque 04 de 13 · Navegación: volver, barra superior y transiciones

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`), Supabase y
  React Router 7 con router de datos (`createBrowserRouter` en `src/App.jsx`).
  La interfaz está en español rioplatense y el código en inglés.
- **Dónde se usa.** Sobre todo desde un iPhone, instalada como app, **sin
  flecha de volver del navegador**. En el futuro se empaqueta para App Store y
  Play Store con un webview a pantalla completa y sin código nativo. En
  Android, el atrás del sistema recorre el historial.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan. Leé "Sistema visual"
  entero, incluida la parte de "Movimiento".
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 04 de 13 de
  un plan aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.
- **La dirección.** La app tiene que sentirse como una app de iOS, calma, y
  responder a la mano. El usuario tipo arranca de cero.

**Lo que ya existe (bloques 01 a 03).** Hay una capa de datos en caché y el
formulario de gasto ya abre bien. El "+" (clase `.fab` en `index.css`) ya
tiene su propio `view-transition-name`, así que no participa de los cambios de
pantalla. Nada de eso se toca acá.

## Skills

- **`apple-design`**: es la principal. El modelo de navegación de iOS, el
  título grande que se achica en la barra, los materiales translúcidos y la
  consistencia espacial (se sale por donde se entró).
- **`ux-designer`**: orientación. Dónde estoy, a dónde puedo ir, cómo salgo.
- **`impeccable`**: leé `reference/craft-floor.md` antes de editar UI.
- **`ponytail:ponytail`**: una sola pieza de navegación y un solo helper de
  volver; se borran todas las variantes.

## Los problemas (verificados)

1. **"Volver" agrega historial en vez de sacarlo.**
   - `BackLink` (`src/components/BackLink.jsx`) con `to`, y los
     `navigate('/…')` de las pantallas, navegan **hacia adelante** a la
     pantalla madre.
   - **Recorrido verificado:** Inicio → Ajustes → Apariencia → volver →
     volver. Después, el atrás del sistema reabre **Ajustes** y otro atrás
     **Apariencia**.
   - Cambiar de pestaña también apila, así que el atrás de Android pasea por
     las pestañas.
2. **El volver scrollea con el contenido.** Es una fila arriba del título. En
   un historial largo (el detalle de un activo, el extracto de una cuenta), para
   volver hay que subir hasta arriba de todo.
3. **No se usa `env(safe-area-inset-top)` ni las zonas de los costados.** Hoy
   no se nota porque la PWA reserva la barra de estado, pero en un empaquetado
   a pantalla completa el título y el encabezado de un sheet quedan debajo del
   notch.
4. **Todas las navegaciones tienen la misma animación.** La vieja se apaga en
   120 ms y la nueva sube 8 px en 220 ms (`::view-transition-old(root)` y
   `::view-transition-new(root)` en `index.css`).
   - En el teléfono es imperceptible.
   - Cambiar de pestaña y entrar a un detalle se ven igual, así que no dice a
     dónde fuiste.
5. **Hay dos nombres para lo mismo.** La pestaña y la pantalla de compromisos
   se llaman "Compromisos". **Decisión de Nacho: se llama "A pagar"**, en la
   barra **y** en el título.
6. **Queda una ruta huérfana:** `/objetivo` (`src/pages/Goal.jsx`), a la que no
   lleva ningún link.

## El diseño, entero

Todo esto es **una sola pieza**: la navegación de una pantalla. Se construye
junta para que no haya que rehacer nada.

### 1. Volver es volver: `src/hooks/useGoBack.js`

Un hook que recibe la ruta madre y devuelve la función de volver:

- **Si hay una entrada anterior dentro de la app,** hace `navigate(-1)`. El
  router de datos guarda el índice en `window.history.state.idx`; si es mayor
  que 0, hay a dónde volver.
- **Si no hay** (se entró por un link directo, o se reabrió la PWA en esa
  ruta), hace `navigate(madre, { replace: true })`, que no agrega entradas.
- **Excepción:** si la entrada anterior es `/login`, se trata como si no
  hubiera anterior.
- **Marca la dirección** para la transición (sección 4) antes de navegar.
- **La decisión** va en una función pura exportada (del estilo
  `backTarget(idx, parent)`), para testearla.

**El rótulo** del volver nombra la pantalla a la que se va a volver:

- por defecto, la madre;
- si el link que trajo al usuario pasó `state: { from: { label } }`, ese
  rótulo.

Hoy el detalle de un activo lo hace a mano (`state.from === 'movements'`). Se
generaliza, y pasan su rótulo:

- las filas de inversión y de ahorro de Movimientos;
- el encabezado de grupo en Inversiones (`src/components/AssetGroup.jsx`).

**Después de eliminar algo** (una cuenta, un plan, una tarjeta, una categoría,
un grupo), las pantallas usan el mismo `useGoBack`, no `navigate('/madre')`.
Buscá los `navigate(` en `src/pages/`.

**Las pestañas no apilan.** En `src/components/Layout.jsx`, tanto en la barra
como en la columna lateral:

- tocar una pestaña **reemplaza** la entrada actual (`replace` en el
  `NavLink`), salvo cuando se sale de Inicio (`/`), que empuja;
- así el atrás del sistema, desde la raíz de cualquier pestaña, lleva a
  Inicio, y desde Inicio sale de la app.

**Limitación aceptada:** cambiar de pestaña desde un detalle reemplaza el
detalle, así que el atrás vuelve a la pestaña anterior. No hay una pila por
pestaña, a propósito.

### 2. La barra superior fija (en el teléfono)

Vive en `src/components/PageHeader.jsx`, que usan todas las pantallas,
directamente o a través de `src/components/settings/SettingsPage.jsx`.

**Cómo se ve:**

- **Pegada arriba** (`position: sticky`), 44 px de alto más
  `env(safe-area-inset-top)`.
- **Arriba de todo, sin haber scrolleado,** está vacía y transparente, y se lee
  el título grande de siempre (`title-page`) debajo.
- **Cuando el título grande sale por arriba,** aparecen tres cosas, con un
  fundido corto:
  - el título chico, centrado, en `text-body` semibold;
  - el fondo translúcido (`paper` al ~80 % con `backdrop-filter` blur);
  - un borde inferior de 1 px en `line`.
- **Para detectarlo,** un `IntersectionObserver` sobre el título grande, con
  `rootMargin` negativo del alto de la barra. Nada de escuchar `scroll` en cada
  cuadro.
- **A la izquierda, el volver** (flecha más rótulo), si la pantalla tiene.
  **Nunca sale de la pantalla.** Usa `useGoBack`.
- **A la derecha, una acción opcional.** En Inicio, el botón de Ajustes, que hoy
  está pegado al título y scrollea con el contenido.

**La API de `PageHeader`** pasa a recibir:

- la ruta madre y su rótulo (para el volver);
- la acción de la barra;
- algo que va al lado del título grande. El detalle de un activo lo necesita
  para el lápiz de editar, y deja su encabezado hecho a mano.

**El `BackLink` suelto arriba del título desaparece** de todas las pantallas.
Lo reemplaza la barra:

- `src/pages/AssetDetail.jsx`;
- `src/pages/Debts.jsx`;
- `src/pages/CardDetail.jsx`;
- `src/pages/CommitmentDetail.jsx`;
- `src/pages/settings/SettingsHome.jsx`;
- `src/pages/settings/Invitations.jsx`;
- todas las que usan `SettingsPage`: `AccountDetail`, `AssetTypes`,
  `AssetTypeDetail`, `Categories`, `CategoryDetail`, `Appearance` y
  `ExportData`.

`SettingsPage` pierde la dupla `backTo` / `onBack` y pasa la madre.
`BackLink.jsx` queda como pieza interna de la barra, o se borra.

**En escritorio** (`md:` en adelante) no hay barra: hay columna lateral y
encabezado de página. El volver queda arriba del título, como hoy, y usa el
mismo `useGoBack`. Es la única diferencia, y vive dentro de `PageHeader`.

### 3. Zonas seguras

- **`src/components/Layout.jsx`.** En el teléfono, el relleno de arriba del
  contenido lo da la barra (con la zona segura), así que se va el `pt-7`. Los
  rellenos laterales pasan a ser el mayor entre 16 px y
  `env(safe-area-inset-left/right)`.
- **`src/components/FormSheet.jsx`.** Cuando está a pantalla completa
  (`expanded`), el encabezado (Cancelar, título, Guardar) suma
  `env(safe-area-inset-top)`.
- **`Login.jsx`, `Register.jsx` y `ResetPassword.jsx`** (sin `Layout`): sumale
  la zona segura de arriba al relleno.
- **Lo de abajo ya la respeta**: la barra de pestañas, el "+", la barra del
  detalle de activo, el cuerpo del sheet y el toast. No se toca.
- **No cambies** `apple-mobile-web-app-status-bar-style` en `index.html`. Hoy
  vale `default`, así que en la PWA `env(safe-area-inset-top)` es 0 y no cambia
  nada visible. Es para el empaquetado.

### 4. Transiciones con sentido

| Navegación | Qué hace |
|---|---|
| **Cambiar de pestaña** (barra o columna lateral) | **Sin animación.** Instantáneo, como en iOS y Android. Sacá `viewTransition` de los `NavLink` de `Layout.jsx`. La cápsula que se desliza en la barra se queda. |
| **Entrar a un detalle** (cualquier `Link` o `navigate` con `viewTransition` hacia adentro) | La pantalla nueva **entra desde la derecha** (`translateX(100%)` → 0). La vieja se corre un poco a la izquierda (~`translateX(-25%)`) y se oscurece apenas. `--duration-slow` y `--ease-ios`, que ya existen. |
| **Volver** (`useGoBack`) | El camino inverso: la actual **sale por la derecha** y la anterior vuelve desde la izquierda, aclarándose. |
| **Atrás del sistema** (Android, navegador) | Sin animación. React Router no anima un `POP`. |

- **La dirección.** `useGoBack` marca el documento antes de navegar (por
  ejemplo, `document.documentElement.dataset.nav = 'back'`). Todo lo demás con
  `viewTransition` es ida. En `index.css`, dos juegos de keyframes según la
  marca.
  - **Limpiá la marca siempre** al terminar la transición o al empezar la
    siguiente navegación: si queda puesta, la próxima ida se anima como vuelta.
- **Qué no se mueve.** La barra de pestañas, la columna lateral y el "+" ya
  tienen su `view-transition-name`. **La barra de acciones del detalle de
  activo** (Aportar/Retirar, fija abajo en `AssetDetail.jsx`) necesita el suyo,
  para no deslizarse de costado. La barra superior viaja con su pantalla. Si
  eso se ve mal durante el deslizamiento, dale nombre propio y hacé que se
  funda.
- **Qué se borra.** La animación `rise` en `::view-transition-new(root)` y el
  `fade-out` en `::view-transition-old(root)`. Borrá los keyframes `rise` y
  `fade-out` **solo** si nadie más los usa (`fade-out` lo usan el toast y el
  sheet).
- **Movimiento reducido.** `prefers-reduced-motion` ya apaga todo globalmente
  en `index.css`. Verificá que siga cubriendo esto.

### 5. "A pagar"

- **La pestaña** (lista `tabs` de `Layout.jsx`, barra y columna lateral) **y el
  título** de la pantalla (`src/pages/Commitments.jsx`) pasan a decir **"A
  pagar"**.
- **Los rótulos de volver** que hoy dicen "Compromisos" pasan a "A pagar": los
  detalles de tarjeta y de plan, y Deudas.
- **Las rutas no cambian** (`/compromisos…`): son internas y puede haber
  accesos guardados.
- **La descripción** de la pantalla ("Lo que ya está comprometido…") no se
  toca.
- **El rótulo de 10 px de "A pagar"** entra en la barra aun a 320 px de ancho,
  donde "Compromisos" no entraba. Verificalo.

### 6. Borrar `/objetivo`

Sacá la ruta de `src/App.jsx` y borrá `src/pages/Goal.jsx`. El `path="*"`
existente manda cualquier acceso viejo a Inicio.

## Qué se reutiliza

- `PageHeader`, `SettingsPage` y `BackLink` (como pieza interna de la barra).
- El `state.from` de Movimientos.
- `viewTransition` de React Router.
- Los tokens `--duration-slow`, `--ease-ios`, `paper`, `line`, `text-body` y
  `title-page`.
- Los `view-transition-name` existentes.

## Qué se borra

- Los `BackLink` sueltos.
- El `goBack` propio de `AssetDetail` y el `onBack` con `navigate(-1)` de
  `AssetTypeDetail`.
- Los `navigate('/madre')` de después de eliminar.
- La dupla `backTo` / `onBack` de `SettingsPage`.
- El `pt-7` del contenido en el teléfono.
- `viewTransition` en las pestañas.
- La animación `rise` del cambio de pantalla.
- `Goal.jsx` y su ruta.

## Qué NO tocar

- **Las rutas** (salvo `/objetivo`) **y los redirects de rutas viejas.**
- **El contenido de las pantallas.**
- **Los sheets y el toast,** salvo la zona segura del encabezado del sheet.
- **La capa de datos.**
- **`docs/ux/textos.md`:** lo trabaja Nacho.

## Qué se ve distinto en pantalla

- **Volver hace lo que dice,** y el atrás del sistema nunca reabre pantallas
  cerradas.
- **En el teléfono, al scrollear,** el título grande se va y aparece el chico en
  una barra translúcida. **El volver está siempre a la vista.**
- **En Inicio, el botón de Ajustes queda fijo arriba a la derecha.**
- **Tocar una pestaña cambia al instante.** Entrar a un detalle lo trae desde la
  derecha, y volver lo devuelve por la derecha.
- **La pestaña y la pantalla dicen "A pagar".**
- **En escritorio:** el mismo volver arriba del título, pestañas instantáneas y
  detalles con la transición nueva.

## Cómo se verifica

**Tests:**

- `backTarget`:
  - índice mayor que 0 → vuelve;
  - índice 0 → reemplaza a la madre;
  - sin índice → reemplaza a la madre;
  - anterior `/login` → reemplaza a la madre.
- `PageHeader` con `renderToStaticMarkup`: con ruta madre dibuja el volver con
  su rótulo, y sin ella no.

**Playwright:**

- **Historial:**
  1. Inicio → Ajustes → Apariencia → volver → volver: queda en Inicio, y
     `page.goBack()` no reabre ni Ajustes ni Apariencia.
  2. Inicio → Movimientos → Inversiones (pestañas) → `goBack()` → Inicio.
  3. Movimientos → fila de inversión → el volver dice "‹ Movimientos" y vuelve
     a Movimientos.
  4. Entrar directo a `/plata/<id>` → volver → Mi plata, sin que crezca
     `history.length`.
- **Barra (390 × 844):**
  - en un detalle largo, scrolleá al fondo: el volver sigue visible
    (`top >= 0`) y el título chico está;
  - arriba de todo, la barra no tiene fondo;
  - capturas en claro y oscuro, arriba y scrolleado.
- **Escritorio (1440):** sin barra, y el volver arriba del título.
- **Zona segura:** inyectá una regla que la reemplace por 47 px y sacá una
  captura para ver que nada queda tapado. Es una aproximación.
- **Transiciones:**
  - tocá una pestaña y a los 50 ms `document.getAnimations()` no tiene
    animaciones de transición;
  - entrar a un detalle, capturado a ~150 ms, se ve corrido a la derecha;
  - volver, a ~150 ms, sale hacia la derecha;
  - con `page.emulateMedia({ reducedMotion: 'reduce' })`, nada se anima.
- **"A pagar":** a 320 × 568, el rótulo entra en la barra sin pegarse a
  "Inversiones".

**📱 Para Nacho, en el iPhone:**

- Scrollear una pantalla larga: la barra aparece suave y no se despega raro con
  el rebote de iOS, arriba de todo ni al tirar hacia abajo.
- El volver siempre a mano, y vuelve a donde estabas.
- Cambiar de pestaña rápido, varias veces: instantáneo.
- Entrar y salir de detalles: se entiende el sentido. Tocar algo apenas aparece
  la pantalla: el toque no se pierde.
- Abrir un formulario a pantalla completa: la barra no tapa nada.
- La pestaña "A pagar" y el título de la pantalla.
- **Dato para el bloque 13:** en la app instalada, desde un detalle, deslizar
  desde el borde izquierdo. ¿Hace algo?

## Qué puede salir mal

- **La barra sticky y `FormSheet`.** El sheet fija el `body`
  (`position: fixed`) mientras está abierto. Que la barra no salte al abrir y al
  cerrar un sheet.
- **La marca de dirección que queda puesta.** Limpiala siempre.
- **`history.state.idx`** es un detalle interno de React Router. Comentario y
  test.
- **Pantallas que se abren desde dos lugares** con el rótulo de volver
  equivocado. Revisá cada `Link` hacia un detalle.
- **Es un bloque grande.** Si hace falta, hacé commits intermedios para vos,
  pero **entregalo entero**: Nacho lo prueba como una sola navegación.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **`CLAUDE.md`:**
  - mapa: agregá `useGoBack`, y "A pagar" en lugar de Compromisos donde nombra
    la pestaña;
  - "Sistema visual": la barra superior, las zonas seguras, cómo anima cada
    navegación, y la regla de que toda subpantalla lleva volver (ahora en la
    barra);
  - la lista de cinco pestañas.
- **`docs/FUNCTIONAL.md`:** el nombre "A pagar" (sección 5) y el modelo de
  navegación.
- **El resumen para Nacho** y la lista para el iPhone.
- **El commit:** proponé algo como `feat(nav): volver retrocede, barra superior
  fija, transiciones con sentido y "A pagar"`, y **esperá su OK** antes de
  commitear.
- **Playwright:** si hace falta login, que lo haga Nacho a mano. **Nunca**
  escribas ni leas credenciales. Borrá `.playwright-mcp/`.
