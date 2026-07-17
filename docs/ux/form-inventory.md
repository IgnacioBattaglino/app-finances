# Relevamiento de formularios — app-finances

Estado actual, exhaustivo, de todos los formularios y modales de la app. Fuente: código en `src/components/*Modal.jsx`, `src/components/CategoriesSection.jsx`, `src/pages/Login.jsx` y las pantallas que los abren (`Movements.jsx`, `Portfolio.jsx`, `Dashboard.jsx`, `Settings.jsx`). Documento solo descriptivo — no propone mejoras; es el insumo para el rediseño de usabilidad.

---

## 1. TransactionFormModal (nuevo/editar movimiento)

**Archivo:** `src/components/TransactionFormModal.jsx`

### Flujo de apertura
- Desde **Movimientos** (`Movements.jsx`): botón flotante "+" (sin label, esquina inferior derecha) → crear (`initial=null`); o tocando una fila del historial → editar (`initial=tx`).
- Desde **Inicio/Dashboard** (`Dashboard.jsx`): botón flotante "+ Gasto" (con label) → crear con `defaultKind="expense"`.
- Props recibidas: `open`, `initial`, `defaultKind`, `onClose`, `onSaved`, `onDeleted`.
- Qué NO sabe al abrir: las categorías se cargan recién al abrirse (`getCategories()` en el `useEffect`) — no las recibe como prop de la pantalla que ya las tiene cargadas (Movements ya tiene `categories` en su propio estado, pero el modal las vuelve a pedir por su cuenta).

### Inventario de campos (orden visual)
1. **Segmentado Gasto/Ingreso** (arriba del todo, fuera de la tarjeta de campos): dos botones "Gasto" / "Ingreso". Obligatorio (siempre hay uno seleccionado). Default: `defaultKind` ('expense'). Al cambiar, si la categoría elegida no es del nuevo tipo, se resetea (`categoryId=''`).
2. **Monto** — label "Monto", input con prefijo "$", `inputMode="decimal"`, placeholder "0", `autoFocus`, obligatorio.
3. **Categoría** — label "Categoría", `<select>`, opción placeholder "Elegir…" (disabled), opciones filtradas por `kind`. Obligatorio.
4. **Fecha** — label "Fecha", `<input type="date">`, default `todayISO()`. Obligatorio.
5. **Descripción** — label "Descripción", input libre, placeholder "Opcional". Opcional.

### Validaciones y guards
- Submit deshabilitado si: falta fecha, falta categoría, o `amountValue <= 0` (acepta coma o punto decimal).
- Sin validaciones de rango superior ni de fecha futura/pasada.
- Error de guardado: `"No se pudo guardar el movimiento. " + e.message` (texto crudo del backend concatenado).
- Error de carga de categorías: `"No se pudieron cargar las categorías. " + e.message`.
- Eliminar (solo en edición): botón "Eliminar movimiento" → confirmación inline "¿Eliminar este movimiento?" con "No" / "Sí, eliminar"; error: `"No se pudo eliminar el movimiento. " + e.message`.

### Al guardar
- Crea (`createTransaction`) o actualiza (`updateTransaction`) según `editing = Boolean(initial?.id)`.
- Al guardar u borrar, la pantalla que lo abrió refresca movimientos del mes navegado y las estadísticas del mes en curso (`load()` + `loadMonthStats()` en Movements), y **cierra el modal**.
- En Dashboard, `onSaved` solo cierra el modal (no hay nada más que refrescar todavía, esa pantalla no muestra datos).

### Variantes crear vs. editar
- Título: "Nuevo movimiento" / "Editar movimiento".
- Monto: vacío en alta, prellenado con `String(initial.amount_ars)` en edición.
- Solo en edición aparece el botón "Eliminar movimiento".
- El segmentado Gasto/Ingreso está siempre visible en ambos modos (a diferencia de ContributionFormModal, que lo oculta en edición).

---

## 2. ContributionFormModal (aporte / retiro / transferencia)

