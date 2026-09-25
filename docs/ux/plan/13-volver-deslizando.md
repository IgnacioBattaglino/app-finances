# Bloque 13 de 13 · Volver deslizando desde el borde

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`), Supabase y
  React Router 7 con router de datos (`src/App.jsx`). La interfaz está en
  español rioplatense y el código en inglés.
- **Dónde se usa.** Sobre todo desde un iPhone, instalada como app. En el
  futuro se empaqueta sin código nativo.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan.
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el **último** bloque del
  plan, el 13, aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar, salvo la puerta de
    abajo.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.

**REGLA DE ESTE BLOQUE: tiene que poder cortarse sin dejar nada a medio
hacer.**

- **Todo lo nuevo vive en un solo componente nuevo** (por ejemplo
  `src/components/EdgeSwipeBack.jsx`), más **una línea** en
  `src/components/Layout.jsx` que lo monta.
- **Nada de lo que ya existe cambia de comportamiento.**
- **Si se abandona,** se borra el archivo y esa línea, y la app queda
  exactamente como antes.
- **Si algo de otro archivo necesita cambiar para que esto funcione,** parate
  y consultá: es una señal de que se está yendo del alcance.

**Lo que ya existe:**

- `useGoBack` (`src/hooks/useGoBack.js`) decide cómo volver y marca la
  dirección para la transición;
- una barra superior fija con el volver;
- transiciones: un detalle entra por la derecha y vuelve por la derecha;
- un resorte en `src/lib/spring.js`, con `project(velocity)`;
- una capa de datos en caché (TanStack Query), así que cualquier pantalla se
  dibuja al instante con lo último que se sabe.

## Skills

- **`apple-design`**: es la principal. Manipulación directa, velocidad,
  interrupción y velo que acompaña.
- **`ponytail:ponytail`**: mantener todo en un archivo.
- **`impeccable`**.

## PUERTA ANTES DE EMPEZAR

Preguntale a Nacho, y **no escribas nada hasta tener la respuesta**:

> "En la app instalada en tu iPhone, abrí el detalle de un activo y deslizá
> desde el borde izquierdo hacia la derecha. ¿Vuelve solo a la pantalla
> anterior?"

- **Si vuelve solo,** iOS ya tiene el gesto en ese modo. **No se hace este
  bloque:** uno propio se pelearía con el del sistema. Informalo y terminá.
- **Si no pasa nada,** seguí.

## Qué hay que hacer

### Cómo se siente

- **Solo con dedo** (`pointer: coarse`) y solo en pantallas que tienen volver:
  las que no son raíz de una pestaña.
- **Desde el borde izquierdo** (los primeros ~20 px), un arrastre horizontal
  hacia la derecha agarra la pantalla actual. Se decide que es este gesto
  recién después de un umbral de ~10 px **mayormente horizontal**. Si es
  vertical, es scroll y no se toca.
- **La pantalla actual sigue al dedo 1:1.** Debajo aparece **la pantalla
  anterior**:
  - arranca corrida ~25 % a la izquierda y oscurecida por un velo;
  - a medida que avanza el gesto, se centra y se aclara;
  - es el mismo movimiento que la transición de volver, pero manejado por el
    dedo.
- **Al soltar,** posición más `project(velocidad)` (con la velocidad de los
  últimos ~80 ms):
  - **si pasa la mitad del ancho,** la pantalla actual sigue hasta salir por la
    derecha con el resorte, a la velocidad del dedo, y recién ahí se navega
    hacia atrás. Esa navegación **no** tiene que animarse otra vez;
  - **si no pasa la mitad,** vuelve a su lugar con el resorte.
- **Interrumpible:** agarrar de nuevo mientras vuelve o se va detiene el resorte
  y sigue al dedo.
- **Movimiento reducido:** el gesto funciona, pero al soltar se completa sin
  animación.

### La parte difícil: dibujar la pantalla anterior debajo

El router de datos no dibuja dos pantallas a la vez. **El enfoque sugerido,**
que es un prototipo que hay que validar:

- **Al empezar el gesto,** el componente renderiza, en una capa fija debajo de
  la pantalla actual, **el componente de la pantalla madre**. Sale de un mapa
  chico dentro del mismo archivo, de ruta madre a componente de pantalla (por
  ejemplo, `/inversiones` → `Portfolio`), y usa las mismas rutas madre que
  `useGoBack`.
- **Como los datos están en caché,** se dibuja al instante con lo último que se
  sabe.
- **El scroll de la pantalla madre:** colocala en la posición que tenía, que
  React Router guarda para `ScrollRestoration` (mirá dónde la guarda en
  `sessionStorage`), con un `translateY` negativo.
- **Al completar,** se navega atrás. La pantalla real que monta el router tiene
  que coincidir con la capa, así que no hay salto: se saca la capa en el mismo
  cuadro.
- **Si el origen no fue la madre** (por ejemplo, se entró a un activo desde
  Movimientos), la pantalla de debajo es la de origen. Si no se puede saber
  cuál, **no** se activa el gesto en ese caso.

### Punto de corte

Antes de pulir, mostrale a Nacho el prototipo en su iPhone. El criterio de
aceptación es **uno solo**: al completar el gesto **no se ve ningún salto**
entre la capa y la pantalla real, ni en el contenido ni en el scroll.

- **Si no se logra,** se borra el componente y su línea, y el bloque se da por
  cerrado sin gesto.
- **Esa salida es válida y está prevista.**

## Qué NO tocar

- **Las rutas, `useGoBack`, las transiciones, las pantallas y la capa de
  datos.**
- **Android:** el gesto de atrás es del sistema y ya funciona con el bloque 04.
  Este componente no se activa ahí. Detectalo por `pointer: coarse` más iOS, o
  simplemente no lo actives en Android.

## Qué se ve distinto en pantalla

Desde cualquier detalle, deslizar desde el borde izquierdo lleva la pantalla
con el dedo y deja ver debajo la anterior, que se va aclarando. Al soltar,
termina de volver o se queda, con la inercia del gesto.

## Cómo se verifica

**Tests:** la decisión de completar o volver (posición, velocidad y ancho) como
función pura, con `project`. Casos:

- quieto a menos de la mitad → vuelve;
- rápido a poca distancia → completa;
- quieto a más de la mitad → completa.

**Playwright:**

- Un arrastre con eventos de puntero desde x = 5 hacia la derecha, en un
  detalle:
  - la capa de la pantalla madre aparece;
  - al soltar pasado la mitad, la URL es la de la madre;
  - al soltar antes de la mitad, la URL no cambia.
- Un arrastre vertical desde el borde **no** activa el gesto.
- **No certifica la sensación.**

**📱 Para Nacho, en el iPhone.** Es lo único que decide:

- Volver deslizando desde un activo, una cuenta, una tarjeta y Ajustes.
- **¿Se ve algún salto al completar?**
- ¿Choca con algo? Por ejemplo, la tira de filtros de Movimientos, que scrollea
  de costado, o el gesto del sistema en el borde.

## Qué puede salir mal

- **El salto al completar** (el contenido o el scroll no coinciden). Es el
  riesgo principal, y es el criterio de corte.
- **Pantallas que dependen de su estado local** (un filtro, un "Ver más"
  abierto) y que en la capa se dibujan distinto que al volver de verdad.
  Aceptalo si el salto es imperceptible. Si no, es motivo de corte.
- **Que el gesto se active sin querer** al scrollear. Por eso el umbral
  mayormente horizontal y la franja del borde.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **Si queda:** `CLAUDE.md` (mapa, "Piezas de pantalla") y `docs/FUNCTIONAL.md`
  (principios).
- **Si se corta:** una línea en `docs/ux/propuesta-frontend.md`, sección I, con
  por qué.
- **El resumen para Nacho** y la lista para el iPhone.
- **El commit:** proponé algo como `feat(nav): volver deslizando desde el
  borde`, y **esperá su OK** antes de commitear.
- **Playwright:** nunca credenciales. Borrá `.playwright-mcp/`.
