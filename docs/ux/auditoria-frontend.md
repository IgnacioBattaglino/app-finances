# Auditoría del frontend — etapa 1 de 5

**Qué es este documento.** Un diagnóstico de la app completa sobre la rama
`feat/ui-polish` (versión 0.9.1). No trae propuestas ni código: las propuestas
son la etapa 2.

**Fecha:** 2026-09-17.

**Contra qué vara se audita.** La dirección del producto: la app tiene que
sentirse **calma**, silenciosa y espaciosa, con la información justa. Inicio
condensa lo importante y el detalle queda a un toque. El usuario tipo arranca de
cero con sus finanzas. No se audita contra "que quede lindo".

**Cómo se hizo.**

- **Lectura del código:**
  - las 25 pantallas de `src/pages/`;
  - los componentes compartidos;
  - los hooks de datos;
  - `index.css`, `index.html` y el manifest;
  - los 9 commits de la rama.
- **Medición en el navegador** con Playwright:
  - teléfono a 390 × 844 y a 320 × 568, teléfono horizontal a 844 × 390 y
    escritorio a 1440 × 900;
  - la cuenta de prueba;
  - red rápida y red de teléfono simulada (400 ms de latencia y 200 kB/s);
  - alto del contenido cuadro por cuadro, layout-shift, pedidos a Supabase por
    navegación, foco y capturas en secuencia.
- **Lo que no se probó.** No se escribió ningún dato. Lo que depende de guardar
  algo se diagnosticó por código, y se aclara en cada caso.

**Cómo leer cada hallazgo:**

- **ROTO:** hace algo mal, muestra algo falso o impide hacer algo.
- **PROLIJO:** funciona, pero se lee o se siente peor de lo que debería.
- **📱 teléfono real:** solo se puede confirmar en un iPhone o un Android de
  verdad, con la app instalada. Playwright no lo reproduce, así que no lo doy
  por bueno ni por malo.

**Cómo está ordenado.** Por impacto en la experiencia del teléfono, no por
facilidad de arreglo.

---

## Resumen: las diez cosas que más pesan

1. **ROTO. Cada pantalla se arma dos o tres veces delante del usuario.** Ninguna
   pantalla recuerda nada: al entrar, todo se vuelve a pedir desde cero. Los
   esqueletos no tienen la forma del contenido y la transición de pantalla anima
   el esqueleto, no los datos. Es la causa del parpadeo (sección 1).
2. **ROTO. Guardar hace parpadear la pantalla entera.** Después de guardar, casi
   todas las pantallas vuelven al esqueleto y pierden el scroll (1.4).
3. **ROTO. El primer "+" de cada visita a Inicio abre dos sheets y le roba el
   foco al monto.** Es la acción más frecuente de la app, y ese primer toque
   abre un sheet a medias que se reemplaza por otro. El campo del monto recibe el
   foco y lo pierde 4 ms después (5.2).
4. **ROTO. "Volver" crea historial nuevo.** El atrás del sistema, en Android o en
   el navegador, te devuelve a las pantallas de las que acababas de volver
   (5.1).
5. **ROTO. Compromisos muestra datos falsos mientras carga.** Por un instante
   dice que no tenés tarjetas y que debés US$ 0, y si una consulta falla, se
   queda así sin avisar (1.3).
6. **Nada se puede agarrar con el dedo de verdad.** El único gesto de la app
   (arrastrar un sheet para cerrarlo) no hereda la velocidad al soltar. Está
   apagado justo en el sheet más usado. No hay ningún otro gesto: ni volver
   deslizando, ni refrescar tirando, ni deslizar filas (sección 2).
7. **Inicio no es calmo.** El primer vistazo del teléfono muestra cinco números
   del mismo peso, tres botones (i) y dos marquitas de moneda. Más abajo vienen
   dos gráficos casi iguales, un aviso rojo que no es un error y los gastos. Son
   1760 px de pantalla (4.1).
8. **PROLIJO, pero grave para empaquetar la app.** No se usa
   `safe-area-inset-top` en ningún lado salvo el toast. La pantalla de arranque
   no respeta el modo oscuro. Un iPhone horizontal recibe el layout de escritorio
   con botones de 36 px (5.1).
9. **PROLIJO. Mi plata no dice cuánta plata tenés.** La pestaña que se llama así
   lista cuentas, pero el total vive solo en Inicio. La evolución de las
   inversiones vive en Inicio y no en Inversiones (sección 4).
10. **Código. No hay capa de datos.** 17 pantallas repiten a mano el mismo
    cuarteto `loading/error/load/useEffect`, y 7 pantallas piden las mismas
    categorías cada una por su lado. Es a la vez la mayor duplicación del
    frontend y la causa técnica del punto 1 (5.7).

---

## 1 · ¿Por qué parpadea al entrar a una pantalla?

### 1.1 La respuesta corta

No hay una sola causa, hay cuatro, y se suman:

**A. Nada se recuerda.** Cada pantalla pide todo al montarse y lo tira al
desmontarse. No existe caché ni "lo último que sé". Por eso no hay nada que
mostrar mientras se refresca, y **la pantalla siempre arranca vacía**, aunque
hayas estado ahí hace diez segundos.

Medido yendo Inicio → Movimientos → Inicio:

- la segunda visita a Inicio vuelve a hacer los mismos 26 pedidos a 12 endpoints
  (en desarrollo; StrictMode duplica, así que en producción son 13);
- `getContributions()` completo se pide en Inicio, otra vez en Inversiones, y
  **dos veces** en el detalle de un activo (una entera y otra paginada);
- el detalle de un activo vuelve a pedir **todos** los activos para encontrar
  uno, aunque Inversiones los acaba de tener.

**B. Los esqueletos no ocupan el espacio del contenido.**

- 12 pantallas usan el mismo `ListSkeleton`: tres renglones, unos 132 px.
- Inicio usa textos "Calculando…" de 17 px donde después va un monto de 28 a
  40 px.
- Cuando el esqueleto se va, todo lo que está debajo se corre.

