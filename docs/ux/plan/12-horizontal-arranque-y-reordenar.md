# Bloque 12 de 13 · Teléfono horizontal, arranque en oscuro y reordenar

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`) y Supabase. La
  interfaz está en español rioplatense y el código en inglés.
- **Dónde se usa.** Sobre todo desde un iPhone, instalada como app. En el
  futuro se empaqueta para App Store y Play Store. **No hay código nativo, ni
  va a haber.**
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan. Leé "Sistema visual".
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 12 de 13 de
  un plan aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.

**Este bloque son dos arreglos chicos y sin relación entre sí,** juntos para
ahorrar una sesión:

- **Parte A:** el teléfono horizontal y el arranque en oscuro.
- **Parte B:** reordenar filas con el dedo.

Cada parte se verifica por separado, **pero se entregan juntas**.

**Lo que ya existe:**

- **Zonas seguras:** la barra superior fija y el layout ya las respetan (bloque
  04).
- **El tema:** `src/lib/theme.js` guarda la elección en `localStorage` con la
  clave `finanzas:theme` y la aplica con `applyTheme`. Confirmá los valores y el
  atributo exactos en el archivo.
- **El resorte:** `src/lib/spring.js`, del bloque 11, con amortiguación y
  respuesta. Arranca desde el valor actual con una velocidad dada, se puede
  detener y leer, y trae `project(velocity)`.

## Skills

- **`apple-design`**: la parte B (manipulación directa, asentarse).
- **`ux-designer`**: la parte A (adaptación a dispositivos).
- **`ponytail:ponytail`**: redefinir antes que reescribir.
- **`impeccable`**.

---

## Parte A · Horizontal y arranque

### Los problemas

1. **Un iPhone horizontal recibe el layout de escritorio.** El corte `md` de
   Tailwind es por ancho (768 px) y un teléfono horizontal mide 844. Recibe la
   columna lateral de 250 px, sin "+", con botones de 36 px pensados para mouse.
   iOS ignora la orientación del manifest en una web instalada. Verificado a
   844 × 390.
2. **El tamaño de los controles depende del ancho, no del dedo.** Un iPad
   táctil recibe botones de mouse.
3. **Arranque en modo oscuro:**
   - `public/manifest.webmanifest` tiene `background_color` y `theme_color` en
     `#f3f5f1`, un gris viejo; el fondo real es `--color-paper`, `#f1f2f6`;
   - el HTML no pinta ningún fondo antes del CSS;
   - con "Oscuro" elegido a mano y el sistema en claro, el primer cuadro es
     claro;
   - no hay pantallas de arranque de iOS.

### Qué hay que hacer

- **El layout de escritorio exige ancho y alto:** al menos 768 px de ancho
  **y** ~600 px de alto.
  - Un teléfono horizontal (390 de alto) queda con el layout del teléfono,
    estirado a lo ancho. Un iPad sigue en escritorio.
  - **La forma preferida:** redefinir el variant `md` de Tailwind 4 en
    `src/index.css` (`@custom-variant md (@media (min-width: 48rem) and
    (min-height: 37.5rem));` o equivalente). **Verificá en el CSS de
    `npm run build`** que `md:` usa la condición nueva.
  - Si Tailwind no deja pisarlo, creá `desk:` y reemplazá los ~45 `md:` de
    `src/` de forma mecánica.
  - **Los `@media (min-width: 48rem)` escritos a mano** en `index.css` y
    **cualquier `matchMedia`** de `src/` usan la misma condición. Por ejemplo,
    el que monta el gráfico de Inicio solo en escritorio.
- **El tamaño de los controles depende del puntero.** `.btn` baja a 36 px y
  14 px de texto **solo con `(hover: hover) and (pointer: fine)`**. Con dedo,
  siempre 52 px. Lo mismo para cualquier otro tamaño "de mouse" en `index.css`.
- **Arranque sin destellos:**
  - **`index.html`,** en el `<head>`:
    - un `<style>` mínimo con el fondo de `html` en `#f1f2f6`, y en `#0b0c10`
      bajo `prefers-color-scheme: dark`, con un comentario, acá y en
      `index.css`, de que tienen que coincidir;
    - un `<script>` síncrono y corto, antes del CSS, que lea
      `localStorage['finanzas:theme']` dentro de un `try/catch` y ponga
      `data-theme` en `<html>` con **los mismos valores que `applyTheme`**.
  - **`public/manifest.webmanifest`:** `background_color` y `theme_color` a
    `#f1f2f6`.
  - **Pantallas de arranque de iOS** (`apple-touch-startup-image`), en claro y
    oscuro:
    - el anillo de la app (`public/icon.svg`) centrado sobre `paper`;
    - para el iPhone de Nacho (preguntale el modelo) y los 2 o 3 tamaños más
      comunes;
    - generalas renderizando un HTML con Playwright y guardando en `public/`;
    - declaralas con `media` por tamaño y por `prefers-color-scheme`.
