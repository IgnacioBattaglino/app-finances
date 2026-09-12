# Arquitectura de información y flujo de navegación — app-finances

Relevamiento de las pantallas de la app, análisis de dónde quedó cada acción y
propuesta de reorganización. Fuente: recorrida completa de la app en el
navegador (mobile 390 × 844 y desktop 1440 × 900) con la cuenta de prueba, sobre
la versión 0.9.1, contrastada con el código de `src/App.jsx`,
`src/components/Layout.jsx` y las pantallas de `src/pages/`.

Fecha del relevamiento: 2026-09-10.

**Alcance.** Es un documento de estructura y flujo: dónde vive cada cosa y
cuántos toques cuesta llegar. No propone features nuevas —todo lo que aparece en
la propuesta existe hoy y solo cambia de lugar— ni toca la estética (colores,
tipografía, tarjetas), que son decisiones ya tomadas y documentadas en
`CLAUDE.md`. El inventario campo por campo de los formularios está en
`form-inventory.md`, que este documento no repite.

---

## 1. Relevamiento

### 1.1 Las rutas

| Ruta | Pantalla | Qué se puede hacer ahí | Se llega desde |
|---|---|---|---|
| `/` | Inicio | Ver disponible, ahorrado, invertido, deudas y Total · curva del portafolio · gastos del mes · **cargar un gasto** (FAB) | Pestaña 1 |
| `/movimientos` | Movimientos | Listar el mes · totales · filtrar por tipo y categoría · cargar, editar y eliminar un movimiento | Pestaña 2 |
| `/portafolio` | Portafolio | Ver activos por grupo · nuevo activo · actualizar valuaciones (masivo) · ordenar · ver archivados | Pestaña 3 |
| `/portafolio/:assetId` | Detalle de activo | Aportar · Retirar · Transferir · Liquidar · Actualizar valuación · editar el activo · historial | Portafolio |
| `/objetivo` | Objetivo | Nada: "Todavía en construcción" | Pestaña 4 |
| `/deudas` | Deudas | Ver saldo · nueva deuda · registrar pago · editar deuda y pago · ver saldadas | Pestaña 5 |
| `/ajustes` | Ajustes | Índice de seis filas | Pestaña 6 |
| `/ajustes/apariencia` | Apariencia | Tema claro/oscuro/automático · color de la app | Ajustes |
| `/ajustes/categorias` | Categorías | Listar por tipo · crear · reordenar · eliminar | Ajustes |
| `/ajustes/categorias/:categoryId` | Detalle de categoría | Renombrar · eliminar | Categorías |
| `/ajustes/cuentas` | Cuentas | **Contar mi plata** (reconciliar) · **Transferir entre cuentas** · ver el saldo de cada cuenta · ver el ahorro · crear · reordenar · eliminar | Ajustes · Inicio |
| `/ajustes/cuentas/:accountId` | Detalle de cuenta | Renombrar · moneda · marcar como ahorro · **ver el extracto de la cuenta** · **Aportar / Retirar** (si es de ahorro) · eliminar | Cuentas |
| `/ajustes/grupos` | Grupos de activos | Listar · crear · ver archivados | Ajustes · Portafolio |
| `/ajustes/grupos/:assetTypeId` | Detalle de grupo | Renombrar · ver sus activos · orden en Portafolio · color · cuenta en el total · rendimiento por default · archivar | Grupos · Portafolio |
| `/ajustes/exportar` | Exportar mis datos | Descargar dos CSV | Ajustes |
| `/ajustes/cuenta` | Cuenta | Ver el email · cerrar sesión | Ajustes |

Más `/login` y `/nueva-contrasena`, fuera de la app logueada.

### 1.2 Cuánto cuesta cada acción

Toques desde que abre la app (que abre en Inicio) hasta tener el formulario
delante. No cuenta llenar el formulario ni guardar.