**C. Partes que aparecen tarde y empujan.** Hay bloques que no tienen lugar
reservado y se insertan cuando llegan: el recordatorio de compromisos, la tarjeta
de Ahorrado, la de Deudas, los totales de Movimientos, el aviso de precios de
Inversiones y la fila de Invitaciones de Ajustes.

**D. La transición de pantalla anima lo que no es.** La View Transition captura
la pantalla vieja, la apaga en 120 ms y hace subir 8 px la nueva en 220 ms. Pero
la pantalla nueva en ese momento **es el esqueleto**. Los datos llegan después
de que termina la animación, alrededor de 300 ms en red local y más en 4G, y
recién ahí la pantalla cambia de forma. El ojo ve dos eventos: una animación
chiquita y después un salto grande. La animación no disimula la carga: la
anuncia.

### 1.2 Medición: alto del contenido, cuadro por cuadro (teléfono, 390 px)

Cada número es el alto de `<main>` cada vez que cambió. Es la cantidad de veces
que la pantalla cambió de forma.

| Pantalla | Secuencia de altos (ms: px) | Formas distintas |
|---|---|---|
| Inicio | 0: 668 → 70: 1063 → 291: 1044 → 305: 1505 → 489: 1625 → 653: 1761 | **6** |
| Movimientos | 0: 1761 → 92: 467 → 324: 938 | 3 |
| Inversiones | 0: 648 → 64: 345 → 270: 401 → 284: 940 | 4 |
| Mi plata | 0: 938 → 68: 474 → 279: 648 | 3 |
| Compromisos | 0: 940 → 70: 668 (sin esqueleto; ver 1.3) | 2, con datos falsos |

Layout-shift medido, un número que subestima: no cuenta un esqueleto que se
reemplaza entero, solo lo que se corre.

- **Inicio:** 0,445 en la primera visita y 0,214 en la segunda. El umbral de
  "malo" de Google es 0,25.
- **Movimientos:** 0,211 en cada visita.

Con red de teléfono simulada, las seis formas de Inicio se estiran a lo largo de
1,5 a 2,5 segundos. Secuencia capturada:

- **Primero llega "Dinero invertido"** con su número y "Dinero disponible" sigue
  en "Calculando…".
- **Después aparece "Dinero ahorrado"** en el medio, y empuja Invertido y Deudas
  unos 72 px hacia abajo.
- **Después cambia el Total.**
- **Por último,** el gráfico pasa de un bloque de 380 px a dos de 300 y de ahí a
  su tamaño real.

### 1.3 Pantalla por pantalla

| Pantalla | Qué salta y por qué | Tipo |
|---|---|---|
| **Inicio** | Ver el detalle abajo. | ROTO |
| **Movimientos** | Mientras carga solo muestra el navegador de mes y un esqueleto de 3 filas. Los 5 totales y el desglose por categoría **no tienen esqueleto**: aparecen de golpe arriba de la lista y la empujan unos 470 px. Cambiar de mes repite todo: la pantalla se vacía y se vuelve a armar, en vez de mostrar el mes anterior hasta que llega el nuevo. Volver a Movimientos desde un activo arranca arriba de todo: solo Inversiones restaura el scroll. | ROTO |
| **Inversiones** | Esqueleto de 3 filas (unos 130 px) donde después van el resumen, los botones, la fila de herramientas y los grupos (unos 600 px). Los precios en vivo llegan después: los montos cambian solos y, con el orden "por monto", **las tarjetas se reordenan** delante del usuario. El aviso "No se pudieron traer los precios" aparece arriba cuando falla, más tarde, y empuja todo. | ROTO |
| **Detalle de activo** | El título está **vacío** mientras carga: el nombre del activo que se acaba de tocar no se pasa. Después, esqueleto de 3 filas en lugar de un bloque de unos 1200 px. El valor cambia cuando llega el precio en vivo. | ROTO |
| **Mi plata** | Los dos botones de arriba no se mueven (bien). Debajo, esqueleto de 3 filas en lugar de dos grupos con título y nota al pie. Salto moderado. | PROLIJO |
| **Detalle de cuenta** | El título dice "Cuenta" mientras carga y después el nombre: el encabezado cambia de texto y de largo. Mismo esqueleto genérico. | PROLIJO |
| **Compromisos** | **No tiene estado de carga.** Mientras llegan los datos pinta la pantalla vacía como si fuera real: "Tarjetas" sin tarjetas, con el texto de "cargá tus compras en cuotas…", "Suscripciones" vacía, y **"Deudas US$ 0,00"**. Después aparecen el recordatorio y "Comprometido este mes" arriba de todo, que empujan la pantalla entera. Si falla la consulta de tarjetas o de categorías, se traga el error (`catch(() => {})`) y el vacío falso se queda para siempre. | **ROTO** (muestra un dato falso) |
| **Deudas** | Esqueleto de 3 filas en lugar del resumen grande con barra y las tarjetas. | PROLIJO |
| **Detalle de tarjeta / de plan** | Mismo esqueleto genérico. Los datos de la tarjeta ya estaban en Compromisos y se vuelven a pedir. | PROLIJO |
| **Ajustes** | La fila "Invitaciones" aparece un momento después (se pregunta si sos admin) y corre el bloque de email y Cerrar sesión. Solo te pasa a vos. | PROLIJO |
| **Categorías, Grupos, Detalle de grupo** | Mismo esqueleto genérico. El detalle de grupo además tiene un "Cargando…" suelto adentro. | PROLIJO |

**Detalle de Inicio:**

- **Seis formas distintas** en la primera visita (ver 1.2).
- Las tarjetas dicen "Calculando…" en 17 px, donde después va un monto de
  28 px o más.
- **Ahorrado y Deudas** se insertan cuando llegan y reacomodan la grilla.
- **El recordatorio** de compromisos se inserta **arriba de todo** cuando llega y
  empuja la pantalla entera. El comentario del código dice que "nunca se mueve",
  pero lo que no se mueve es su posición una vez que existe: su aparición sí
  mueve todo lo demás.
