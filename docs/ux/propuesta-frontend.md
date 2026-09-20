# Propuesta de cambios del frontend — etapa 2 de 5

Qué hacer con lo que encontró `auditoria-frontend.md`, en la rama
`feat/ui-polish`. No repite el diagnóstico: cada cambio lo cita por su
sección (§).

Es una propuesta para aprobar, no un plan de implementación. Cada cambio
trae cuatro cosas: **problema**, **qué se ve distinto**, **costo** y
**riesgo**. El costo va en tres tallas:

- **S**: una tarde, pocos archivos.
- **M**: unos días, toca un patrón compartido.
- **L**: una semana o más, toca la estructura.

Las dependencias entre cambios se marcan con «**depende de**».

Fecha: 2026-09-17.

**La vara.**

- **Calma:** silenciosa, espaciosa, la información justa. Inicio condensa y
  el detalle está a un toque. El usuario tipo arranca de cero.
- **Agarre:** en el teléfono la app responde a la mano, no reproduce
  animaciones.

**Confirmado en tu iPhone.**

- **El primer "+" de cada visita a Inicio no abre el teclado**; el segundo sí.
  Pasa a ser un ROTO confirmado.
- **Los toques perdidos durante la transición** no se pudieron verificar. La
  propuesta los vuelve irrelevantes: saca la transición de las pestañas y deja
  una sola, corta, para entrar a un detalle (C3).

---

## El orden

| # | Cambio | Talla | Depende de |
|---|---|---|---|
| **A** | Capa de datos: la app recuerda, y la pantalla nunca se vacía | L | — |
| **B** | Captura: un solo "+", un solo sheet, teclado al primer toque | S | A (parcial) |
| **C** | Navegación: volver es volver, barra superior fija, pestañas quietas | M | — |
| **D** | Inicio calmo, y cada detalle a su pantalla | M | A |
| **E** | El sheet se agarra con el dedo | M | — |
| **F** | El rojo vuelve a significar algo | S | — |
| **G** | Los otros ROTO (Compromisos, la fila de ahorro) | S | A (Compromisos) |
| **H** | Empaquetado: zona segura, horizontal, arranque en oscuro | S–M | C |
| **I** | Volver deslizando desde el borde | L | A, C, E |
| **J** | Movimientos, Mi plata e Inversiones en el teléfono | M | A, D |
| **K** | Reordenar que se asienta | S | E |

A va primero aunque no se vea sola: es la mitad del arreglo de B, D, G, I y
J. Lo que no dependa de A se puede hacer en paralelo.

---

## A · La app recuerda (el fin del parpadeo)

**Problema.** Es §1 entero, más §1.4 (guardar vacía la pantalla), §5.7.1 (17
pantallas con el mismo cuarteto a mano) y la mitad de §5.6. Es un solo
problema: no hay un lugar donde viva lo que la app ya sabe.

### A.1 Qué se recuerda entre pantallas

Todo lo que se lee de Supabase pasa a vivir en **una sola caché compartida**,
con una llave por consulta:

- las cuentas;
- las categorías;
- el disponible por cuenta;
- el portafolio (activos, grupos, aportes, valuaciones);
- los precios, aparte;
- las deudas;
- los compromisos y las tarjetas;
- los movimientos de un período;
- los gastos de 12 meses;
- la serie del portafolio.

Hay dos reglas de frescura:

- **Fresco por un rato.** Volver a una pantalla vista hace menos de ~30 s no
  pide nada. Así, ir y venir entre pestañas no hace ningún pedido.
- **Viejo, pero visible.** Pasado ese rato, se muestra lo último que se sabe
  al instante y se pide de nuevo por detrás. Cuando llega, los números cambian
  **en su lugar**, sin mover nada: las cifras ya son tabulares.

Además:

- **Al volver a la app** (la app vuelve a primer plano) se refresca lo que
  esté a la vista. Resuelve "a la mañana veo el disponible de ayer" (§2.3) sin
  que el usuario haga nada.
- **Los detalles arrancan con lo que ya se sabe del listado.** El detalle de
  un activo se abre con el nombre, el valor y el grupo que Inversiones ya
  tenía, y completa el historial. El de una cuenta, con el nombre y el saldo de
  Mi plata. Se terminan el título vacío y el "Cuenta" que cambia de texto.
- **Categorías y cuentas se piden una vez al entrar a la app**, antes de que
  nadie las necesite. Son chicas y las usa todo formulario.

### A.2 Qué se muestra mientras refresca

Tres casos, cada uno con su comportamiento:

| Caso | Qué se ve |
|---|---|
| **La misma pregunta, refrescada** (volver a Inicio, volver a la app, después de guardar) | Los datos de antes, quietos. **Ningún indicador**: la calma es que no pase nada visible hasta que haya algo nuevo que mostrar. |
| **Otra pregunta** (Movimientos pasa de septiembre a agosto, el gráfico cambia de rango) | La **estructura** de la pantalla se queda y **los valores** pasan a un marcador del mismo tamaño en el mismo lugar. No se muestran los números del mes anterior bajo el título del nuevo: sería un dato falso. |
| **Nunca se vio** (primer arranque, primera visita a un detalle sin listado) | El esqueleto de A.3. |

### A.3 La forma de los esqueletos

Tres reglas:

1. **Cada pantalla dibuja su propio esqueleto con sus propios componentes.**
   El esqueleto de Inicio es Inicio sin números; el de Inversiones, la tarjeta
   del total, la fila de herramientas y dos grupos. Así mide lo mismo que el
   contenido, porque es el contenido. `ListSkeleton` como pieza genérica
   desaparece.
2. **No late.** Bloques quietos en `mist`, sin `animate-pulse`. Si la espera
   pasa de ~1 s, aparece una sola línea de texto discreta. Además, el
   esqueleto aparece recién a los ~150 ms: en una red buena, nunca se llega a
   ver.
3. **Nada que llegue tarde puede aparecer ARRIBA de algo ya visible.**
   - Lo que está en el primer vistazo se revela **junto**, una sola vez.
   - Lo que está más abajo puede llegar después, porque no empuja nada que el
     ojo esté mirando.
   - El recordatorio de compromisos, la tarjeta de ahorro y los totales de
     Movimientos entran en la primera categoría: esperan al resto o tienen su
     lugar reservado.

### A.4 Guardar

- **El sheet se cierra, la pantalla de atrás no se toca y los números cambian
  en su lugar** cuando llega la respuesta. No hay esqueleto, no se pierde el
  scroll, y el toast confirma.
- **Qué se refresca después de cada escritura se decide en un solo lugar.**
  Por ejemplo: un gasto toca el disponible, los movimientos del período, los
  gastos del mes y el extracto de su cuenta. Es la pieza que más cuidado pide
  de toda la propuesta: una lista mal armada deja un número viejo en pantalla.
- **La fila nueva o editada se ilumina apenas, una vez**, para que el ojo la
  encuentre. Es el único movimiento de esta sección, y responde a algo que hizo
  el usuario.
- **Sin actualizaciones optimistas.** El disponible y los totales los calcula
  la base, y adivinarlos en el cliente sería reimplementar la regla de plata.
  Se espera la respuesta del servidor, como hoy.

### A.5 Lo que se borra como consecuencia

- **Los 17 cuartetos `loading/error/load/useEffect`.**
- **`useScrollRestoration`.** Con los datos en caché, la pantalla se dibuja
  entera en el primer cuadro al volver, y el `ScrollRestoration` del router
  alcanza para **todas** las pantallas, no solo Inversiones.
- **El `catch(() => {})` que se tragaba errores.** Un error de carga pasa a
  ser siempre un `ErrorNotice` con Reintentar (§5.2).

Aprovechando que todo pasa por un solo lugar, las dos consultas sin paginar
de §5.6 (`getContributions`, `getReconciliationBatches`) pasan a usar
`fetchAllPages`. No cambia qué se calcula, solo que no se corten en silencio.

### A.6 La dependencia: TanStack Query (~13 kB gzip)

**Por qué.** Lo que hace falta es exactamente lo que hace esa librería:

- caché con llave;
- frescura configurable;
- refresco al volver a la app;
- deduplicar pedidos simultáneos (hoy Inicio y el formulario piden lo mismo a
  la vez);
- invalidar después de escribir;
- descartar respuestas de un pedido viejo que llegan tarde;
- reintentos.

**Qué pasa si no.** Se escribe un módulo propio de unas 200 líneas con esas
mismas piezas, más sus tests. Se puede, y no es exótico. Pero es una capa
donde un error de carrera muestra un **monto viejo como si fuera actual**, en
una app de plata. La librería es una dependencia a cambio de borrar más código
del que agrega: los 17 cuartetos desaparecen.

**Por qué no los loaders del router** (el router de datos ya está). Un loader
hace esperar la navegación hasta que llegan los datos. En red de teléfono eso
es un toque muerto de medio segundo (§1.5), y además no recuerda nada entre
visitas. Resuelve el salto a costa de la respuesta al toque.

### A.7 Una decisión tuya: guardar la caché en el teléfono

Con la caché solo en memoria, **el arranque en frío** (abrir la app de cero)
sigue mostrando esqueleto hasta que llegan los datos. Y ese es el momento más
frecuente de todos.

Si la caché se guarda en el dispositivo, la app abre **con los últimos números
conocidos al instante** y se refresca por detrás.

- **A favor:** la app abre como una app nativa.
- **En contra:** los montos quedan en el almacenamiento del teléfono. Se
  borran al cerrar sesión, pero existen fuera de Supabase. No contradice la
  regla del repo (que los datos no estén en el código), pero es una decisión
  de privacidad y es tuya.
- **Mi recomendación:** sí, con borrado al cerrar sesión.

### Costo y riesgo de A

- **Costo:** L. Toca todas las pantallas, pero cada pantalla queda más corta.
- **Riesgo:** medio. Lo concentra la lista de qué refresca cada escritura.
  Mitigación: un test por escritura que diga qué llaves invalida.

---

## B · Captura: un "+", un sheet, teclado al primer toque

**Problema.** §5.2, confirmado en tu iPhone. El formulario espera a las
categorías, así que el primer toque abre un sheet provisorio que después se
reemplaza por otro. El foco del monto llega fuera del toque del usuario, y
iOS no abre el teclado.

**Qué se ve distinto.**

- **Un solo sheet, abierto en el mismo toque, con el monto enfocado.** Las
  categorías ya están en la caché (A.1). Y si en un arranque en frío todavía no
  llegaron, **el formulario abre igual**: el monto no necesita categorías. Lo
  único que espera es el selector de categoría, que muestra "Cargando…" adentro
  suyo, y el Guardar sigue deshabilitado hasta tener una.