**Archivo:** `src/components/ContributionFormModal.jsx`

Es el formulario más complejo de la app: un solo componente resuelve tres operaciones (aporte, retiro, transferencia entre activos) con copy espejado (objeto `COPY`).

### Flujo de apertura
- Desde **Portafolio**: botón flotante "+ Aporte" → crear, `mode` default `'contribution'`.
- Tocando una fila de aporte/retiro dentro de un activo expandido (`AssetGroup` → `AssetRow` → "Aportes (n)") → editar; el modo se infiere de `initial.direction === 'out'`.
- Props: `open`, `initial`, `assets`, `valuations`, `contributions`, `onClose`, `onSaved`, `onDeleted`. Recibe `assets`/`valuations`/`contributions` ya cargados por Portfolio — no vuelve a pedirlos.
- Qué NO sabe al abrir: no recibe el líquido actual ni ningún dato de Movimientos; el toggle "va al líquido" es ciego a si el usuario efectivamente tiene ese dinero disponible.

### Inventario de campos (orden visual)

| # | Campo | Control | Condición | Obligatorio | Default |
|---|---|---|---|---|---|
| 1 | Segmentado **Aporte / Retiro** | 2 botones | Solo si `!editing` | — | `'contribution'` |
| 2 | **Activo** | `<select>` | siempre | Sí | `initial?.asset_id ?? assets[0]?.id` |
| 3 | **Fecha** | `<input type="date">` | siempre | Sí | `todayISO()` |
| 4 | **Va por MEP** | toggle (switch) | siempre | — | `true` (siempre arranca en `true`, incluso al editar un registro que uso "cambio manual" — ver deuda de UX) |
| 5a | **Monto** (si "Va por MEP") | segmentado ARS/USD + input decimal | | Sí | placeholder "0" |
| 5b | Nota de conversión | texto | solo si `currency==='ars'` y hay monto y MEP | — | — |
| 6 | **Dólar MEP** | input decimal | si "Va por MEP" | Sí | autocompletado con cotización del día si `!editing`; deshabilitado mientras `mepLive` es truthy |
| 7a | **Pesos invertidos/recibidos** (si "cambio manual") | input decimal | si NO "Va por MEP" | Sí | placeholder "0" |
| 7b | **Dólares recibidos/vendidos** (si "cambio manual") | input decimal | si NO "Va por MEP" | Sí | placeholder "0" |
| 7c | Nota "Tipo de cambio: {derivado}" | texto | si NO "Va por MEP" | — | — |
| 8 | **Cantidad / Cantidad vendida** | input decimal | siempre visible | Obligatorio solo si el activo es `valuation_mode='live'` | placeholder "ej: 0,001" (live) / "Opcional" |
| 9 | Aviso "supera el valor" | texto (rojo) | solo retiro, si excede valuación | — | — |
| 10 | **Vendí/retiré todo este activo** | toggle | solo retiro | — | `false` |
| 10b | **Archivar el activo al guardar** | checkbox | solo si #10 activo | — | `true` |
| 11 | **Reinvertir en otro activo** | toggle | solo retiro y `!editing` | — | `false` |
| 11b | **Activo destino** | `<select>` | solo si #11 activo | Sí | placeholder "Elegir…" |
| 11c | **Cantidad en destino** | input decimal | solo si #11 activo | Obligatorio si destino es `live` | placeholder "ej: 0,001" / "Opcional" |
| 12 | **Ya lo tenía** / **Va al líquido** | toggle | oculto si `mode==='withdrawal' && reinvest` | — | `true` (aporte) / según `initial.affects_liquid` (edición) |

Todos los inputs de monto/cantidad usan `inputMode="decimal"` y aceptan coma decimal.