- **El gráfico** pasa por tres altos (380 → 2 × 300 → 2 × 330 aprox.).
- **"Gastos del mes"** tiene un esqueleto de 140 px para un bloque que con datos
  mide cerca de 500. Y la serie en dólares llega **después**, así que se agrega
  otro bloque de unos 180 px al final.

### 1.4 Guardar también parpadea. ROTO, verificado por código

`refresh()` y `load()` ponen `loading = true` antes de volver a pedir. Como la
pantalla muestra el esqueleto cuando `loading` es true, **cada guardado vacía la
pantalla y la vuelve a armar**:

- Inversiones, al crear un activo o cargar una valuación.
- Detalle de activo, al aportar, retirar, transferir o liquidar: la pantalla
  entera vuelve al esqueleto de 3 filas.
- Deudas, al cargar un pago.
- Mi plata, después de contar la plata o transferir.
- Detalle de plan.

**Qué ve el usuario:**

- el sheet baja;
- la pantalla de atrás se vacía, se pierde el scroll y vuelve arriba;
- vuelve a armarse;
- recién ahí el toast de "guardado".

En Inicio, guardar un gasto vuelve a poner "Calculando…" en el disponible.

No lo medí en vivo para no escribir en la cuenta de prueba. El camino en el
código es directo.

### 1.5 La transición y la carga compiten

Además de lo del punto D:

- **El botón "+" viaja con la pantalla.** La transición anima toda la raíz,
  salvo la barra de pestañas y la columna lateral. El FAB se renderiza adentro de
  cada pantalla, así que al pasar de Inicio a Movimientos (las dos tienen "+") se
  apaga y vuelve a subir. Es un botón que no cambió de lugar y parpadea en cada
  cambio de pestaña.
- **La primera vez que se entra a una pestaña, el toque no responde de
  inmediato.** El router espera el código de la pantalla antes de navegar, y
  mientras tanto la pestaña no se marca ni pasa nada. En red de teléfono es un
  toque "muerto" de varios cientos de milisegundos. Pasa una sola vez por
  pestaña, porque después ese código queda en caché.
- **Probablemente los toques se pierden durante la transición.** Mientras la
  View Transition corre, lo que se ve es una capa encima del documento. Si el
  usuario toca un botón en esos 220 ms, lo más probable es que el toque no llegue
  a nada. 📱 teléfono real: confirmarlo tocando rápido dos veces seguidas.
- **Al abrir la app, hay tres pantallas antes del contenido:** el HTML sin
  estilos, después el anillo latiendo (`AppLoading`) mientras se lee la sesión,
  después Inicio con "Calculando…", y recién después los números.

---

## 2 · ¿Qué se siente decorativo en el teléfono, y dónde falta poder agarrar?

### 2.1 Cada animación, con veredicto

| Animación | Dónde | Cuánto dura | En el teléfono | Veredicto |
|---|---|---|---|---|
| Cambio de pantalla: la vieja se apaga y la nueva sube 8 px | toda navegación | 120 + 220 ms | 8 px es imperceptible a esa velocidad. Anima el esqueleto, no los datos (1.1 D), hace parpadear el FAB y probablemente bloquea toques. Es la misma animación para ir a una pestaña hermana y para entrar a un detalle, así que no dice nada de dónde estás. En iOS, cambiar de pestaña no anima y entrar a un detalle desliza desde la derecha. | **Adorno** que además estorba |
| La cápsula de la pestaña activa se desliza | barra inferior | 380 ms | Se ve, es tranquila. Ninguna app de iOS lo hace; no es ruido, pero no aporta información. | Adorno inofensivo |
| Barras de gastos que crecen desde cero | Gastos del mes en Inicio | 380 ms | Se repite **cada vez** que se entra a Inicio y cada vez que se recarga. La primera vez dice algo; la décima es movimiento que no responde a nada que hizo el usuario, contra la regla del propio `index.css`. | **Adorno** |
| Esqueletos latiendo (`animate-pulse`) | 12 pantallas y los gráficos | continuo | Bloques grises que laten: es la forma más reconocible de "página web cargando". Contradice el pedido de calma. | **Adorno** (ruido) |
| Anillo latiendo al abrir | `AppLoading` | continuo | Ídem, en el primer segundo de la app. | Adorno |
| Pastilla del segmentado que se desliza | `BinaryChoice` | 220 ms | Es exactamente lo que hace el control nativo. Sí aporta: dice qué cambió. | **Aporta** |
| Switch | `Switch` | 200 ms | Aporta. Anima `left` en vez de `transform`: se nota solo en teléfonos lentos. | Aporta |
| Sheet que entra desde abajo | `FormSheet` | 380 ms | Aporta: dice de dónde vino. | **Aporta** |
| Sheet que se va hacia abajo (una copia del sheet que baja sola) | `FormSheet` | 220 ms | Aporta: sale por donde entró. Pero ver 2.2. | Aporta, mal resuelto |
| Sheet que pasa de compacto a pantalla completa al tocar un campo | `FormSheet` | **0 ms**, sin transición | El panel salta de unos 260 a 844 px de golpe, y 300 ms después el contenido scrollea solo otro salto. Es lo contrario de un adorno: el movimiento que haría falta no existe. | **Falta** |
| El Total que se abre deslizando | Inicio | 220 ms | Aporta. | Aporta |
| Botones que se achican al tocarlos (0,97 y el FAB 0,92) | `.btn`, `.fab` | 120 a 220 ms | Aporta: es la respuesta al toque. 📱 teléfono real: en iOS, `:active` necesita un listener de touch en la página. React lo registra en la raíz, así que debería andar, pero hay que verlo. | Aporta |
| Fondo de fila al tocar (`.pressable`) | filas | instantáneo al apoyar | Aporta, y está bien hecho: aparece en 0 ms y se va suave. | **Aporta** |
| Toast que baja | tras guardar | 380 ms + 220 ms de salida | Aporta: es la confirmación de que se guardó. | Aporta |
| Confirmación que aparece en su lugar | `ConfirmAction` | 220 ms | Aporta. | Aporta |

