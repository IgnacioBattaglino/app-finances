# Reconciliación y transferencias — cómo se registran hoy

Informe técnico, sin cambios de código. Responde a un bug real visto en
pantalla: al "Contar mi plata" con varias cuentas, Movimientos mostró un
"Gastos" del mes de $1.118.364 con "Ajuste de saldo $711.478" arriba del
desglose por categoría — un gasto que no ocurrió. Documenta el mecanismo
exacto que lo produce, para decidir la implementación de la regla nueva en un
paso aparte.

Fecha del relevamiento: 2026-09-12. Fuente: código de `src/lib/liquid.js`,
`src/lib/movements.js`, `src/lib/transactions.js`, `src/pages/Movements.jsx`,
`src/components/LiquidModal.jsx`, `src/components/ExpensesBlock.jsx`, y las
migraciones `0034`, `0036`, `0037` (reconciliación) y `0040` (transferencias).

---

## 1. Cómo funciona hoy la reconciliación, de punta a punta

### 1.1 El dato de partida: NO hay saldo guardado

No existe una columna "saldo" en ninguna tabla. El saldo de una cuenta es
siempre el resultado de sumar sus movimientos en el momento de preguntarlo:

```
saldo(cuenta) = Σ transactions.amount (con signo por kind)
              + Σ contributions (con affects_liquid, convertidas si la cuenta no es USD)
              − Σ debt_payments (ídem)
```

Esa suma la hace la función de base `get_liquid_by_account()` (migraciones
0033/0036/0039), invocada tanto por el cliente (`getAccountBalances()`, para
pintar cada pantalla) como, **de nuevo, puertas adentro**, por la propia
función de reconciliación. No hay una foto cacheada en ningún lado: cada
lectura recalcula desde cero. Esto es lo que decide si se puede netear —
sí se puede, porque "el total de una moneda" es una suma que se puede rehacer
en cualquier punto, antes o después de escribir un ajuste.

### 1.2 El flujo: `LiquidModal` → `reconcile()` → `reconcile_liquid` (RPC)

1. **`LiquidModal.jsx`** carga `computeCurrentLiquid()` y muestra una fila por
   cuenta con "Según la app: $X" y un campo para escribir el monto real. Una
   cuenta que se deja en blanco **no entra** a la declaración: no se
   reconcilia ni genera ajuste (comentario explícito en el modal). El preview
   de "se registra un ingreso/gasto de ajuste" que ve el usuario ANTES de
   guardar es puramente de UI (`decideAdjustment`, en el cliente) y ya hoy es
   **por cuenta**, no hay ningún cálculo de total ahí tampoco.
2. Al guardar, **una sola llamada** a `reconcile({ date, declarations })`,
   donde `declarations` es `[{ accountId, declaredAmount }, ...]` — solo las
   cuentas que se completaron.
3. `reconcile()` (`lib/liquid.js`) hace **una sola llamada RPC** a
   `reconcile_liquid(p_date, p_declarations)`. Todo lo que sigue pasa en el
   servidor, en una transacción.

### 1.3 Qué hace `reconcile_liquid` (Postgres, `plpgsql`)

```
saca una foto de get_liquid_by_account() (una sola vez, antes de escribir nada)
para cada cuenta declarada:
    v_current  = balde de esa cuenta en la foto (0 si no tiene)
    v_declared = lo que el usuario escribió
    v_difference = round(v_declared - v_current, 2)
    si |v_difference| >= 0.01:
        v_kind = 'income' si v_difference > 0, si no 'expense'
        busca la categoría del sistema "Ajuste de saldo" (system_key = 'balance_adjustment') de ese kind
        inserta UNA transaction:
            amount = |v_difference|
            currency = la moneda DE ESA CUENTA (liquid_accounts.currency) — nunca se convierte
            description = "Saldo inicial" (primera reconciliación de esa cuenta) o "Reconciliación de disponible"
            account_id = esa cuenta
    inserta SIEMPRE una fila en liquid_reconciliations (account_id, date, declared_amount, adjustment_transaction_id)
    -- incluso sin ajuste: es "declaré esto en esta fecha", el dato que define hasta cuándo está conciliada la cuenta
```

Puntos clave para la regla nueva:

- **Es un loop por cuenta, sin ningún concepto de "total".** Cada cuenta se
  compara solo contra sí misma. Si dos cuentas de la MISMA moneda se mueven en
  sentido contrario (una baja, otra sube) y el total no cambió, hoy se
  generan **dos movimientos igual de reales**: un gasto en la que bajó y un
  ingreso en la que subió. Nada en el código de hoy sabe que son "la misma
  plata" — es exactamente el escenario que describe la regla 1 del pedido
  (efectivo −200, Mercado Pago −100, sobre un total que bajó 300: en ESE
  ejemplo puntual las dos son gastos y suman bien, pero si una de las dos
  hubiera subido en vez de bajar, hoy se anotaría un ingreso ahí que nunca
  existió).
