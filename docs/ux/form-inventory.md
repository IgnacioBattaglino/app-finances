# Relevamiento de formularios — app-finances

Estado actual de los formularios y modales de la app. Fuente: el código en
`src/components/*.jsx`, `src/components/contribution/*.jsx`,
`src/components/asset/*.jsx`, `src/components/form/*.jsx`,
`src/pages/settings/Categories.jsx` + `CategoryDetail.jsx`, `src/pages/Login.jsx`
y `src/pages/ResetPassword.jsx`. Documento solo descriptivo — no propone
mejoras.

No cubre los formularios de Deudas (`DebtFormModal`, `DebtPaymentModal`):
quedan fuera del relevamiento original y siguen sin releverse.

---

## 1. TransactionFormModal (nuevo/editar movimiento)

**Archivo:** `src/components/TransactionFormModal.jsx`

### Flujo de apertura
- Desde **Movimientos**: botón flotante "+" → crear (`initial=null`); tocando una fila de `transaction` del historial → editar. Las filas de inversión (ver Movimientos en FUNCTIONAL.md) son de solo lectura y no abren este modal.
- Desde **Inicio**: botón flotante "+ Gasto" → crear con `defaultKind="expense"`.
- Único formulario que abre con `startExpanded` (a pantalla completa, con teclado, sin el paso intermedio compacto→full de `FormSheet`): es el de captura rápida, el único con `autoFocus`.
- Recibe `categories` como prop (ya cargadas por la pantalla que lo abre).

### Inventario de campos (orden visual)
1. **Segmentado Gasto/Ingreso** (`BinaryChoice`, fuera de la tarjeta de campos): siempre visible, en alta y en edición. Cambiar de tipo resetea la categoría elegida si no es del nuevo tipo.
2. **Monto** — prefijo "$", `inputMode="decimal"`, `autoFocus`, obligatorio.
3. **Categoría** — `<select>`, opciones filtradas por `kind` y sin las categorías del sistema (que solo las usa la reconciliación). El orden es el que el usuario arrastró en Ajustes (`position`), no alfabético. Incluye la opción **"+ Nueva categoría"**: revela un input inline (autofocus, Enter crea, Escape cancela) que da de alta la categoría con el `kind` que se está cargando y la deja elegida — sin salir del formulario.
4. **Fecha** — `CollapsedDateField` (no un `<input type="date">` nativo suelto): fila colapsada "Hoy · cambiar" que revela el date picker nativo al tocar "cambiar" y vuelve a colapsar al `blur`. Default hoy, obligatorio.
5. **Descripción** — input libre, opcional.

### Validaciones y guards
- Submit deshabilitado si falta fecha, categoría o `amountValue <= 0` (acepta coma o punto decimal). `MissingHint` muestra qué falta ("Falta: monto y categoría").
- Error de guardado/borrado: `FormError` con mensaje en español + `e.message` como detalle técnico aparte (nunca concatenado al mensaje).
- Eliminar (solo en edición): botón "Eliminar movimiento" → confirmación inline "¿Eliminar este movimiento? Es permanente." con "No" / "Sí, eliminar".

### Variantes crear vs. editar
- Título: "Nuevo movimiento" / "Editar movimiento".
- Solo en edición aparece "Eliminar movimiento".
- El segmentado Gasto/Ingreso está siempre visible en los dos modos.

---

## 2. Aportar / Retirar — ContributionFormModal

**Archivo:** `src/components/ContributionFormModal.jsx`, con las piezas
compartidas `src/components/contribution/ExchangeRateField.jsx` y
`QuantityAmountField.jsx` (ver sección 5).

Ya no es un componente monolítico que también resuelve transferencia y
liquidación: **Transferir y Liquidar son formularios propios** (secciones 3 y
4), abiertos desde el detalle del activo, no desde acá.

### Flujo de apertura
- Desde **AssetDetail**: botones "Retirar" / "Aportar" (barra fija abajo en mobile, header en desktop) → crear, con `operation` fijo según el botón.
- Tocando una fila de aporte/retiro en el historial del activo → editar; `operation` se infiere de `initial.direction`.
- Una fila que es **parte de una transferencia** (`initial.transfer_id`) abre este mismo componente pero en un modo de **solo lectura**: muestra monto, cantidad, tipo de cambio y fecha, con la explicación de que para corregirla hay que borrar la transferencia entera (las dos patas, atómico) y volver a cargarla — no se edita una pata sola.