**Por qué casi todo "no se nota" en el teléfono.** El sistema de movimiento que
dejó la rama está pensado para un mouse: son cambios de estado con una curva y
una duración, que se disparan y corren solos. En el teléfono lo que se nota no es
la curva, es si **la interfaz responde a la mano**. Y eso, salvo un caso, no está.

### 2.2 El único gesto que existe: arrastrar el sheet para cerrarlo

Existe, sigue al dedo desde la barrita y el encabezado, y se cierra si se suelta
a más de un tercio o con un tirón. Pero:

1. **No hereda la velocidad al soltar. ROTO de sensación.**
   - La "velocidad" que usa es el **promedio de todo el gesto** (distancia total
     sobre tiempo total), no la del final. Un arrastre lento que termina en un
     tirón rápido no cuenta como tirón.
   - Al cerrar, la copia que baja arranca **desde velocidad cero** con una curva
     que acelera (`ease-in`, 220 ms). Venías moviéndolo rápido, el panel frena en
     seco y recién después arranca a caer: es el "golpe contra la pared" que
     describe Apple.
   - Al soltar sin cerrar, vuelve con una transición CSS fija, tampoco desde la
     velocidad del dedo.
2. **Está apagado donde más se usaría. ROTO.** El arrastre se desactiva en cuanto
   el sheet está a pantalla completa, y:
   - el formulario de Movimientos, el más usado, **arranca** a pantalla completa;
   - cualquier otro formulario pasa a pantalla completa en cuanto se toca un
     campo.

   En la práctica, el gesto existe en los sheets que casi nadie arrastra, y solo
   antes de tocar nada. Cerrar el de gasto es siempre "Cancelar" arriba a la
   izquierda, el rincón más lejos del pulgar.
3. **Solo desde la barrita o el encabezado.** En iOS se puede tirar hacia abajo
   desde el contenido cuando ya está scrolleado arriba de todo. Acá el cuerpo
   nunca arrastra.
4. **El velo no acompaña.** Mientras se arrastra, el fondo oscuro queda igual de
   oscuro; recién se apaga cuando se suelta. El velo no dice cuánto falta para
   cerrar.
5. **Tope duro hacia arriba.** Al tirar para arriba no hay resistencia elástica:
   el panel queda clavado.
6. **No se puede agarrar mientras entra ni mientras sale.** La entrada es una
   animación CSS y la salida es una copia inerte, así que no hay forma de
   frenarlo y revertirlo a mitad de camino.

### 2.3 Lo que no se puede agarrar en absoluto

Ordenado por cuánto se extraña en el uso diario:

| Qué falta | Dónde se nota | Por qué pesa |
|---|---|---|
| **Volver deslizando desde el borde** | detalle de activo, de cuenta, de plan, de tarjeta; Deudas; todo Ajustes | En una app instalada en iOS no hay flecha del navegador. Y el `BackLink` no está fijo: **scrollea con el contenido**. En un historial largo (detalle de activo, extracto de una cuenta) para volver hay que subir hasta arriba de todo. 📱 teléfono real: confirmar si la PWA instalada en iOS permite el gesto de borde. En un empaquetado para App Store, el webview no lo trae activado por defecto. |
| **Tirar para refrescar** | todas las pantallas | En la app instalada no hay botón de recargar. Tampoco se vuelve a pedir nada al volver a la app (no se escucha `visibilitychange`): si iOS la dejó en memoria, a la mañana Inicio puede seguir mostrando el disponible de ayer hasta que cambies de pestaña. 📱 teléfono real. |
| **Deslizar una fila** | movimientos, vencimientos, cuentas | En iOS, deslizar una fila es el camino corto para confirmar, borrar o archivar. Acá todo es entrar, buscar el botón y confirmar. |
| **Reordenar que se sienta físico** | cuentas y categorías | La manija sí sigue al dedo, pero la fila que se mueve **salta de a una posición** (redondea a filas enteras). Las de al lado cambian de lugar sin animarse, y al soltar la fila se clava en su lugar sin asentarse. No hay auto-scroll al llegar al borde, así que con muchas categorías no se puede llevar una de abajo hasta arriba en un solo arrastre. |
| **Deslizar la pastilla del segmentado o el switch** | todos los formularios | Los nativos se pueden arrastrar; estos son solo de toque. Es menor. |
| **Cambiar de mes deslizando** | Movimientos | Hoy son dos flechas de 36 px. No es una expectativa fuerte de iOS; lo dejo anotado. |
| **Recorrer un gráfico con el dedo** | Inicio | 📱 teléfono real: recharts muestra el tooltip al tocar, pero no está claro que siga al dedo al arrastrar sobre la línea. |

---

## 3 · ¿Qué hay que conservar de `feat/ui-polish`?

La rama tiene 9 commits, toca 83 archivos y en términos netos borra más de lo
que agrega (+2688 / −2822). Separando:

### 3.1 Se queda: trabajo bueno que se nota

