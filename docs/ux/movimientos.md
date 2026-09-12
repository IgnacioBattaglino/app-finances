# Movimientos — qué cuenta, qué se ve y qué no cierra

Informe de una sola pantalla, sin cambios de código. Responde a cinco preguntas
concretas: si los totales del mes están contando de más, de dónde sale el
selector de categorías, cuántos tipos de movimiento existen de verdad, cómo
podrían convivir los filtros con los totales, y qué más hay roto ahí adentro.

Fecha del relevamiento: 2026-09-12. Continúa `arquitectura-informacion.md`
(hallazgos H8, H11 y H12) y `reconciliacion-y-transferencias.md`, con las
migraciones 0041 (neteo), 0042 (borrado de conteos) y el cambio C6 (renglón
"Ahorrado") ya aplicadas.

Fuente: `src/pages/Movements.jsx`, `src/lib/movements.js`,
`src/lib/transactions.js`, `src/lib/systemCategories.js`,
`src/lib/contributions.js`, `src/components/TransactionFormModal.jsx`,
`src/lib/liquid.js`, `src/lib/assets.js` y las migraciones 0038, 0040, 0041 y
0042. Verificación numérica: `monthTotals` real corrida sobre un mes
reconstruido, y una lectura read-only de septiembre 2026 en la cuenta de prueba.

**Cada hallazgo dice si ROMPE (da un número o un destino equivocado) o si
INCOMODA (es cierto pero se lee mal).** Están mezclados a propósito dentro de
cada tema, porque el que incomoda suele ser el que esconde al que rompe.

---

## 1 · Verificación: el "Reparto entre cuentas" verde

### 1.1 La respuesta

**No, el total de Ingresos NO incluye esa fila.** Los $612.188,39 verdes están
en la lista y no están en los $2.143.179,28 de arriba. El total está bien
calculado; lo que está roto es que no hay ninguna forma de darse cuenta.

La regla vive en un solo lugar, `isMovedMoney` (`src/lib/systemCategories.js`),
y `monthTotals` la aplica antes de sumar nada:

```
if (isMovedMoney(t.category)) continue        // lib/movements.js
MOVED_MONEY = { 'savings_movement', 'account_transfer' }
```

La fila "Reparto entre cuentas" la escribe `reconcile_liquid` con
`system_category_id('account_transfer', v_kind)` (migración 0041, líneas 485-490),
así que cae exactamente en esa llave. La consulta que alimenta la pantalla trae
la llave junto con el nombre (`SELECT` en `lib/transactions.js`:
`category:categories(name, system_key)`), así que el filtro nunca se queda sin
el dato.

### 1.2 La cuenta, renglón por renglón

Qué suma a cada total, para una fila de `transactions`:

| Fila | Categoría (`system_key`) | Gastos | Ingresos | Invertido | Ahorrado |
|---|---|---|---|---|---|
| Gasto común | `null` (de usuario) | ✅ | — | — | — |
| Ingreso común | `null` (de usuario) | — | ✅ | — | — |
| Ajuste de saldo (el neto de un conteo) | `balance_adjustment` | ✅ si `expense` | ✅ si `income` | — | — |
| **Reparto entre cuentas** (el resto de un conteo) | `account_transfer` | ❌ | ❌ | — | — |
| Pata de transferencia entre cuentas | `account_transfer` + `transfer_id` | ❌ | ❌ | — | ✅ solo si cruza a una cuenta de ahorro |
| Movimiento de ahorro "de afuera" | `savings_movement` | ❌ | ❌ | — | ❌ |

