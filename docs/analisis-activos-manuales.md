# Análisis — activos manuales (modelo, cálculo y terminología)

Relevamiento de solo lectura para decidir un cambio de diseño sobre los activos
con `valuation_mode = 'manual'`: cómo los modela hoy la app, cómo calcula su
"valuación", y qué ve un usuario nuevo al crearlos y valuarlos. Sin propuestas.

Fecha: 2026-07-21.

---

## Parte 1 — Modelo y reglas de cálculo

### 1. Modelo del activo manual

Un `asset` manual usa la **misma tabla `assets`** que todos
(`docs/ARCHITECTURE.md:60-73`, migraciones `0001`/`0014`/`0015`). No hay
columnas propias: lo único que lo distingue es `valuation_mode = 'manual'`
(CHECK: `'contributed' | 'manual' | 'live'`).

- **No guarda cantidad/unidades en el activo.** La única noción de "unidades"
  vive en `contributions.quantity` (`numeric(20,8)`, opcional —
  `ARCHITECTURE.md:82`), por operación, no en el activo.
- Diferencia operativa (toda en `valueAsset`, `src/lib/portfolio.js:78-112`):
  - `live`: valor = `heldQuantity × precio` (precio por unidad de API); cae a
    la última valuación si no hay precio.
  - `contributed`: valor = aportado; **nunca** pide valuación.
  - `manual`: valor = última valuación cargada (total); **sin valuación,
    valor = null** (no cae al aportado).
- `coingecko_id` / `ticker` existen en la fila pero el modo manual no los usa.

### 2. Qué significa "valuación" hoy — es VALOR TOTAL, no precio por unidad

`asset_valuations.value_usd` (`numeric(14,2)`, `ARCHITECTURE.md:89-97`) se
interpreta como **el valor total actual del activo**. En `valueAsset`
(`src/lib/portfolio.js:103-110`):

```js
if (latestValuation) {
  return { contributed, value: Number(latestValuation.value_usd), source: 'manual', date: ... }
}
```

`value = value_usd` **directo, sin multiplicar por cantidad**. Comparar con la
rama `live` (`:86`): `value = quantity * price` — ahí sí `price` es por unidad.
En `manual` no hay ninguna multiplicación → `value_usd` es el total.

Se confirma en la UI de carga: `ValuationModal.jsx:64` dice "Valor en USD a la
fecha elegida" y muestra "Último: {formatUSD(value_usd)}" (`:82`).
`upsertValuation` (`src/lib/valuations.js:32-43`) guarda ese número tal cual.

`computeContributed` (`portfolio.js:17-24`) no toca `asset_valuations`: suma/
resta `amount_usd` de las contributions. Aportado y valuación son cálculos
independientes.

### 3. Cantidad en activos manuales — se puede guardar, casi no se usa

- **Aportar/Retirar a un manual**: `ContributionFormModal.jsx:271-283`
  renderiza un campo "Cantidad" con `placeholder="Opcional"` y
  `required={isLive}` (= no requerido para manual). Si el usuario lo completa,
  se guarda: `finalQuantity > 0 ? finalQuantity : null` (`:102, :150/:165`). O
  sea **un manual SÍ puede acumular `quantity` en sus contributions**.
- **Transferir a un manual**: el input de cantidad-destino solo se muestra si
  `destAsset.valuation_mode === 'live'` (`TransferFormModal.jsx:248`,
  validación en `:145`). A un manual la pata de entrada va con
  `toQuantity = null` (`:171`). Por eso una transferencia a un manual queda
  **sin cantidad**.
- **¿Se usa esa cantidad?** En `valueAsset` manual, **no**: el valor sale solo
  de `value_usd`. `heldQuantity` (`portfolio.js:59-67`) suma cantidades pero
  solo se llama para `live` (en `valueAsset` y en `AssetDetail`
  `heldQty = mode==='live' ? heldQuantity(...) : 0`). El único lugar donde la
  cantidad de un manual "asoma" es `averagePurchasePrice`
  (`portfolio.js:139-153` = Σ`amount_usd` / Σ`quantity` sobre entradas con
  `quantity>0`), que en `AssetDetail` alimenta la métrica "Precio prom. de
  compra" y se muestra para todo activo que no sea `contributed` (manual
  incluido). Si un manual no tiene cantidad → devuelve `null` → "—".
- **¿Conflicto cantidad × valuación?** No se multiplican ni se cruzan: `value`
  sale 100% de `value_usd`. La cantidad de un manual, si existe, solo afecta el
  número "Precio prom. de compra" (informativo); **nunca** el valor ni la
  ganancia.

### 4. El caso "prueba": por qué quedó valiendo 1 en total

1. **La transferencia** (`create_transfer`, migración `0017`; cliente
   `src/lib/contributions.js`) insertó la pata de entrada:
   `asset_id=prueba, amount_usd=10, quantity=NULL` (null porque el destino
   manual no pide cantidad, §3), `direction='in'`.
2. **Antes de valuar**: `computeContributed = 10` (aportado). `valueAsset`
   manual sin `latestValuation` → `{ contributed:10, value:null,
   source:'none' }` → "sin valuación", no suma al total. El detalle muestra
   valor `US$ 0` (`formatUSD(valuation?.value ?? 0)`).
