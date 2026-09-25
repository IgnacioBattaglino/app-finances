# Bloque 11 de 13 · El sheet se agarra con el dedo

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`) y Supabase. La
  interfaz está en español rioplatense y el código en inglés. Se usa sobre todo
  desde un iPhone, instalada como app.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan. Leé "Convenciones de
  formularios" entero (`FormSheet`, teclado, autofocus, expansión a pantalla
  completa, "guardar sin tocar nada deja la fila idéntica") y "Movimiento".
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 11 de 13 de
  un plan aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.
- **La dirección.** En el teléfono, la app tiene que **responder a la mano**,
  no reproducir animaciones. **El sheet es el gesto más usado de la app. Se
  prueba entero:** no hay "mitad de arrastre" que se pueda evaluar.

## Skills

- **`apple-design`**: es la principal. Respuesta, manipulación directa,
  interrupción, resortes, traspaso de velocidad, proyección del impulso,
  resistencia elástica y consistencia espacial. Seguila al pie de la letra.
- **`ponytail:ponytail`**:
  - se borra un truco frágil (el clon del DOM);
  - se simplifica el montaje de 15 formularios;
  - el resorte es propio y chico, sin librería.
- **`impeccable`**: leé `reference/craft-floor.md`.

## Los problemas

Todo formulario usa `src/components/FormSheet.jsx`. Hoy:

1. **Cada formulario se desmonta solo al cerrarse.**
   - La mayoría hace `if (!open) return null`.
   - Algunos padres los montan condicionalmente, por ejemplo
     `{rangeOpen && <RangeSheet/>}` en `Movements.jsx` y
     `{paymentModal.debt && <DebtPaymentModal/>}` en `Debts.jsx`.
   - Como el sheet desaparece de golpe, la salida se anima con un **truco**: al
     desmontarse, `FormSheet` clona su DOM (`cloneNode`), lo pega en `<body>`,
     lo anima y lo borra con un `setTimeout`. Esa copia no se puede agarrar y
     siempre arranca a velocidad cero.
2. **El arrastre para cerrar:**
   - decide con la velocidad **promedio** de todo el gesto, no con la del final;
   - al cerrar hay un frenazo (la copia arranca de cero con una curva que
     acelera);
   - al soltar sin cerrar vuelve con una transición CSS fija, sin la velocidad
     del dedo;
   - está **apagado a pantalla completa**, y el formulario de gasto arranca a
     pantalla completa, así que nunca se puede arrastrar;
   - solo se agarra de la barrita o del encabezado, nunca del contenido;
   - el velo no acompaña;
   - hacia arriba se clava;
   - no se puede agarrar mientras entra o sale.

## El diseño, entero

### 1. Un resorte propio: `src/lib/spring.js`

Un resorte amortiguado con los dos parámetros de Apple:

- **amortiguación** (`damping`): 1 no rebota;
- **respuesta** (`response`): en segundos; cuanto más baja, más rápido.

Se mueve con `requestAnimationFrame`.

- **Qué recibe:** el valor de partida, el destino, la **velocidad inicial** en
  px/s, los parámetros y un `onUpdate`.
- **Qué devuelve:** algo que permite **detenerlo** y **leer el valor y la
  velocidad actuales**.
- **Termina** cuando la distancia y la velocidad son despreciables, y llama a
  `onComplete`.
- **Al lado, una función pura `project(velocity, decelerationRate = 0.998)`:**
  `(v / 1000) * d / (1 - d)`, la de Apple.
- **Unas 40 a 60 líneas. Sin dependencias.** Lo van a usar también el bloque 12
  (reordenar) y el 13 (volver deslizando).

### 2. `FormSheet` es dueño de su presencia

- **Recibe `open`.**
  - Con `true`, se monta y **entra con el resorte**, desde abajo.
  - Con `false` estando visible, **sale con el resorte** hacia abajo, y **recién
    al terminar** se desmonta de verdad.
  - Mientras sale, es inerte (`inert`).
- **Mientras sale, el contenido queda congelado.** Los padres limpian su estado
  al cerrar (`setEditing(null)`), y el título no puede pasar de "Editar gasto" a
  "Nuevo gasto" durante la salida.
  - Una forma simple: mientras sale, `FormSheet` muestra los últimos `children`,
    título y subtítulo que recibió con `open` en `true`.
- **Los 15 formularios** dejan de hacer `if (!open) return null` (o
  `if (!open || !x) return null`). Pasan `open` a `FormSheet`, y solo dejan de
  renderizar su contenido cuando **no hay datos** (por ejemplo, `!asset`):
  - `AssetFormModal`, `ContributionFormModal`, `DebtFormModal`,
    `DebtPaymentModal`, `LiquidModal`, `TransactionFormModal`,
    `ValuationModal`;
  - `account/AccountTransferModal`, `account/SavingsMovementModal`;
  - `commitments/CardFormModal`, `commitments/CommitmentFormModal`,
    `commitments/ConfirmChargeModal`;
  - `contribution/LiquidatePositionModal`, `contribution/TransferFormModal`;
  - `movements/RangeSheet`.
- **Los padres** que los montan condicionalmente pasan a montarlos siempre, con
  `open`. Buscá `{x && <…Modal` y similares.
- **Los efectos de reseteo** de cada formulario
  (`useEffect(() => { if (!open) return; … }, [open, initial])`) no cambian.
  **Leé en `CLAUDE.md` la regla del reseteo de `ExchangeRateField` antes de
  tocar nada cerca.**
- **`LiquidModal`** tiene otro `return null` (`if (!anyDeclared)`) que es otra
  cosa y no se toca.
- **Se borran** el clon del DOM (el `useLayoutEffect` con `cloneNode`), el
  `setTimeout` de 600 ms y las reglas `.sheet-leaving` de `index.css`.

### 3. Cómo se siente (con dedo; `pointer: coarse` o eventos de touch)

**Se agarra:**

- de la barrita y del encabezado;
- **del cuerpo, cuando ya está scrolleado arriba de todo** y el dedo va hacia
  abajo. Si el cuerpo puede scrollear hacia arriba, scrollea y no arrastra.
  Decidilo al principio del gesto, según `scrollTop` y la dirección: en iOS, una
  vez que arrancó el scroll nativo no se puede tomar el gesto;
- **también a pantalla completa**, incluido el formulario de gasto. Al empezar a
  arrastrar se le saca el foco al campo (se baja el teclado) y el sheet sigue al
  dedo.
- **Umbral:** ~8 a 10 px antes de decidir que es un arrastre y no un toque.

**Mientras se arrastra:**

- **1:1 con el dedo,** respetando el punto de agarre, con
  `setPointerCapture`;
- **el velo se aclara en proporción** a cuánto bajó el panel;
- **hacia arriba, resistencia elástica** (cuanto más se tira, menos sigue), y
  al soltar vuelve;
- `transform` del panel y opacidad del velo **directo sobre el DOM**, sin estado
  de React por cuadro.

**Al soltar:**

- **Velocidad del final:** la de los últimos ~80 a 100 ms de `pointermove`.
- **Decide con la posición proyectada:** posición actual más
  `project(velocidad)`. Si pasa la mitad del alto del panel, **cierra**; si no,
  **vuelve**.
- **Cierra:** sigue bajando **a la velocidad que traía** (resorte,
  amortiguación 1, respuesta ~0,3), el velo se apaga en el mismo movimiento, y
  al terminar se llama a `onClose` y se desmonta.
- **Vuelve:** resorte con amortiguación 1 y respuesta ~0,35, **arrancando a la
  velocidad del dedo**. Sin rebote.

**Interrupción:**

- Si el dedo agarra el sheet mientras entra o sale (por el resorte), se detiene
  el resorte, se lee la posición actual y sigue al dedo desde ahí.
- Si se estaba yendo porque se tocó "Cancelar" y el usuario lo agarra, vuelve a
  estar abierto.

**Cerrar con "Cancelar", Escape, tocar el velo o después de guardar:** el mismo
resorte, desde velocidad cero.

**En escritorio** (`(pointer: fine)`), nada de esto: la tarjeta centrada entra
y sale como hoy, con las animaciones de escritorio que ya existen.

**Movimiento reducido:** sin resorte. Un fundido corto al entrar y al salir, y
el arrastre, si se usa, cierra o vuelve sin animación.

### 4. Lo que queda como está

- La expansión a pantalla completa al enfocar un campo, **y su scroll
  obligatorio del campo enfocado** (`CLAUDE.md`: es un requisito, no una
  mejora).
- El foco que entra al panel y vuelve a su lugar, Escape, el bloqueo del scroll
  del `body` (que se libera **al terminar** la salida, no al empezarla), el
  `<form>` y el Guardar.

## Qué NO tocar

- **Lo que hace cada formulario:** campos, validación y guardado.
- **La lógica de conteos, transferencias y tipos de cambio.**

## Qué se ve distinto en pantalla

- **Cualquier sheet se baja con el dedo:** de arriba, desde el contenido si está
  arriba de todo, y aunque esté a pantalla completa con el teclado abierto.
- **Sigue al dedo y el fondo se aclara en el camino.** Al soltarlo, sigue con el
  impulso que traía o vuelve suave.
- **Se puede frenar y revertir a mitad de camino,** también mientras entra o
  sale.
- **Abrir y cerrar con los botones** se ve casi igual que hoy, pero es el sheet
  real el que se mueve.

## Cómo se verifica

**Tests** (vitest, `node`) de `src/lib/spring.js`, avanzando el tiempo a mano:

- con amortiguación 1, llega al destino **sin pasarse**;
- con velocidad inicial hacia el destino, llega antes que sin ella;
- detenerlo a mitad da un valor entre el origen y el destino;
- `project(0) === 0` y crece con la velocidad.

**Playwright** (390 px, con eventos de puntero; **no certifica la
sensación**):

- **Cada uno de los 15 formularios:** abrir → Cancelar → Escape → abrir,
  guardar y cerrar. Durante la salida el `role="dialog"` sigue en el DOM, y a
  los ~600 ms ya no.
- **No quedan clones** (`.sheet-leaving`).
- **Editar un movimiento y cancelar:** a los 80 ms el título sigue diciendo
  "Editar…".
- **Arrastrar** el encabezado 60 px despacio → vuelve. **60 px en ~50 ms** →
  cierra.
- **A mitad de un arrastre de 200 px,** la opacidad del velo es menor.
- **Formulario de gasto** (a pantalla completa): arrastrar desde el encabezado
  lo baja.
- **Cuerpo scrolleado hacia abajo:** arrastrar hacia abajo desde el cuerpo
  scrollea y no mueve el panel.
- **Dos sheets apilados** (desde un movimiento viejo, "Contarla de nuevo ahora"
  abre el conteo encima): cerrar el de arriba no cierra el de abajo.
- **Con `reducedMotion: 'reduce'`,** sin animaciones.
- **El "+" de Inicio sigue abriendo con el foco en el monto** al primer toque.
  Es el bug que arregló el bloque 02: el foco que vuelve al cerrarse un sheet
  no puede volver a romperlo.

**📱 Para Nacho, en el iPhone.** Es lo que decide el bloque:

- Bajar un sheet despacio y soltarlo antes de la mitad: vuelve sin rebote y sin
  frenazo.
- Tirón corto: se va con el impulso, sin pausa entre el dedo y la caída.
- Agarrarlo mientras cae y subirlo: responde.
- El formulario de gasto con el teclado abierto: arrastrar lo baja y el teclado
  se va sin saltos raros.
- Un formulario largo scrolleado: scrollear no lo cierra. Arriba de todo,
  seguir tirando lo baja.
- El velo acompaña.
- El "+" de Inicio sigue abriendo el teclado al primer toque.

## Qué puede salir mal

- **El teclado de iOS al quitar el foco en medio del gesto:** el viewport cambia
  de alto. Es lo más delicado, y solo se ve en el iPhone.
- **Un formulario que dependía de desmontarse para limpiar un estado interno** y
  que al reabrir muestra lo anterior. Probá cada uno: abrir, tipear, cancelar,
  reabrir.
- **El conflicto entre el scroll del cuerpo y el arrastre.**
- **Rendimiento,** si algo del gesto pasa por el estado de React.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **`CLAUDE.md`:**
  - "Convenciones de formularios": todo modal recibe `open` y se lo pasa a
    `FormSheet`, nadie hace `if (!open) return null`, y cómo se cierra con el
    dedo;
  - "Movimiento": `src/lib/spring.js` como la primitiva de todo movimiento
    guiado por un gesto;
  - mapa: agregá `spring.js`.
- **El resumen para Nacho** y la lista para el iPhone.
- **El commit:** proponé algo como `feat(forms): el sheet se agarra, hereda la
  velocidad y se puede frenar`, y **esperá su OK** antes de commitear.
- **Playwright:** nunca credenciales. Borrá `.playwright-mcp/`.