### Validaciones y guards
- `valid` exige: activo, fecha, (monto+MEP válidos si "va por MEP" o pesos+dólares válidos si manual), cantidad si el activo es de precio vivo, **no** exceder el valor cuando el guard bloquea, y si hay reinversión: destino distinto del origen y su cantidad si es de precio vivo.
- **Guard de retiro** (`withdrawalExceedsValue` + `withdrawalGuardBlocks`, en `lib/portfolio.js`): si la valuación del activo es confiable (`source` distinto de `'stale'`/`'none'`) y el monto del retiro supera el valor actual → **bloquea el submit**, mensaje: *"Este retiro supera el valor actual del activo ({valor})."* Si la valuación es `'stale'` (precio caído) o `'none'` (sin valuación) → **no bloquea**, solo avisa: *"Este retiro supera el último valor conocido del activo ({precio caído|sin valuación}) — no podemos confirmarlo con precisión, pero podés continuar."*
- Mensajes de error de guardado/borrado: `"No se pudo guardar el {aporte|retiro}. " + e.message` / `"No se pudo eliminar el {aporte|retiro}. " + e.message`.
- Confirmación de borrado (solo edición): *"¿Eliminar este {aporte|retiro}?"*, "No" / "Sí, eliminar".

### Al guardar
- Tres caminos según estado: `createTransfer` (retiro+reinversión, crea dos filas — retiro y aporte — vinculadas por `transfer_id`), `createWithdrawal`/`updateWithdrawal` (retiro simple), `createContribution`/`updateContribution` (aporte). Si "Vendí/retiré todo" y "Archivar el activo al guardar" están activos, además llama `archiveAsset(assetId)`.
- Redondeo a 2 decimales (`Math.round(x*100)/100`) solo en el camino de aporte; no en retiro/transferencia (inconsistencia menor de redondeo entre variantes).
- `onSaved` → Portfolio hace `refresh()`: cierra los tres modales de la pantalla y recarga todo (`load()`).

### Variantes crear vs. editar
- Título: "Nuevo aporte"/"Editar aporte" o "Nuevo retiro"/"Editar retiro" según `copy.title`.
- Segmentado Aporte/Retiro: **oculto en edición** (no se puede cambiar el tipo de un registro existente).
- "Reinvertir en otro activo": solo aparece en alta de retiro, nunca en edición.
- Al editar, `mepLive` se fuerza a `false` (el campo MEP queda editable y no se pisa con la cotización del día — es el valor congelado del registro).
- Moneda del monto: en alta arranca en `'ars'`; en edición arranca en `'usd'` (porque el dato guardado es `amount_usd`) — el toggle ARS/USD cambia de default silenciosamente entre modos.

### Deudas de UX conocidas
- El toggle "Va por MEP" siempre reinicia a `true` al abrir, incluso editando un registro que se cargó con "cambio manual" — se pierde la distinción de cómo se cargó originalmente.
- El mismo campo booleano tiene **lógica de encendido invertida** entre aporte y retiro: "Ya lo tenía" (ON = no afecta el líquido) vs. "Va al líquido" (ON = sí afecta el líquido) — la expresión `mode === 'withdrawal' ? affectsLiquid : !affectsLiquid` lo confirma en el código.
- Hasta 6 condicionales pueden apilarse en un único formulario (retiro + excede valor + vendí todo + archivar + reinvertir + destino), todo en una sola hoja plana sin agrupación visual ni pasos.
- El campo "Cantidad" es obligatorio solo si el activo es de precio vivo, pero no hay ninguna marca visual de "obligatorio" además del asterisco implícito del placeholder distinto.

---

## 3. AssetFormModal (crear/editar activo + gestión embebida de bolsas)

**Archivo:** `src/components/AssetFormModal.jsx`

Contiene, embebidos dentro del mismo formulario, tres mini-forms para gestionar bolsas (asset_types): crear, renombrar, gestionar (archivar/eliminar).

### Flujo de apertura
- Desde **Portafolio**: botón "Nuevo activo" (acción secundaria, o único CTA si el portafolio está vacío) → crear.
- Tocando el nombre de un activo (con ícono de lápiz) dentro de un grupo expandido → editar.
- Props: `open`, `initial`, `assetTypes`, `assets`, `onAssetTypesChanged`, `onClose`, `onSaved`, `onArchived`.