### Inventario de campos (alta, activo de precio en vivo con precio disponible)
1. **Cantidad + Monto** (`QuantityAmountField`, sección 5) — vinculados: editar cualquiera deriva el otro a partir del precio del instrumento.
2. **¿Cuántos pesos moviste?** (`ExchangeRateField`, sección 5) — con el monto ya fijado por el campo anterior, acá se registra el tipo de cambio (MEP del día automático, con un botón "Cambiar" para corregirlo) y se muestran los pesos equivalentes, editables: escribirlos define la tasa.
3. **¿De dónde sale?** / **¿A dónde va?** (`BinaryChoice`, el label y las opciones cambian según sea aporte o retiro) — "De mi disponible"/"A mi disponible" (afecta el disponible) vs. "De afuera"/"Afuera" (no lo afecta). Reemplaza al viejo par de toggles con polaridad invertida: es una sola pregunta que se lee igual en los dos sentidos.
4. **Fecha** (`CollapsedDateField`).

Si el activo NO es de precio en vivo (o no hay precio disponible), no hay
vínculo cantidad↔monto: `ExchangeRateField` cae a su rail completo, con Pesos y
Dólares lado a lado (se carga el que se sepa) y el tipo de cambio abajo (ver
sección 5).

### Validaciones y guards
- Obligatorio: monto, cantidad (solo si el activo es de precio en vivo), tipo de cambio (**solo si la operación afecta el disponible** — "de afuera" no lo pide), fecha.
- **Guard de tenencia** (único que bloquea el submit): retirar más unidades de las que el activo tiene, según `heldQuantity` en `lib/portfolio.js` — excluye la propia fila al editar, para no restarse a sí misma.
- **Guard de "supera el valor"**: solo avisa, **nunca bloquea**. El comentario en el código lo dice explícito ("Aviso, nunca bloquea… lo único imposible es retirar más unidades de las que hay"). No distingue por confiabilidad de la valuación — es la misma política sea cual sea el `source` de la valuación.
- Errores: `"No se pudo guardar el {aporte|retiro}."` / `"No se pudo eliminar el {aporte|retiro}."`, con `e.message` como detalle.
- Confirmación de borrado (solo edición, y no en una pata de transferencia): "¿Eliminar este {aporte|retiro}? Es permanente."

### Al guardar
- `createContribution`/`updateContribution` o `createWithdrawal`/`updateWithdrawal` según `operation`. Nunca crea transferencias (eso vive en `TransferFormModal`).

### Variantes crear vs. editar
- Título: "Aportar a {activo}"/"Retirar de {activo}" en alta; "Editar aporte"/"Editar retiro" en edición.
- El vínculo cantidad↔monto **solo aplica en alta**: al editar, cantidad y monto son dos campos sueltos (no se recalculan contra el precio de hoy).
- Editando, el tipo de cambio se muestra "congelado" (`FrozenRateField`, ver sección 5): el valor guardado con un botón "Cambiar" para corregirlo, no una re-derivación automática. Guardar sin tocarlo deja la fila idéntica — incluida una fila que se guardó sin tipo de cambio, que sigue sin ninguno.
- Editando un **retiro**, `empties_asset` sale de la fila guardada y no de un `false` fijo: es el insumo con el que se calculó su ganancia realizada la primera vez (ver ADR-011).

---

## 3. Transferir — TransferFormModal

**Archivo:** `src/components/contribution/TransferFormModal.jsx`

Formulario propio, no una variante de ContributionFormModal.

### Flujo de apertura
- Link de texto "Transferir" al final del detalle de un activo (`AssetDetail`), siempre visible.

### Inventario de campos
1. **Destino** — `<select>` con los demás activos del usuario.
2. **Cantidad que sale** — solo si el activo origen es de precio en vivo.
3. **Monto** (USD) — un solo campo compartido por las dos patas de la transferencia.
4. **Cantidad que entra** — solo si el activo destino es de precio en vivo.
5. **Tipo de cambio** (`ExchangeRateField`, con el monto ya fijo y `askPesos={false}`) — la tasa es siempre un dato de registro **opcional** acá: una transferencia nunca toca el disponible. Es el único call site que **no** muestra la fila de pesos: la plata pasa de un activo a otro sin pasar por el bolsillo, así que no hay ningún movimiento en pesos que preguntar.
6. **Fecha** (`CollapsedDateField`).