- **El "+" es uno solo y vive fuera de las pantallas.** Aparece en Inicio y en
  Movimientos, en el mismo lugar, y no participa de la transición: deja de
  apagarse y volver a subir al cambiar de pestaña (§1.5). Hoy cada pantalla
  tiene su propio "+" con su propio formulario, y son dos copias de lo mismo.
- **El título sigue al segmentado:** "Nuevo gasto" o "Nuevo ingreso". Hoy el
  mismo formulario se llama "Nuevo gasto" en Inicio y "Nuevo movimiento" en
  Movimientos.

**Costo.** S.

**Riesgo.** Bajo.

**Depende de.** A, pero solo para que las categorías ya estén en la caché.
Abrir el formulario sin esperarlas arregla el teclado por sí solo, así que B
se puede hacer antes que A.

**Fuera de las siete preguntas, pero en la misma captura.** Elegir la
categoría es hoy la parte lenta del flujo diario (§5.2): el `<select>` con la
rueda de iOS. Propongo mostrar **las primeras 6 categorías como pastillas**
debajo del monto, en el orden que el usuario ya les dio en Ajustes, más "Otra…"
que abre la lista completa. Se pasa de cuatro gestos a uno para el caso de
todos los días. Es talla S y no depende de nada. Lo dejo a tu criterio porque
cambia un formulario que ya aprobaste.

---

## C · Navegación: volver es volver

**Problema.**

- §5.1: el volver apila historial.
- §2.3: el volver se va con el scroll.
- §2.1 y §1.5: la transición es genérica y anima el esqueleto.

### C.1 Volver saca, no agrega (ROTO)

- **"Volver" regresa a donde estabas.** El `BackLink`, el volver de un detalle
  y el de Ajustes retroceden en el historial en vez de navegar hacia adelante
  a la pantalla madre. Si el usuario llegó por un link directo (un acceso
  guardado, reabrir la PWA), no hay "donde estabas": ahí va a la pantalla madre
  **reemplazando** la entrada, y el historial no crece.
- **El rótulo dice a dónde vas.** "‹ Movimientos" si viniste de Movimientos,
  "‹ Inversiones" si viniste de Inversiones. El detalle de activo ya lo hace a
  mano; pasa a ser la regla de todas.
- **Las pestañas no apilan.** Cambiar de pestaña reemplaza la entrada, salvo
  la primera salida desde Inicio. Resultado: el atrás de Android desde
  cualquier pestaña lleva a Inicio, y desde Inicio sale de la app. Es la
  convención de Android y cierra el "paseo por las pestañas".

**Qué NO propongo: que cada pestaña recuerde su propia pila**, como iOS, que
al volver a Inversiones te deja en el activo que estabas mirando. Con uno o
dos niveles de profundidad no vale lo que cuesta. Tocar una pestaña la abre en
su raíz, como hoy, y con A vuelve al scroll donde estaba.

### C.2 Barra superior fija con el título que se achica

- **Arriba de todo, una barra fija, translúcida, con el volver a la
  izquierda.** Mientras el título grande está a la vista, la barra está vacía y
  transparente. Cuando el título grande sale por arriba al scrollear, el título
  aparece chico y centrado en la barra, y el volver **nunca se va de la
  pantalla**. Es el título grande de iOS.
- **Esa barra es además el lugar de la zona segura de arriba** (H.1): hay un
  solo elemento que tiene que saber del notch.
- **En Inicio**, la barra lleva el botón de Ajustes, que hoy scrollea con el
  contenido.

### C.3 Transiciones con sentido

| Navegación | Hoy | Propuesta |
|---|---|---|
| Cambiar de pestaña | la vieja se apaga, la nueva sube 8 px | **Sin animación.** El cambio es instantáneo, como en iOS y en Android. La cápsula de la pestaña activa puede quedarse: no molesta (§3.3). |
| Entrar a un detalle | ídem | La pantalla nueva **entra desde la derecha** y la de atrás se corre un poco a la izquierda y se oscurece apenas. ~300 ms, con la curva de iOS. |
| Volver | ídem | El camino inverso: **sale por la derecha**, por donde entró. |

Sigue siendo la API de View Transitions, sin dependencias: solo cambia qué se
anima según la dirección. Con A, la pantalla que entra ya tiene sus datos, así
que se anima el contenido y no un esqueleto.

**Los toques perdidos que no pudiste verificar** quedan acotados: dejan de
existir al cambiar de pestaña, que es la navegación más frecuente, y solo
podrían pasar durante los 300 ms de entrar a un detalle.

**Costo.** M (C.1 es S; la barra fija de C.2 es la parte M).

**Riesgo.** Bajo en C.1. Medio en C.2: la barra tiene que convivir con el
scroll del documento y con el sheet.

---

## D · Inicio calmo

**Problema.** §4.2 y §4.1.2–5: cinco números del mismo peso, (i) y
marquitas, dos gráficos, un aviso rojo, 1760 px.

### D.1 Qué queda en el primer vistazo

De arriba abajo, en una pantalla de 844 px, sin scrollear:

1. **El recordatorio**, solo si hay algo que confirmar. Mismo lugar de hoy,
   con el tratamiento de F.