### Inventario de campos — formulario principal
1. **Nombre** — input, placeholder "ej: Bitcoin, Colchón USD", obligatorio.
2. **Bolsa** — `<select>` con todas las bolsas + opción "+ Nueva bolsa" (abre mini-form, ver abajo). Debajo, si hay bolsa seleccionada y ningún mini-form abierto: link "Renombrar" (con ícono de lápiz) y link "Gestionar bolsa" (subrayado punteado).
3. **Modo de valuación** — segmentado de 3 ("Aportado" / "Manual" / "Vivo"), con texto de ayuda permanente debajo según la opción activa:
   - Aportado: "Vale lo aportado; nunca pide carga de valor."
   - Manual: "Pedís el valor a mano cada tanto."
   - Vivo: "Precio automático por identificador — hoy solo cripto vía CoinGecko; el resto cae a carga manual."
4. **Ticker** — input, placeholder "Opcional, ej: AAPL". Opcional.
5. **CoinGecko ID** — solo si modo="Vivo". Input, placeholder "ej: bitcoin, ethereum". **Opcional incluso en modo vivo** (si se deja vacío, cae a valuación manual). Ayuda: "Hoy solo cripto resuelve precio automático (vía CoinGecko) con este ID; el resto cae a carga manual."
6. **Busca rendimiento** — toggle, default `true` (o `initial.yields !== false` en edición). Ayuda permanente: "Desactivalo para reservas de valor como efectivo: no cuentan en el % de rendimiento del portafolio."

### Mini-form: crear bolsa (al elegir "+ Nueva bolsa")
- Input "Nombre de la bolsa" (autofocus), toggle "Busca rendimiento (default)" (default `true`), botones "Cancelar" / "Crear bolsa" (label "Creando…" mientras busy). Al crear, selecciona automáticamente la nueva bolsa en el select principal.

### Mini-form: renombrar bolsa
- Input con el nombre actual (autofocus), botones "Cancelar" / "Guardar".

### Mini-form: gestionar bolsa
- Al abrir, pide conteo de activos (`countAssetsForType`): "Revisando…" mientras carga.
- Si tiene activos activos: mensaje bloqueante *"Esta bolsa tiene N activo(s) activo(s). Moveló(s) a otra bolsa o archivalo(s) antes de poder archivar o eliminar esta bolsa."* — sin acción posible.
- Si solo tiene activos archivados: *"Sin activos activos, pero tiene N archivado(s). Se puede archivar la bolsa."* + botón "Archivar bolsa".
- Si no tiene ningún activo: *"No tiene ningún activo. Se puede eliminar."* + botón "Eliminar bolsa".
- Siempre: link "Cerrar".

### Validaciones y guards
- `valid` = nombre no vacío + bolsa elegida + modo de valuación elegido. Ticker y CoinGecko ID nunca son obligatorios (ni siquiera en modo "Vivo").
- Errores: `"No se pudo guardar el activo. " + e.message"`, `"No se pudo archivar el activo. " + e.message"`, y errores propios de los mini-forms de bolsa (`bolsaError`, estado separado del formulario principal): `"No se pudo {crear|renombrar|archivar|eliminar} la bolsa. " + e.message"`.
- Archivar activo (solo edición): botón "Archivar activo" → confirmación inline "¿Archivar este activo?" con nota fija: *"Por ahora, restaurarlo solo se puede hacer desde la base de datos; la restauración desde la app queda pendiente."*

### Al guardar
- `createAsset`/`updateAsset` según `editing`. Si el modo no es "Vivo", `coingeckoId` se fuerza a `''` al guardar aunque el usuario haya escrito algo antes de cambiar de modo (se pierde silenciosamente).
- `onSaved` → Portfolio `refresh()`: cierra todo y recarga.
- Las acciones de bolsa (crear/renombrar/archivar/eliminar) **no cierran el modal de activo**: llaman `onAssetTypesChanged()` (recarga solo `assetTypes` en Portfolio) y quedan con el modal de activo abierto para seguir completándolo.