- **Se generan hasta N transacciones "Ajuste de saldo"** por una sola
  reconciliación (una por cada cuenta declarada con diferencia ≥ 1 centavo),
  más N filas en `liquid_reconciliations` (una por cada cuenta declarada,
  tenga o no diferencia).
- **La moneda es la de la cuenta, sin conversión** — esto YA cumple la regla 2
  del pedido (neteo por moneda) en el sentido de que nunca mezcla pesos con
  dólares dentro de un mismo ajuste; lo que falta es netear DENTRO de la
  misma moneda entre cuentas distintas.
- **El saldo por cuenta queda exacto** después de escribir el ajuste, porque
  se lee de la misma foto (`get_liquid_by_account`) contra la que se comparó:
  no hay forma de que quede un resto — esto es lo que pide la regla 3, y ya
  se cumple estructuralmente porque nada se cachea.
- La categoría se busca por **`system_key = 'balance_adjustment'`**, nunca
  por nombre ni por `is_system` a secas (así conviven con "Movimiento de
  ahorro" desde la migración 0037).

---

## 2. Cómo funcionan hoy las transferencias entre cuentas

`create_account_transfer(from, to, date, fromAmount, toAmount)` (migración
0040), invocada por `AccountTransferModal` vía `createAccountTransfer()`
(`lib/accountTransfers.js`):

- Inserta **dos filas** en `transactions`, atómicas (un solo INSERT con dos
  `values`), compartiendo un `transfer_id` nuevo (columna agregada en esta
  misma migración, mismo patrón que `contributions.transfer_id`):
  - Una `expense` en la cuenta de origen, por `fromAmount`, en la moneda de
    esa cuenta.
  - Una `income` en la cuenta de destino, por `toAmount`, en la moneda de
    esa cuenta.
- Categoría: **`system_key = 'savings_movement'`** ("Movimiento de ahorro"),
  la misma que usan los aportes/retiros de una cuenta de ahorro
  (`SavingsMovementModal`) — es la categoría "esto es plata que cambió de
  lugar, no un gasto ni un ingreso real".
- Los dos montos van **por separado, no un monto + una tasa**: cuando las
  cuentas están en monedas distintas, el par de montos exactos que
  efectivamente salieron y entraron ya es el registro completo de la
  conversión (no hay `mep_rate` en `transactions`).
- Editar una pata individual está bloqueado en el formulario
  (`TransactionFormModal`, `isTransferPart`): se muestra de solo lectura, con
  la opción de borrar la transferencia ENTERA (`deleteAccountTransfer`, un
  `DELETE ... WHERE transfer_id = ...`, atómico por ser una sola sentencia).

La regla 4 del pedido ("tiene que quedar registro en el historial de cada
cuenta, pero no puede afectar ninguna estadística") es, en la práctica, **la
regla que ya rige para transferencias desde la 0040** — ver la tabla de la
sección 3. El trabajo pendiente, si lo hay, es replicar ese mismo patrón para
la parte de una reconciliación que sea puro reparto entre cuentas.

---

## 3. Quién consume estos movimientos, y quién excluye qué

Ambas categorías del sistema tienen `is_system = true` Y su propio
`system_key` (`balance_adjustment` / `savings_movement`). Cada consumidor
filtra por uno de los dos criterios, o por ninguno — y ahí está la
inconsistencia:

| Pantalla / función | Qué mira | "Ajuste de saldo" | "Movimiento de ahorro" (transferencia) |
|---|---|---|---|
| **Inicio → Gastos del mes** (`ExpensesBlock.jsx` → `getExpenses()`, `lib/transactions.js`) | `!category.is_system` | ❌ Excluido siempre, entero | ❌ Excluido siempre, entero |
| **Inicio → desglose por categoría** (mismo `ExpensesBlock`, `groupByCategory` sobre lo que devolvió `getExpenses`) | hereda el filtro de arriba | ❌ Excluido | ❌ Excluido |
| **Movimientos → Gastos/Ingresos/Invertido/Balance** (`monthTotals`, `lib/movements.js`) | `category.system_key === 'savings_movement'` | ✅ **Cuenta entero**, como cualquier gasto/ingreso | ❌ Excluido |
| **Movimientos → "En qué se fue"** (`groupExpensesByCategory`, `lib/transactions.js`) | nada — no filtra ninguna categoría | ✅ **Cuenta entero**, con su propia fila en el desglose | ✅ **Cuenta entero** (si fuera un `expense`; en la práctica una transferencia siempre tiene su lado `expense` en la cuenta de origen) |
| **Movimientos → lista de movimientos** (`getTransactions()` + `TransactionRow`) | filtra cuentas de ahorro (`!account.is_savings`), no categorías | Aparece como fila normal, editable | Aparece como fila normal, editable (salvo si la cuenta es de ahorro, que ya se excluye por otro motivo) |
| **Historial de una cuenta** (`getAccountTransactions()` + `AccountHistory.jsx`) | sin filtro de cuenta de ahorro ni de categoría — a propósito, es EL historial de esa cuenta | ✅ Aparece, editable | ✅ Aparece, de solo lectura si es una pata de transferencia |

Lectura de la tabla: **"Ajuste de saldo" está en dos estados contradictorios
hoy** — invisible por completo en Inicio, pero contado como gasto/ingreso real
(total y desglose) en Movimientos. Ninguna de las dos pantallas hace lo que
pide la regla 1 (contar SOLO el neto real, no el reparto). Inicio se queda
corto (esconde hasta la plata que de verdad faltó); Movimientos se pasa
(cuenta también el reparto entre cuentas como si fuera gasto e ingreso).
"Movimiento de ahorro" (transferencia), en cambio, ya está bien en todos
lados salvo un lugar: el desglose "En qué se fue" de Movimientos no lo
excluye, así que una transferencia entre cuentas de uso diario aparecería ahí
como una categoría de gasto — no había hasta ahora ningún flujo que las
generara en volumen para notarlo.

---

## 4. El bug reportado, explicado con el mecanismo de arriba

Con varias cuentas reconciliadas en una sola pasada, `reconcile_liquid`
generó una transacción "Ajuste de saldo" **por cada cuenta con diferencia**,
cada una con su propio signo. Movimientos las suma TODAS bajo "Gastos" (las
que dieron `expense`) e "Ingresos" (las que dieron `income`) vía `monthTotals`
— que explícitamente decide no excluir esta categoría — y además las repite,
una por una, en el desglose "En qué se fue" vía `groupExpensesByCategory`,
que no excluye ninguna categoría. El resultado ($1.118.364 de "Gastos", con
$711.478 solo de "Ajuste de saldo") es la suma de varios ajustes por cuenta,
sin ningún neteo entre ellos ni contra el total: exactamente lo que predice
el modelo de la sección 1.3.

---

## 5. Contraste explícito con las 4 reglas pedidas

1. **Solo el neto del total es gasto real; el reparto no.** Hoy no se cumple:
   no existe ningún cálculo de "total" en `reconcile_liquid` — es un loop
   puramente por cuenta. Ni el RPC ni el cliente comparan la suma antes/después.
2. **El neteo es por moneda.** Estructuralmente ya está: cada cuenta declara
   en su propia moneda, sin conversión, y `get_liquid_by_account` ya separa
   los baldes por moneda (migración 0039). Lo que falta es sumar DENTRO de
   cada moneda antes de decidir qué es gasto.
3. **Los saldos por cuenta tienen que seguir correctos.** Ya se cumple hoy y
   es estructural: nada se cachea, cada saldo sale de sumar sus movimientos.
   Cualquier esquema de neteo tiene que seguir dejando, para cada cuenta, la
   suma de sus movimientos igual a lo declarado — igual que ahora.
4. **Transferencias: quedan en el historial, no afectan estadísticas.** Ya
   es el comportamiento real de `create_account_transfer` desde la 0040, con
   una sola falla puntual: el desglose por categoría de Movimientos
   (`groupExpensesByCategory`) no la excluye.

---

## 6. Preguntas abiertas para la fase de implementación

No son parte de este informe (que es solo "cómo funciona hoy"), pero surgen
directamente del mecanismo descripto y conviene tenerlas resueltas antes de
tocar código:

- **¿"El total" de qué universo de cuentas?** Una reconciliación puede
  declarar un subconjunto de las cuentas (las que se dejan en blanco no
  entran). Si se declaran 2 de 3 cuentas en pesos, ¿el neteo es entre esas 2,
  o contra el total de las 3 (incluida la no declarada, que se asume sin
  cambios)? El RPC hoy no tiene ese concepto en absoluto.
- **¿Dónde vive la parte "reparto" de la operación?** Hoy una diferencia
  genera una `transaction` con categoría "Ajuste de saldo". Si solo el neto
  debe ser gasto/ingreso real, la parte de reparto necesita algún lugar
  igual de auditable (aparece en el historial de cada cuenta, con su monto
  exacto) pero que no cuente en ninguna estadística — el mismo contrato que
  ya cumple "Movimiento de ahorro" para transferencias. ¿Se reusa esa misma
  categoría, o hace falta una tercera?
- **Consistencia entre Inicio y Movimientos.** Hoy Inicio excluye "Ajuste de
  saldo" por completo (`is_system`) y Movimientos no excluye nada
  (`system_key` puntual). La regla 1 exige que el NETO sí cuente como gasto
  real y en algún lado se vea — hoy no se ve en ninguna de las dos pantallas
  tal como se necesita.
- **`groupExpensesByCategory`** (el desglose de Movimientos) es la única
  función que hoy no excluye ninguna categoría de sistema; encaja mal tanto
  con el tratamiento de "Movimiento de ahorro" en el resto de la app como con
  la regla nueva para "Ajuste de saldo".
