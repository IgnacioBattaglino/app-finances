# Inventario de textos de interfaz

Solo lectura — sin propuestas de redacción. Agrupado por pantalla; cada modal
compartido se detalla una vez, con nota de qué pantallas lo abren.

---

## Login (`src/pages/Login.jsx`)

**1. Títulos**
- Wordmark: `"finanzas"` (línea 49, minúscula)
- `"Ingresá para continuar"` (línea 50, subtítulo)

**2. Campos**
- Email: sin label visible, placeholder `"Email"` (línea 59)
- Contraseña: sin label visible, placeholder `"Contraseña"` (línea 68)

**3. Botones**
- `"Ingresar"` / `"Ingresando…"` mientras envía (línea 82)

**4. Mensajes**
- Credenciales inválidas: `"Email o contraseña incorrectos."` (línea 35)
- Error genérico: `"No se pudo iniciar sesión. Verificá tus datos o probá de nuevo."` + detalle técnico (línea 37-38)

---

## Inicio / Dashboard (`src/pages/Dashboard.jsx`)

**1. Títulos**
- `"Inicio"` (línea 23, `PageHeader`)
- Descripción: `"Patrimonio, resumen del mes y avance hacia tu objetivo."` (línea 24) — nota: la página hoy solo tiene el botón de gasto rápido y la versión; "patrimonio" y "avance hacia tu objetivo" no están implementados en esta pantalla todavía.

**3. Botones**
- `"+ Gasto"` (línea 33, FAB que abre `TransactionFormModal`)

**4. Mensajes**
- `"versión {APP_VERSION}"` (línea 45, minúscula, pie de página)

Abre `TransactionFormModal` (ver detalle en Movimientos, es el mismo componente) con `defaultKind="expense"`.

---

## Movimientos (`src/pages/Movements.jsx`)

**1. Títulos**
- `"Movimientos"` (línea 123, sin descripción)
- `"Este mes"` (línea 129, sección de estadísticas fijas)
- `"Historial"` (línea 176, sección de lista navegable)

**2. Campos / controles**
- Filtro segmentado: `"Todos"` / `"Gastos"` / `"Ingresos"` (líneas 204-206)
- Select de categoría: `aria-label="Filtrar por categoría"` (línea 223), opción `"Todas"` (línea 226)

**3. Botones**
- `aria-label="Mes anterior"` `‹` (línea 184) / `aria-label="Mes siguiente"` `›` (línea 193)
- `"Reintentar"` tras error de carga (línea 267)
- `aria-label="Nuevo movimiento"` (línea 321, FAB `+`)

**4. Mensajes**
- Error de carga: `"No se pudieron cargar los movimientos. "` + `e.message` (línea 47) — concatenación directa, no usa el patrón `FormError`
- Vacío con filtros: `"Sin movimientos con estos filtros."` (línea 276)
- Vacío sin filtros: `"Sin movimientos este mes."` (línea 276)
- Cargando: `"Cargando…"` (línea 273)
- Categoría faltante en una fila: `"Sin categoría"` (línea 293)

**Etiquetas de resumen** (repetidas en dos bloques, "Este mes" y "Historial"): `"Gastos"`, `"Ingresos"`, y en el segundo bloque además `"Balance"` (líneas 133, 145, 241, 246, 253).

Abre `TransactionFormModal` (alta con `+`, edición al tocar una fila).

### Modal: Nuevo/Editar movimiento (`src/components/TransactionFormModal.jsx`)
Usado desde Inicio y Movimientos.

**1. Título de modal**
- `"Nuevo movimiento"` / `"Editar movimiento"` (línea 94)

**2. Campos**
- `"Monto"` (línea 120), prefijo `"$"`, placeholder `"0"` (línea 127)
- `"Categoría"` (línea 135), opción deshabilitada `"Elegir…"` (línea 143)
- Fecha: ver `CollapsedDateField` (compartido, más abajo)
- `"Descripción"` (línea 154), placeholder `"Opcional"` (línea 158) — sin ayuda adicional

**3. Botones**
- Segmentado `"Gasto"` / `"Ingreso"` (líneas 111-112)
- Acción: `"Guardar"` / `"Guardando…"` (línea 104)
- `"Eliminar movimiento"` (línea 197)