| Acción | Camino más corto | Toques | Frecuencia real |
|---|---|---|---|
| Cargar un gasto | Inicio → FAB "+" | 1 | diaria |
| Ver cuánto tengo | ya está en Inicio | 0 | diaria |
| Cargar un ingreso | Inicio → FAB → segmento "Ingreso" | 2 | mensual |
| Ver los movimientos del mes | pestaña Movimientos | 1 | semanal |
| Contar mi plata (reconciliar) | Inicio → tarjeta Disponible → Contar mi plata | 2 | mensual |
| Ver el extracto de una cuenta | Inicio → tarjeta Disponible → la cuenta | 2 | mensual |
| Transferir entre cuentas | Inicio → tarjeta Disponible → Transferir | 2 | mensual |
| Aportar a una cuenta de ahorro | Inicio → tarjeta Ahorrado → la cuenta → Aportar | 3 | mensual |
| Crear una cuenta con moneda o de ahorro | Ajustes → Cuentas → Nueva cuenta | 3 | al arrancar |
| Aportar a un activo | Portafolio → el activo → Aportar | 2 | mensual |
| Nuevo activo | Portafolio → Nuevo activo | 2 | esporádica |
| Renombrar un grupo de activos | Portafolio → encabezado del grupo (salta a Ajustes) | 2 | esporádica |
| Registrar un pago de deuda | Deudas → Registrar pago | 2 | mensual |
| Exportar los datos | Ajustes → Exportar mis datos | 2 | rara |
| Cambiar el tema | Ajustes → Apariencia | 2 | una vez |

El número de toques casi nunca es el problema: lo es **por dónde pasan**. Varias
de estas filas llegan rápido porque el atajo cruza a Ajustes, y el camino que el
usuario esperaría —entrar por la pestaña— cuesta uno más.

---

## 2. Análisis

Doce hallazgos, ordenados por cuánto le cuestan al usuario.

### H1 — La plata líquida vive adentro de Ajustes

La tarjeta más grande de Inicio, "Dinero disponible", navega a
`/ajustes/cuentas` (lo mismo "Dinero ahorrado"). Y esa pantalla no es una lista
de configuración: es el centro de operaciones de la plata del día a día. Contar
la plata, transferir entre cuentas, ver el saldo de cada una, entrar al extracto
de una cuenta, aportar o retirar del ahorro — todo eso pasa dos o tres niveles
adentro de la pestaña que se abre para cambiar el tema.

**Contar mi plata tiene un único punto de entrada en toda la app:** el botón
dentro de `/ajustes/cuentas` (`LiquidModal` se monta solo ahí). Es una operación
recurrente y no existe en ningún otro lado.

En desktop el problema se lee crudo: mientras el usuario opera con su plata, la
pestaña marcada en la columna lateral dice **Ajustes**.

### H2 — De las seis filas de Ajustes, una sola es un ajuste

Apariencia es un ajuste. Categorías, Cuentas y Grupos de activos son gestión de
entidades —cosas que el usuario crea, nombra y ordena, con saldos y movimientos
adentro—. Exportar es una acción. Cuenta es la sesión. El propio índice lo
reconoce al agrupar cuatro filas bajo "Tus datos": si son tus datos, no son
ajustes de la app.

### H3 — Objetivo ocupa un sexto de la navegación y no responde nada

En el celular la barra inferior es el recurso más escaso de la app: seis
destinos, al alcance del pulgar, visibles siempre. Uno dice "Todavía en
construcción". No es un costo de una vez: es un sexto del ancho de la barra, en
cada pantalla, a cambio de nada.

Contrasta con el criterio que la app ya aplica en Inicio, donde la tarjeta de
Deudas desaparece si no hay deudas cargadas porque "un US$ 0 permanente es
ruido". La barra no aplica esa misma regla a una pantalla sin contenido.

### H4 — Los grupos se tocan desde Portafolio y se editan en Ajustes

En Portafolio, el encabezado de cada grupo es un link a
`/ajustes/grupos/:assetTypeId`. Ahí adentro hay una lista de los activos del
grupo que devuelve a `/portafolio/:assetId`. El recorrido entra por Portafolio,
sale a Ajustes y vuelve a Portafolio sin que el usuario haya pedido ir a Ajustes
en ningún momento, y la barra de pestañas cambia de sección en el medio.

El síntoma más claro es que el formulario de alta de activo tiene que explicar
por escrito dónde está lo demás: *"Renombrar y archivar grupos: en Ajustes"*.
Cuando un formulario necesita dar indicaciones de dónde queda algo, el mapa está
mal.

### H5 — Hay dos formas de crear una cuenta y no hacen lo mismo

En el formulario de un movimiento, el selector de cuenta ofrece "+ Nueva cuenta"
(`AccountField` + `AccountCreateForm`) — el patrón correcto: la cuenta nace
cuando aparece la plata. Pero ese atajo crea siempre una cuenta **en pesos** y
**de uso diario**: `AccountCreateForm` solo muestra moneda y tipo con la prop
`extended`, que pasa únicamente Ajustes → Cuentas.

Las dos entradas se llaman igual y ofrecen poderes distintos sin decirlo. Quien
crea "Dólares en casa" desde el atajo se lleva una cuenta en pesos y no se
entera hasta que los números no cierran.