### Variantes crear vs. editar
- Título: "Nuevo activo" / "Editar activo".
- Solo en edición: botón "Archivar activo" (no hay "Eliminar", solo archivar — a diferencia de Transaction/Contribution que sí eliminan).
- Al elegir bolsa (tanto en alta como al cambiar de bolsa en edición) se sugiere el modo de valuación predominante de esa bolsa y el flag "busca rendimiento" default de la bolsa — pero en edición esto **pisa silenciosamente** el modo/yields que el activo ya tenía si el usuario toca el select de bolsa, aunque no haya querido cambiar esos otros campos.

### Deudas de UX conocidas
- Formulario dentro de formulario: el campo "Bolsa" despliega hasta 3 mini-forms distintos (crear/renombrar/gestionar), cada uno con su propio busy/error (`bolsaBusy`/`bolsaError`) separado del busy/error del formulario de activo — dos sistemas de estado de carga y error conviviendo en una sola pantalla.
- "Eliminar bolsa" y "Archivar bolsa" son irreversibles/semi-reversibles de forma distinta a "Archivar activo", pero visualmente usan el mismo estilo de botón texto rojo (`text-clay`) sin distinguir gravedad.
- CoinGecko ID se pierde silenciosamente si el usuario cambia de modo de valuación y vuelve a "Vivo" (el estado del input no se limpia visualmente, pero al guardar con otro modo el valor se descarta).

---

## 4. ValuationModal ("Actualizar valores")

**Archivo:** `src/components/ValuationModal.jsx`

### Flujo de apertura
- Botón "Actualizar valores" en Portafolio (visible solo si hay activos de valuación manual) → abre con `assets = manualAssets` (todos los que necesitan carga manual, `needsManualValuation`).
- Link "Actualizar valor" dentro de la fila expandida de un activo individual (`AssetRow`, visible solo si `valuation.source !== 'live' && valuation.source !== 'contributed'`) → abre con `assets = [asset]` (uno solo).
- Props: `open`, `assets`, `latestValuations`, `onClose`, `onSaved`.

### Inventario de campos
- Nota fija arriba del form: *"Valor de hoy en USD. Los que dejes vacíos no se tocan."*
- Por cada activo en `assets`: nombre, línea de referencia ("Último: {valor} ({fecha})" o "Sin valuación previa"), input decimal con prefijo "US$", placeholder = último valor conocido o "0". Todos opcionales individualmente (se puede cargar solo algunos y dejar el resto vacío).
- **No hay campo de fecha**: la fecha siempre es "hoy" (`todayISO()`), sin posibilidad de cargar una valuación retroactiva desde este modal.

### Validaciones y guards
- Submit deshabilitado si ningún campo tiene un valor `> 0` (`filled.length === 0`).
- Error: `"No se pudieron guardar las valuaciones. " + e.message"`.
- No hay eliminar ni archivar acá.

### Al guardar
- Llama `upsertValuation` una vez por cada activo con valor cargado (loop secuencial, no batch). `onSaved` → Portfolio `refresh()`.

### Variantes crear vs. editar
- No hay modo "editar" explícito: es siempre un upsert (por fecha+activo, `UNIQUE(asset_id, date)`), la única variante es la cantidad de activos mostrados (uno vs. todos los manuales).

### Deudas de UX conocidas
- Sin campo de fecha: si el usuario quiere corregir un valor de una fecha pasada, no puede desde acá.
- Es el único modal de "alta" que no tiene ninguna opción de borrado/corrección posterior visible en su propia UI.

---

## 5. LiquidModal (reconciliación de líquido) — **huérfano**

**Archivo:** `src/components/LiquidModal.jsx`