- **Para el empaquetado futuro, solo una nota.** En `docs/FUNCTIONAL.md`,
  "Principios de diseño": al empaquetar, fijar la orientación vertical y generar
  la pantalla de arranque con variante oscura. Es configuración, no código.

### Cómo se verifica la parte A

**Playwright:**

- **844 × 390:** barra de pestañas, "+", sin columna lateral.
- **1440 × 900 y 1024 × 768:** escritorio.
- **768 × 1024** con `hasTouch` e `isMobile`: escritorio, con un `.btn` de 52 px
  de alto.
- **`colorScheme: 'dark'`** con el CSS bloqueado (`page.route`): el fondo del
  primer cuadro es oscuro.
- **`finanzas:theme` en oscuro con el sistema en claro:** `data-theme` en
  `<html>` antes de React.

**📱 Para Nacho, en el iPhone:**

- Girar el teléfono en varias pantallas.
- **Con el iPhone en oscuro,** cerrar la app del todo y abrirla: ¿arranque
  oscuro, sin destello? Lo mismo en claro.

---

## Parte B · Reordenar que se asienta

### El problema

`src/components/settings/ReorderableRows.jsx`, el arrastre de la manija en
Categorías y en Mi plata:

- **salta de a una fila** (redondea el desplazamiento y reescribe el orden en
  cada paso);
- **las de al lado cambian de golpe;**
- **al soltar, la fila se clava.**

### Qué hay que hacer

- **La fila arrastrada sigue al dedo de forma continua,** 1:1, respetando el
  punto de agarre, levantada con la sombra que ya tiene.
- **El orden no se reescribe durante el gesto.** Se calcula la posición destino
  a partir del desplazamiento, y **las filas entre el origen y el destino se
  corren** una fila con `transform`, **animadas** (`--duration-base`,
  `--ease-ios`).
- **Al soltar,** la fila se asienta con el resorte (amortiguación 1, respuesta
  ~0,3) a la velocidad del dedo. **Recién al terminar** se aplica el nuevo orden
  y se llama a `onCommit`, como hoy.
- **Todo con `transform` directo sobre el DOM** durante el gesto.
- **Umbral de 4 a 6 px:** un toque en la manija no reordena.
- **Movimiento reducido:** sin animación; el orden se aplica al soltar.
- **No se hace:**
  - **auto-scroll al borde:** las listas son de 5 a 15 filas;
  - **pulsación larga sobre la fila entera:** la manija es explícita y no se
    pelea con el scroll, que es una decisión escrita en `docs/FUNCTIONAL.md`.
- **La API** (`items`, `onCommit`, `children(item, dragHandlers)`) **no
  cambia.** `reorderCategories` y `reorderAccounts` tampoco.

### Cómo se verifica la parte B

**Tests:** el cálculo de la posición destino (desplazamiento, alto de fila y
cantidad) como función pura. Bordes, cero y fracciones.

**Playwright:**

- **En Ajustes → Categorías,** arrastrá la tercera a la primera posición:
  - a mitad del arrastre, las dos de arriba tienen `transform` hacia abajo;
  - a los ~500 ms de soltar, el DOM tiene el orden nuevo;
  - al recargar, persiste.
- **Volvé a dejarla** donde estaba.

**📱 Para Nacho, en el iPhone:** reordenar categorías y cuentas. ¿Va pegado al
dedo? ¿Se asienta sin saltos?

---

## Qué NO tocar

- **El contenido de las pantallas.**
- **`src/lib/theme.js`:** solo se replica su primer paso en el HTML.
- **Qué y cómo se guarda el orden.**

## Qué puede salir mal

- **Pisar el variant `md`** puede no funcionar o romper algo en silencio. Se
  verifica en el CSS generado.
- **Un `md:` que no era de layout** (un tamaño de texto) y ahora cambia en
  horizontal. Revisá los usos.
- **Las imágenes de arranque de iOS** se ignoran sin avisar si el tamaño no
  coincide exacto.
- **Que la lista se re-renderice** por la caché justo al terminar el
  reordenamiento. Aplicá el orden al terminar el resorte, no antes.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **`CLAUDE.md`,** en "Sistema visual": el layout depende del ancho y el alto,
  y el tamaño de los controles del puntero.
- **El resumen para Nacho,** con las dos partes separadas, y la lista para el
  iPhone.
- **El commit:** proponé algo como `feat(ui): layout de teléfono en horizontal,
  arranque en oscuro y reordenar que se asienta`, y **esperá su OK** antes de
  commitear.
- **Playwright:** nunca credenciales. Borrá `.playwright-mcp/`.