### H6 — "Cuentas" y "Cuenta" son dos cosas distintas en la misma lista

En Ajustes, "Cuentas" son las billeteras y el efectivo; "Cuenta", tres filas más
abajo, es el usuario y el botón de cerrar sesión. La única diferencia es una
*s*. Para alguien que abre la app por primera vez no hay forma de saber cuál es
cuál sin entrar a las dos.

### H7 — El detalle de una cuenta hace tres trabajos y arranca por el menos importante

`AccountDetail` es, en este orden: un formulario de configuración (nombre,
moneda, si es de ahorro), después el saldo, después el extracto completo, y al
final las operaciones (Aportar, Retirar) y el borrado. El usuario que entra
viene de tocar un saldo en Inicio: viene a ver plata, y lo primero que encuentra
es un campo de texto con el nombre de la cuenta.

Ese extracto es, además, la segunda lista de movimientos de la app, y la única
forma de verla es entrando ahí: Movimientos no filtra por cuenta.

### H8 — Movimientos mezcla dos tipos de fila, y le faltan unos cuantos

En la lista conviven gastos e ingresos —que abren el editor, con un lapicito—
con aportes y retiros de inversión —que sacan al usuario de Movimientos hacia el
detalle del activo, con un chevrón—. Son dos afordancias distintas en filas que
se ven casi iguales.

En el otro sentido: los movimientos de las cuentas de ahorro **no aparecen** en
esta pantalla (`getTransactions` los excluye), aunque son gastos e ingresos
reales con su categoría. La pestaña se llama "Movimientos" y no los tiene, y no
hay forma de darse cuenta desde la pantalla.

> **Resuelto (C6).** `getTransactions` ya no excluye nada: los movimientos de
> las cuentas de ahorro aparecen en la lista, con chevrón al detalle de su
> cuenta (mismo patrón que una inversión, y por el mismo motivo — el formulario
> de esta pantalla no ofrece cuentas de ahorro, así que editarlos acá podría
> mudarlos). No cuentan como gasto ni como ingreso: tienen su propio renglón,
> "Ahorrado", al lado de "Invertido" y con el mismo criterio. Queda abierta la
> primera mitad del hallazgo: las tres afordancias (lápiz, chevrón a un activo,
> chevrón a una cuenta) siguen viviendo en filas parecidas.

### H9 — "Eliminar" está al nivel de la lista, junto al saldo

En Cuentas, cada fila muestra el nombre, el saldo y un "Eliminar" rojo en la
misma línea tocable. En Categorías, lo mismo (ocho "Eliminar" en una pantalla
que se abre para reordenar). La app ya tiene el lugar correcto: el detalle de
cada una, donde el botón al pie ya existe. Tenerlo en los dos lados duplica el
riesgo sin agregar nada — la lista es para leer saldos, no para borrar.

### H10 — La app dice qué hacer, pero no lleva

Al editar un movimiento anterior a la última reconciliación aparece un aviso muy
bien redactado: *"te conviene volver a contarla después de guardar"*. No hay
forma de hacerlo desde ahí. Hay que cerrar el modal, salir de Movimientos,
entrar a Ajustes, entrar a Cuentas y buscar "Contar mi plata" — y acordarse, en
el camino, de para qué se iba.

### H11 — El filtro de categorías muestra opciones idénticas repetidas

En Movimientos, el desplegable "Todas las categorías" lista "Ajuste de saldo"
dos veces y "Movimiento de ahorro" dos veces —una por gasto y otra por ingreso—.
Para el usuario son filas indistinguibles, y elegir cualquiera de las dos da un
resultado a medias.

### H12 — Hay dos resúmenes de gastos del mes, en dos pantallas

Inicio tiene el bloque "Gastos del mes" con su gráfico; Movimientos tiene "En
qué se fue" con las categorías del mes. Responden la misma pregunta de dos
formas. No es grave —Inicio resume y Movimientos detalla— pero conviene decidir
cuál manda antes de que crezcan por separado.

### Lo que está bien y no hay que tocar

- **El gasto en un toque.** FAB en Inicio, formulario de cinco campos, el monto
  enfocado. La acción más frecuente es la más barata de la app. Todo lo demás de
  la propuesta está subordinado a no romper esto.
- **El alta al vuelo de categoría y cuenta** dentro del formulario (arreglando
  H5). Es exactamente el patrón correcto: la entidad nace donde se la necesita.
- **Deudas.** Todo lo que se puede hacer con una deuda está en la pantalla de
  Deudas. Es la única sección que no manda al usuario a otro lado.