**4. Mensajes**
- `"No se pudo guardar el movimiento."` + detalle (línea 75)
- `"No se pudo eliminar el movimiento."` + detalle (línea 87)
- Confirmación de borrado: `"¿Eliminar este movimiento? Es permanente."` (línea 170), botones `"No"` / `"Sí, eliminar"` (líneas 179, 186)

---

## Portafolio (`src/pages/Portfolio.jsx`)

**1. Títulos**
- `"Portafolio"` (línea 123, sin descripción)
- `"Valor del portafolio"` (línea 156, tarjeta resumen)

**3. Botones**
- `"Reintentar"` (línea 135)
- `"Nuevo activo"` (línea 148 en estado vacío, línea 192 en la barra de acciones normal)
- `"Actualizar valores"` (línea 200, abre `ValuationModal` con todos los activos manuales)

**4. Mensajes**
- Error de carga: `"No se pudo cargar el portafolio. "` + `e.message` (línea 44)
- Estado vacío: `"Creá tu primer activo para empezar a registrar aportes."` (línea 141)
- Aviso precios cripto caídos: `"No se pudieron traer los precios cripto. Se muestra el último valor disponible de cada activo."` (líneas 172-173)
- Aviso activos sin valuación (singular): ``"${nombre}" no tiene valuación y no suma al total.`` (línea 179)
- Aviso activos sin valuación (plural): `"${n} activos sin valuación no suman al total."` (línea 180) — ambos seguidos de `'Usá "Actualizar valores".'` (línea 181)
- Cargando: `"Cargando…"` (línea 126)

**Métrica inline**
- `"aportado"` + monto, minúscula (línea 165, tarjeta resumen general; se repite igual en `AssetGroup`)

### `AssetGroup` / `AssetRow` (`src/components/AssetGroup.jsx`)
**5. Badges de estado**
- `"fuera del total"` (línea 77, cuando `include_in_total = false`)
- `"sin valuación"` (línea 82, cuando todos los activos del grupo no tienen valor)

**Texto de segunda línea por activo** (línea 10-24, varía por `valuation_mode`):
- live: `"${cantidad}${ticker} · prom. ${promedio} → hoy ${precioActual}"`
- manual: `"Valuación manual · ${fecha o 'sin valuar'}"`
- contributed: `"${monto} aportado"`

### `SourceTag` (`src/components/SourceTag.jsx`) — compartido entre fila de Portafolio y header del Detalle de activo
- live: `"en vivo"` + hora opcional (línea 14)
- stale: `"precio caído · último valor ${fecha}"` (línea 21)
- manual: `"valuado ${fecha}"` (línea 26)
- contributed: `"no requiere valuación"` (línea 29)
- sin valuación: `"sin valuación — no suma al total"` (línea 31)

Abre `AssetFormModal` (alta/edición) y `ValuationModal` (batch de manuales).

### Modal: Nuevo/Editar activo (`src/components/AssetFormModal.jsx`)
Usado desde Portafolio y desde el ícono de editar en Detalle de activo.

**1. Título**
- `"Nuevo activo"` / `"Editar activo"` (línea 138)

**2. Campos**
- `"Nombre"` (línea 154), placeholder `"ej: Bitcoin, Colchón USD"` (línea 158)
- `"Bolsa"` (línea 166), opción `"+ Nueva bolsa"` (línea 178), ayuda: `"Renombrar y archivar bolsas: en Ajustes."` (línea 185)
- `"Modo de valuación"` (línea 201), segmentado con 3 opciones y su ayuda (líneas 9-11):
  - `"Aportado"` — `"Vale lo aportado; nunca pide carga de valor."`
  - `"Manual"` — `"Pedís el valor a mano cada tanto."`
  - `"Vivo"` — `"Precio automático por identificador — hoy solo cripto vía CoinGecko; el resto cae a carga manual."`
- `"Ticker"` (línea 223), placeholder `"Opcional, ej: AAPL"` (línea 227) — sin texto de ayuda
- `"CoinGecko ID"` (línea 234, solo si modo = Vivo), placeholder `"ej: bitcoin, ethereum"` (línea 238), ayuda: `"Hoy solo cripto resuelve precio automático (vía CoinGecko) con este ID; el resto cae a carga manual."` (líneas 243-245)
- Switch `"Cuenta en el rendimiento"` (línea 250), ayuda: `"Desactivalo para reservas de valor como efectivo: no cuentan en el % de rendimiento del portafolio."` (líneas 267-270)