**Confirmado por búsqueda en el código:** el componente está completamente implementado pero **no se importa ni se renderiza desde ninguna pantalla actual** (`grep` no encuentra ningún `<LiquidModal` ni `import LiquidModal` fuera de su propio archivo). Es código muerto en la app corriendo hoy, a la espera de que el Dashboard lo reincorpore (ver FUNCTIONAL.md, sección Dinero líquido).

### Inventario de campos (según el código, sin entrada real hoy)
1. **Líquido actual** — fila de solo lectura, calculada (`computeCurrentLiquid()`), muestra "Calculando…" mientras carga.
2. **Tenés (real)** — input con prefijo "$", `inputMode="decimal"`, placeholder "0", `autoFocus`, obligatorio.
3. Previsualización condicional: si hay diferencia (`Math.abs(difference) >= 0.01`), texto: *"Diferencia: {+/−}{monto} → se registrará un {ingreso|gasto} de ajuste{ como saldo inicial, si es la primera reconciliación}."* Si no hay diferencia: *"Sin diferencia: no se genera ajuste."*

### Validaciones y guards
- `valid` = declarado no vacío, `>= 0`, y líquido actual ya calculado.
- Error: `"No se pudo calcular el líquido actual. " + e.message"` / `"No se pudo guardar la reconciliación. " + e.message"`.

### Al guardar
- Llama `reconcile({ date: todayISO(), declaredAmount })`, que internamente crea la `transaction` de ajuste + la fila de `liquid_reconciliations` si corresponde.

### Particularidades
- Es el único modal cuyo botón de acción principal dice **"Confirmar"** en vez de "Guardar" (inconsistencia de vocabulario con el resto).
- Sin campo de fecha visible: usa siempre `todayISO()` internamente, igual que ValuationModal.
- Sin modo edición ni borrado — es una operación de alta pura, siempre "hoy".

---

## 6. Login (autenticación)

**Archivo:** `src/pages/Login.jsx`

### Flujo de apertura
- No es un modal: es una página completa (`/login` o ruta raíz sin sesión), servida por `ProtectedRoute`/routing de `App.jsx`. Redirige a `/` si ya hay sesión.
- **No existe formulario de registro/signup** — coherente con el modelo semi-cerrado del proyecto (cuentas creadas por el admin).

### Inventario de campos
1. **Email** — `type="email"`, placeholder "Email", `autoComplete="email"`, obligatorio.
2. **Contraseña** — `type="password"`, placeholder "Contraseña", `autoComplete="current-password"`, obligatorio.

### Validaciones y guards
- Solo `required` nativo del HTML — sin validación de formato adicional en el cliente.
- Error: si `signInError.message === 'Invalid login credentials'` → *"Email o contraseña incorrectos."* (traducido); para cualquier otro error, se muestra el `signInError.message` **crudo, sin traducir** (potencial fuga de mensajes técnicos/en inglés del backend, único lugar de la app donde esto puede pasar sin el prefijo explicativo en español que usan todos los demás formularios).

### Al guardar
- `signIn(email, password)`; si tiene éxito, `useAuth` actualiza el estado global y la navegación redirige a `/`.

### Variantes
- No tiene variantes (no hay editar/crear, es un único modo).

### Particularidades de diseño
- Es el único formulario que no usa la "hoja" (bottom sheet) del resto de la app: es una pantalla centrada, standalone, sin el header "Cancelar / Título / Guardar".
- Es el único con `autoComplete` configurado explícitamente.

---

## 7. CategoriesSection (gestión de categorías — inline, no modal)

**Archivo:** `src/components/CategoriesSection.jsx`, embebido en `src/pages/Settings.jsx`

Es el único "formulario" de alta/edición de la app que **no es un modal**: vive permanentemente incrustado en la pantalla de Ajustes.

### Flujo de apertura
- No se "abre": está siempre visible en Ajustes. La edición de cada categoría se activa tocando su fila (excepto categorías de sistema).