Y para una fila de `contributions` (que en la lista se ve como "Inversión ·
*activo*" o "Retiro · *activo*"):

| Fila | Señal | Invertido | Ahorrado |
|---|---|---|---|
| Aporte a un activo | `asset.savings_account_id = null` | ✅ `+` | — |
| Retiro de un activo | ídem, `direction = 'out'` | ✅ `−` | — |
| Aporte a un activo convertido en cuenta de ahorro (migración 0038) | `asset.savings_account_id` presente | — | ✅ |

La identidad que define la pantalla, entonces, es:

```
Ingresos = Σ (filas income con categoría de usuario)  +  Σ (Ajuste de saldo income)
Gastos   = Σ (filas expense con categoría de usuario) +  Σ (Ajuste de saldo expense)
Balance  = Ingresos − Gastos − Invertido − Ahorrado        (por moneda, sin mezclar)
```

Verificación corrida con la función real sobre un mes reconstruido con esa
forma —dos ingresos de usuario, un reparto `income` de $612.188,39, un ajuste
`expense` y un gasto común—:

```
Ingresos  = [{ ARS, 2.143.179,28 }]     ← sin el reparto
Gastos    = [{ ARS,   165.000,00 }]
suma cruda de todas las filas verdes = 2.755.367,67     ← 2.143.179,28 + 612.188,39
```

O sea: si el total hubiera incluido la fila, en la pantalla habría dicho
**$2.755.367,67**. Dice otra cosa, así que no la incluye. Es una comprobación
que podés repetir a mano en un minuto: sumá a ojo las filas verdes del mes; si
te da el total de Ingresos, el reparto está adentro (y sería un bug); si te da
el total más los repartos, está afuera (y es lo correcto).

> Nota: no puedo leer tus filas. RLS aísla por usuario y desde acá solo tengo
> el usuario de prueba, cuyo septiembre 2026 tiene otros cuatro movimientos.
> Lo que verifiqué es la función real (`monthTotals`, `groupExpensesByCategory`)
> con la forma exacta de tu mes, más el SQL que escribe esas filas.

Lo mismo para los otros tres renglones del mismo mes:

- **Gastos**: los repartos `expense` de ese conteo tampoco están. Sí está el
  "Ajuste de saldo", que desde la 0041 es el neto y es un gasto de verdad.
- **Invertido**: solo `contributions` con `affects_liquid = true` de activos que
  no fueron convertidos en cuenta de ahorro. Ningún conteo lo toca.
- **Ahorrado**: solo transferencias que cruzan a una cuenta de ahorro (con
  `transfer_id`) y aportes a activos migrados. **Un reparto que deja plata en
  una cuenta de ahorro NO entra** — ver 5.4, que es un número que falta.

### 1.3 Qué hace imposible darse cuenta — ROMPE

La aritmética está bien; la pantalla no la deja ver. Cinco cosas, todas de la
misma familia:

1. **El color dice que es un ingreso.** `TransactionRow` pinta `text-gain` para
   todo `kind === 'income'`, sin mirar la categoría. La app ya tiene la
   convención correcta —`InvestmentRow` y `SavingsRow` van sin color, "no es
   una pérdida ni una ganancia, es plata que cambió de lugar"— pero la aplica
   **por tabla, no por significado**: como el reparto vive en `transactions`, se
   lleva el color de un ingreso real.
2. **Tiene el lapicito.** La fila se ve exactamente igual de editable que un
   sueldo, y de hecho abre el mismo formulario (ver 5.2, donde eso sí rompe).
3. **Los totales están en otra tarjeta y no responden a nada.** Ninguna
   interacción relaciona una fila con un número. En desktop están a la
   izquierda, quietos; en mobile, arriba de todo, fuera de la pantalla cuando
   mirás la lista.
4. **Filtrar empeora la contradicción, no la aclara.** Con el segmento en
   "Ingresos" la lista muestra el reparto verde y arriba sigue el total que no
   lo incluye: dos números que se contradicen a un dedo de distancia (ver 4.1).
5. **"En qué se fue" tampoco lo nombra.** El desglose excluye los repartos
   (bien), así que no hay ningún lugar de la pantalla donde la fila y su
   tratamiento se encuentren.

Ninguna de las cinco es un cálculo mal hecho. Las cinco juntas son la razón por
la que hubo que abrir este informe para responder una pregunta que la pantalla
debería contestar sola.

---

## 2 · El selector de categorías

### 2.1 De dónde sale

`Movements.jsx` carga `getCategories()` una vez y lo vuelca entero en un
`<select>`:

```
getCategories()   →  categories.eq('is_archived', false).order('position').order('name')
<select>          →  categories.filter(cat => kind === 'all' || cat.kind === kind)
```

`getCategories` no filtra `is_system`: trae las del usuario **y las seis del
sistema** (migración 0041: `balance_adjustment`, `savings_movement` y
`account_transfer`, cada una en sus dos `kind`). Como el filtro de tipo está en
"Todos" por default, se ven las seis, de a pares con el mismo nombre. El orden
las manda al fondo (las del sistema viven en `position = 100`), pero ahí abajo
quedan las tres duplicadas seguidas.

Dos detalles que conviene tener a mano antes de elegir un arreglo:

- **El duplicado no es exclusivo del sistema.** Cualquier usuario que tenga
  "Regalos" de gasto y "Regalos" de ingreso ve exactamente el mismo problema.
  Es un defecto del selector, no de las categorías de sistema.
- **Con el segmento en "Gastos" o "Ingresos" el duplicado desaparece solo**,
  porque ahí el filtro por `kind` deja una sola de cada par. O sea: el problema
  existe únicamente en el estado por default.
- **Elegir una del sistema no está mal, está a medias**: filtrar por
  "Transferencia de cuenta (income)" muestra la mitad de las transferencias del
  mes, y la otra mitad —su pata `expense`— queda invisible sin ninguna
  explicación.

### 2.2 Opciones

**A · Agrupar por tipo con `<optgroup>`.** Dos grupos, "Gastos" e "Ingresos", y
dentro cada categoría una sola vez. El duplicado se explica solo: son dos filas
porque son dos tipos, y el encabezado lo dice.
*Consecuencia*: es el cambio más chico (no toca datos ni queries) y resuelve
también el caso "Regalos". No resuelve que las del sistema estén mezcladas con
las del usuario, salvo que se agregue un tercer grupo.

**B · Agrupar por origen: "Tus categorías" / "De la app".** Un `<optgroup>` por
cada uno, con las del sistema al final.
*Consecuencia*: contesta la pregunta "¿por qué hay una categoría que yo nunca
creé?", que hoy la app no contesta en ningún lado. Se puede combinar con A
(grupos anidados no existen en HTML, así que serían cuatro grupos planos:
Gastos tuyos / Ingresos tuyos / De la app · gastos / De la app · ingresos — que
ya es demasiado).

**C · Colapsar cada par de sistema en una sola opción que filtre las dos.**
"Transferencia de cuenta" aparece una vez y selecciona las dos `kind`.
*Consecuencia*: es lo que el usuario espera —son una sola cosa— pero obliga a
que el valor del filtro deje de ser un `category_id` y pase a ser "una llave de
sistema", o sea dos formas de filtrar conviviendo en un mismo control. También
descoloca a `changeKind`, que hoy limpia la categoría cuando no coincide el
tipo.

**D · Sacar las del sistema del selector y reemplazarlas por el filtro de tipo
de movimiento** de la sección 4. Las tres categorías de sistema no son
categorías en el sentido en que el usuario usa la palabra: son *qué clase de
movimiento es*. Si esa pregunta pasa a tener su propio control (Gastos ·
Ingresos · Invertido · Ahorrado · Movimientos internos), el selector de
categorías vuelve a ser lo que su nombre dice: las categorías del usuario.
*Consecuencia*: es el arreglo más limpio y el más caro — depende de la decisión
de la sección 4. Deja un caso sin cubrir: buscar *todos* los ajustes de saldo
del mes, que hoy se puede y ahí pasaría a hacerse por el filtro de tipo.

**Recomendación**: A ahora (barato, no compromete nada) y D cuando se implemente
el filtro por tipo. B es tentador pero pierde contra A: el usuario no se
pregunta de dónde salió la categoría, se pregunta por qué está dos veces.

---

## 3 · Cuántos tipos de movimiento hay, y de dónde sale el tipo

### 3.1 No son cinco: son siete, y no hay ninguna columna que lo diga

| # | Tipo | Cómo se deduce hoy | Dónde cuenta | Color hoy |
|---|---|---|---|---|
| 1 | **Gasto** | `transactions.kind = 'expense'` + categoría de usuario | Gastos | clay |
| 2 | **Ingreso** | `transactions.kind = 'income'` + categoría de usuario | Ingresos | gain |
| 3 | **Ajuste de saldo** (el neto de un conteo) | `category.system_key = 'balance_adjustment'` | Gastos o Ingresos | clay / gain |
| 4 | **Reparto de un conteo** | `system_key = 'account_transfer'` **y `transfer_id` nulo** | en ningún lado | clay / gain ⚠️ |
| 5 | **Transferencia entre cuentas** | `system_key = 'account_transfer'` **y `transfer_id` presente** | en ningún lado, salvo que cruce al ahorro → Ahorrado | clay / gain ⚠️ |
| 6 | **Movimiento de ahorro "de afuera"** | `system_key = 'savings_movement'`, sin `transfer_id` | en ningún lado | sin color (cae en `SavingsRow`) |
| 7 | **Inversión / Retiro** | viene de `contributions`; `asset.savings_account_id` decide si es Invertido o Ahorrado | Invertido o Ahorrado | sin color |

El tipo de una fila no está guardado en ninguna parte: se reconstruye cada vez
a partir de **cuatro señales distintas**, y cada consumidor usa las que
necesita:

1. `category.system_key` — separa lo real de lo que solo cambió de lugar.
2. `transfer_id` — separa una transferencia de verdad del reparto de un conteo.
   Son la misma categoría, con la misma descripción de sistema. Es la única
   diferencia entre el tipo 4 y el tipo 5.
3. `account.is_savings` — de la fila y **de su hermana**: una transferencia es
   ahorro cuando exactamente una de sus dos patas cae en una cuenta de ahorro
   (`savedByCurrency`, en `lib/movements.js`).
4. `asset.savings_account_id` — un aporte a un activo que la migración 0038
   convirtió en cuenta de ahorro es ahorro, no inversión.

Y la pregunta se responde hoy en **cuatro lugares**: `monthTotals` y
`savedByCurrency` (`lib/movements.js`), el `switch` de filas en
`Movements.jsx`, y `groupExpensesByCategory` (`lib/transactions.js`). Cada uno
mira un subconjunto de las cuatro señales. Esto es lo que hay que arreglar
primero, y está desarrollado en la sección 6.

### 3.2 El color hoy indica signo, no tipo — ROMPE (parcialmente)

Lo que la app tiene escrito como regla, en `src/index.css`:

```
/* SIGNIFICADO FINANCIERO — fijo, nunca sigue al acento: verde = ganancia e
   ingreso, clay = pérdida y gasto */
```

Y lo que ya aplica bien en dos de los tres componentes de fila: `InvestmentRow`
y `SavingsRow` van **sin color**, con el comentario "no es una pérdida ni una
ganancia, es plata que cambió de lugar. El signo dice para qué lado".

El defecto es que `TransactionRow` pinta por `kind` sin mirar la categoría, así
que los tipos 4 y 5 —que son exactamente "plata que cambió de lugar"— se llevan
el color de un gasto o un ingreso real. **No hace falta ningún color nuevo para
arreglar la fila que disparó este informe: alcanza con aplicar la regla que la
app ya declaró, por significado en vez de por tabla.** Un reparto y una pata de
transferencia pasan a ir en `ink`, igual que una inversión.

### 3.3 Cinco colores para cinco tipos choca con CLAUDE.md

Sí, choca, y en un punto explícito: verde y clay tienen significado financiero
fijo y no siguen ni al acento. Si "Ahorrado" fuera azul y "Transferencia"
violeta, el verde pasaría a significar dos cosas (ingreso *y* uno de los cinco
tipos) y la lectura más frecuente de la app —¿esto entró o salió?— se vuelve
ambigua. Sumale que la paleta de marca (`ACCENTS`, en `lib/theme.js`) la elige
el usuario: con acento Vino, un "tipo transferencia" en violeta compite con
todo lo demás.

Tres alternativas que dan el "se distingue a simple vista" sin romper eso:

**A · Ícono al principio de la fila, color solo para gasto/ingreso.** Un glifo
chico a la izquierda (flecha que sale, flecha que entra, gráfico para inversión,
alcancía para ahorro, dos flechas cruzadas para transferencia/reparto), y el
monto de la derecha conservando la regla de dos colores. El ícono puede llevar
un fondo teñido suave (`color-mix`, como ya hace `.notice`) sin pisar el
significado del monto.
*Consecuencia*: es la única que sirve para daltonismo y la que menos toca el
sistema visual. Cuesta un ícono por tipo y ~16px de ancho en cada fila.

**B · Agrupar la lista por tipo.** Secciones con encabezado ("Gastos",
"Ingresos", "Inversiones", "Ahorro", "Entre cuentas"), como ya hace "En qué se
fue" con las monedas. El tipo pasa a ser posición, no color.
*Consecuencia*: gratis en tokens, pero rompe el orden cronológico, que es la
lectura principal de esta pantalla ("¿qué pasó el martes?"). Encaja mucho mejor
como *resultado del filtro* de la sección 4 que como orden permanente.

**C · Una etiqueta de texto en la segunda línea.** Donde hoy va "12 sep ·
Efectivo", agregar "· Transferencia". Cero color, cero íconos.
*Consecuencia*: lo más barato y lo más explícito; a cambio, la segunda línea ya
tiene fecha y cuenta y se satura, y "a simple vista" pasa a ser "leyendo".

**Recomendación**: A, con la corrección de 3.2 hecha primero (que sola ya
resuelve el caso reportado), y B como el modo en que se ve la lista cuando hay
un filtro de tipo activo.

---

## 4 · Tocar un total para filtrar

### 4.1 Los dos controles ya se contradicen hoy — ROMPE

Antes de agregar nada: el segmentado de arriba y los totales de la izquierda
**ya dicen cosas distintas sobre las mismas filas**.

El segmentado filtra por `kind`, que es la columna de la base:

```
filteredTransactions = monthItems.filter(t => kind === 'all' || t.kind === kind)
```

Los totales filtran por significado (`isMovedMoney`). Entonces, con el
segmentado en **"Gastos"**, la lista muestra:

- gastos comunes → están en el total ✅
- "Ajuste de saldo" `expense` → está en el total ✅
- **patas `expense` de transferencias → NO están en el total** ❌
- **"Reparto entre cuentas" `expense` → NO están en el total** ❌
- movimientos de cuentas de ahorro `expense` → NO están en el total ❌

O sea: hoy ya se puede poner el filtro en "Gastos" y ver una lista de filas
rojas que no suman el número que dice "Gastos" arriba. No es un riesgo futuro
del cambio que querés hacer: es el estado actual, y el cambio es la oportunidad
de arreglarlo.

Dos contradicciones menores de la misma familia, ambas INCOMODAN:

- **Los totales describen el mes entero; la lista está filtrada.** Es una
  decisión deliberada y está comentada en el código, pero la pantalla no lo
  dice en ningún lado.
- **Las inversiones desaparecen con cualquier filtro** (`showInvestments = kind
  === 'all' && !categoryId`), sin ninguna explicación. Elegir "Gastos" hace
  desaparecer filas que no eran gastos, lo cual es correcto y se ve como un bug.

### 4.2 Opciones

**A · Los totales SON el filtro; el segmentado desaparece.**
Cinco estados: Todos · Gastos · Ingresos · Invertido · Ahorrado. Tocar un
renglón lo deja activo (resaltado) y la lista pasa a mostrar exactamente las
filas que lo componen; tocarlo de nuevo vuelve a Todos. "Balance" no es
tocable: es una resta, no un conjunto de filas.
*Consecuencias*: es un solo control, así que no puede contradecirse consigo
mismo, y obliga a que el filtro sea **semántico** (por tipo, no por `kind`), que
es justo lo que arregla 4.1. Exige una sexta opción o una decisión explícita
sobre las filas que no están en ningún total (transferencias, repartos, ahorro
"de afuera"): o se les da su propio renglón "Entre cuentas" (con un total de
$0, que es informativo: dice que no mueven nada), o solo se ven en "Todos".
Dos costos: se pierde el segmentado como afordancia obvia de "acá se filtra"
(una tarjeta de números no se ve tocable — hay que resolverlo con un chevrón o
un resaltado), y en mobile los totales están arriba de todo, lejos de la lista.

**B · Un solo estado, dos entradas.** El segmentado se queda pero pasa a tener
las mismas cinco opciones que los totales, y ambos leen y escriben el mismo
estado: tocar "Invertido" en la tarjeta marca "Invertido" en el segmentado.
*Consecuencias*: nunca pueden contradecirse porque son el mismo valor, y la
afordancia del segmentado se conserva. A cambio, cinco o seis opciones no
entran en un segmentado en un teléfono; habría que pasarlo a chips
scrolleables, que es otro componente que la app no tiene.

**C · Cada total abre una vista propia.** Tocar "Invertido" navega a una
pantalla con solo eso.
*Consecuencias*: escala bien (cada vista puede tener su propio desglose) y es
el patrón que la app ya usa en Inicio (tocar una tarjeta lleva a su sección).
Pero parte Movimientos en cinco pantallas y pierde la lectura cronológica
mezclada, que es lo que hace útil a esta pestaña.

**D · No tocar los filtros; mostrar el vínculo al revés.** Cada fila que no
cuenta en ningún total lleva una marca ("no cuenta como gasto"), y los totales
quedan como están.
*Consecuencias*: es el arreglo más barato del problema real (que es de lectura,
no de filtrado) y no agrega ningún control. No da lo que pediste.

**Recomendación**: B. Un solo estado compartido, con el filtro definido por
tipo y no por `kind`, y la lista mostrando exactamente las filas del total
elegido. Con el filtro en "Gastos", el total de Gastos tiene que ser la suma de
lo que se ve: ese es el criterio de aceptación de todo este cambio.

Y una regla que sale sola: **el filtro de categorías solo tiene sentido dentro
de Gastos, Ingresos o Todos.** Con "Invertido" elegido no hay categoría posible
(las inversiones no tienen), así que el control se oculta o se deshabilita en
vez de quedar ahí prometiendo un filtro que no hace nada.

---

## 5 · Lo demás que encontré

### 5.1 Filas iguales que hacen cosas distintas — INCOMODA

Tres afordancias en filas del mismo alto y el mismo formato (es la mitad de H8
que quedó abierta):

- **lapicito** → abre el editor acá mismo (gasto, ingreso, ajuste, reparto).
- **chevrón** → te saca a `/inversiones/:assetId` (inversión/retiro).
- **chevrón** → te saca a `/plata/:accountId` (cualquier fila de una cuenta de
  ahorro).

Los dos chevrones son idénticos y llevan a secciones distintas de la app.

Y el caso peor, que no se distingue de ninguna manera: **una pata de
transferencia y un reparto de conteo son la misma categoría, con el mismo
nombre visible, y se comportan distinto.** Las dos abren el mismo modal; la
pata de transferencia se muestra de solo lectura ("no se puede editar, borrala
y volvé a cargarla") y el reparto se abre completamente editable. Lo único que
las separa en la lista es la descripción ("Transferencia a «Efectivo»" vs.
"Reparto entre cuentas"), que es texto secundario.

### 5.2 Editar una fila de un conteo — ROMPE

Es la pregunta que hiciste sobre las filas nuevas del neteo, y es el hallazgo
más serio del informe después del de la sección 1.

Abrí un "Ajuste de saldo" o un "Reparto entre cuentas" y mirá el campo
Categoría: **está en blanco**. El formulario arma sus opciones con

```
categories.filter(cat => cat.kind === kind && !cat.is_system)
```

y el `value` del `<select>` es el id de una categoría de sistema, que no está en
la lista: ninguna opción coincide, el control queda vacío. Al mismo tiempo,
`missing` no lo reclama (`categoryId` tiene valor), así que **"Guardar" está
habilitado**. Guardar sin tocar nada deja la fila idéntica —eso funciona—, pero
el campo vacío es una invitación a elegir algo, y elegir algo tiene
consecuencias que la pantalla no anuncia:

- **Cambiarle la categoría a un reparto lo convierte en un gasto o ingreso
  real.** Los totales del mes suben por plata que nunca entró ni salió. Es
  exactamente el bug que la migración 0041 vino a arreglar, reintroducido a
  mano, una fila por vez.
- **Cambiarle el monto a un reparto rompe la aritmética del conteo.** Los
  repartos de una moneda suman cero a propósito (ADR-016); con uno cambiado,
  las cuentas dejan de quedar en lo que declaraste y el desglose del disponible
  empieza a mentir en silencio.
- **Cambiarle la cuenta lo muda a otra cuenta**, con el mismo efecto.
- **Cambiar Gasto↔Ingreso** limpia la categoría (ahí sí `changeKind` la borra
  por no coincidir el `kind`) y obliga a elegir una de usuario: el reparto se
  convierte en un movimiento real, sin vuelta.

Lo que sí está bien resuelto es el **borrado**: `getReconciliationOf` reconoce
que la fila es parte de un conteo, el modal lo dice antes de tocar nada ("Esto
lo escribió «Contar mi plata» el …, junto con N movimientos más. Se sostienen
entre sí, así que se borran juntos") y `delete_reconciliation` (0042) se lleva
el conteo entero. **La edición tiene el mismo diagnóstico disponible y no lo
usa**: el mismo `reconciliation` que habilita el texto y el botón rojo podría
poner la fila de solo lectura, igual que ya hace `isTransferPart` con las patas
de una transferencia. El precedente existe, el dato ya está cargado, y es la
misma regla ("estas piezas no se sostienen por separado").

### 5.3 Una inversión que no es una inversión y no lleva a ningún lado — ROMPE

Verificado con datos reales en la cuenta de prueba (septiembre 2026): hay una
`contribution` a un activo que la migración 0038 convirtió en cuenta de ahorro.
En la lista se ve así:

- dice **"Inversión · *nombre del activo*"** (`contributionLabel` solo mira
  `direction`),
- **cuenta en "Ahorrado"**, no en "Invertido" (`monthTotals` sí mira
  `asset.savings_account_id`),
- y su chevrón apunta a `/inversiones/:assetId`, donde **`AssetDetail` no
  encuentra el activo** —`getAssets()` filtra `is_archived = false` y la 0038
  los archivó— y redirige a `/inversiones` con un `<Navigate replace>`.

O sea: la etiqueta dice una cosa, el total dice otra, y tocarla te deja en la
lista de inversiones sin ninguna explicación. Lo mismo le pasa a los aportes de
**cualquier activo archivado** que caiga en el mes navegado, no solo a los
migrados.

### 5.4 Un conteo puede aumentar tu ahorro sin que "Ahorrado" se entere — ROMPE

"Ahorrado" cuenta una transferencia cuando exactamente una de sus dos patas cae
en una cuenta de ahorro, y para aparear las patas necesita `transfer_id`. Los
repartos de un conteo **no llevan `transfer_id`** (lo comenta `savedByCurrency`
con precisión: "queda afuera solo, sin una regla aparte").

El caso concreto: contás tu plata, declarás menos en Efectivo y más en tu
cuenta de ahorro en pesos, el neto de la moneda da cero. La 0041 escribe dos
repartos que se compensan; los saldos quedan perfectos. Pero lo que realmente
pasó es que moviste plata del bolsillo al ahorro sin registrarlo, y el renglón
"Ahorrado" del mes —cuya única función es medir exactamente eso— no se mueve.

Es defendible como consecuencia de ADR-016 ("el reparto no cuenta en ninguna
estadística") y es, al mismo tiempo, un número que queda corto. Vale la pena
decidirlo explícitamente en vez de heredarlo.

### 5.5 Una transferencia se lee como dos movimientos — INCOMODA

Las dos patas están en el mes, así que la lista muestra `−$X` en la cuenta de
origen y `+$X` en la de destino, las dos con color de gasto y de ingreso (ver
3.2). Una sola operación ocupa dos renglones que se leen como actividad real.
Con el neteo de un conteo pasa lo mismo, multiplicado por la cantidad de
cuentas declaradas: un conteo de cuatro cuentas puede dejar hasta cuatro filas
de reparto más el ajuste.

### 5.6 "En qué se fue" y "Gastos del mes" de Inicio (H12) — INCOMODA

Buena noticia: **ya usan el mismo criterio.** Desde el neteo, `getExpenses`
(Inicio) y `groupExpensesByCategory` (Movimientos) filtran las dos con
`isMovedMoney` e incluyen el ajuste de saldo. La contradicción que documentaba
el informe del 12-09 está resuelta.

Quedan dos diferencias chicas, ninguna rompe nada:

- **El rango.** Inicio pide `to: today`; Movimientos toma el mes calendario
  completo. Un movimiento con fecha futura dentro del mes en curso aparece en
  uno y no en el otro.
- **La unidad.** Inicio, para comparar doce meses, convierte a dólares
  (`monthlyUsdTotals`); Movimientos nunca convierte. Es deliberado (ADR-015) y
  está bien, pero explica por qué los dos números del mismo mes pueden no
  coincidir si hay gastos en dos monedas.

Lo que sí conviene decidir es H12 en su forma original: dos desgloses por
categoría del mismo mes en dos pantallas, que van a divergir apenas alguno
crezca.

### 5.7 Varias monedas en el mismo mes — INCOMODA (sano)

Es de lo mejor resuelto de la pantalla y lo verifiqué: los cinco totales son
listas por moneda (`currencyLines`), el desglose se parte por moneda con
encabezado solo cuando hay más de una, y `monthTotals` nunca suma pesos con
dólares. Dos cosas menores:

- Un total en **cero** se muestra igual en la moneda local (es lo que vi en la
  cuenta de prueba: `Gastos $0` con toda la actividad del mes en dólares). No
  miente, pero un mes entero de movimientos en dólares se lee como un mes
  vacío hasta que mirás bien.
- El filtro de tipo y el de categoría no tienen equivalente por moneda: no hay
  forma de ver "solo lo de la cuenta en dólares". La pantalla tampoco filtra
  por cuenta (H7 ya lo señalaba desde el otro lado).

### 5.8 Detalles sueltos

- **INCOMODA** — El selector de categorías ofrece las categorías **ocultas**
  no, pero sí todas las activas aunque no tengan ni un movimiento en el mes
  navegado: una lista larga donde casi todo da vacío.
- **INCOMODA** — Al editar cualquier movimiento anterior a la última vez que se
  contó esa cuenta, aparece el aviso "te conviene volver a contarla" sin un
  camino para hacerlo. Es H10 y sigue abierto; ahora que "Contar mi plata" está
  a un toque en `/plata`, el link es casi gratis.
- **INCOMODA** — `getTransactions` no pagina. Un mes con más de 1000
  movimientos se cortaría en silencio (el mismo corte de PostgREST que motivó
  `get_liquid_by_account`). Improbable en un mes, pero es la misma clase de bug
  que ya mordió una vez.

---

## 6 · Por dónde empezar

Empezaría por lo que no se ve: **darle al "tipo de movimiento" un solo lugar en
el código antes de tocar un pixel de la pantalla.** Hoy la pregunta "¿qué es
esta fila?" se responde en cuatro lados con cuatro criterios parciales
—`monthTotals`, `savedByCurrency`, el `switch` de filas de `Movements.jsx` y
`groupExpensesByCategory`—, y todos los problemas que rompen números en este
informe salen de ahí: el reparto verde es el color pintando por tabla en vez de
por significado, el filtro "Gastos" que no suma el total de Gastos es el mismo
desacuerdo, y el reparto editable es un cuarto lugar que ni siquiera se hace la
pregunta. Una función `movementType(fila)` que devuelva uno de los siete tipos
de 3.1 —del mismo tamaño y con el mismo rol que `isMovedMoney`, que ya probó
que este patrón funciona— convierte tres de los cambios que querés en
consecuencias de una línea: el color deja de mirar `kind`, el filtro deja de
mirar `kind`, y la fila sabe si es editable. Con eso hecho, el orden natural es
corregir el color (una fila de código, y el caso que abrió este informe deja de
confundir), bloquear la edición de las filas de un conteo reusando el
`reconciliation` que el modal ya carga, y recién ahí encarar el filtro por
totales, que es el único de los cuatro que necesita diseño y no solo criterio.