| Qué | Por qué se queda |
|---|---|
| **Escala tipográfica como tokens** (`text-body/subhead/footnote/caption`) | Pasó de 520 tamaños sueltos a 4 nombres. Hoy quedan **27** `text-[Npx]` sueltos que violan la regla de `CLAUDE.md` (montos de 28/40/44 px, las etiquetas de 10 px de la barra), así que se queda y hay que terminarlo. |
| **Contraste de `ink-soft` / `ink-faint`** | Cumple AA de verdad y la regla está escrita. |
| **Clases compartidas** (`row`, `pressable`, `list`, `field`, `input-inline`, `value-button`, `btn-*`, `callout`, `notice`, `badge`, `eyebrow`) | Son el vocabulario de la app. Sin ellas cualquier cambio visual cuesta el triple. |
| **Carga diferida por pantalla** | Bajó el bundle inicial de 195 a 113 kB gzip. Se queda (pero ver 1.5: la espera del chunk no da ninguna respuesta al toque). |
| **`FormSheet` como armazón de todos los formularios**: el `<form>`, el Guardar con sus estados, el foco que entra y vuelve, el Escape que cierra solo el de arriba, `aria-labelledby` | Es la pieza más importante que dejó la rama: 16 formularios dejaron de repetirse. El armazón se queda; lo que se rehace es el movimiento (3.2). |
| **`ConfirmAction`, `ErrorNotice`/`FormError` + `describeError`, `InlineCreate`** | Cada uno reemplazó entre 4 y 15 copias. Se leen igual en toda la app. |
| **`Icons.jsx`, `BackLink`, `MovementRow`, `useMepRate`** | Duplicación eliminada. `BackLink` se queda como componente; su comportamiento se rehace (5.1). |
| **Cinco pestañas, todas plata, y Ajustes afuera** | Es la decisión correcta y resolvió los nombres que no entraban (pero ver 5.3: a 320 px vuelven a chocar). |
| **El monto como protagonista del formulario de gasto** | Es el acierto de producto más grande de la rama. |
| **El toast de "guardado"** | Responde "¿se guardó?", que en una app de plata tiene que tener respuesta. |
| **Detalles de criterio**: un $ 0 que no va en rojo, encabezados en minúscula, `.badge`, el chevron solo en lo que navega, el Total que se abre deslizando, la pastilla del segmentado | Son chicos, son correctos y bajan el volumen. Van en la dirección "calma". |
| **`handle.ownBottomBar`** | La ruta declara que tiene su propia barra; Layout ya no lo adivina. |

### 3.2 Se rehace: la intención era buena, la ejecución no llega

| Qué | Qué salió mal |
|---|---|
| **Esqueletos "en vez de Cargando…" en 12 pantallas** | El commit dice que es para que la pantalla no salte. Salta igual: el esqueleto es el mismo de 3 filas en todas, sin la forma de nada. Además late, que es lo menos calmo que puede hacer. La idea es correcta; el esqueleto no. Y en muchos casos el problema de fondo no es el esqueleto sino que no haya nada mejor que mostrar (1.1 A). |
| **Transiciones de pantalla** | Ver 2.1: animación genérica, casi invisible, que anima el esqueleto y probablemente bloquea toques. El mecanismo (View Transitions) puede servir; lo que se anima y cuándo, no. |
| **Arrastrar el sheet para cerrarlo** | Ver 2.2: velocidad promedio, frenazo al soltar, apagado a pantalla completa. |
| **Salida animada del sheet** | Funciona, pero con un truco: al desmontarse, clona el DOM del sheet, lo pega en `<body>` y lo borra con un `setTimeout` de 600 ms. No se puede agarrar, arranca siempre desde velocidad cero y copia un DOM de React a mano. Hace falta un sheet que siga vivo mientras sale, no una foto. |
| **`ScrollRestoration` + `useScrollRestoration`** | Solo Inversiones restaura el scroll al volver. Movimientos, el extracto de una cuenta y el historial de un activo arrancan arriba. Y como los "volver" de la app navegan hacia adelante (5.1), el router ni siquiera los reconoce como volver. |
| **`ReorderableRows`** | Ver 2.3: salta de a una fila y no se asienta. |
| **Esqueleto dentro del sheet de gasto en Inicio** | La idea era no abrir el formulario sin categorías. El resultado es el bug de 5.2. |

### 3.3 Se tira: trabajo que no se nota, o que suma ruido

| Qué | Por qué |
|---|---|
| **Barras de gastos que crecen al aparecer** | Se repiten en cada visita (2.1). |
| **La subida de 8 px de la pantalla nueva** | Imperceptible en el teléfono y hace parpadear el FAB (1.5). |
| **El latido de los esqueletos y del anillo de carga** | Ruido. |
| **La cápsula que se desliza en la barra** | Inofensiva, pero no aporta nada que la pestaña resaltada no diga ya. Es candidata a salir, no urgente. |
| **Restos**: la rama `onlyContributed` del detalle de activo (el modo "vale lo aportado" está en retirada, ADR-014), la ruta `/objetivo` (Goal.jsx) sin ningún link que lleve a ella, el comentario de `AssetFormModal` que dice que los grupos "viven en Ajustes" | Código muerto o que miente. |

---

## 4 · ¿Está cada cosa donde el usuario la busca?

El informe de arquitectura (`arquitectura-informacion.md`) es anterior a
Compromisos, al rango histórico y al neteo. Así quedaron sus hallazgos:

| Hallazgo | Estado hoy |
|---|---|
| H1 · la plata líquida vive en Ajustes | **Resuelto**: pestaña Mi plata. |
| H2 · Ajustes lleno de cosas que no son ajustes | **Resuelto**: Apariencia, Categorías, Exportar y el pie. |
| H3 · Objetivo ocupa una pestaña vacía | **Resuelto** en la barra. Queda la ruta `/objetivo` huérfana (3.3). |
| H4 · los grupos se editan en Ajustes | **Resuelto**: viven bajo Inversiones. |
| H5 · dos formas de crear una cuenta que no hacen lo mismo | **Sigue abierto.** El alta al vuelo desde un formulario crea siempre una cuenta en pesos y de uso diario, sin decirlo. |
| H6 · "Cuentas" y "Cuenta" | **Resuelto**. |
| H7 · el detalle de cuenta arranca por la configuración | **Resuelto a medias.** El saldo va primero. Pero una cuenta del día a día no tiene ninguna acción: ni "contar esta cuenta" ni "transferir desde acá". Solo las de ahorro tienen Aportar/Retirar. Se entra a ver una cuenta y no se puede hacer nada con ella. |
| H8 · filas iguales que hacen cosas distintas | **Mejorado** (chevron solo en lo que navega). Apareció algo nuevo, abajo. |
| H9 · Eliminar al nivel de la lista | **Resuelto**. |
| H10 · la app dice qué hacer pero no lleva | **Resuelto** ("Contarla de nuevo ahora"). |
| H11 · categorías repetidas en el filtro | **Resuelto** (el filtro de categoría solo aparece dentro de Gastos o Ingresos). |
| H12 · dos resúmenes de gastos del mes | **Sigue abierto**, y ahora pesa más (4.1). |