3. **La valuación** (`ValuationModal` → `upsertValuation`) guardó una fila
   `asset_valuations{ asset_id=prueba, value_usd=1 }` — interpretada como
   **valor total = 1** (§2).
4. **El cálculo** (`portfolio.js:103-110`): `value = Number(value_usd) = 1`. No
   multiplica por nada. Ganancia = `value − contributed = 1 − 10 = −9`.

O sea: se cargó "1" y el sistema lo tomó como "este activo hoy vale 1 USD en
total", no "1 USD por unidad" (no hay unidades: `quantity` era null, y aun con
unidades no las usaría). Por eso "vale 1 en total".

### 5. Interacción valuación vs aportado

- **Conviven como dos números separados**: `contributed` (base de costo, de
  `computeContributed`) y `value` (valor actual, de `value_usd`). La ganancia
  mostrada es `value − contributed` (`AssetDetail`:
  `gain = valuation.value − valuation.contributed`).
- La valuación **reemplaza al aportado como VALOR** del activo (lo que suma al
  total del portafolio y lo que se compara para la ganancia), pero **no borra**
  el aportado, que sigue como referencia de costo.
- **Manual sin valuación cargada**: `value = null`, `source='none'`
  (`portfolio.js:111`) → **no** usa el aportado como valor, y **no** suma al
  total del portafolio (a diferencia de `contributed`, que sí hace
  `value = contributed`, `:99-101`). El aportado sigue existiendo, pero el
  activo figura como "sin valuación".

**Tensión de fondo:** en modo `manual` el número cargado es un **total**,
mientras que un activo con unidades (como el `live`) razona en
**precio × cantidad**; hoy la cantidad de un manual se puede guardar pero queda
inerte salvo por la métrica de precio promedio.

---

## Parte 2 — Terminología de cara al usuario

Desde la óptica de alguien que usa la app por primera vez, con los strings
reales.

### A. Términos que ve al CREAR el activo (`AssetFormModal.jsx`)

- **"Nombre"** — placeholder `"ej: Bitcoin, Colchón USD"`.
- **"Bolsa"** (select) + opción **"+ Nueva bolsa"**; ayuda:
  `"Renombrar y archivar bolsas: en Ajustes."` (`:185`).
- **"Modo de valuación"** (`:201`) — segmentado de 3 con una línea de ayuda que
  cambia según la opción (`VALUATION_MODES`, `:8-12`):
  - **"Aportado"** → `"Vale lo aportado; nunca pide carga de valor."`
  - **"Manual"** → `"Pedís el valor a mano cada tanto."`
  - **"Vivo"** → `"Precio automático por identificador — hoy solo cripto vía
    CoinGecko; el resto cae a carga manual."`
- **"Ticker"** — placeholder `"Opcional, ej: AAPL"`, sin ayuda.
- **"Cuenta en el rendimiento"** (switch) + ayuda `"Desactivalo para reservas
  de valor como efectivo: no cuentan en el % de rendimiento del portafolio."`
  (`:267-270`).
- (Si edita) **"Archivar activo"** → confirmación `"¿Archivar este activo?"`.

### B. Términos que ve al VALUAR

**Portafolio** (`Portfolio.jsx`):
- Botón **"Actualizar valores"** (`:200`), aparece solo si hay activos
  manuales.
- Aviso: `"«{nombre}» no tiene valuación y no suma al total."` / `"{n} activos
  sin valuación no suman al total. Usá «Actualizar valores»."` (`:179-181`).

**Modal de valuación** (`ValuationModal.jsx`):
- Título **"Actualizar valores"** (`:51`).
- Ayuda: `"Valor en USD a la fecha elegida. Los que dejes vacíos no se tocan."`
  (`:64-65`).
- Por activo: nombre + `"Último: {monto} ({fecha})"` o `"Sin valuación previa"`
  (`:81-83`); input con prefijo **"US$"**.
- Fecha: **"Fecha"** colapsada (`"Hoy · cambiar"`).

**Detalle del activo** (`AssetDetail.jsx`):
- Link **"Actualizar valuación"** (`:335`, solo modo manual).
- Valor grande arriba (sin label), y **NO** muestra la línea `"equivale a X"`
  (esa es solo `live`, `:249`).
- Grilla de métricas (`:262-284`): **"Precio prom. de compra"**, **"Precio
  actual"**, **"Aportado"**, cada una con un botón (i). Textos (i) (`:29-34`):
  - Precio actual → `"Última cotización disponible, o tu última valuación
    manual si no hay precio en vivo."`
  - Precio prom. → `"Promedio ponderado de tus compras: total invertido ÷
    cantidad comprada…"`
  - Aportado → `"Capital propio en este activo: tus aportes menos la parte de
    capital de tus retiros…"`

**Fila de Portafolio** (`AssetGroup.jsx:20-21`): segunda línea de un manual =
`"Valuación manual · {fecha}"` o `"Valuación manual · sin valuar"`.

