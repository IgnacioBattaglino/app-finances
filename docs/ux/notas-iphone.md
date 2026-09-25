# Notas de prueba en el iPhone

Cosas que Nacho va notando al probar cada commit de `feat/ui-polish`. Solo
anotadas, sin atacar todavía.

## Detectadas probando el commit 2 (`4224900`, captura al primer toque)

1. **Editar un movimiento viejo abre el teclado.** No debería: al modificar un
   movimiento lo más probable es eliminarlo o cambiar la fecha o la categoría,
   y el monto es lo primero que se pone al cargar, no al editar. El autofocus
   queda solo para el alta.
2. **La barra de estado del iPhone (hora, wifi, batería) se pone gris** después
   de cargar un movimiento, y se queda así el resto de la sesión hasta cerrar y
   volver a abrir la app. Pista a revisar: `theme-color` / estado de
   `FormSheet` (o el foco del teclado) que no se restablece al cerrar.

## Detectadas probando el commit 3 (`c06995b`, pastillas de categoría)

3. **Idea:** mostrar las 5 categorías más usadas y que el sexto botón sea
   "Otra", que abre la rueda nativa. Hoy son 6 pastillas más "Otra categoría"
   aparte. Funciona bien como está; es un ajuste de diseño para más adelante.

## Detectada probando el commit 4 (`5084f5a`, navegación)

4. **"Unexpected Application Error! 'text/html' is not a valid JavaScript MIME
   type" al tocar Movimientos.** Causa: la app instalada tenía abierta una
   versión vieja y, al deployar un push nuevo, Vercel borró el chunk con hash
   viejo (`Movements-xxxx.js`); el rewrite `/(.*) → /index.html` de
   `vercel.json` responde HTML en vez de un 404, y el navegador lo rechaza como
   módulo. No es un bug del commit 4: va a pasar cada vez que se deploye con la
   app abierta. Arreglo posible (una línea en `main.jsx`): escuchar
   `vite:preloadError` y hacer `location.reload()`. Queda para más adelante.
5. **Cambiar de pestaña rápido:** es casi instantáneo, pero hay un instante en
   que los campos aparecen vacíos. Esperado en este commit (sin esqueletos ni
   datos en caché por pantalla); lo cubre `cd7b446` (bloques 5 y 6). Re-probar
   ahí.
6. **Entrar y salir de detalles: la animación se ve fea.** Es de este commit
   (las transiciones de entrada por la derecha y de vuelta son del bloque 4).
   Sin detallar todavía qué se ve mal; describirlo mejor (¿salto, parpadeo,
   pantalla en blanco, demasiado lenta?) y re-probar después de `cd7b446`, que
   cambia lo que hay dentro de cada detalle mientras carga.