**3. Botones**
- `"Guardar"` / `"Guardando…"` (línea 147)
- `"Archivar activo"` (línea 313)

**4. Mensajes**
- `"No se pudo guardar el activo."` + detalle (línea 112)
- `"No se pudo archivar el activo."` + detalle (línea 124)
- Confirmación: `"¿Archivar este activo?"` (línea 281), `"No"` / `"Sí, archivar"` (líneas 289, 296)
- Ayuda tras confirmar: `"Por ahora, restaurarlo solo se puede hacer desde la base de datos; la restauración desde la app queda pendiente."` (líneas 301-304)

### Sub-form: Nueva bolsa (`src/components/CreateAssetTypeForm.jsx`)
Embebido en `AssetFormModal` ("+ Nueva bolsa") y en Ajustes.

**2. Campos**
- Sin label visible, placeholder `"Nombre de la bolsa"` (línea 38) — sin ejemplo ni ayuda
- Switch `"Cuenta en el rendimiento (default)"` (línea 43) — sin ayuda

**3. Botones**
- `"Cancelar"` (línea 63, solo si `onCancel` está presente)
- `"Crear bolsa"` / `"Creando…"` (línea 72)

**4. Mensajes**
- `"No se pudo crear la bolsa."` + detalle (línea 27)

### Modal: Actualizar valores (`src/components/ValuationModal.jsx`)
Abierto desde Portafolio (todos los activos manuales) y desde Detalle de activo (uno solo, vía el link "Actualizar valuación").

**1. Título**
- `"Actualizar valores"` (línea 51) — fijo, sin importar si es uno o varios activos

**2. Campos**
- Por activo: sin label individual más que el nombre; dato de referencia `"Último: ${valor} (${fecha})"` o `"Sin valuación previa"` (líneas 81-84); placeholder = último valor conocido o `"0"`
- Ayuda general: `"Valor en USD a la fecha elegida. Los que dejes vacíos no se tocan."` (línea 65)

**3. Botones**
- `"Guardar"` / `"Guardando…"` (línea 60)

**4. Mensajes**
- `"No se pudieron guardar las valuaciones."` + detalle (línea 44)

---

## Detalle de activo (`src/pages/AssetDetail.jsx`)

**1. Títulos**
- Sin `PageHeader`: el nombre del activo hace de título (línea 195), con ticker al lado si tiene
- `"Historial"` (línea 295, sección)

**2. Métricas (`MetricCard`, `src/components/assetDetail/MetricCard.jsx`)**
- `"Precio prom. de compra"` (línea 265)
- `"Precio actual"` (línea 273)
- `"Aportado"` (línea 280)
- Botón de ayuda por métrica: `aria-label='Qué significa "${label}"'` (MetricCard línea 29), glifo `"i"` (línea 35)
- Explicaciones (`METRIC_EXPLANATIONS`, líneas 29-34):
  - avg: `"Promedio ponderado de tus compras: total invertido ÷ cantidad comprada. Compararlo con el precio actual te muestra cuánto rindió tu inversión."`
  - current: `"Última cotización disponible, o tu última valuación manual si no hay precio en vivo."`
  - contributed: `"Capital propio en este activo: tus aportes menos la parte de capital de tus retiros. La diferencia con el valor actual es tu ganancia."`

**3. Botones**
- `aria-label="Volver a Portafolio"` `←` (línea 188)
- `aria-label="Editar activo"` (línea 202, ícono lápiz)
- `"Aportar"` (líneas 219 desktop, 352 barra mobile)
- `"Retirar"` (líneas 229 desktop, 362 barra mobile)
- `"Transferir"` (línea 318)
- `"Liquidar"` (línea 326, solo si `canLiquidate`)
- `"Actualizar valuación"` (línea 335, solo si `valuation_mode === 'manual'`)

**4. Mensajes**
- Error de carga: `"No se pudo cargar el activo. "` + `e.message` (línea 91)
- `"Reintentar"` (línea 240)
- Cargando: `"Cargando…"` (línea 235)
- `"equivale a ${cantidad} ${nombre}"` (línea 251, solo activos "vivos")