El vínculo cantidad↔monto se aplica **de forma independiente a cada lado**
cuando ese lado es de precio en vivo: el último campo tocado (monto, cantidad
origen o cantidad destino) manda, y tocar cualquiera de los otros dos rompe
solo su propio vínculo (o los dos, si se toca el monto compartido).

### Validaciones y guards
- Obligatorio: activo destino, monto, cantidad en origen/destino si ese lado es de precio en vivo, fecha.
- Guard de "supera el valor" del activo origen: mismo criterio que Retirar — avisa, nunca bloquea.
- Error: "No se pudo guardar la transferencia."

### Al guardar
- `createTransfer` (`lib/contributions.js`): inserta las dos patas (retiro + aporte, mismo `transfer_id`) en una sola operación atómica.

---

## 4. Liquidar — LiquidatePositionModal

**Archivo:** `src/components/contribution/LiquidatePositionModal.jsx`

Es una **confirmación**, no un alta común: calcula y muestra de antemano la
ganancia/pérdida que se cristaliza, y el monto es editable pero nada bloquea
por valor — el monto ES el precio real de venta.

### Flujo de apertura
- Link de texto "Liquidar" al final del detalle de un activo, visible solo si el activo tiene algo que liquidar (`canLiquidate`: no es cierto que aportado sea 0 y no tenga valor).

### Inventario de campos
1. **Monto** — precargado con el valor actual **solo si la valuación no está desactualizada**; con valuación `outdated` o sin valuación (`source === 'none'`) arranca vacío, para no confirmar sin mirar un número viejo o inventado.
2. **Ganancia realizada** — de solo lectura, se muestra recién cuando hay un monto cargado (`> 0`); en rojo si es pérdida.
3. **Cantidad** — solo si el activo es de precio en vivo.
4. **¿Cuántos pesos moviste?** (`ExchangeRateField`, con el monto de venta ya fijo).
5. **¿A dónde va?** (`BinaryChoice`) — "A mi disponible" / "Afuera".
6. **Archivar el activo** — checkbox, default marcado.
7. **Fecha** (`CollapsedDateField`).

### Validaciones y guards
- Obligatorio: monto, cantidad si es de precio en vivo, tipo de cambio si va al disponible, fecha.
- Aviso (nunca bloquea) si el monto se aleja del último valor conocido — **por encima o por debajo**, a diferencia de Retirar/Transferir que solo avisan si supera.
- Error: "No se pudo liquidar la posición."

### Al guardar
- `createWithdrawal` con `emptiesAsset: true`; si "Archivar el activo" está marcado, además `archiveAsset(assetId)`.

---

## 5. Piezas compartidas de dinero: ExchangeRateField y QuantityAmountField

**Archivos:** `src/components/contribution/ExchangeRateField.jsx`,
`QuantityAmountField.jsx`

Usadas por Aportar/Retirar, Transferir, Liquidar y (`QuantityAmountField`
específicamente) el vínculo cantidad↔monto de Aportar/Retirar.