- **El detalle de activo.** Las dos acciones frecuentes (Aportar, Retirar) en
  una barra fija; las tres esporádicas (Transferir, Liquidar, Actualizar
  valuación) en una tarjeta con una línea de explicación cada una. La jerarquía
  por frecuencia está bien resuelta.
- **Los textos.** "Contar mi plata", "¿De qué cuenta?", "Te queda por pagar",
  "Falta: monto y categoría". El UX writing está por encima de la arquitectura:
  el problema no es cómo se nombran las cosas sino dónde están.

---

## 3. Propuesta

### 3.1 El criterio

1. **La barra nombra dónde está la plata, no los módulos del código.** La app
   tiene tres mundos declarados —disponible, invertido, deudas— y la barra hoy
   nombra dos y medio: "Portafolio" y "Deudas" sí, pero el disponible no tiene
   pestaña, y en su lugar hay una pestaña vacía.
2. **Ajustes es solo lo que no es plata.** Si adentro hay un saldo, un
   movimiento o una operación, no es un ajuste.
3. **Cada entidad se gestiona donde se la usa.** Los grupos, en Portafolio. Las
   cuentas, en la pestaña de la plata. Las categorías se quedan en Ajustes
   porque son lo único que se configura una vez y no tiene saldo.
4. **Nada nuevo.** Cada pantalla de la propuesta existe hoy. Ninguna se parte en
   dos y una se elimina.

### 3.2 La barra

Hoy, seis pestañas:

    Inicio · Movimientos · Portafolio · Objetivo · Deudas · Ajustes

Propuesta, cinco:

    Inicio · Movimientos · Mi plata · Inversiones · Ajustes

Cada una responde una pregunta: cuánto tengo · qué entró y qué salió · dónde
está y qué debo · qué tengo invertido · la app.

"Mi plata" no es una pantalla nueva: es `/ajustes/cuentas` subida de nivel.
"Inversiones" es Portafolio con un nombre que no es jerga — la palabra
"portafolio" asume que el lector ya sabe de qué se trata, y el norte del
proyecto es que lo entienda alguien que arranca de cero (ver 3.5, decisión 3).

### 3.3 El mapa nuevo

**Inicio** — `/`
Igual que hoy, con una sola corrección: los chevrones apuntan a donde
corresponde.
- Dinero disponible · ahorrado · invertido · deudas · Total
- Curva del portafolio y gastos del mes
- FAB: nuevo gasto — intacto
- Disponible y Ahorrado ahora llevan a **Mi plata**, no a Ajustes

**Movimientos** — `/movimientos`
Sin cambios de estructura. Queda abierta la decisión 2 sobre los movimientos de
ahorro.

**Mi plata** — `/plata`
Es la pantalla que hoy es Ajustes → Cuentas, tal cual, como pestaña.
- **Contar mi plata** — reconciliación, ahora a un toque
- **Transferir entre cuentas**
- Las cuentas del día a día, con su saldo
- Las cuentas de ahorro, con su saldo
- Nueva cuenta — con moneda y tipo, igual que el atajo del formulario
- **Deudas**, como tercer bloque: cuánto queda por pagar (decisión 1)

**Detalle de cuenta** — `/plata/:accountId`
La misma pantalla, con el orden dado vuelta: primero la plata, después la
configuración.
- Saldo y extracto de la cuenta, arriba
- Aportar / Retirar (ahorro), arriba
- Nombre, moneda, si es de ahorro — abajo, como ajustes de esa cuenta
- Eliminar, al pie

**Inversiones** — `/inversiones` (era Portafolio)
Lo mismo que hoy, más la gestión de grupos que hoy está en Ajustes.
- Total invertido, aportado y rendimiento
- Activos por grupo · Nuevo activo · Actualizar valuaciones · orden · archivados
- El encabezado de un grupo entra a su detalle acá, sin salir de la sección

**Detalle de activo** — `/inversiones/:assetId`
Sin cambios. La jerarquía por frecuencia ya está bien resuelta.

**Detalle de grupo** — `/inversiones/grupos/:assetTypeId`
La misma pantalla que hoy vive en `/ajustes/grupos/:assetTypeId`.

**Ajustes** — `/ajustes`
Tres filas y un pie. Todo lo que queda es realmente un ajuste.
- Apariencia — tema y color
- Categorías — con qué se etiquetan los movimientos
- Exportar mis datos
- Al pie, sin pantalla propia: el email, Cerrar sesión y la versión

### 3.4 Qué se mueve y por qué