### Historial (`src/components/assetDetail/AssetHistory.jsx`)
- Vacío: `"Todavía no hay operaciones."` (línea 59)
- Fila de valuación intercalada: `"Valuación"` (línea 39, siempre esta palabra, no el nombre del activo)
- `"Ver más"` / `"Cargando…"` (línea 86)
- Error de paginación: `"No se pudo cargar más. Reintentá."` (línea 90)
- Etiquetas de cada operación (`labels`, resueltas por `classifyOperations` en `lib/portfolio.js`, no leídas en este barrido — son las que aparecen como título de cada fila del historial, ej. "Aporte", "Retiro", "Transferencia").

### Modal: Aportar / Retirar (`src/components/ContributionFormModal.jsx`)
Copy espejo según `operation` (líneas 21-47):

| | Aportar | Retirar |
|---|---|---|
| Título | `Aportar a ${nombre}` | `Retirar de ${nombre}` |
| Entidad (usada en mensajes) | `"aporte"` | `"retiro"` |
| Campo cantidad | `"Cantidad"` | `"Cantidad vendida"` |
| Campo pesos | `"Pesos invertidos"` | `"Pesos recibidos"` |
| Campo dólares | `"Dólares recibidos"` | `"Dólares vendidos"` |
| Pregunta de pesos | `"¿Cuántos pesos pusiste?"` | `"¿Cuántos pesos recibiste?"` |
| Label de origen/destino | `"¿De dónde sale?"` | `"¿A dónde va?"` |
| Opciones | `"De mi líquido"` / `"De afuera"` | `"A mi líquido"` / `"Afuera"` |

**2. Otros campos**
- `"Monto USD"` (línea 230, solo visible al editar), prefijo `"US$"`
- Placeholder de cantidad: `"ej: 0,001"` si es activo vivo, `"Opcional"` si no (líneas 224, 278)
- Ayuda: `"No toca tu saldo líquido."` (línea 289, cuando el origen/destino es "afuera")
- Aviso de transferencia: `"Parte de una transferencia — la otra pata no se modifica sola."` (línea 211, solo en registros que vienen de una transferencia)

**3. Botones**
- `"Guardar"` / `"Guardando…"` (línea 204)
- `Eliminar ${entidad}` → `"Eliminar aporte"` / `"Eliminar retiro"` (línea 329)

**4. Mensajes**
- `No se pudo guardar el ${entidad}.` + detalle (línea 176)
- `No se pudo eliminar el ${entidad}.` + detalle (línea 188)
- Confirmación: `¿Eliminar este ${entidad}? Es permanente.` (línea 302), `"No"` / `"Sí, eliminar"` (líneas 310, 317)
- Guardas de retiro (líneas 125-132):
  - `Estás retirando ${cantidad} un., pero solo tenés ${heldQty} un. de ${nombre}.`
  - `Este retiro supera el valor actual del activo (${valor}).`
  - `Este retiro supera el último valor conocido del activo (${'precio caído' | 'sin valuación'}) — no podemos confirmarlo con precisión, pero podés continuar.`

### Modal: Transferir (`src/components/contribution/TransferFormModal.jsx`)
**1. Título**: `Transferir desde ${fromAsset.name}` (línea 185)

**2. Campos**
- `"Destino"` (línea 201), opción `"Elegir…"` (línea 208)
- `Cantidad en ${fromAsset.name}` (línea 221, solo si origen es "vivo"), placeholder `"ej: 0,001"`
- `"Monto"` (línea 234), prefijo `"US$"` — sin aclarar moneda en el label (a diferencia de "Monto USD" en Aportar/Retirar)
- `Cantidad en ${destAsset.name}` (línea 250, solo si destino es "vivo")
- Pregunta de pesos propia: `"¿Cuántos pesos movés?"` (línea 264)

**3. Botones**: `"Guardar"` / `"Guardando…"` (línea 194)

**4. Mensajes**
- `"No se pudo guardar la transferencia."` + detalle (línea 178)
- Guarda de valor (líneas 151-156), mismo patrón que Retirar pero con `"transferencia"` en vez de `"retiro"`.

### Modal: Liquidar (`src/components/contribution/LiquidatePositionModal.jsx`)
**1. Título**: `Liquidar ${asset.name}` (línea 85)

**2. Campos**
- `"Monto de venta"` (línea 102), ayuda condicional (líneas 116-120):
  - `"Sin valuación conocida — indicá el monto de venta."`
  - `"Último valor conocido — ajustalo si vendiste por otro monto."`
  - `Se registra un retiro por este monto (valor actual: ${valor}).`