### Inventario de campos — alta de categoría (form fijo al final de la lista)
1. **Segmentado Gasto/Ingreso** — mismo patrón visual que TransactionFormModal, controla `newKind`. Default: `'expense'`.
2. **Nueva categoría** — input, placeholder "Nueva categoría". Botón "Agregar" (deshabilitado si vacío o `creating`).

### Inventario de campos — edición inline por fila (`CategoryRow`)
- Tap en el nombre de la categoría (con ícono de lápiz decorativo, `sr-only "Editar {nombre}"`) → la fila se convierte en: input con el nombre actual (autofocus), Enter guarda / Escape cancela; fila de botones: "Archivar" (izquierda, texto rojo) y "Cancelar" / "Guardar" (derecha).
- Categorías de sistema (`is_system`, ej. "Ajuste de saldo"): fila no clickeable, sin ícono de lápiz, badge "categoría del sistema" a la derecha — no se pueden renombrar ni archivar.

### Archivadas
- Sección colapsable "▸/▾ Archivadas (n)" al final. Cada fila archivada: nombre + badge de tipo (gasto/ingreso) + link "Restaurar".

### Validaciones y guards
- Alta: `trimmed` no vacío bloquea el submit (botón deshabilitado).
- Rename: si el nombre nuevo está vacío o es igual al actual, no llama a la API — simplemente cierra el modo edición sin error.
- Errores de carga: bloque bordeado rojo con botón "Reintentar" (`load()`), distinto del texto simple usado en errores de acción (crear/renombrar/archivar/restaurar), que se muestran como texto rojo suelto arriba de las secciones.
- Mensajes: `"No se pudieron cargar las categorías. "`, `"No se pudo crear la categoría. "`, `"No se pudo renombrar la categoría. "`, `"No se pudo archivar la categoría. "`, `"No se pudo restaurar la categoría. "` (todas + `e.message`).

### Al guardar
- Alta: agrega a la lista local y re-ordena alfabéticamente sin recargar todo del servidor; si el alta "revive" una categoría archivada del mismo nombre (constraint de unicidad probable), la saca de la lista de archivadas.
- Rename/archive/restore: actualización optimista del estado local, sin cerrar nada (no hay "cerrar" — es inline).

### Variantes crear vs. editar
- Crear: un form fijo compartido para gasto e ingreso (segmentado).
- Editar: por fila, sin segmentado (no se puede cambiar el tipo gasto/ingreso de una categoría existente vía UI).
- No hay operación de "eliminar", solo archivar/restaurar (igual que Asset, distinto de Transaction/Contribution que sí eliminan).

---

## Patrones transversales

### Repetidos consistentemente
- **Chrome del modal**: los 5 modales (Transaction, Contribution, Asset, Valuation, Liquid) comparten idéntica estructura: overlay `bg-ink/40`, hoja que sube desde abajo en mobile (`items-end`, `rounded-t-2xl`) y se centra en desktop (`items-center`, `rounded-2xl`), header con "Cancelar" (izquierda, texto) — título (centro) — acción primaria (derecha, texto, color `text-pine`, `disabled:opacity-40`). Cierre con tecla Escape en los 5.
- **Layout de campos**: lista agrupada tipo "Ajustes de iOS" — una tarjeta (`divide-y rounded-2xl border`) con filas label-izquierda / control-derecha.
- **Inputs de dinero**: siempre `inputMode="decimal"`, siempre aceptan coma decimal (`.replace(',', '.')`), siempre placeholder `"0"`, siempre clase `font-money`.
- **Fecha**: nativa `<input type="date">`, default `todayISO()`. Presente en Transaction y Contribution; **ausente** en Valuation y Liquid (ambos fuerzan "hoy" sin poder elegir otra fecha).
- **Confirmación destructiva**: mismo patrón visual (botón rojo pleno → se transforma en franja "¿Seguro?" + No/Sí) en Transaction (eliminar), Contribution (eliminar) y Asset (archivar) — visualmente idéntico aunque la semántica difiere (eliminar es permanente; archivar es reversible solo desde la base).
- **Errores**: casi todos los formularios usan el mismo patrón — texto rojo (`text-clay`) chico debajo del form, mensaje = *"No se pudo {acción}. "* + `e.message` crudo del backend concatenado sin traducir.
- **Botón guardar**: label alterna entre texto estático y "…ndo…" mientras `busy` (Transaction, Contribution, Asset, Valuation: "Guardar"/"Guardando…"). Login usa "Ingresar"/"Ingresando…" con el mismo patrón.