| Qué | De | A | Por qué |
|---|---|---|---|
| Cuentas, ahorro, contar, transferir | `/ajustes/cuentas` | pestaña **Mi plata** | Es el destino de la tarjeta más grande de Inicio y el segundo lugar más visitado. No es configuración: es plata. |
| Grupos de activos | `/ajustes/grupos` | **Inversiones** | Ya se entra desde Portafolio. Elimina el salto a Ajustes y la línea de ayuda que hoy tiene que explicarlo. |
| Deudas | pestaña propia | bloque en **Mi plata** | Una pestaña entera para una lista que casi siempre tiene cero o una fila. "Lo que tengo y lo que debo" es una sola pregunta. |
| Email y cerrar sesión | `/ajustes/cuenta` | pie de **Ajustes** | Dos datos no justifican una pantalla, y elimina la colisión "Cuentas" / "Cuenta". |
| Objetivo | pestaña propia | fuera de la barra | Está vacía. Vuelve el día que tenga el número adentro; hasta entonces cuesta un sexto de la navegación. |
| "Eliminar" de las filas | listas de Cuentas y Categorías | solo el detalle | El botón ya existe en el detalle. En la lista solo agrega riesgo. |
| Alta de cuenta del formulario | versión recortada | la misma que en Mi plata | Dos entradas con el mismo nombre tienen que hacer lo mismo, o la de abajo es una trampa. |
| Aviso "volvé a contarla" | texto suelto | texto + acción | Si la app sabe qué hay que hacer, que lleve. Es un link a Contar mi plata, que pasa a estar a un toque. |

### 3.5 Qué mejora, en toques

| Acción | Hoy | Propuesta |
|---|---|---|
| Contar mi plata | 2 desde Inicio · 3 por la barra | 2 desde Inicio · **2** por la barra, y fuera de Ajustes |
| Ver el extracto de una cuenta | 2 · 3 | 2 · **2** |
| Crear una cuenta en dólares | 3 | **2**, o desde el formulario sin recorte |
| Renombrar un grupo | 2, con salto a Ajustes | 2, **sin salto** |
| Volver a contar después de editar | 4 y de memoria | **1**, desde el aviso |
| Cargar un gasto | 1 | 1 — intacto, a propósito |

### 3.6 Qué cuesta

Es re-parenteo, no reescritura. Las pantallas que se mudan (`Accounts`,
`AccountDetail`, `AssetTypes`, `AssetTypeDetail`) cambian de ruta y de
encabezado, no de contenido. `SettingsHome` pierde tres filas y gana un pie.
`Account` desaparece. `Layout` cambia su lista de pestañas.

Las rutas viejas conviene dejarlas redirigiendo: son links que ya existen en el
código (Inicio, Portafolio y varios avisos apuntan a ellas) y la app es una PWA
instalable, así que alguien puede tener una guardada.

### 3.7 La regla, en una línea

> Si una pantalla muestra un saldo, un movimiento o un botón que mueve plata, no
> puede estar adentro de Ajustes.

Aplicada sola, esa regla produce exactamente esta propuesta.

---

## 4. Decisiones abiertas

Estas tres no están resueltas: cambian el resultado y dependen de cómo tiene que
crecer la app, no de lo que se ve en la pantalla.

### 1 · Deudas adentro de "Mi plata", o pestaña propia

Meterla adentro deja la barra en cinco y agrupa "lo que tengo y lo que debo",
que es como piensa alguien que arranca de cero.

En contra: el proyecto tiene declarado que los tres mundos nunca se mezclan
(`FUNCTIONAL.md`, y el comentario de `SummaryCard` en `Dashboard.jsx`). Agrupar
en una pestaña no es sumar, pero es un paso en esa dirección.

La alternativa es dejar Deudas como pestaña y quedarse en seis — pero entonces
Objetivo tiene que salir igual.

### 2 · Los movimientos de ahorro, ¿entran a Movimientos?

Hoy no aparecen ahí, solo en el extracto de su cuenta. Es defendible —no son
gastos del día a día y ensuciarían los totales del mes— pero entonces la pestaña
"Movimientos" no contiene todos los movimientos, y no hay forma de darse cuenta
desde la pantalla.

Una salida sin agregar nada: que el extracto de la cuenta sea el único lugar, y
que Movimientos diga en una línea que el ahorro se ve en su cuenta.

### 3 · "Portafolio" o "Inversiones"

"Portafolio" es la palabra correcta para quien ya sabe, y la que usa toda la
documentación del proyecto. "Inversiones" es la que entiende alguien que nunca
invirtió.

Es un cambio de una sola palabra y no obliga a tocar ninguna ruta. Entra en la
propuesta porque el criterio declarado del proyecto es el segundo lector, no el
primero.