### 4.1 Lo que quedó fuera de lugar con la estructura nueva

1. **ROTO de lectura. Una fila dice "Inversión" y su plata suma en "Ahorrado".**
   Visto en la cuenta de prueba, septiembre de 2026:
   - la lista muestra "Inversión · USDs físicos · Activo archivado −$ 50.005,14";
   - arriba, Invertido dice **$ 0** y Ahorrado **$ 50.005,14**;
   - es el aporte a un activo que la migración 0038 convirtió en cuenta de
     ahorro, y el total lo cuenta bien;
   - pero la fila no se enteró, y la etiqueta contradice al renglón que la suma.

   Y el Balance da **−$ 50.005,14**: para alguien que arranca, guardar plata se
   lee como perder plata.
2. **Mi plata no dice cuánta plata tenés. PROLIJO, importante.**
   - La pestaña se llama como la pregunta y no la responde: lista cuentas con su
     saldo, pero el total del disponible solo está en Inicio.
   - Quien entra por la pestaña tiene que sumar a ojo.
   - Tampoco se ve el ahorro total.
3. **La evolución de las inversiones está en Inicio y no en Inversiones.**
   - Inicio carga dos gráficos (aportado y valor) con selector de rango y el
     rendimiento acumulado.
   - Inversiones, que es donde alguien iría a ver cómo le va, no tiene ningún
     gráfico.
   - Es exactamente al revés de "Inicio condensa y el detalle está a un toque".
4. **Dos "rendimientos" distintos para lo mismo.**
   - En Inicio, el rendimiento acumulado sale de la serie, que incluye
     archivados y todo lo que no rinde.
   - En Inversiones, el rendimiento sale de otro universo.
   - Está documentado y es intencional, pero para el usuario tipo son dos
     números que dicen "cuánto gané" y no coinciden. La explicación vive detrás
     de un (i).
5. **Dos "gastos del mes" (H12).**
   - "Gastos del mes" en Inicio tiene total, comparación, desglose con barras y
     la serie de 12 meses.
   - "Gastos por categoría" en Movimientos repite el desglose sin barras.
   - Ninguno de los dos lleva al otro.
6. **Deudas quedó a dos niveles de profundidad y cambia de ancho.**
   - Compromisos usa una página angosta; su hija Deudas usa una ancha.
   - Se entra por una fila suelta con una nota al pie.
   - Correcto que no sea una pestaña, pero es la única sección de Compromisos que
     no se ve en su índice (solo el saldo).
7. **Ajustes solo se alcanza desde Inicio en el teléfono.** Desde cualquier otra
   pestaña hay que ir primero a Inicio. Es aceptable por lo poco que se usa; lo
   dejo anotado.
8. **El filtro por tipo y el rango histórico están bien ubicados.**
   - Los seis filtros en chips entran bien a 390 px.
   - El rango se abre desde el nombre del período, con la forma de "tocá para
     cambiar".
   - A 320 px el FAB tapa el tercer chip (5.3).

### 4.2 Inicio contra la vara de "calma"

Primer vistazo en el teléfono (390 × 844), con la cuenta de prueba:

- **Cinco números del mismo tamaño y peso:** disponible, ahorrado, invertido,
  deudas y total.
- **Tres botones (i)** y **tres marquitas de moneda** (ARS, USD, USD).
- Todas las tarjetas con chevron.

Scrolleando:

- los dos gráficos, uno encima del otro, con dos rótulos casi iguales ("Aportado
  acumulado", "Aportado a hoy");
- un **aviso rojo** ("tiene una valuación vieja…") que no es un error;
- "Gastos del mes".

Son **1760 px**, más de dos pantallas.

**Contra la vara:**

- **No hay jerarquía.** Todo pesa igual, así que nada es "lo más importante".
  Las tarjetas iguales son una decisión escrita (los tres mundos no se mandan
  entre sí). Pero con cinco números iguales, la pantalla deja de condensar y
  pasa a listar.
- **El rojo (`clay`) se usa para cosas que no son alarmas:**
  - una valuación vieja;
  - un vencimiento de suscripción atrasado, que pinta **todo el bloque de
    arriba de Inicio** en rojo;
  - el tinte rosado del grupo "Renta fija" en Inversiones, que al lado de una
    pérdida en `clay` se lee como pérdida.

  Rojo significa "pérdida, gasto, destructivo" según el propio `index.css`.
- **Jerga en la primera pantalla** para alguien que arranca: "Aportado
  acumulado", "valuación", "Rendimiento acumulado", "activos", "Liquidar",
  "Aportado".

---

## 5 · El resto del frontend

### 5.1 App instalada (lo que importa desde ahora para App Store y Play Store)

| Hallazgo | Tipo |
|---|---|
| **Los "volver" navegan hacia adelante.** `BackLink` con `to` y los `navigate('/...')` de las pantallas **agregan** una entrada al historial en vez de volver. Verificado: Inicio → Ajustes → Apariencia → (volver) Ajustes → (volver) Inicio; después, el atrás del sistema lleva a **Ajustes** y otro atrás a **Apariencia**. En Android, el botón atrás recorre al revés pantallas que el usuario ya cerró. Cambiar de pestaña también apila historial, así que atrás en Android pasea por las pestañas en vez de salir o ir a Inicio. | **ROTO** |
| **`safe-area-inset-top` no se usa en ningún lado salvo el toast.** Hoy funciona porque `apple-mobile-web-app-status-bar-style=default` hace que iOS reserve la barra de estado. En un empaquetado con webview a pantalla completa (lo habitual para ir a las tiendas), el título, el sheet a pantalla completa (su "Cancelar" y "Guardar") y el contenido quedan debajo del notch. `safe-area-inset-left/right` tampoco, y en horizontal el notch tapa la columna lateral. | PROLIJO hoy, **ROTO** al empaquetar |
| **iPhone horizontal = layout de escritorio.** El corte de `md` es por ancho (768 px). Un teléfono horizontal (844 px) recibe la columna lateral de 250 px, sin FAB, con botones de 36 px y texto de 14, pensados para mouse. El manifest pide `portrait`, pero iOS ignora esa orientación en una web instalada. Verificado a 844 × 390. | **ROTO** en teléfono horizontal |
| **Pantalla de arranque.** El manifest tiene `background_color` y `theme_color` en `#f3f5f1`, el gris de antes, que ya no coincide con `--color-paper` (`#f1f2f6`), y no tiene versión oscura. No hay `apple-touch-startup-image`. En modo oscuro, la app instalada arranca en claro o en blanco y después pasa a negro. 📱 teléfono real. | PROLIJO |
| **Sin forma de refrescar ni de enterarse de que pasó el tiempo.** Ver 2.3. | ROTO 📱 |
| **El volver se va con el scroll.** Ver 2.3. Ninguna pantalla deja de tener salida (la rama agregó los `BackLink` que faltaban, bien), pero en una pantalla larga la salida queda fuera de la vista. | PROLIJO |
| **Altura del viewport.** Se usa `dvh` en todos lados y no hay ningún `100vh` ni `h-screen`: el problema clásico de Safari está resuelto. El sheet a pantalla completa con el teclado depende del scroll manual de `FormSheet`, documentado y correcto. 📱 teléfono real: el criterio de aceptación de `CLAUDE.md` (campo visible sobre el teclado) solo se puede confirmar en un iPhone. | OK |
| **Abajo de todo sí se respeta la zona segura**: la barra de pestañas, la barra del detalle de activo, el FAB y el cuerpo del sheet. | OK |

### 5.2 Formularios

| Hallazgo | Tipo |
|---|---|
| **El primer "+" de cada visita a Inicio.** Las categorías se piden recién al tocar "+" y se pierden al salir de Inicio. Entonces el primer toque de cada visita abre un sheet compacto titulado **"Nuevo gasto"**, con un esqueleto adentro. Cuando llegan las categorías, ese sheet se desmonta (su copia baja) y se monta otro **distinto**, a pantalla completa, titulado **"Nuevo movimiento"**. Medido, con red lenta: el campo del monto recibe el foco a los 489 ms y **lo pierde a los 493 ms**, porque el sheet viejo, al cerrarse, devuelve el foco a donde estaba. El segundo toque de la misma visita sí deja el foco en el monto. 📱 teléfono real: en iOS, además, un foco que llega después de una consulta (fuera del toque del usuario) no abre el teclado. La captura rápida, la razón de ser del FAB, arranca sin teclado la primera vez de cada visita. | **ROTO** |
| **Errores tragados.** Las categorías de Movimientos, del detalle de cuenta y de Compromisos se piden con `.catch(() => {})`. Si fallan, el selector de categoría queda vacío y nadie dice por qué. Lo mismo pasa con las tarjetas de Compromisos (1.3). | ROTO |
| **Pasar a pantalla completa es un salto.** Ver 2.1. | PROLIJO |
| **Elegir la categoría es la parte lenta de la captura rápida.** El monto ya es protagonista, pero la categoría es un `<select>` nativo: un toque, la rueda de iOS, elegir y cerrar. Son tres o cuatro gestos para el dato que más se repite. | PROLIJO |
| **Blancos táctiles chicos en el recordatorio.** "Cambió el monto" (13 px, subrayado punteado) y "y N más para confirmar" miden bastante menos de 44 px de alto. | PROLIJO |
| **Borrar no se deshace.** Toda eliminación pide confirmación y después es definitiva. Para alguien que arranca, un "deshacer" en el toast pesaría menos que la confirmación. Es diagnóstico, no propuesta: hoy no hay forma de revertir un error. | PROLIJO |

### 5.3 Accesibilidad

| Hallazgo | Tipo |
|---|---|
| **La barra de pestañas a 320 px.** "Inversiones" y "Compromisos" quedan pegadas, sin aire entre una etiqueta y la otra, en 10 px (menos que el token más chico, `caption`, de 11). Verificado a 320 × 568. | ROTO en teléfonos chicos |
| **El texto no crece con el tamaño de letra del sistema.** Todo está en px fijos. Quien agranda la letra en iOS no ve ningún cambio en la app. El producto no tiene un requisito formal (PRODUCT.md), pero el usuario tipo incluye a gente cercana que no necesariamente ve bien de cerca. 📱 teléfono real. | PROLIJO |
| **Los estados de carga no se anuncian.** `ListSkeleton` y los placeholders de gráfico ponen `aria-label` en un `<div>` sin rol, y los lectores de pantalla ignoran ese label. | PROLIJO |
| **El color como único portador**: no. Ganancia y pérdida llevan signo, y los montos de gasto e ingreso también. | OK |
| **Foco visible, `role="alert"` en errores, `role="status"` en el toast, foco atrapado y devuelto en los sheets, `aria-expanded` en los (i) y en el Total, reduced-motion global.** | OK |

### 5.4 Estados vacíos y errores

- **Usuario nuevo en Inicio.** Aparece "Configurar mis cuentas" en el
  disponible, US$ 0,00 en invertido y dos textos de "Todavía no cargaste…". Se
  entiende, pero son cuatro bloques diciendo "nada todavía" y ninguno es "empezá
  por acá". Es PROLIJO; es trabajo de onboarding.
- **Compromisos** muestra vacíos falsos mientras carga (1.3). **ROTO.**
- **`ErrorNotice` es consistente** en todas las pantallas que lo usan: mensaje,
  detalle y Reintentar. Bien.

### 5.5 Responsive y escritorio

- **Escritorio está bien resuelto:**
  - Inicio en grilla, gráfico al lado de los gastos;
  - Movimientos en dos paneles con el mes fijo a la izquierda;
  - detalle de activo en dos columnas.

  Es una experiencia propia y no el teléfono estirado.
- **El teléfono sí es, en buena parte, el escritorio apilado.** Las mismas
  tarjetas, los mismos dos gráficos y los mismos bloques, uno debajo del otro.
  Lo que cambia es el FAB y la barra. No hay decisiones propias del teléfono
  sobre **qué no mostrar**. Por eso Inicio mide 1760 px. En Movimientos, los
  filtros recién empiezan en y = 413 a 390 px, y a 320 px el primer movimiento
  queda al pie de la pantalla, tapado a medias por el FAB.
- **Sin desbordes horizontales** a 320 px. Verificado.

### 5.6 Performance real

| Hallazgo | Tipo |
|---|---|
| Todo se vuelve a pedir en cada navegación (1.1 A). Inicio hace 12 consultas distintas por visita. | ROTO (causa del parpadeo) |
| **Consultas sin paginar que pueden cortarse en silencio en 1000 filas**, contra la regla que el proyecto ya tiene escrita en `lib/pagination.js`: `getContributions()` sin límite (alimenta Inicio, Inversiones y el detalle de activo) y `getReconciliationBatches()` (trae **todos** los conteos de la historia en cada visita a Movimientos). Hoy la cuenta está lejos de esa marca. Al pasarla, el valor del portafolio y el apareo de repartos darían mal sin avisar. | ROTO latente |
| recharts pesa 111 kB gzip para tres gráficos simples (dos líneas y unas barras) y se descarga al entrar a Inicio en cuanto hay un aporte. Queda en caché, pero es el chunk más pesado de la app. | PROLIJO |
| Bundle inicial: 113 kB gzip de la app más 52 de supabase-js más 10 de CSS. Razonable. | OK |

### 5.7 Calidad de código (ponytail)

Ordenado por cuánta complejidad sobra:

1. **No hay capa de datos.**
   - 17 pantallas escriben a mano el mismo patrón: `useState` de loading, error
     y datos, una `load()` asíncrona con try/catch/finally, y un `useEffect` que
     la llama.
   - `getCategories()` se llama en 7 lugares.
   - `useAccounts()` se instancia en 10, y cada instancia hace su consulta.
   - `usePortfolio()` se instancia en tres pantallas y cada una trae el
     portafolio entero.

   Es la mayor duplicación del frontend, y es exactamente lo mismo que hace
   parpadear la app (sección 1): no son dos problemas.
2. **La salida del sheet clona el DOM a mano** (3.2). Es la pieza más ingeniosa
   del frontend y por eso mismo la más frágil.
3. **La regla de tokens tiene 27 excepciones** (`text-[28px]`, `[40px]`,
   `[44px]`, `[10px]`…). Hay además tres sombras con `rgb(16 18 24 / …)` escrito
   a mano (switch, segmentado, reordenar), que en oscuro no se redefinen.
4. **Código muerto**: la rama `onlyContributed`, la ruta `/objetivo` y el
   comentario viejo de `AssetFormModal` (3.3).
5. **Dos estados de "cargando" dentro de una misma pantalla** que se resuelven en
   momentos distintos:
   - Inicio tiene cinco (disponible, portafolio, deudas, compromisos, gastos) y
     cada uno decide su forma de esperar: texto, bloque latiendo o nada.
   - Detalle de activo tiene dos (datos y precio).

   Es una de las razones por las que Inicio cambia seis veces de forma.
6. **Lint**: 5 avisos `only-export-components` en `ExchangeRateField.jsx`
   (constantes exportadas junto al componente). Menor.

---

## 6 · Lo que solo se puede confirmar en un teléfono real

Nada de esto lo doy por bueno ni por malo:

1. Si el primer "+" de Inicio abre el teclado (5.2). El foco se pierde en
   Playwright; en iOS además hay que ver el teclado.
2. Si los toques durante la transición de pantalla se pierden (1.5).
3. Si la PWA instalada en iOS permite volver deslizando desde el borde (2.3).
4. Si la app, al volver a primer plano después de horas, muestra datos viejos
   (2.3).
5. La pantalla de arranque en modo oscuro (5.1).
6. Que el campo enfocado quede siempre sobre el teclado en todos los formularios
   (el criterio de aceptación de `CLAUDE.md`).
7. Que `:active` pinte el fondo al tocar en iOS (2.1).
8. Si los gráficos se pueden recorrer arrastrando el dedo (2.3).
9. Cómo se ve la app con el tamaño de letra del sistema agrandado (5.3).
10. La sensación real de las animaciones a 120 Hz (ProMotion) contra 60 Hz. Las
    duraciones de 120 a 380 ms se perciben distinto.

---

## Anexo · Datos de la medición

- **Teléfono a 390 × 844, red local, navegando por la barra de pestañas:**
  - Layout-shift: Inicio 0,445 en la primera visita y 0,214 en la segunda;
    Movimientos 0,211; Mi plata, Inversiones y Compromisos 0,000.
  - El 0,000 no significa que no salten. Layout-shift no cuenta un esqueleto
    reemplazado entero, solo lo que se corre. El alto cuadro por cuadro de 1.2
    sí lo muestra.
- **Pedidos a Supabase por visita** (en desarrollo, con StrictMode, que duplica):

  | Pantalla | Pedidos | Endpoints distintos |
  |---|---|---|
  | Inicio | 26 | 12 |
  | Movimientos | 12 | 5 |
  | Compromisos | 12 | 6 |
  | Inversiones | 10 | 4 |
  | Mi plata | 4 | 2 |

- **Foco al tocar "+" en la primera visita a Inicio** (red lenta simulada):
  - 49 ms: se abre "Nuevo gasto" (261 px), foco en el panel;
  - 489 ms: se abre "Nuevo movimiento" (844 px), foco en el monto;
  - 493 ms: el foco vuelve al panel;
  - 715 ms: la copia del sheet viejo termina de irse.

  En el segundo toque de la misma visita y en Movimientos, el foco queda en el
  monto.
- **Historial:** "volver" dentro de la app agrega entradas en vez de sacarlas
  (5.1). Recorrido: Inicio → Ajustes → Apariencia → volver → volver. Después,
  el atrás del sistema da `/ajustes` y otro atrás da `/ajustes/apariencia`.
- **Los tres tamaños:**
  - 320 × 568: sin desborde horizontal; etiquetas de la barra pegadas.
  - 844 × 390: layout de escritorio.
  - 1440 × 900: correcto.