- `"Ganancia realizada"` (línea 125, campo de solo lectura, calculado)
- `"Cantidad"` (línea 136, solo si es "vivo") — mismo label que Aportar, distinto de "Cantidad vendida" de Retirar
- Pregunta de pesos propia: `"¿Cuántos pesos recibiste?"` (línea 150, igual que Retirar)
- `"¿A dónde va?"` (línea 155), opciones `"A mi líquido"` / `"Afuera"` (líneas 158-159), ayuda `"No toca tu saldo líquido."` (línea 165)
- `"Archivar el activo"` (línea 170, checkbox, tildado por default)

**3. Botones**: `"Liquidar"` / `"Liquidando…"` (línea 94) — el único modal con verbo propio en vez de "Guardar", según la convención del proyecto.

**4. Mensajes**: `"No se pudo liquidar la posición."` + detalle (línea 78) — dice "posición", único lugar del código visible al usuario que usa esa palabra en vez de "activo".

### Campo compartido: Tipo de cambio (`src/components/contribution/ExchangeRateField.jsx`)
Usado en Aportar/Retirar, Transferir y Liquidar. Tres variantes según contexto:

- **Editando (`FrozenRateField`)**: label `"Tipo de cambio"` (línea 29), link `${tasa} (guardado) · cambiar` (línea 35), al expandir: `"volver a lo guardado"` (línea 62)
- **Monto ya fijado (`CompactRateField`)**: `"Buscando cotización…"` (línea 106); label `"Tipo de cambio"` + link `Se registra con MEP del día (${tasa}) · usar otro` (líneas 110-116); en modo manual usa la `pesosQuestion` del padre; ayuda: prefijo `"No se pudo traer el MEP del día. "` si aplica + `"Tipo de cambio: "` (líneas 139-140); `"volver a MEP del día"` (línea 152)
- **Monto libre (`FullAmountRail`)**, defaults propios (líneas 315-318): `amountLabel="Monto"`, `pesosLabel="Pesos invertidos"`, `dolaresLabel="Dólares recibidos"`, `pesosQuestion="¿Cuántos pesos pusiste?"`
  - Segmentado `"ARS"` / `"USD"` (líneas 221, 227)
  - Conversión: `${ars} ≈ ${usd} al MEP ${tasa}` (líneas 242-245)
  - `"Buscando cotización…"` (línea 250); `MEP ${tasa} (hoy) · usar otro` (línea 259)
  - Modo manual: campos `pesosLabel`/`dolaresLabel`, `"Tipo de cambio: "` (línea 294), `"volver a MEP del día"` (línea 301)

---

## Objetivo (`src/pages/Goal.jsx`)

Pantalla stub — solo `PageHeader`:
- `"Objetivo"` (línea 6)
- `"Cuánto te falta para la independencia financiera."` (línea 7)

Sin campos, botones ni mensajes: la funcionalidad no está implementada.

---

## Deudas (`src/pages/Debts.jsx`)

Pantalla stub — solo `PageHeader`:
- `"Deudas"` (línea 6)
- `"Saldos y pagos, separados de tus gastos."` (línea 7)

Sin campos, botones ni mensajes: la funcionalidad no está implementada.

---

## Ajustes (`src/pages/Settings.jsx`)

**1. Títulos**
- `"Ajustes"` (línea 11, sin descripción)
- `"Cuenta"` (línea 20, sección)

**3. Botones**
- `"Cerrar sesión"` (línea 29)

**Contenido**: email del usuario mostrado tal cual (`{user?.email}`, línea 23), sin label.

### Sección Categorías (`src/components/CategoriesSection.jsx`)
**1. Títulos**: `"Gastos"` / `"Ingresos"` como títulos de grupo (líneas 275, 281)

**3. Botones / controles**
- Fila en edición: `"Archivar"` (línea 78), `"Cancelar"` (línea 90), `"Guardar"` (línea 98)
- Alta: segmentado `"Gasto"` / `"Ingreso"` (líneas 299, 308), placeholder `"Nueva categoría"` (línea 315), botón `"Agregar"` (línea 323)
- `▾/▸ Archivadas (${n})` (línea 335, toggle)
- `"Restaurar"` (línea 353)