**`ExchangeRateField`** resuelve el tipo de cambio según el contexto, sin que
cada formulario reimplemente la lógica:
- **Editando** (`editing=true`, siempre que se edite: con tasa guardada o sin ella): `FrozenRateField` — muestra la tasa que quedó guardada con la operación y no re-deriva nada. **No reporta nada al montar**: el estado del tipo de cambio lo siembra el formulario padre desde `initial.mep_rate` (los efectos de los hijos corren antes que los del padre, así que el reseteo del padre pisaba lo que el hijo reportaba y el formulario se creía sin tasa). Si la fila **no tiene** tasa guardada, tampoco sale a buscar el MEP de hoy: se ofrece cargarla a mano ("Cargar tipo de cambio"), porque guardar sin tocar nada no puede estamparle a una operación vieja la cotización de hoy.
- **Monto ya fijado por otro campo** (`fixedAmountUsd` no nulo — el caso de Transferir, Liquidar, y Aportar/Retirar con vínculo cantidad↔monto activo): `CompactRateField` — el MEP del día automático y, siempre a la vista, el monto en pesos. Como los dólares ya están fijados arriba, escribir los pesos define la tasa, y cambiar la tasa a mano recalcula los pesos. Con `askPesos={false}` (hoy solo Transferir) esa fila no se dibuja: si la operación no movió pesos, preguntarlos es pedir un dato que no existe.
- **Monto todavía no determinado** (Aportar/Retirar sin precio en vivo, pago de deuda nuevo): `FullAmountRail` — **Pesos y Dólares lado a lado**, con el mismo peso visual: se carga el que se sepa y el otro se deriva con el tipo de cambio vigente (bidireccional, mismo criterio que `QuantityAmountField`). Reemplaza al viejo campo único con segmentado ARS/USD + modo manual escondido detrás de "Usar otro".
- **Cambiar la cotización** es en las tres variantes un `.btn` de verdad (52px en celular, 36px en desktop), no un texto gris de 13px.
- **Al cambiar la tasa a mano en el rail completo**, los dos montos dejan de cuadrar entre sí: en vez de recalcular a ciegas aparece la pregunta "¿Cuál está bien?" (`BinaryChoice`) con los dos importes concretos a la vista. El elegido queda intacto y el otro se recalcula al instante. Arranca preseleccionada en el último monto que tocó el usuario, así que nunca bloquea. En `CompactRateField` no aparece: con los dólares fijados desde afuera no hay ambigüedad posible.
- `required`: si la operación no afecta el disponible ("de afuera", o cualquier campo de Transferir/Liquidar hacia afuera), el tipo de cambio es opcional — no se le pide al usuario ni bloquea el guardado, aunque igual se intenta traer el MEP del día por detrás.

**`QuantityAmountField`**: cantidad y monto USD vinculados a un precio unitario — escribir en cualquiera de los dos deriva el otro; el último campo tocado manda. Solo se usa en alta (`editing=false` en el uso real): al editar, cantidad y monto quedan como campos sueltos.

---

## 6. AssetFormModal (crear/editar activo)

**Archivo:** `src/components/AssetFormModal.jsx`, con el mini-form embebido
`src/components/CreateAssetTypeForm.jsx` y el buscador
`src/components/asset/InstrumentPicker.jsx`.

### Flujo de apertura
- Desde **Portafolio**: botón "Nuevo activo" → crear.
- Desde **AssetDetail**: ícono de lápiz junto al nombre del activo → editar.

### Inventario de campos
1. **Nombre** — input libre, obligatorio.
2. **Grupo de activos** — `<select>` con **"Sin grupo" como opción**, todos los grupos del usuario, y "+ Nuevo grupo". **El grupo es opcional** (migración 0029): un activo sin grupo se muestra suelto en Portafolio. La opción "+ Nuevo grupo" revela `CreateAssetTypeForm` (nombre + toggle "Los activos nuevos buscan rendimiento") embebido en el mismo modal — es el **único** mini-form de grupo que queda acá: renombrar, archivar, restaurar y eliminar un grupo viven en Ajustes (`AssetTypes.jsx`/`AssetTypeDetail.jsx`), no en este formulario.
3. **"¿De dónde sale el valor de este activo?"** — segmentado de 3: "Vale lo que pusiste" / "Valuación manual" / "Valuación automática", con texto de ayuda permanente debajo según la opción activa.
4. **`InstrumentPicker`** — solo si el modo es "Valuación automática". Buscador sobre el catálogo compartido de instrumentos (por nombre o símbolo): muestra nombre, símbolo, tipo (Cripto/CEDEAR/Bono/Acción/…) y el último precio conocido en su moneda nativa, como confirmación de que se eligió el correcto. **Es obligatorio en este modo** — no hay forma de guardar un activo "en vivo" sin instrumento elegido. Reemplaza por completo al viejo campo de texto libre "CoinGecko ID"; no existe ningún campo de identificador escrito a mano.
5. **"Cuenta en el rendimiento"** — switch (`Switch`), default heredado del grupo elegido (o `true` sin grupo).

No hay campo de **ticker** en este formulario: se eliminó del alta y de todas las vistas.

Al elegir grupo (alta o al cambiar de grupo en edición) se sugiere el modo de
valuación predominante de ese grupo y su default de rendimiento — en edición,
esto solo se aplica si el usuario efectivamente toca el selector de grupo.