**Etiqueta de origen** (`SourceTag.jsx`): manual → `"valuado {fecha}"`; sin
valuación → `"sin valuación — no suma al total"`; contributed →
`"no requiere valuación"`.

### C. Decisiones que se piden sin explicar (o sin decir qué pasa si no se toman)

1. **"Modo de valuación" al crear** (`AssetFormModal.jsx:201`): decisión
   obligatoria de 3 opciones. La ayuda de "Manual" (`"Pedís el valor a mano
   cada tanto."`) **no dice** la consecuencia clave: hasta que se cargue un
   valor, el activo figura "sin valuación" y **no suma al total** (eso aparece
   después, en el aviso de Portafolio y en `SourceTag`). Además, si no elige,
   queda un **default** (el modo predominante de la bolsa, o "manual";
   `predominantValuationMode`, `:17-32`) que la persona puede no notar que se
   eligió por ella.

2. **La valuación es un TOTAL, no por unidad** (`ValuationModal.jsx:64`): el
   único texto es `"Valor en USD a la fecha elegida."`. No aclara que ese
   número es el **valor total del activo** (no precio por unidad) — lo que
   confundió en el caso "prueba". La decisión "¿qué número pongo?" se toma sin
   esa información.

3. **"Cantidad (Opcional)" al aportar/transferir a un manual**
   (`ContributionFormModal.jsx:271-283`, `copy.quantity` = "Cantidad" /
   "Cantidad vendida"): el campo se ofrece con placeholder `"Opcional"`, pero
   **nada dice** que en un activo manual esa cantidad no se usa para nada
   (queda inerte; Parte 1 §3). Decisión ofrecida sin explicar que no tiene
   efecto.

4. **"¿De dónde sale?" / "¿A dónde va?"** al aportar/retirar
   (`ContributionFormModal.jsx:285-291`, opciones "De mi líquido" / "De
   afuera"): solo "De afuera/Afuera" muestra ayuda (`"No toca tu saldo
   líquido."`). Para "De mi líquido" no hay texto de qué implica.

5. **Fecha de la valuación** (`ValuationModal.jsx`, `"a la fecha elegida"`): se
   pide elegir fecha; la única ayuda (`"Los que dejes vacíos no se tocan."`)
   explica los vacíos, no qué significa la fecha ni qué pasa si deja "Hoy".

6. **"Cuenta en el rendimiento"** (switch, `AssetFormModal.jsx:250`): tiene
   ayuda, pero asume que la persona entiende "rendimiento" y "% de rendimiento
   del portafolio".

7. **Al no cargar valuación**: la consecuencia (`"sin valuación — no suma al
   total"`) se comunica **después**, en la fila/aviso, nunca en el momento de
   crear el activo manual. El usuario nuevo crea un manual y no sabe que le
   queda "a medias" hasta valuar.

### D. Mapa exacto de "valuación" / "valuar" de cara al usuario

La palabra aparece con **texto acompañante desparejo**, y el flujo mezcla tres
términos para lo mismo — **"valuación"**, **"valores"** y **"valor"**:

| Dónde | Texto exacto | Ayuda acompañante |
|---|---|---|
| `AssetFormModal.jsx:201` | **"Modo de valuación"** (label) | La ayuda del modo Manual dice `"Pedís el valor a mano cada tanto."` — usa "valor", no "valuación" |
| `Portfolio.jsx:200` / `ValuationModal.jsx:51` | Botón/título **"Actualizar valores"** | En el modal: `"Valor en USD a la fecha elegida. Los que dejes vacíos no se tocan."` |
| `Portfolio.jsx:179-181` | Aviso `"…no tiene valuación y no suma al total."` / `"…sin valuación no suman al total."` | `"Usá «Actualizar valores»."` |
| `ValuationModal.jsx:83` | `"Sin valuación previa"` | (ninguna) |
| `AssetDetail.jsx:335` | Link **"Actualizar valuación"** | (ninguna) |
| `AssetDetail.jsx:31` (texto (i) de "Precio actual") | `"…o tu última valuación manual si no hay precio en vivo."` | es el propio texto de ayuda |
| `AssetGroup.jsx:21` | Fila: `"Valuación manual · {fecha}"` / `"Valuación manual · sin valuar"` | (ninguna) |
| `SourceTag.jsx:26,29,31` | `"valuado {fecha}"` · `"no requiere valuación"` · `"sin valuación — no suma al total"` | son la etiqueta misma, sin más texto |

Observaciones de terminología que enfrenta el usuario nuevo:
- El **botón** dice "Actualizar **valores**", el **link** del detalle dice
  "Actualizar **valuación**", y los **avisos** dicen "sin **valuación**" — tres
  formas para la misma acción.
- **"Aportado"** aparece con **tres sentidos** distintos: un modo de valuación
  ("Aportado"), una métrica del detalle ("Aportado"), y la 2ª línea de la fila
  de un contributed ("{monto} aportado").
- En el detalle, a un manual se le muestra la métrica **"Precio actual"** con
  lo que en realidad es un **total** (no un precio), y **"Precio prom. de
  compra"** que para un manual suele dar "—" (sin cantidad) — el usuario ve la
  palabra "Precio" aplicada a un valor total.