**4. Mensajes**
- `"Sin categorías"` (línea 138, por grupo vacío)
- `"Cargando…"` (línea 271)
- `"Reintentar"` (línea 263)
- Errores — **todos concatenados como string plano**, no usan `FormError`: `"No se pudieron cargar las categorías. "` (175), `"No se pudo crear la categoría. "` (200), `"No se pudo renombrar la categoría. "` (216), `"No se pudo archivar la categoría. "` (235), `"No se pudo restaurar la categoría. "` (248) — cada uno seguido de `e.message`.

**5. Badges**
- `"categoría del sistema"` (línea 23, para categorías `is_system`)
- Kind de una categoría archivada: `"gasto"` / `"ingreso"` en minúscula (línea 347) — distinto casing/forma que el segmentado `"Gasto"`/`"Ingreso"` y que los filtros `"Gastos"`/`"Ingresos"` de Movimientos.

### Sección Bolsas (`src/components/AssetTypesSection.jsx`)
**1. Títulos**: `"Bolsas"` (línea 333)

**2. Campos / controles**
- Fila en edición: input sin label, `"Cancelar"` (línea 90) / `"Guardar"` (línea 98)
- Switch `"Cuenta en el total del portafolio"` (línea 133), ayuda: `"Si lo apagás, esta bolsa se ve pero no suma al valor total ni al rendimiento general."` (línea 151)

**3. Botones**
- `"Archivar bolsa"` (línea 192) / `"Eliminar bolsa"` (línea 225), según si la bolsa tiene activos archivados o ninguno
- `▾/▸ Archivadas (${n})` (línea 370), `"Restaurar"` (línea 382)

**4. Mensajes**
- `"Cargando…"` (línea 339), `"Sin bolsas"` (línea 344)
- Bloqueo por activos activos: `Tiene ${n} activo${s} activo${s}. Moveló${s} a otra bolsa o archivalo${s} para poder gestionar esta bolsa.` (líneas 156-159, con pluralización manual)
- Confirmaciones: `"¿Archivar esta bolsa?"` (línea 165) / `"¿Eliminar esta bolsa? Es permanente."` (línea 198), `"No"` / `"Sí, archivar"` / `"Sí, eliminar"`
- Errores — **estos sí usan el objeto `{message, detail}` + `FormError`**: `"No se pudieron cargar las bolsas."` (249), `"No se pudo renombrar la bolsa."` (265), `"No se pudo actualizar la bolsa."` (276), `"No se pudo archivar la bolsa."` (292), `"No se pudo restaurar la bolsa."` (308), `"No se pudo eliminar la bolsa."` (318)

**5. Badges**: `"fuera del total"` (línea 111, mismo badge y misma palabra que en `AssetGroup` de Portafolio)

---

## Navegación (`src/components/Layout.jsx`)

**1. Tabs** (rail desktop y barra inferior mobile, mismas labels): `"Inicio"`, `"Movimientos"`, `"Portafolio"`, `"Objetivo"`, `"Deudas"`, `"Ajustes"` (líneas 7, 14, 21, 28, 39, 46)
- Wordmark `"finanzas"` (línea 81, minúscula — consistente con Login)

---

## Componentes de formulario compartidos (genéricos, sin texto propio de dominio)

### `FormSheet` (`src/components/FormSheet.jsx`)
- `"Cancelar"` (línea 75, botón de cierre en el header — presente en TODOS los modales de formulario)

### `CollapsedDateField` (`src/components/form/CollapsedDateField.jsx`)
- Label default `"Fecha"` (línea 7)
- Colapsado: `"Hoy"` o la fecha formateada, + `" · cambiar"` (línea 19)

### `MissingHint` (`src/components/form/MissingHint.jsx`)
- `"Falta: ${término}"` o `"Falta: ${a}, ${b} y ${c}"` (línea 9) — arma la lista de qué falta con los términos que cada modal empuja a `missing` (ej. `"monto"`, `"categoría"`, `"fecha"`, `"tipo de cambio"`, `"cantidad"`, `"activo destino"`, `"cantidad en origen"`, `"cantidad en destino"`, `"monto de venta"`, `"un monto menor al valor actual"`, `"una cantidad que no supere lo que tenés"`, `"bolsa"`, `"nombre"`, `"modo de valuación"`)

### `FormError` (`src/components/form/FormError.jsx`)
Sin texto propio — renderiza `message` + `detail` que le pasa cada formulario.