### Validaciones y guards
- Obligatorio: nombre, modo de valuación, instrumento si el modo es "Valuación automática". El grupo nunca es obligatorio.
- Error: "No se pudo guardar el activo." / "No se pudo archivar el activo."
- Archivar (solo edición): botón "Archivar activo" → confirmación con nota: **"Podés restaurarlo después desde «Archivados», al final de Portafolio."** — la restauración está implementada en la app (no hace falta ir a la base de datos).

### Variantes crear vs. editar
- Título: "Nuevo activo" / "Editar activo".
- Solo en edición aparece "Archivar activo" (no hay "Eliminar" — igual que Categorías, se archiva, no se borra).

---

## 7. ValuationModal ("Actualizar valuación")

**Archivo:** `src/components/ValuationModal.jsx`

### Flujo de apertura
- Botón "Actualizar valuación" en el detalle de un activo manual (`AssetDetail`), o desde Portafolio para todos los activos manuales de una vez (`assets` recibe uno o varios).

### Inventario de campos
- **Fecha** (`CollapsedDateField`, default hoy) — **sí tiene campo de fecha**: permite cargar una valuación retroactiva, no solo "hoy".
- Por cada activo: nombre, línea de referencia ("Último: {valor} ({fecha})" o "Nunca lo valuaste"), input US$. Todos opcionales individualmente (se puede cargar solo algunos).
- Si ya existe una valuación de ese activo en la fecha elegida, avisa (nunca bloquea): "Ya tenés una valuación en esta fecha — la vas a reemplazar."

### Validaciones y guards
- Submit deshabilitado si ningún campo tiene un valor `> 0`.
- Error: "No se pudieron guardar las valuaciones."

### Al guardar
- `upsertValuation` una vez por cada activo con valor cargado (por fecha+activo, upsert — nunca duplica).

---

## 8. LiquidModal (reconciliación del disponible)

**Archivo:** `src/components/LiquidModal.jsx`

**No es código muerto.** Está montado activamente en `src/pages/Dashboard.jsx`: es el modal que abre la tarjeta "Dinero disponible" de Inicio.

### Inventario de campos
1. **Línea de solo lectura** — "Según la app tenés {monto}", calculado (`computeCurrentLiquid`).
2. **"¿Cuánto tenés realmente?"** — input con prefijo "$", obligatorio.
3. Previsualización condicional: si hay diferencia (`>= $0,01`), muestra el monto y de qué signo el ajuste que se va a registrar (ingreso o gasto), marcado como "saldo inicial" si es la primera reconciliación. Sin diferencia: "Sin diferencia: no se genera ajuste."

### Validaciones y guards
- Válido: declarado no vacío, `>= 0`, y el disponible actual ya calculado.
- Error: "No se pudo calcular el disponible." / "No se pudo guardar la reconciliación."

### Particularidades
- Sin campo de fecha: siempre `todayISO()`, sin poder elegir otra.
- Sin modo edición ni borrado: alta pura, siempre "hoy".
- Es el único modal cuyo botón de acción dice **"Guardar"** igual que el resto (ya no dice "Confirmar" — el vocabulario se unificó).

---

## 9. Login

**Archivo:** `src/pages/Login.jsx`

### Flujo de apertura
- Página completa (no modal), servida por el routing de `App.jsx`. Redirige a `/` si ya hay sesión (reconstruyendo la ruta a la que el usuario quiso ir antes de que lo mandaran a loguearse).
- **No existe formulario de registro/signup**, coherente con el modelo semi-cerrado. Tampoco existe ningún "olvidé mi contraseña" en esta pantalla — la recuperación se dispara desde afuera de la app (ver ResetPassword, sección 10).

### Inventario de campos
1. **Email** — obligatorio, `autoComplete="email"`.
2. **Contraseña** — obligatorio, `autoComplete="current-password"`.

### Validaciones y guards
- Solo `required` nativo del HTML.
- Error: si `signInError.message === 'Invalid login credentials'` → "Email o contraseña incorrectos."; para cualquier otro error, mensaje genérico en español con `signInError.message` como detalle técnico aparte (no crudo pegado al mensaje).

### Particularidades
- No usa `FormSheet`: pantalla centrada, standalone.

