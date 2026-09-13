# Deudas y su relación con los gastos del mes — cómo funciona hoy

Informe técnico, sin cambios de código. Se hizo para decidir el diseño de
cuotas y suscripciones ("cargar una compra en 6 cuotas y ver $50.000 de gasto
por mes durante seis meses"), sin tocar nada todavía.

Fecha del relevamiento: 2026-09-13. Fuente: código de `src/lib/debts.js`,
`src/lib/liquid.js`, `src/lib/movements.js`, `src/lib/transactions.js`,
`src/lib/expensesSummary.js`, `src/components/DebtFormModal.jsx`,
`src/components/DebtPaymentModal.jsx`, `src/pages/Debts.jsx`,
`src/pages/Dashboard.jsx`, `src/pages/settings/Accounts.jsx`, y las
migraciones `0001`, `0010`, `0023`, `0033`, `0036`, `0039`.

---

## 1. El modelo hoy: qué es una deuda, qué es un pago

Dos tablas, sin categoría de por medio.

**`debts`** — un préstamo: `creditor`, `original_amount_usd`, `start_date`.
Nada más. No tiene "cuotas", ni frecuencia, ni plan de pago: es un monto
único en dólares y una fecha de inicio (`DebtFormModal.jsx`). El comentario
del propio formulario lo dice: *"Los pagos se registran después, uno por
uno"*.

**`debt_payments`** — un pago contra una deuda: `debt_id`, `date`,
`amount_usd`, `mep_rate` (tipo de cambio congelado, nullable), `affects_liquid`
(default `true`), `account_id`. Cada pago se carga a mano, desde la deuda ya
creada (`DebtPaymentModal.jsx`), con su propio monto y fecha — no hay ningún
mecanismo que genere varios pagos de una sola carga.

**Saldo de una deuda** (`debtBalance` en `lib/debts.js`) = `original_amount_usd
− Σ amount_usd de sus pagos`, con piso en 0. Es un valor **calculado**, nunca
guardado — no hay columna "saldo" en ningún lado del sistema (mismo patrón que
el disponible).

### 1.1 Un pago NO genera fila en `transactions`

Esto es lo primero a tener claro, porque cambia todo lo que sigue: pagar una
deuda **no crea un gasto**. No hay ninguna categoría "Pago de deuda", ni el
código de `createPayment`/`updatePayment` (`lib/debts.js`) toca la tabla
`transactions` en ningún punto. El pago vive únicamente como una fila de
`debt_payments`, con su propio `account_id` para saber de qué cuenta salió la
plata.

Esto contrasta con Ajuste de saldo, Movimiento de ahorro o Transferencia de
cuenta (que sí son `transactions` con una categoría de sistema, ver
`lib/systemCategories.js`) y con los aportes/retiros a un activo (que viven en
`contributions`, la otra tabla que sí entra a `monthTotals`). Un pago de
deuda es la única de las cuatro "salidas de plata que no son un gasto" que
**no aparece en ninguna lista de movimientos ni en ningún total del mes**
(sección 2).

### 1.2 "De mi disponible" vs. "de afuera": el mismo mecanismo que Aportar

`affects_liquid` decide de dónde sale la plata, con las mismas dos opciones y
las mismas palabras que en Aportar a un activo:

| | `affects_liquid` | Resta del disponible | `account_id` |
|---|---|---|---|
| **"De mi disponible"** | `true` | Sí, al `mep_rate` congelado del día | El que elige el usuario |
| **"De afuera"** | `false` | No | Se fuerza `null` (aunque el usuario haya elegido cuenta antes de cambiar el origen — `toPaymentRow` en `lib/debts.js`) |

En los dos casos el pago **baja el saldo de la deuda por igual** — el destino
del dinero (la deuda) no distingue de dónde salió. Lo único que cambia es si
además tocó el disponible.

Un pago sin `mep_rate` (anteriores a la migración 0010, o cargados sin tasa)
queda **fuera del cálculo del disponible** aunque `affects_liquid` sea `true`
— tanto en `computeLiquidByAccount` (JS) como en `get_liquid_by_account` (SQL,
migración 0039) el filtro es `mep_rate is not null`. Es la misma regla que
Guardar-sin-tocar-nada del resto de la app: no se sale a buscar una cotización
de hoy para completar un dato viejo.

---

## 2. El recorrido: ¿un pago del disponible cuenta en algún lado?

**No, en ninguna de las tres pantallas.** Ni en "Gastos del mes" de Inicio, ni
en los totales de Movimientos, ni en el desglose por categoría. La tabla:

| Pantalla / cálculo | Fuente de datos | ¿Incluye `debt_payments`? |
|---|---|---|
| Inicio → "Gastos del mes" (`ExpensesBlock.jsx`) | `getExpenses()` (`lib/transactions.js`) — solo `transactions` con `kind='expense'` | **No.** La query ni siquiera toca `debt_payments`. |
| Movimientos → los 5 totales del período (`monthTotals`, `lib/movements.js`) | Recibe `{ transactions, contributions }` como parámetros | **No.** La firma de la función no tiene un tercer parámetro para pagos de deuda; no hay forma de que entren. |
| Movimientos → desglose por categoría (`groupByCategory`, `lib/expensesSummary.js`) | Mismo array de `expenses` que arriba | **No**, por la misma razón: nunca llegó ahí. |
| Movimientos → la LISTA de movimientos (`mergeMovements`, `lib/movements.js`) | `{ transactions, contributions, transfers }` | **No.** Un pago de deuda no tiene forma de aparecer como fila en Movimientos — ni como gasto, ni como transferencia. Su único lugar de lectura en toda la app es la tarjeta de la deuda en la pantalla Deudas. |
| `computeLiquidByAccount` / `get_liquid_by_account` (el disponible) | `transactions + contributions + debt_payments` | **Sí.** Un pago con `affects_liquid=true` y `mep_rate` resta de su cuenta, igual que un aporte. |

Es una asimetría real, y está confirmada por `FUNCTIONAL.md` (línea 145):
*"Los pagos de deuda quedan fuera de estos indicadores (se reportan aparte)"*
— referido a tasa de ahorro y % invertido, pero el código la extiende también
a Gastos del mes y al desglose por categoría, no solo a esos dos ratios.

**Consecuencia concreta:** hoy pagás una deuda con tu disponible, ese dinero
sale de tu cuenta (baja el "Dinero disponible" de Inicio), pero **en ninguna
pantalla de la app aparece como algo que gastaste este mes**. Es plata que
salió del bolsillo y no se ve en ningún lado excepto en el saldo de la cuenta.
Esto es distinto de un aporte a inversión, que sí tiene su propia fila
("Invertido") en `monthTotals` aunque tampoco cuente como "Gastos".

---

## 3. La tarjeta de Deudas de Inicio y el total adeudado de Mi plata

Las dos leen exactamente la misma función, sin intermediarios propios:

```
summarizeDebts(await getDebts()).totalBalance
```

- **`getDebts()`** trae **todas** las deudas del usuario con sus pagos
  anidados (un solo `select`, sin filtro de fecha ni de estado).
- **`summarizeDebts()`** separa activas (`balance > 0`) de saldadas
  (`balance <= 0`) y suma `debtBalance()` de las **activas únicamente**. Una
  deuda saldada no resta ni suma nada al total — desaparece de la cuenta, con
  su historial intacto y colapsado bajo "Saldadas".

`Dashboard.jsx` (tarjeta "Deudas", visible solo si hay alguna deuda cargada) y
`pages/settings/Accounts.jsx` (fila "Deudas" de Mi plata) llaman a este mismo
par de funciones por separado — dos consultas y dos cálculos independientes,
pero la MISMA regla, así que los dos números siempre coinciden. No hay una
tabla ni una vista compartida entre ellos; es la definición pura (`lib/debts.js`)
invocada dos veces.

Es un número en **USD**, aislado de la moneda local: no se mezcla ni se
convierte con el disponible en ninguna de las dos pantallas (coherente con la
regla de los "tres mundos", sección 5).

---

## 4. ¿Se puede cargar una deuda con pagos futuros programados?

**No existe el concepto de "pago programado" o "plan de cuotas".** Lo que
existe:

- Una deuda es un monto único (sección 1). No hay campo para "N cuotas de
  tanto cada una" ni para frecuencia.
- Cada pago se carga individualmente desde `DebtPaymentModal`, con su propia
  fecha (`CollapsedDateField`, sin restricción a hoy o al pasado — técnicamente
  se puede poner cualquier fecha, incluida una futura).
- Pero un pago con fecha futura **no queda como un dato "pendiente" o
  "planeado"**: es una fila real de `debt_payments`, indistinguible de un pago
  ya ocurrido. Y como vimos en la sección 2, `debtBalance()` y
  `get_liquid_by_account()`/`computeLiquidByAccount()` **no filtran por
  fecha** — suman TODAS las filas, sin importar si la fecha es futura o
  pasada.

**Consecuencia concreta:** si hoy cargás por adelantado los 6 pagos futuros de
una cuota, la deuda se ve saldada al instante (el saldo ya descontó los 6
pagos) y, si marcaste "de mi disponible", el disponible actual **también** baja
de una, como si ya hubieras pagado las 6 cuotas hoy. No hay ninguna noción de
"esto va a pasar" separada de "esto pasó": la fecha de una fila es solo un
dato descriptivo para ordenar y filtrar, nunca una condición que la excluya
del cálculo del presente. Esto es consistente en TODA la app (transactions,
contributions y debt_payments funcionan igual: no hay estado "futuro" ni
"pendiente" en ningún lado del modelo de datos).

---

## 5. Los tres mundos que nunca se suman — y qué pasaría con una cuota

### 5.1 Dónde está escrito

- `CLAUDE.md` (contexto de negocio): *"Tres mundos separados que nunca se
  suman en un patrimonio total: dinero líquido (ARS, operativo), invertido
  (USD, con rendimiento) y deudas (saldo restante en USD)."*
- `docs/FUNCTIONAL.md:19`: *"Tres mundos separados: la app maneja tres
  magnitudes que se muestran SIEMPRE por separado (...). NO existe un
  'patrimonio total' que sume líquido + invertido: pesos inflacionarios y
  dólares no son comparables ni sumables de forma útil."*
- `docs/FUNCTIONAL.md:146`: *"NO existe un indicador de 'patrimonio total':
  líquido, invertido y deuda se leen por separado."*
- `docs/ARCHITECTURE.md` (sección Fórmulas): *"No existe un 'patrimonio
  total' que sume líquido + portafolio: son magnitudes separadas."*

No hay un ADR dedicado exclusivamente a esta regla (a diferencia de, por
ejemplo, ADR-015 para saldos/gastos por moneda) — vive repetida, casi palabra
por palabra, en las tres fuentes de arriba. Es una decisión de producto
declarada, no una consecuencia accidental del esquema.

### 5.2 Qué significa exactamente "no se mezclan"

Leyendo el código (no solo la declaración), la regla real que se cumple hoy
es más específica que "tres números separados en pantalla": es que **una
operación pertenece a un solo mundo a la vez, y ese mundo determina de qué
tabla sale y qué cálculos la tocan**. Concretamente:

- `transactions` (líquido, ARS) → cuenta en Gastos/Ingresos, en `monthTotals`,
  en el desglose por categoría, en el disponible.
- `contributions` (invertido, USD) → cuenta en "Invertido"/"Ahorrado" de
  `monthTotals`, en el rendimiento del portafolio, y (si `affects_liquid`) en
  el disponible.
- `debt_payments` (deuda, USD) → cuenta en el saldo de la deuda, y (si
  `affects_liquid`) en el disponible. **No** cuenta en `monthTotals`, ni en el
  desglose por categoría, ni en el rendimiento de nada.

El disponible es la única magnitud que las tres tocan — es el "bolsillo" del
que salen o al que entran, y por eso `get_liquid_by_account` es la única
función que suma las tres tablas. Pero ni ahí se mezclan sus UNIDADES: cada
una entra convertida a la moneda de la cuenta que tocó, nunca sumada en una
unidad artificial "líquido + deuda".

### 5.3 Qué regla se rompería con una compra en cuotas modelada como deuda

Si "cargar una compra en 6 cuotas" se implementara creando una `debts` row (la
tabla que hoy existe para eso), la tensión no está en la separación de
mundos en sí — una cuota es, conceptualmente, un préstamo (le debés al banco
o al comercio) y encaja bien ahí — sino en dos reglas puntuales que hoy
asumen que "deuda" es **siempre** algo grande y ocasional (un préstamo de
alguien), nunca el día a día:

1. **Los pagos de deuda están explícitamente excluidos de "Gastos del mes"**
   (sección 2). Si una cuota es una deuda, pagarla nunca aparecería como gasto
   en Inicio ni en el desglose por categoría — que es exactamente lo opuesto
   de lo que se busca ("ver $50.000 de gasto por mes"). Hoy la app cumple al
   pie de la letra "una deuda no es un gasto que decidiste hacer este mes"
   (mismo criterio que excluye Ajuste de saldo y Transferencia de cuenta del
   lado del sistema), pero una cuota SÍ es, en la experiencia del usuario, un
   gasto de este mes — es la razón concreta que motiva este informe.

2. **No hay concepto de "obligación futura"** (sección 4). Modelar 6 cuotas
   como una deuda con 6 pagos programados no puede hacerse hoy sin que esos 6
   pagos, si se cargan de una, cuenten TODOS ya mismo contra el disponible y
   el saldo de la deuda. El modelo actual de `debts`/`debt_payments` registra
   EVENTOS ya ocurridos (mismo principio #1 de ARCHITECTURE.md: "se guardan
   eventos y configuración"), no compromisos futuros — y una cuota es
   exactamente eso: un compromiso, con 5 de sus 6 partes todavía sin ocurrir.

Lo que **no** se rompería: la separación de monedas (una cuota en USD o ARS
sigue siendo una magnitud propia, no se sumaría a ningún total mezclado), ni
"no existe patrimonio total" (una deuda por cuotas seguiría siendo saldo
restante en USD, aparte de líquido e invertido).

---

## 6. Resumen — roto vs. más prolijo

**Esto está roto / es una laguna real del modelo, no un detalle de estilo:**

- Un pago de deuda que sale del disponible es plata que salió del bolsillo y
  no aparece en NINGUNA pantalla como algo gastado — ni en Inicio, ni en
  Movimientos, ni en el desglose por categoría. Solo se ve como una baja en el
  saldo de la cuenta y en el saldo de la deuda.
- No existe ningún estado "futuro/pendiente" en todo el modelo de datos
  (transactions, contributions, debt_payments): una fecha futura cuenta
  exactamente igual que una fecha pasada, en el saldo de la deuda y en el
  disponible. Cargar pagos por adelantado los hace contar ya, no cuando
  llegue la fecha.
- `debts` no tiene ningún campo para modelar un plan (cuotas, frecuencia,
  monto por cuota): hoy es monto único + pagos sueltos cargados a mano, uno
  por uno.

**Esto sería más prolijo pero no es un bug:**

- Que `getDebts()`/`summarizeDebts()` se llamen por separado en Dashboard y en
  Accounts.jsx en vez de compartir una carga — hoy no diverge porque las dos
  llaman a las mismas funciones puras, pero son dos round-trips a la base en
  vez de uno.
- La ausencia de un ADR dedicado a "los tres mundos no se mezclan": la regla
  está bien declarada y se cumple, pero vive repetida en tres documentos en
  vez de en una decisión versionada con su razonamiento.