7. **Precisión sobre la animación de detalles (nota 6):** con el botón de volver
   se ve bien. Al volver deslizando desde el borde (gesto nativo de iOS), la
   animación ocurre dos veces: una mientras se desliza, y otra al terminar,
   como si además se hubiera tocado el botón. Es el gesto nativo (que anima por
   su cuenta) sumado a la transición de vista de la app disparada por el POP.
   Lo cubre el commit 13 (`dbafcc1`, volver deslizando propio, "esa navegación
   no se anima otra vez"); re-probar ahí, sobre todo en pantallas que el gesto
   propio no cubre (el detalle de un activo sigue con el nativo a propósito).

## Detectadas probando el commit 6 (`2548f1e`, Inicio calmo)

8. **Inicio se siente más calmo, pero se echan de menos algunas cosas que se
   sacaron.** Nacho quiere seguir viendo en Inicio (de alguna forma, sin volver
   a llenarlo): el **desglose del disponible por cuenta** y la **información de
   rendimiento de los activos**. Puede haber más; lo que salió de Inicio en
   este bloque: los (i) de explicación, las marquitas ARS/USD, el desglose por
   cuenta, los dos gráficos de evolución (con "Aportado a hoy" y "Rendimiento
   acumulado", hoy solo en Inversiones y en desktop), la serie de 12 meses (hoy
   en Movimientos) y las barras de categorías. Decidir cuáles volver y en qué
   forma (por ejemplo una línea chica dentro de la fila, sin recargar).

## Detectadas probando el commit 7 (`c2af2b8`, Movimientos)

9. **El resumen plegable de Movimientos se despliega demasiado grande.** Al
   tocar la tarjeta de Gastos/Ingresos aparece todo junto (cinco renglones,
   "Gastos por categoría" y la serie de 12 meses) y ocupa demasiado. Repensar
   qué va adentro o cuánto se muestra.
10. **La animación de despliegue se siente demasiado rápida, brusca.** Es la
    grilla `0fr → 1fr` de `MonthSummary` (mismo mecanismo que el pie del Total
    de Inicio). Revisar duración y curva, y si conviene animar la altura de
    otra forma cuando el contenido es tan alto.

11. **Propuesta de Nacho para el resumen de Movimientos (nota 9):** sacar
    "Gastos por categoría" a **otra tarjeta** aparte. La tarjeta plegable queda
    solo con los montos por tipo de movimiento: ahorro, inversión, ingresos y
    el sobrante ("Te sobró"), más gastos. La serie de 12 meses habría que
    decidir dónde va (¿tarjeta propia junto a categorías?).

## Detectadas probando el commit 8 (`562a177`, contar/transferir y orden)

12. **Reordenar cuentas arrastrando funciona mal: las cuentas "titilan"** hasta
    quedar como las puso. Es el `ReorderableRows` viejo (salta de a una fila y
    reescribe el orden en cada paso). Lo reescribe el commit 12 (`f0c3198`,
    "reordenar que se asienta"); re-probar ahí, en Categorías y en Mi plata.
13. **La plata ahorrada tiene muy poca importancia visual.** Hoy aparece como
    línea chica en `ink-soft` ("+ US$ X ahorrados") dentro de la fila del
    disponible en Inicio, y como total chico bajo el total del disponible en Mi
    plata. Nacho quiere que pese más (¿fila propia? ¿mismo tamaño?). Ojo: el
    plan decidió a propósito que el ahorro es parte del mundo de la plata, no
    un cuarto mundo; hay que rediscutir esa decisión.

## Detectadas probando el commit 9 (`0172f84`, el rojo)

14. **Volver atrás con el color de los grupos de activos.** A Nacho le gustaban
    los grupos teñidos de su color; el commit 9 los pasó a tarjeta neutra con
    un punto o marca al lado del nombre. Restaurar el tinte (`.group-tint` y
    `.group-tint-soft` en `index.css`, y su uso en `AssetGroup.jsx`, más las
    reglas de modo oscuro, borrados en `0172f84`). Ojo: el motivo original era
    que un grupo "Vino" se leía como pérdida al lado de un rendimiento rojo;
    al volver, ver cómo evitar esa confusión (por ejemplo, sin tinte rojizo o
    con menos intensidad).

## Detectada probando el commit 10 (`b3e3200`, el sheet se agarra)

15. **REGRESIÓN: el "+" ya no abre el teclado al primer toque** (lo que arregló
    `4224900`). Causa probable, leída del código: `FormSheet` ahora decide
    montarse en un `useEffect` (`setMounted(true)` cuando `wantOpen` pasa a
    true), o sea un render DESPUÉS del toque. El `<input autoFocus>` de
    `TransactionFormModal` recién se monta ahí, fuera del turno del gesto, y
    iOS solo abre el teclado si `focus()` ocurre dentro del mismo toque. Antes
    el modal se montaba en el mismo render del toque. Arreglo posible: que
    `mounted` se derive en el render (`open || estado`) en vez de esperar al
    efecto, para que el input exista en el mismo commit del toque; verificar
    también el efecto de foco del panel (`panelRef.current.focus()`), que no
    le robe el foco al input. Prioridad ALTA (es el gesto principal de la app).

    **Arreglada (nota 15):** commit `1b11867`. Verificado en el navegador que el
    campo recibe el foco en el mismo turno del toque (con el código anterior el
    sheet ni existía un turno después). Falta confirmarlo en el iPhone.

## Arreglos aplicados (2026-09-20)

- **Nota 15, segunda parte:** al abrir con teclado el formulario quedaba corrido
  hacia arriba con una franja vacía (iOS revelaba el input con el panel todavía
  fuera de pantalla). Ahora el sheet que autoenfoca entra con un fundido, en su
  lugar. Commit `80407a3`. Probar en el iPhone.
- **Nota 1:** editar un movimiento ya no autoenfoca ni abre a pantalla completa
  (mismo commit `80407a3`). Además `expanded` se reinicia en cada apertura.
- **Nota 2 (barra de estado gris):** sin arreglo directo; puede ser un efecto
  del corrimiento de la página de la nota 15. Re-probar después de `80407a3`.
- **Nota 4:** `vite:preloadError` recarga una vez por minuto (commit
  `0ef02dd`).
- **Nota 14:** el tinte de los grupos de activos vuelve (commit `8c290f8`).
- **Sin tocar (falta decidir):** notas 3, 8, 9, 10, 11 y 13.
