# Bloque 08 de 13 · Movimientos en el teléfono

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`) y Supabase. La
  interfaz está en español rioplatense y el código en inglés. Se usa sobre todo
  desde un iPhone, instalada como app.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan.
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 08 de 13 de
  un plan aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.
- **La dirección.** Calma, y el usuario tipo arranca de cero: guardar plata no
  puede leerse como perderla.

**Lo que ya existe:**

- `src/pages/Movements.jsx` saca sus datos de `useMovements(range)`, sobre una
  caché compartida, sin parpadeo;
- tiene esqueletos con forma;
- la serie de gastos de 12 meses ya vive acá, debajo de "Gastos por categoría"
  (bloque 07).

**Cómo está la pantalla hoy:**

- **Arriba:** el navegador de período, y después **cinco renglones de
  totales** (Gastos, Ingresos, Invertido, Ahorrado y Balance), que calcula
  `monthTotals` en `src/lib/movements.js`.
- **Debajo:** el desglose "Gastos por categoría" y la serie.
- **Después:** los chips de filtro y la lista.
- **En el teléfono,** la lista recién empieza en y ≈ 413 px.

## Skills

- **`ux-designer`**: es la principal. Jerarquía y lectura para alguien que
  arranca.
- **`impeccable`**: leé `reference/craft-floor.md`.
- **`apple-design`**: el despliegue.
- **`ponytail:ponytail`**.

## REGLA DE ORO DE ESTE BLOQUE

**Los totales del mes no cambian de cálculo. Ni una línea.**

- `monthTotals`, `savedByCurrency`, `movementBucket`, `collapseTransfers` y todo
  lo que suma o clasifica **no se tocan**.
- Lo único que se toca en `src/lib/movements.js` es `contributionLabel`, que
  devuelve un texto.
- Todo lo demás es **cómo se muestra**. Si algo parece necesitar cambiar un
  cálculo, frená y preguntá.

## Qué hay que hacer

### 1. Los cinco renglones: cómo se ven (decidido por Nacho)

Quedan cinco renglones, en este orden:

| Renglón | Cómo se ve |
|---|---|
| **Gastos** | Como hoy, en rojo (`clay`) cuando hay plata. |
| **Ingresos** | Como hoy, en verde (`gain`) cuando hay plata. |
| **Invertido** | **Sin rojo y sin signo negativo.** Es plata que cambió de lugar. El monto va en valor absoluto y en tinta, precedido por una flecha que dice para qué lado se movió: **"→"** si en el período salió más plata hacia inversiones de la que volvió (el número de `monthTotals` es positivo), y **"←"** si volvió más de la que salió (el número es negativo). En cero, sin flecha. |
| **Ahorrado** | **Mismo criterio que Invertido.** |
| **Te sobró** | Es el renglón que hoy se llama "Balance". **Cambia solo el nombre.** El número es el mismo, con su signo si es negativo, sin color, como hoy. |

**La flecha.** Es el mismo lenguaje que ya usan las transferencias entre
cuentas en la lista (`TransferRow`, en `Movements.jsx`, usa "→"): plata que
cambió de lugar va sin signo y sin color.

- La flecha lleva información (la dirección), así que va en `ink-soft`, no en
  `ink-faint`: la regla de contraste de `CLAUDE.md` dice que el texto que
  informa nunca va en faint.
- Con dos monedas, cada línea lleva su propia flecha según su propio signo.
- Para lectores de pantalla, la flecha necesita un texto: por ejemplo "salió
  hacia inversiones" o "volvió de inversiones", en un `sr-only` o como
  `aria-label` de la línea.

### 2. Las filas de la lista: mismo criterio

`InvestmentRow` y `SavingsRow` hoy muestran "−$ 50.005,14" en tinta para un
aporte.

- **Pasan a mostrar el monto sin signo, con la misma flecha:** "→" si la plata
  salió del disponible hacia la inversión o el ahorro, "←" si volvió.
- **En un aporte o retiro de inversión** (`InvestmentRow`), la dirección la da
  `direction`: `'in'` es aporte (→) y `'out'` es retiro (←).
- **En `SavingsRow`** (un movimiento en una cuenta de ahorro), la dirección
  sale de `kind` visto desde la cuenta de ahorro. Revisá bien el sentido con
  datos de prueba antes de fijarlo, y documentalo en un comentario. **La regla:
  la flecha siempre se lee desde tu plata disponible.**
- Los gastos y los ingresos comunes (`TransactionRow`) **no cambian**.

### 3. La fila que dice "Inversión" y suma en "Ahorrado"

Un aporte a un activo que la migración 0038 convirtió en cuenta de ahorro ya se
cuenta como ahorro en el total y cae en el filtro "Ahorros", porque
`monthTotals` y `movementBucket` miran `c.asset?.savings_account_id`. Pero la
fila se sigue rotulando "Inversión" y no se puede tocar, porque el activo está
archivado.

- **`contributionLabel`** (`src/lib/movements.js`, solo esa función) devuelve
  **"Ahorro"** para un aporte y **"Retiro de ahorro"** para un retiro cuando
  `c.asset?.savings_account_id` existe. Si no, devuelve lo de siempre
  ("Inversión" o "Retiro").
- **La fila navega a `/plata/<savings_account_id>`,** la cuenta en la que se
  convirtió, en lugar de quedar muerta como "Activo archivado". Pasale el rótulo
  de origen para el volver (`state: { from: { label: 'Movimientos' } }`, el
  patrón del bloque 04).
- Confirmá que la consulta (`getLiquidContributions` en
  `src/lib/contributions.js`) ya trae `asset.savings_account_id`: `monthTotals`
  lo usa, así que tiene que estar.

### 4. El resumen plegado (solo en el teléfono)

Para que la lista quede cerca:

- **Arriba, debajo del navegador de período, una sola tarjeta tocable** con
  dos cifras lado a lado: **"Gastos"** con su monto en `clay` e
  **"Ingresos"** con su monto en `gain`, más un chevron que gira.
  - Con dos monedas, cada cifra se apila en dos líneas del mismo tamaño.
- **Al tocarla se despliega,** con la misma técnica de grilla `0fr` → `1fr`
  que ya usa el Total de Inicio (`TotalSummary`): los cinco renglones, "Gastos
  por categoría" y la serie de 12 meses.
- **Arranca plegada** cada vez que se entra. No se recuerda.
- **En escritorio no hay pliegue:** el panel izquierdo muestra todo abierto,
  como hoy, sin chevron. Es el mismo componente, abierto por defecto a partir
  de `md:`. La diferencia vive ahí, no en dos componentes.
- **El esqueleto** del resumen plegado es la misma tarjeta con marcadores
  (clase `placeholder`).

## Qué se reutiliza

- `monthTotals` y todos los cálculos, que solo se **llaman**.
- `TransferRow` como referencia de estilo.
- El despliegue de `TotalSummary`.
- `MoneyStack` y `formatByCurrency`.

## Qué se borra

- El signo "−" y "+" en `InvestmentRow` y `SavingsRow`: la función
  `SignedAmount` deja de usarse para ellas.
- El rótulo "Balance".

## Qué NO tocar

- **Ningún cálculo ni ninguna clasificación de `src/lib/movements.js` y
  `src/lib/movementList.js`,** salvo `contributionLabel`.
- **Los filtros por tipo y categoría,** el navegador de período y la hoja de
  rango (`RangeSheet`).
- **Los textos** fuera de "Te sobró", "Ahorro" y "Retiro de ahorro"
  (`docs/ux/textos.md` lo trabaja Nacho y **no se toca**).

## Qué se ve distinto en pantalla

- **En el teléfono,** arriba hay una tarjeta con lo que gastaste y lo que
  entró; tocándola se ve el resto. La lista empieza bastante más arriba.
- **Invertido y Ahorrado se leen como plata que se movió,** con flecha y sin
  signo, en los totales y en las filas.
- **"Te sobró"** en lugar de "Balance".
- **Los aportes al ahorro** dicen "Ahorro" y llevan a su cuenta.

## Cómo se verifica

**Tests:**

- En `src/lib/movements.test.js`, `contributionLabel` con
  `asset.savings_account_id` devuelve "Ahorro" o "Retiro de ahorro"; sin él,
  "Inversión" o "Retiro". Actualizá el test existente, **no lo borres**.
- **Los tests de `monthTotals` no se tocan y tienen que seguir pasando igual.**
  Es la prueba de que el cálculo no cambió.
- En `src/pages/Movements.test.jsx`:
  - `InvestmentRow` de un aporte a un activo convertido lleva a `/plata/<id>`
    y dice "Ahorro";
  - `InvestmentRow` no muestra "−" y muestra la flecha;
  - un retiro muestra "←".
- **El renglón de totales:** Invertido positivo muestra "→" sin "−"; negativo
  muestra "←" sin "−"; y "Te sobró" negativo conserva su "−".

**Playwright:**

- **A 390 × 844:** la primera fila de la lista tiene que estar visible sin
  scrollear. Medí su `top`: antes ≈ 470 px.
- **El resumen:** tocarlo lo despliega, y tocarlo de nuevo lo pliega.
- **A 1440 px:** el panel izquierdo muestra los cinco renglones abiertos.
- **Septiembre de 2026 en la cuenta de prueba:** hay un aporte a "USDs
  físicos". La fila dice "Ahorro · USDs físicos", sin "−", y al tocarla va a la
  cuenta de ahorro.
- **Comparar números.** Los cinco montos (en valor absoluto) son exactamente los
  mismos que antes del bloque. Sacá una captura antes de empezar para comparar.

**📱 Para Nacho, en el iPhone:**

- ¿Se entiende de un vistazo qué gastaste y qué entró?
- ¿La flecha se lee como "moví plata" y no como "perdí plata"?
- ¿El despliegue se siente suave y responde al toque?

## Qué puede salir mal

- **La dirección de la flecha al revés en `SavingsRow`.** Es el punto más
  delicado: verificalo con un aporte y un retiro reales de prueba en una cuenta
  de ahorro.
- **Que alguien lea "Te sobró −$ X" raro** cuando se gastó más de lo que entró.
  Es lo decidido: mostralo tal cual y mencionáselo a Nacho en el resumen, sin
  cambiarlo.
- **Tocar sin querer algo que suma.** Los tests de `monthTotals` son la red.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **`docs/FUNCTIONAL.md`:** actualizá la sección 2 (Movimientos): los cinco
  renglones, "Te sobró", la flecha y el resumen plegado.
- **El resumen para Nacho** y la lista para el iPhone.
- **El commit:** proponé algo como `feat(movements): la plata que se movió se
  lee como movida, y la lista más cerca`, y **esperá su OK** antes de
  commitear.
- **Playwright:** nunca credenciales. Borrá `.playwright-mcp/`.