2. **Una sola tarjeta con tus tres mundos**, una fila por mundo, con el nombre
   a la izquierda, el monto a la derecha y un chevron. Cada fila entra a su
   pestaña:
   - **Disponible** → Mi plata. Debajo, en chico: "+ US$ 787 ahorrados", solo
     si hay ahorro.
   - **Invertido** → Inversiones.
   - **Deudas** → Deudas, solo si hay.

   Las tres filas tienen **el mismo tamaño y el mismo peso**, ~22 px: ninguno
   de los mundos manda sobre los otros.
3. **El total en dólares**, como pie de esa misma tarjeta, más chico, con el
   desglose al tocar (como hoy). Sigue siendo la única excepción a "no se
   suman", y ahora se nota que es un pie y no un cuarto mundo.
4. **Tus gastos de este mes:** el total, la comparación con el mes anterior
   en una línea, y **las tres categorías más grandes**. Tocar la tarjeta lleva
   a Movimientos. El total va en tinta, no en rojo (F).

Resultado estimado: ~650 a 780 px, según haya recordatorio y deudas. Entra
en una pantalla y no hay nada más abajo.

### D.2 Qué se va, y a dónde

| Qué | A dónde | Por qué |
|---|---|---|
| El desglose por cuenta del disponible | **Mi plata**, que además gana el total arriba (J.2) | Es detalle, y es lo que Mi plata tiene que responder. |
| Los dos gráficos de evolución y el rendimiento acumulado | **Inversiones** (J.3) | Es donde alguien va a ver cómo le va, y hoy no tiene ningún gráfico (§4.1.3). Inicio deja de descargar recharts. |
| La serie de gastos de 12 meses | **Movimientos**, debajo de "Gastos por categoría" | Es el mismo tema que esa pantalla. Cierra H12: "Gastos del mes" de Inicio pasa a ser un resumen que lleva al detalle, no un segundo detalle. |
| El aviso "valuación vieja" | **Inversiones**, donde está la acción que lo resuelve | En Inicio era un aviso rojo sobre un gráfico que ya no va a estar ahí. |
| Los tres botones (i) | **La descripción de cada pantalla destino** | La explicación de "Dinero invertido" es la primera línea de Inversiones, que es donde se lee con ganas. En Inicio, tres (i) eran tres invitaciones a una clase. |
| Las marquitas ARS / USD | **Se van** | El símbolo del monto ya dice la moneda (`$` o `US$`). |

### D.3 Jerarquía

**Qué pesa más.** Nada pesa más que los tres mundos, y entre ellos nada pesa
más que otro. Lo que baja de peso es todo lo demás:

- el total es un pie;
- los gastos son la segunda tarjeta, en un tamaño menor;
- ya no hay gráficos.

**Espacio.**

- Menos tarjetas, más aire entre ellas: la tarjeta de los mundos y la de
  gastos, separadas por un espacio de sección, no de fila.
- El título "Inicio" puede quedar grande: es el único texto grande de la
  pantalla.

**Escritorio (ver sección 7).** Con ancho de sobra, Inicio de escritorio
**sí** conserva el gráfico al lado de los gastos. Es la única pantalla donde el
contenido del teléfono y el de escritorio divergen.

### Decisiones escritas que D toca

Ninguna es lógica de plata; te las marco porque están escritas:

- **"Las tres tarjetas comparten componente… exactamente el mismo peso"**
  (`Dashboard.jsx`, `FUNCTIONAL.md` §1). **Se respeta:** pasan de tres
  tarjetas a tres filas, todas iguales.
- **"Dinero ahorrado" como tarjeta propia.** Pasa a ser una línea dentro de
  Disponible. Es jerarquía **dentro** del mundo líquido (el ahorro vive en Mi
  plata, igual que el disponible), no entre mundos. Si para vos el ahorro es un
  cuarto mundo del mismo rango, esto no va y el ahorro queda como cuarta fila
  del mismo peso.