### `ProtectedRoute` (`src/components/ProtectedRoute.jsx`)
- `"Cargando"` (línea 12, `sr-only`, solo lectores de pantalla)

---

## Componente sin uso actual: `LiquidModal` (`src/components/LiquidModal.jsx`)

**No está importado por ninguna página ni modal activo** — no llegué a encontrar quién lo abre (Dashboard no lo referencia; no aparece en ninguna otra pantalla). Queda como inventario por si se retoma, pero su copy no es alcanzable hoy desde la UI:

- Título: `"Actualizar líquido"` (línea 53)
- Campos: `"Líquido actual"` (línea 69, solo lectura, `"Calculando…"` mientras carga), `"Tenés (real)"` (línea 75, sin ayuda de qué contar)
- Botón: `"Guardar"` / `"Guardando…"` (línea 62)
- Previsualización: `Diferencia: ${+/−}${monto} → se registrará un ${ingreso/gasto} de ajuste${' como saldo inicial' si aplica}.` (líneas 99-103); sin diferencia: `"Sin diferencia: no se genera ajuste."` (línea 107)
- Errores: `"No se pudo calcular el líquido actual."` (línea 26), `"No se pudo guardar la reconciliación."` (línea 46)

---

## Términos con más de una forma para la misma cosa

- **"Actualizar valores" vs "Actualizar valuación"**: el botón de Portafolio dice `"Actualizar valores"` (plural, batch) y abre un modal titulado `"Actualizar valores"`; el botón equivalente en Detalle de activo dice `"Actualizar valuación"` (singular) pero abre el **mismo modal**, que sigue titulado `"Actualizar valores"` — el título no coincide con el botón que lo abrió.
- **"Gasto/Gastos/gasto"** e **"Ingreso/Ingresos/ingreso"**: singular en el segmentado de alta (`"Gasto"`/`"Ingreso"`, TransactionFormModal y CategoriesSection), plural en los filtros y totales de Movimientos (`"Gastos"`/`"Ingresos"`), minúscula en el badge de categoría archivada (`"gasto"`/`"ingreso"`, CategoriesSection línea 347).
- **"Monto" / "Monto USD" / "Monto de venta"**: mismo tipo de campo (un importe en USD) con tres labels distintos según el modal — TransferFormModal dice `"Monto"` a secas, ContributionFormModal (editando) dice `"Monto USD"`, LiquidatePositionModal dice `"Monto de venta"`.
- **"Cantidad" / "Cantidad vendida" / "Cantidad en {activo}"**: Aportar usa `"Cantidad"`, Retirar usa `"Cantidad vendida"`, Liquidar vuelve a `"Cantidad"`, Transferir usa `"Cantidad en ${nombre}"`.
- **Preguntas de pesos**: `"¿Cuántos pesos pusiste?"` (aportar), `"¿Cuántos pesos recibiste?"` (retirar y liquidar), `"¿Cuántos pesos movés?"` (transferir) — tres variantes para la misma pregunta subyacente ("cuántos pesos entran/salen").
- **"Tipo de cambio" vs "MEP" vs "dólar MEP"**: el label del campo siempre es `"Tipo de cambio"`, pero toda la microcopy de ayuda usa `"MEP"` sin explicarlo (`"Se registra con MEP del día"`, `"volver a MEP del día"`, `"MEP ${tasa} (hoy)"`) — nunca aparece en la UI la forma completa "dólar MEP" que sí usa la documentación.
- **"Cuenta en el rendimiento"**: aparece igual en `AssetFormModal` (por activo, campo `yields`) y en `CreateAssetTypeForm` como `"Cuenta en el rendimiento (default)"` (por bolsa, campo `earns_yield`) — mismo texto base para dos flags distintos en dos niveles del modelo. Un tercer switch cercano, `"Cuenta en el total del portafolio"` (`AssetTypesSection`, campo `include_in_total`), usa una redacción distinta para un concepto también distinto (suma al total vs. suma al %).
- **"fuera del total"**: mismo badge literal en `AssetGroup` (Portafolio) y `AssetTypesSection` (Ajustes) — consistente, pero solo se explica (con texto de ayuda) en Ajustes, no en Portafolio.
- **Errores de carga/acción**: mayoría de los formularios usa el patrón `{message, detail}` + `FormError`, pero `CategoriesSection` concatena strings planas (`'No se pudieron cargar las categorías. ' + e.message`) y las muestra en un `<p>` propio en vez de `FormError` — mismo dominio (Ajustes), dos patrones de error distintos entre `CategoriesSection` y `AssetTypesSection`.
- **"Guardar" como default silencioso**: todos los modales dicen `"Guardar"` salvo `LiquidatePositionModal` (`"Liquidar"`), que sigue la convención documentada; el resto no distingue textualmente entre crear, editar, transferir o reconciliar — todo es "Guardar".