---

## 10. ResetPassword (recuperación de contraseña)

**Archivo:** `src/pages/ResetPassword.jsx`, con soporte en `src/hooks/useAuth.jsx`.

No es un formulario que el usuario abra desde dentro de la app: se llega
únicamente desde el link de recuperación que manda Supabase. No hay ningún
botón "olvidé mi contraseña" en Login que lo dispare — ver la nota técnica
sobre este mecanismo en CLAUDE.md.

### Flujo de apertura
- El link de recuperación cae en el Site URL con los tokens en el hash de la URL. Mientras `useAuth` detecta una recuperación en curso, `App.jsx` no monta las rutas normales: todo redirige acá.
- Tres estados: cargando; **sin sesión de recuperación válida** (link vencido o ya usado); **con sesión válida** (formulario).

### Inventario de campos (con sesión válida)
1. **Contraseña nueva** — `type="password"`, mínimo 6 caracteres (el mínimo lo impone Supabase).
2. **Repetir contraseña** — mismo mínimo.

No pide la contraseña anterior: la sesión de recuperación ya autentica al
usuario para este único cambio.

### Validaciones y guards
- Cliente: longitud mínima y que las dos coincidan, antes de llamar a la API.
- Error de guardado: "No se pudo guardar la contraseña. Probá de nuevo." + detalle técnico.
- Link vencido/usado: mensaje fijo ("El enlace expiró. Pedí uno nuevo para volver a intentar.") + botón "Ir al inicio de sesión".

### Al guardar
- `updateUser({ password })` vía `useAuth`; al confirmar, botón "Entrar" que cierra el estado de recuperación y deja pasar a la app.

### Particularidades
- No usa `FormSheet`, mismo tratamiento visual que Login (pantalla centrada, standalone).
- No hay forma de disparar este flujo desde la app: el link tiene que originarse afuera (con toda probabilidad, el administrador desde el dashboard de Supabase), coherente con el registro semi-cerrado.

---

## 11. Categorías — Categories.jsx + CategoryDetail.jsx

**Archivos:** `src/pages/settings/Categories.jsx`,
`src/pages/settings/CategoryDetail.jsx`

El componente `CategoriesSection.jsx` que describía una versión anterior de
este documento **ya no existe**. La gestión de categorías se rehizo bajo el
modelo de navegación iOS de Ajustes: lista → detalle, sin edición inline por
fila.

### Flujo de apertura
- `Categories.jsx` vive en `/ajustes/categorias`, siempre visible (no se "abre"). Tocar el nombre de una categoría navega a `/ajustes/categorias/:id` (`CategoryDetail.jsx`), donde se renombra.

### Inventario de campos — Categories.jsx (lista)
- Dos grupos, "Gastos" e "Ingresos", cada uno con sus categorías reordenables por arrastre (`ReorderableRows`, con **Pointer Events, no la API de drag de HTML5** — esa no dispara con el dedo en iOS) desde una manija dedicada (arrastrar desde toda la fila movería categorías sin querer al scrollear).
- Las categorías del sistema ("Ajuste de saldo") se listan al final de cada grupo, con badge "del sistema", sin manija ni botón de eliminar — no entran al arrastre.
- **"Nueva categoría"** al pie de cada grupo (`NewCategoryRow`): revela un input inline (autofocus) sin segmentado — el grupo en el que está ya dice el tipo. Antes vivía un único form suelto con un segmentado Gasto/Ingreso.
- Cada fila no-sistema tiene: manija de arrastre, el nombre (link al detalle) y un botón **"Eliminar"**.

### Inventario de campos — CategoryDetail.jsx (detalle)
- Categoría de sistema: solo lectura (nombre + tipo), con nota de que no se puede renombrar ni eliminar.
- Categoría normal: input de nombre (renombrar) + tipo de solo lectura (no se puede cambiar el `kind` de una categoría existente). El botón "Guardar" solo aparece si el nombre cambió.