- **El chip de moneda del encabezado** (`CLAUDE.md`, "Dos monedas en una
  tarjeta…"). Desaparece siempre, no solo con dos monedas.
- **"Dos gráficos mensuales de evolución… uno al lado del otro"**
  (`FUNCTIONAL.md` §1). Se mudan a Inversiones sin cambiar lo que dicen.

**Costo.** M.

**Riesgo.** Bajo en código. El riesgo es de producto: Inicio muestra menos, y
el que extrañe el gráfico lo tiene a un toque.

**Depende de.** A, para que la tarjeta de los mundos se revele entera y no
fila por fila.

---

## E · El sheet se agarra con el dedo

**Problema.** §2.2. Es el único gesto de la app y el más frecuente. Si se
arregla uno solo, es este.

### E.1 Cómo se siente

- **Se agarra de cualquier lado que no scrollee:** de la barrita, del
  encabezado, y **del contenido cuando ya está arriba de todo**. Tirar hacia
  abajo desde el cuerpo sin nada que scrollear baja el sheet, como en iOS.
- **Se agarra también a pantalla completa**, incluido el formulario de gasto.
  Al empezar a arrastrar se baja el teclado, y el sheet sigue al dedo.
- **Sigue al dedo 1:1**, respetando el punto de agarre.
- **El velo acompaña:** se aclara en proporción a cuánto bajó el panel. A
  mitad de camino, el velo está a mitad de camino.
- **Hacia arriba no se clava:** resiste elástico y vuelve.
- **Al soltar decide con la velocidad del final del gesto, no con el
  promedio.** Un tirón corto y rápido cierra; un arrastre largo y lento que se
  suelta quieto vuelve. La decisión mira hacia dónde se proyecta el gesto, no
  dónde quedó el dedo.
- **Hereda la velocidad.**
  - Si cierra, el panel sigue bajando a la velocidad que traía el dedo y va
    frenando: sin el golpe contra la pared de hoy.
  - Si vuelve, vuelve con un resorte que arranca a esa misma velocidad, sin
    rebote.
- **Es interrumpible.** Un sheet que está entrando o saliendo se puede volver
  a agarrar: el panel se detiene donde está y sigue al dedo.

### E.2 Lo que hace falta para eso

- **Un resorte propio.** Un resorte amortiguado con los dos parámetros que usa
  Apple (amortiguación y respuesta), que arranca desde el valor que hay en
  pantalla y con una velocidad dada. Son unas 40 líneas y un test. Lo usan
  también I y K. **Sin dependencia:** una librería de animación completa sería
  mucho más grande para usar una función.
- **Un sheet que sigue vivo mientras se va.** El truco de hoy, la copia inerte
  del DOM, no se puede agarrar ni heredar velocidad, y se va. Para que el sheet
  siga montado durante la salida, los 16 formularios dejan de desmontarse
  solos al cerrar (hoy cada uno hace `if (!open) return null`) y el sheet decide
  cuándo terminó de irse.

**Qué NO propongo.** Paradas intermedias (el sheet a media altura como una
posición estable): con formularios cortos no hay nada que hacer a media altura.

**Costo.** M.

**Riesgo.** Medio.

- La interacción con el teclado de iOS al empezar a arrastrar un formulario
  expandido es la parte delicada, y solo se valida en tu iPhone.
- Los 16 formularios cambian su montaje: son cambios chicos y repetidos.

---

## F · El rojo vuelve a significar algo

**Problema.** §4.2: `clay` en una valuación vieja, en un vencimiento
atrasado que tiñe todo el bloque de arriba de Inicio, y en el tinte rosado de
un grupo.

### F.1 La regla

**Rojo es plata que se fue, o algo que no se pudo hacer:**

| Merece rojo | Por qué |
|---|---|
| Una pérdida (rendimiento negativo) | Es el significado fijo que `index.css` ya declara. |
| El signo de un gasto en una **fila** de lista | Idem, y en chico. |
| Una acción destructiva (Eliminar) | Idem. |
| Un error que impidió guardar o cargar | Hay algo roto que el usuario tiene que saber. |

**Todo lo que es "esto necesita tu atención" deja de ser rojo:**

| Hoy en rojo | Propuesta |
|---|---|
| **Vencimiento atrasado** (todo el bloque teñido) | La tarjeta de siempre, sin teñir. Lo que escala es el **texto**: "venció hace 12 días" en tinta plena y seminegrita, en vez del gris de "vence en 3 días". Y a la izquierda del nombre, **un punto** de un color de atención. La insistencia la da el número de días que sube solo, que ya existe y es lo que funciona. |
| **Valuación desactualizada** | Nota neutra (`callout`) con la acción "Actualizar valuación". No es un error: es un dato que falta. |
| **Activo sin valuación** | Idem. |
| **El total de gastos del mes** (el número grande en Inicio) | En tinta. Gastar no es una alarma: es el uso normal de la plata. El rojo queda en el signo de cada gasto en las listas. |
| **Tinte rosado de un grupo** | Ver F.2. |

**El color de atención.** Un solo token nuevo, `attention`: un ocre apagado,
con su versión oscura. Se usa **solo** para el punto de un vencimiento
atrasado y el de una valuación vieja; nunca para rellenar un bloque ni para
texto largo. Es un color más en la paleta, pero reemplaza bloques enteros de
rojo por puntos: la pantalla queda más quieta, no más cargada.

### F.2 Los colores de grupo

Hoy el color de un grupo tiñe el encabezado y todas sus filas. Propuesta: el
color pasa a ser **un punto o una barrita al lado del nombre del grupo**, y las
filas quedan en la tarjeta blanca de siempre. El grupo se sigue reconociendo
por su color, pero cinco grupos dejan de ser cinco bloques de colores. Se
termina el rosado que se lee como pérdida.

### Decisiones escritas que F toca

- **"Lo que escala es el teñido (clay si está vencido)"** (`FUNCTIONAL.md` §5,
  el recordatorio). Pasa a escalar texto y punto.
- **"clay = pérdida, gasto y lo destructivo"** (`index.css`). Se acota: el
  número protagonista de gastos deja de ir en rojo; las filas no cambian.
- **El tinte de grupo** (`.group-tint` / `.group-tint-soft`). Se reemplaza por
  la marca al lado del nombre.

**Costo.** S.

**Riesgo.** Bajo.

**No depende de nada.**

---

## G · Los otros ROTO

### G.1 Compromisos con datos falsos mientras carga

- **Problema:** §1.3.
- **Qué se ve distinto:** mientras carga se ve su esqueleto (A.3), nunca un
  "Sin tarjetas" o un "Deudas US$ 0,00" que no son ciertos. Si falla una
  consulta, aparece `ErrorNotice` con Reintentar en lugar de un vacío falso
  que se queda para siempre.
- **Costo:** S.
- **Depende de:** A. Si A se demora, el arreglo mínimo es no mostrar nada
  debajo del encabezado hasta tener todo.

### G.2 La fila que dice "Inversión" y suma en "Ahorrado"

**Problema.** §4.1.1. El cajón y el total ya usan la misma regla: un aporte
a un activo que la migración 0038 convirtió en cuenta de ahorro cuenta como
ahorro. Lo único que quedó atrás es la **fila**, que se sigue rotulando
"Inversión", y el **toque**, que no lleva a ningún lado porque el activo está
archivado.

**Qué se ve distinto.**

- La fila dice **"Ahorro · USDs físicos"** (o "Retiro de ahorro").
- Tocarla lleva a **la cuenta de ahorro** en la que se convirtió el activo.
- Lee la misma columna que ya usa el total, así que no puede volver a
  desalinearse.

**Costo:** S. **Riesgo:** nulo.

**Es solo presentación:** no cambia qué suma dónde.

### Aparte: toca cómo se calcula (no está aprobado)

**El Balance da negativo cuando ahorrás.** Balance = ingresos − gastos −
invertido − ahorrado. Para alguien que arranca, apartar $ 50.000 se lee como
"perdí $ 50.000".

Hay dos salidas, y las dos cambian **qué dice un número**, así que te las
marco y no las asumo:

- **(a)** Renombrar el renglón para que diga lo que mide, por ejemplo "Te
  quedó libre", con una línea que explique que ahorrar e invertir lo bajan.
  Mismo cálculo, otra palabra.
- **(b)** Cambiar la definición: Balance = ingresos − gastos, y mostrar
  invertido y ahorrado como "Apartaste", fuera de la resta.

La (a) es solo texto. La (b) es una regla de plata. Mi inclinación es la (b)
para el usuario tipo, pero es tuya.

---

## H · Empaquetado

### H.1 Zona segura

- **Problema:** §5.1. Hoy funciona porque la barra de estado de iOS reserva su
  lugar; en un empaquetado a pantalla completa, el contenido queda debajo del
  notch.
- **Qué se ve distinto:** nada hoy en la PWA, y ese es el punto. La barra fija
  de arriba (C.2), el encabezado del sheet a pantalla completa y el borde de
  cada pantalla suman la zona segura de arriba y la de los costados. En la PWA
  actual esa zona vale 0 y no cambia nada; en un empaquetado a pantalla
  completa, deja todo fuera del notch. Se puede probar hoy en el simulador de
  iOS sin empaquetar nada.
- **Costo:** S.
- **Depende de:** C.2, que concentra la de arriba en un solo lugar.

### H.2 Teléfono horizontal

- **Problema:** §5.1. A 844 × 390 se ve el layout de escritorio con botones
  de 36 px.
- **Qué se ve distinto:**
  - **El layout de escritorio exige ancho Y alto.** Pasa a necesitar al menos
    768 px de ancho **y** ~600 de alto. Un teléfono horizontal (390 de alto)
    se queda con el layout del teléfono, estirado a lo ancho. Un iPad sigue
    recibiendo el de escritorio.
  - **El tamaño de los controles pasa a depender del puntero, no del ancho.**
    Con dedo, 52 px; con mouse, 36. Un iPad o una notebook táctil dejan de
    recibir botones de mouse.
  - **En el empaquetado, la orientación se fija en vertical** desde la
    configuración del proyecto (un archivo de configuración, no código nativo).
    iOS ignora esa opción del manifest en una PWA, así que en la PWA lo de
    arriba es lo que protege.
- **Costo:** S.
- **Riesgo:** bajo. Hay que revisar las pantallas que usan `md:` para cosas
  que no son layout.

### H.3 Arranque en modo oscuro

- **Problema:** §5.1.
- **Qué se ve distinto:**
  - **El manifest** pasa a usar el `paper` actual (`#f1f2f6`), no el gris de
    antes.
  - **El HTML**, antes de que cargue cualquier estilo, ya pinta el fondo del
    tema. Lleva un bloque mínimo en línea con el fondo claro y el oscuro, y lee
    la preferencia guardada ("Oscuro" o "Claro" forzado) antes del primer
    cuadro. Se termina el destello claro en oscuro.
  - **Las pantallas de arranque de iOS**, en claro y en oscuro, para la PWA.
    📱 Si iOS respeta el modo oscuro en esas imágenes se confirma en tu
    iPhone.
  - **En el empaquetado,** la pantalla de arranque es un asset con variante
    oscura, que se genera por configuración.
- **Costo:** S.
- **Riesgo:** bajo.

### Etiquetas de la barra a 320 px (§5.3)

- **Problema.** "Inversiones" y "Compromisos" no entran en 64 px a 10 px de
  letra. No hay ajuste de espaciado que lo arregle: la única salida es un
  nombre más corto, por ejemplo "A pagar".
- **Por qué no lo decido acá.** Es un texto, y el inventario de textos lo
  estás completando vos (`textos.md`). Te lo dejo ahí como decisión de copy.

---

## I · Volver deslizando desde el borde

**Problema.** §2.3. En iOS es el gesto más reflejo que existe. Sin él, lo
primero que hace un usuario de iPhone en un detalle (deslizar desde el borde)
no pasa nada, y la app se siente web.

### I.1 Cómo se siente

- **Desde el borde izquierdo**, en cualquier pantalla con volver, la pantalla
  actual sigue al dedo hacia la derecha.
- **Debajo aparece la pantalla anterior**, un poco corrida y oscurecida, que
  se va aclarando y centrando a medida que avanza el gesto. Es el velo
  acompañando, igual que en E.
- **Al soltar decide la velocidad proyectada:** un tirón corto vuelve, un
  arrastre que se suelta quieto a menos de la mitad se queda.
- **Hereda la velocidad** con el mismo resorte de E, y **se puede agarrar de
  nuevo** a mitad de camino.
- **Es el mismo movimiento que C.3 para volver,** pero manejado por el dedo en
  vez de por el reloj.

### I.2 Por qué es L, y por qué va último

- **Para dibujar la pantalla anterior debajo, hacen falta sus datos al
  instante:** los da A.
- **Y hace falta que el router pueda dibujar dos pantallas a la vez,** algo
  que el router de datos no hace de fábrica. Es la parte cara y la de más
  riesgo: puede requerir mantener montada la pantalla anterior mientras se ve
  el detalle.
- **Antes de empezar, hay que verificar en tu iPhone** si la app instalada ya
  tiene el gesto nativo de volver. Si lo tiene, uno propio se pelearía con él.
  Probalo en un detalle: deslizar desde el borde izquierdo. Si hoy no hace
  nada, no lo tiene.
- **En Android no hace falta:** el gesto de volver es del sistema, y con C.1
  hace lo correcto.
- **En el empaquetado de iOS** el webview puede traer el gesto nativo, pero
  activarlo requiere una línea de código nativo. Tu restricción lo excluye, así
  que ahí también sería el propio.

**Costo.** L.

**Riesgo.** Alto: es la pieza más cercana a construir un framework de
navegación.

**Depende de.** A, C y E.

Si hay que recortar algo de esta propuesta, **es esto**: con C.2 el volver
siempre está a la vista, y la app es usable sin el gesto. Pero es lo que más
separa una app de una web en iOS.

**Segundo intento (2026-09-19).** En la puerta de entrada, Nacho confirmó que
la app instalada en su iPhone ya vuelve sola al deslizar desde el borde
izquierdo en un detalle — el gesto nativo de iOS existe en ese modo, y el
bloque se dio por cortado. Probándolo más, apareció el motivo real de I.1:
el gesto nativo funciona pero se ve mal (la pantalla queda en blanco durante
la transición) y exige una franja de arrastre muy angosta contra el borde.
Con eso, y con que el empaquetado futuro (App Store/Play Store) sigue sin
código nativo — la restricción de I.2 no es transitoria —, se implementó
igual: `components/EdgeSwipeBack.jsx` reemplaza al gesto nativo suprimiéndolo
con `overscroll-behavior-x` solo en las pantallas donde sabe qué dibujar
debajo (el mismo mapa chico ruta-madre → componente que ya usan los `backTo`
de cada detalle); en el resto —el detalle de un activo, que reemplaza la
barra de pestañas por la suya— sigue el gesto nativo tal cual.

---

## J · Cada pantalla en el teléfono

### J.1 Movimientos: la lista más cerca

- **Problema:** §5.5. En el teléfono la lista empieza recién en y = 413, y a
  320 px el primer movimiento queda al pie.
- **Qué se ve distinto:**
  - **Arriba, una sola fila de resumen:** "Gastaste $ X · Entró $ Y". Al
    tocarla se despliegan los cinco renglones y el desglose por categoría, con
    el despliegue suave que ya usa el Total de Inicio.
  - **La serie de 12 meses** que viene de Inicio va ahí adentro.
  - **Escritorio no cambia:** sigue el panel izquierdo fijo, con todo abierto.
- **Costo:** S.
- **Depende de:** D, para saber qué llega de Inicio.

### J.2 Mi plata dice cuánta plata tenés

- **Problema:** §4.1.2.
- **Qué se ve distinto:**
  - **Arriba, el total del disponible** con `MoneyStack`, una línea por
    moneda. Debajo, en chico, el total ahorrado.
  - **Después, Contar y Transferir**, y las cuentas.
  - **El (i) de Inicio** pasa a ser la descripción de esta pantalla.
- **La cuenta del día a día gana acciones:** "Contar esta cuenta" y
  "Transferir desde acá", que abren los formularios que ya existen con la
  cuenta elegida. Cierra H7 (§4).
- **Costo:** S.

### J.3 Inversiones cuenta cómo te va

- **Problema:** §4.1.3–4.
- **Qué se ve distinto:**
  - **Debajo del total, la evolución** (los gráficos que vienen de Inicio),
    con su selector de rango.
  - **Los avisos de valuación** con el tratamiento de F.
  - **Los precios en vivo no reordenan la lista delante del usuario:** el orden
    "por monto" se calcula cuando se entra a la pantalla y se queda quieto
    hasta la próxima visita. Los montos sí se actualizan en su lugar.
- **Costo:** S.
- **Depende de:** D.

### Aparte: toca qué número se muestra (no está aprobado)

**Dos "rendimientos"** (§4.1.4). Al mudarse el gráfico a Inversiones, el
"Rendimiento acumulado" de la serie y el "Rendimiento" del resumen quedan en
**la misma pantalla**, diciendo dos cosas distintas.

- **Mi propuesta:** que el gráfico muestre solo la curva, y que el único
  porcentaje de la pantalla sea el del resumen.
- **Por qué va aparte:** elegir cuál de los dos números ve el usuario es una
  definición, no presentación.

---

## K · Reordenar que se asienta

- **Problema:** §2.3.
- **Qué se ve distinto:**
  - **La fila arrastrada sigue al dedo de forma continua,** sin saltos de a
    una posición.
  - **Las de al lado se corren animadas** para hacerle lugar.
  - **Al soltar,** la fila se asienta en su lugar con el resorte de E.
- **Qué NO propongo:**
  - **Auto-scroll al borde:** las listas son de 5 a 15 filas y entran en
    pantalla.
  - **Reordenar con pulsación larga sobre toda la fila:** la manija es
    explícita y no se pelea con el scroll, que era justamente la razón escrita
    en `FUNCTIONAL.md`.
- **Costo:** S.
- **Depende de:** E (el resorte).

---

## 7 · Teléfono contra escritorio: dónde diverge y dónde no

La regla: **una sola app, un solo árbol de componentes, un solo dato.** La
divergencia vive en cuatro lugares, y solo ahí.

| Qué | Teléfono | Escritorio | Dónde vive la diferencia |
|---|---|---|---|
| **El marco de navegación** | Barra de pestañas abajo; barra superior con título que se achica y volver (C.2) | Columna lateral; encabezado de página | `Layout` y la barra superior. Ya es así hoy, con una pieza más. |
| **La acción principal** | El "+" flotante, uno solo (B) | Botón en el encabezado | Ya es así. |
| **Qué se ve sin tocar nada** | Solo lo que responde la pregunta de la pantalla: Inicio sin gráficos (D), Movimientos con el resumen plegado (J.1) | Todo abierto: Inicio con el gráfico al lado de los gastos, Movimientos en dos paneles | **En la composición de cada página**, con la grilla, no con componentes distintos. El resumen plegado de Movimientos es el mismo componente, abierto por defecto en escritorio. |
| **Gestos y tamaño de controles** | Arrastrar sheets, volver deslizando, 52 px | Clic, 36 px | **En el puntero, no en el ancho** (H.2). Un iPad táctil tiene gestos; una ventana angosta de escritorio no. |

**Todo lo demás se comparte:**

- formularios y sheets (en escritorio, la tarjeta centrada de siempre);
- filas, tokens y la capa de datos;
- los textos;
- los esqueletos.

No hay ninguna pantalla "versión teléfono" y "versión escritorio".

**Dónde NO vale diverger.** En el contenido de un formulario, en el orden de
las filas de una lista y en los textos. Cada divergencia ahí se paga dos veces
en cada cambio futuro, y no hay nada en el uso que la justifique.

---

## Lo que auditaste y no vale la pena arreglar

| Hallazgo | Por qué no |
|---|---|
| **Arrastrar la pastilla del segmentado y el switch** (§2.3) | Copiar iOS porque sí. Nadie arrastra un control de dos opciones: se toca. |
| **Deslizar filas para borrar o confirmar** (§2.3) | Confirmar un vencimiento ya es un toque. Borrar plata es raro, y un deslizamiento hace fácil borrar sin querer: la confirmación explícita es la correcta para esta app. |
| **Cambiar de mes deslizando** (§2.3) | Se pelearía con volver deslizando (I) y con la tira de filtros, que scrollea de costado. |
| **Tirar para refrescar** (§2.3) | Con A, la app se refresca sola al volver a primer plano, después de cada escritura y al cambiar de pantalla pasado el rato. Lo que quedaría es un gesto para un caso raro, y en iOS se pelea con el rebote nativo del documento. Si después de A extrañás refrescar a mano, se agrega. |
| **Cada pestaña con su propia pila** (C.1) | Uno o dos niveles de profundidad no lo justifican. |
| **Reemplazar recharts** (§5.6) | Con D, Inicio deja de descargarla. Queda en Inversiones y Movimientos, donde ya no es el camino de todos los días. |
| **Tamaño de letra del sistema** (§5.3) | En una web de iOS, pasar de px a rem no hace que la letra siga al tamaño del sistema. Hacerlo de verdad pide otra estrategia tipográfica, y el producto no lo tiene como requisito. Se revisa si alguien de los invitados lo necesita. |
| **Deshacer un borrado** (§5.2) | Requiere borrado lógico en la base, que es modelo de datos, no presentación. La confirmación que existe alcanza. |
| **La cápsula que se desliza en la barra** (§3.3) | Inofensiva. No se toca. |
| **Ajustes solo desde Inicio** (§4.1.7) | Se usa poco. Está bien donde está. |
| **Deudas más ancha que su madre** (§4.1.6) | Se corrige de paso, sin propuesta propia: Deudas pasa a página angosta. |
| **Avisos de lint, los 27 tamaños sueltos y las sombras con `rgb` a mano** (§5.7) | No son propuestas: se corrigen al tocar cada archivo en la etapa 4. |

---

## Resumen de lo que NO está aprobado por ser de plata

1. **Balance** (G, aparte): renombrar (a) o redefinir (b).
2. **Qué rendimiento se muestra en Inversiones** (J.3, aparte).

## Resumen de decisiones escritas que la propuesta revisa

No son de plata, pero están escritas en `CLAUDE.md`, `FUNCTIONAL.md` o el
código:

- El ahorro como línea dentro de Disponible (D).
- La marquita de moneda (D).
- Los gráficos se mudan a Inversiones (D).
- El recordatorio escala con texto y punto, no con teñido (F).
- El total de gastos en tinta (F).
- El color de grupo como marca, no como tinte (F).
- Las categorías frecuentes como pastillas (B, opcional).
- Guardar la caché en el teléfono (A.7).