### Donde divergen sin razón aparente
- **Vocabulario del botón de guardar**: "Guardar" en 4 modales vs. **"Confirmar"** en LiquidModal — misma acción, palabra distinta.
- **Mismo control, dos widgets distintos para la misma decisión binaria**: el par Gasto/Ingreso (en Transaction y en CategoriesSection) usa un **segmentado de 2 botones**; decisiones binarias equivalentes en otros formularios (Va por MEP, Ya lo tenía/Va al líquido, Busca rendimiento, Vendí/retiré todo, Reinvertir) usan un **switch tipo iOS**. No hay una regla clara de cuándo usar cada widget para un sí/no.
- **Toggle con lógica de encendido invertida**: "Ya lo tenía" (ON = no afecta el líquido) vs. "Va al líquido" (ON = sí afecta el líquido) en el mismo componente (`ContributionFormModal`), documentado en el propio código (`mode === 'withdrawal' ? affectsLiquid : !affectsLiquid`).
- **Affordance de "tocar para editar"**: en Asset (nombre) y en las bolsas (renombrar) hay un ícono de lápiz explícito; en Transaction y Contribution, la fila entera es tappable para editar **sin ningún ícono ni indicio visual** — incoherente entre entidades para la misma interacción.
- **Eliminar vs. archivar con el mismo estilo**: Transaction y Contribution eliminan de forma permanente; Asset y Category solo archivan (reversible, hoy solo desde la base) — ambos casos usan el mismo botón de texto rojo, sin distinguir gravedad ni reversibilidad en la UI.
- **Presentación de errores de cara al usuario**: texto rojo suelto (mayoría de los modales) vs. bloque bordeado con botón "Reintentar" (errores de carga en CategoriesSection y Movements/Portfolio a nivel de pantalla) vs. traducción condicional de un único mensaje conocido y mensaje crudo para el resto (Login) — tres convenciones distintas conviviendo.
- **Textos de ayuda**: en AssetFormModal el texto de ayuda del modo de valuación es **siempre visible** (cambia según selección); en ContributionFormModal, ayudas equivalentes (ej. "Cambio manual", "Reinvertir", "Vendí/retiré todo") solo aparecen **cuando el toggle asociado está activo** — no hay convención sobre si la ayuda es permanente o aparece al interactuar.
- **Formulario dentro de formulario**: solo AssetFormModal anida sub-formularios completos (crear/renombrar/gestionar bolsa) con su propio estado de busy/error (`bolsaBusy`/`bolsaError`) separado del formulario padre — patrón único, no reutilizado ni replicado en ningún otro lugar donde podría aplicar (ej. gestión de categorías podría haber usado un modal y no lo hace).
- **Estructura modal vs. inline**: CategoriesSection es el único CRUD de la app que no usa un modal — vive permanentemente inline en Ajustes con edición por fila. Todas las demás entidades (Transaction, Contribution, Asset) usan una hoja modal incluso para ediciones triviales.
- **LiquidModal es código muerto**: completamente implementado (incluye guard de "sin diferencia" y detección de primera reconciliación) pero no importado desde ninguna pantalla — confirmado por búsqueda en el repo.
- **Obligatoriedad sin indicar**: ningún formulario usa asterisco ni leyenda de "campo obligatorio"; el único indicio es el botón de guardar deshabilitado (`valid` calculado), sin mensaje inline de "falta completar esto".