### Validaciones y guards — eliminar
**No hay "archivar" ni "restaurar" para categorías, y tampoco hay una
sección de archivadas** (a diferencia de Activos y Grupos, que sí se
archivan). El botón "Eliminar" siempre dice eso, nunca "Archivar", pero la
app decide sola qué hace, sin que el usuario elija:
- Si ninguna `transaction` la usa: se borra de verdad (`DELETE`).
- Si alguna la usa: la base rechaza el `DELETE` (FK sin `ON DELETE CASCADE`, error `23503`) y `deleteCategory` la marca **oculta** (mismo campo `is_archived`, significado nuevo desde la migración 0028) — sale del selector y de esta lista, pero sus movimientos la siguen mostrando por nombre.
- Confirmación antes de intentar el borrado: "¿Eliminar «{nombre}»?" + nota "Si ningún movimiento la usa, se elimina para siempre."
- Crear una categoría con el mismo nombre + tipo de una oculta la revive (sus movimientos viejos vuelven a quedar bajo la misma fila), en vez de duplicarla.

### Al reordenar
- El arrastre reordena en vivo y persiste al soltar (`reorderCategories`, escribe `position` renumerando el grupo). Ese orden es el que usa también el selector de categoría al cargar un movimiento.

---

## Patrones transversales

### Repetidos consistentemente
- **Chrome del modal** (`FormSheet.jsx`): overlay, hoja que sube desde abajo en mobile (compacta hasta `85dvh`, se expande a pantalla completa al enfocar un campo) y se centra en desktop; header con "Cancelar" (izquierda) — título (centro, con `subtitle` opcional) — acción primaria (derecha). Cierre con Escape. Todos los modales de formulario lo usan — Transaction, Contribution, Transfer, Liquidate, Asset, Valuation, Liquid.
- **Fecha**: `CollapsedDateField` en absolutamente todos los formularios que la usan (Transaction, Contribution, Transfer, Liquidate, Valuation) — ningún `<input type="date">` nativo suelto en la UI. LiquidModal es la única excepción real: no tiene campo de fecha, siempre "hoy".
- **Inputs de dinero**: siempre `inputMode="decimal"`, siempre aceptan coma decimal, siempre placeholder `"0"`, siempre `font-money`.
- **Vocabulario del botón de guardar**: "Guardar" en todos los modales de alta/edición estándar. Excepciones con verbo propio porque no son un guardado genérico: "Liquidar" (LiquidatePositionModal, es vender) y "Confirmar contraseña"/"Entrar" (ResetPassword, por su naturaleza de flujo de dos pasos). LiquidModal ya no dice "Confirmar" — quedó unificado en "Guardar".
- **Confirmación destructiva**: mismo patrón visual (botón rojo → franja "¿Seguro?" + No/Sí) en Transaction (eliminar), Contribution (eliminar), transferencia completa (eliminar), Asset (archivar) y Categoría (eliminar) — la semántica sigue siendo distinta (eliminar es permanente; archivar de Asset es reversible desde la propia app) aunque el estilo visual no distinga gravedad.
- **Errores**: `FormError` en todos los formularios — mensaje en español + `e.message` como detalle técnico, nunca concatenado. Login es la única excepción parcial: un mensaje conocido se traduce, cualquier otro muestra el texto del backend como detalle.
- **Guardas de "supera/difiere del valor"**: mismo criterio en Retirar, Transferir y Liquidar (y en los pagos de deuda, fuera de este relevamiento) — **nunca bloquean**, solo avisan. Lo único que bloquea en toda esta familia de formularios es el guard de tenencia de Retirar (no se puede dejar la posición en negativo).

### Donde siguen sin unificarse
- **Affordance de "tocar para editar"**: en Asset y en Categorías (nombre) hay un ícono de lápiz o el link es explícito por diseño de fila; en Transaction y Contribution, la fila entera del historial es tappable para editar sin ningún ícono — sigue sin haber una convención única para la misma interacción.
- **Botones vs. links de texto**: Transferir y Liquidar son links de texto al final de una lista (`AssetDetail`); Aportar/Retirar son botones en una barra fija; Categorías usa un botón de fila completa para "Nueva categoría". No hay una regla explícita de cuándo cada uno.
- **Obligatoriedad sin indicar**: ningún formulario usa asterisco ni leyenda de "campo obligatorio" — el único indicio es el botón de guardar deshabilitado más `MissingHint` ("Falta: …"), donde está presente (no todos los formularios lo usan — LiquidModal y ValuationModal, por ejemplo, no tienen `MissingHint`, solo el botón deshabilitado).