## Términos usados con más de un significado

- **"Aportado"**: (a) nombre del modo de valuación `contributed` en el segmentado de `AssetFormModal`; (b) métrica del detalle de activo (`MetricCard`, capital propio neto = aportes menos la parte de capital de los retiros, según `METRIC_EXPLANATIONS`); (c) línea de fila en Portafolio/`AssetGroup` (`"${monto} aportado"`), que no aclara si neta los retiros o es el bruto histórico — mismo término, potencialmente números distintos.
- **"Retirar" vs "Liquidar"**: ambas son formas de sacar valor de un activo (una parcial, otra total/cierre de posición) expuestas como dos links separados en Detalle de activo, sin ningún texto que explique cuándo usar una u otra.
- **"Valor"**: "Valor del portafolio" (Portafolio, total agregado calculado) vs "valor actual" (mensajes de guarda de retiro/transferencia, y `MetricCard` "Precio actual") vs "sin valuación — no suma al total" (`SourceTag`) — a veces es el total del portafolio, a veces el precio de una unidad/activo.
- **"Transferir"**: mueve una posición entre dos activos propios del usuario (no es una transferencia bancaria); ningún texto en el modal lo distingue de "Aportar"/"Retirar" para alguien que lo ve por primera vez.
- **"Bolsa"**: metáfora interna para `asset_types` (agrupador de activos); no se explica en ningún lugar de la UI qué es una "bolsa" ni por qué existe separada de "activo" — un usuario nuevo podría leerla como "casa de bolsa"/mercado.
- **"Ajuste"**: nombre de la categoría de sistema (`"categoría del sistema"` en Ajustes) y concepto detrás de la reconciliación de líquido (`LiquidModal`: "se registrará un ingreso/gasto de ajuste"). Hoy `LiquidModal` no es alcanzable desde ninguna pantalla, así que el único lugar donde "ajuste" tiene contexto en la UI activa es el badge de categoría de sistema, sin explicar para qué se usa esa categoría.

## Campos que se piden sin explicar qué son o qué pasa si quedan vacíos

- `AssetFormModal` → **"Ticker"**: placeholder `"Opcional, ej: AAPL"`, sin texto de ayuda sobre para qué se usa (hoy es solo informativo).
- `TransactionFormModal` → **"Descripción"**: placeholder `"Opcional"` sin más contexto; no se dice que después aparece junto al nombre de la categoría en la lista de movimientos.
- `ContributionFormModal` / `LiquidatePositionModal` / `TransferFormModal` → **"Cantidad" (todas sus variantes)**: solo se pide (y es obligatoria) para activos de modo "Vivo"; el campo simplemente no aparece para el resto, sin ningún texto que explique la condición al usuario.
- `CreateAssetTypeForm` → **"Nombre de la bolsa"**: sin placeholder de ejemplo (a diferencia de "Nombre" de activo, que sí tiene `"ej: Bitcoin, Colchón USD"`) y sin explicar qué es una bolsa ni sus consecuencias.
- `ExchangeRateField` (modo manual) → **"Pesos invertidos" / "Pesos recibidos"**: no aclara que ese monto en pesos no se guarda como tal — solo se usa para derivar y registrar el tipo de cambio.
- `LiquidModal` → **"Tenés (real)"**: sin explicar qué contar como líquido real (efectivo + cuentas, según la documentación) — no aplica hoy porque el modal no es alcanzable, pero queda para cuando se retome.
- Sección **"Bolsas"** en Ajustes: el encabezado de sección no tiene descripción (a diferencia de otras pantallas con `PageHeader`), y es el único lugar de toda la app donde se explica qué hace cada bolsa — si un usuario llega a "Bolsa" desde `AssetFormModal` antes de pasar por Ajustes, no tiene ninguna explicación disponible ahí.
