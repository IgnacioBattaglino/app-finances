# Bloque 07 de 13 · Inicio calmo, y cada detalle a su pantalla

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales con enfoque
  FIRE, hecha con React 19, Vite, Tailwind 4 (clases propias en
  `src/index.css`) y Supabase. La interfaz está en español rioplatense y el
  código en inglés. Se usa sobre todo desde un iPhone, instalada como app.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan. Leé "Contexto de
  negocio" (los tres mundos) y "Sistema visual" enteros.
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 07 de 13 de
  un plan aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.
- **La dirección.** Calma: silenciosa, espaciosa, la información justa.
  **Inicio condensa lo importante y el detalle está a un toque.** El usuario
  tipo arranca de cero con sus finanzas.

**Una regla escrita que se respeta:** los tres mundos (la plata disponible, lo
invertido y las deudas) **no se suman ni se mandan entre sí**. Se muestran con
**el mismo peso**. El único total que mezcla monedas es el "Total" en dólares,
que es una excepción deliberada y se ve como algo menor.

**Lo que ya existe (bloques 01 a 06):**

- **Todos los datos salen de hooks sobre una caché compartida** (TanStack Query,
  persistida en el teléfono): `useLiquid`, `usePortfolio`, `useDebts`,
  `useDuePayments`, `useExpenses` y `usePortfolioSeries`, en `src/hooks/`.
- **Toda escritura invalida la caché sola.**
- **Esqueletos con forma** (clase `placeholder` en `index.css`, sin latido,
  aparecen a los ~150 ms), y la regla de que nada que llega tarde aparece
  arriba de algo visible.
- **Barra superior fija** en `PageHeader`, con el botón de Ajustes de Inicio a
  la derecha.
- **Tokens de texto** para montos: `--text-title2` (22), `--text-title1` (28) y
  `--text-display` (40).

## Skills

- **`impeccable`**: es la principal. Leé `reference/craft-floor.md`.
- **`ux-designer`**: jerarquía, qué va en el primer vistazo.
- **`apple-design`**.
- **`ponytail:ponytail`**: mover componentes, no duplicarlos.

## El problema

Hoy Inicio mide 1760 px en el teléfono. En el primer vistazo hay cinco números
del mismo tamaño y peso (disponible, ahorrado, invertido, deudas y total), tres
botones (i) y tres marquitas de moneda. Más abajo hay dos gráficos casi
iguales, un aviso rojo y los gastos del mes con barras y una serie de 12 meses.
Nada es "lo más importante", porque todo pesa igual. Y el detalle que debería
estar a un toque está en Inicio: la evolución de las inversiones no está en
Inversiones, y Mi plata no dice cuánta plata tenés.

## Qué hay que hacer (decidido por Nacho)

### 1. Inicio en el teléfono: una sola pantalla

De arriba abajo, sin scrollear, en 390 × 844:

1. **El recordatorio de compromisos** (`src/components/commitments/CommitmentReminder.jsx`),
   solo si hay algo que confirmar. Va en el mismo lugar que hoy y no se
   rediseña acá: su color lo cambia el bloque 10.
2. **Una sola tarjeta con los tres mundos,** una fila por mundo: el nombre a la
   izquierda, el monto a la derecha y un chevron. Cada fila entra a su
   pantalla.
   - **"Dinero disponible"** → `/plata`.
     - Si hay plata en más de una moneda, van las dos líneas del **mismo
       tamaño**, una debajo de la otra (`MoneyStack`; regla de `CLAUDE.md`).
     - Debajo, en chico y en `ink-soft`, una línea con el ahorro, por ejemplo
       "+ US$ 787,19 ahorrados", **solo si hay ahorro**. Si hay ahorro en más de
       una moneda, las dos en la misma línea.
     - Usá `summarizeSavingsCard` de `src/lib/liquid.js`, que ya decide si
       mostrarlo.
     - El ahorro es parte del mundo de la plata (vive en Mi plata), por eso va
       adentro de esta fila y no como cuarta fila.
   - **"Dinero invertido"** → `/inversiones`.
   - **"Deudas"** → `/compromisos/deudas`, **solo si hay deudas**, como hoy.
   - **Los tres montos van del mismo tamaño y peso** (`--text-title2`,
     semibold), con cifras tabulares. Ninguno manda.
   - **Los nombres son los de hoy.** No inventes textos nuevos: Nacho está
     trabajando los textos aparte, en `docs/ux/textos.md`.
3. **El total en dólares, como pie de esa misma tarjeta:** separado por la
   línea interna, en tamaño menor y con el desglose que se abre al tocarlo.
   Reutilizá el comportamiento de `TotalSummary` de `src/pages/Dashboard.jsx`.
   Tiene que leerse como un pie, no como un cuarto mundo.
4. **Tus gastos de este mes,** una segunda tarjeta, con espacio de sección
   entre las dos:
   - arriba, el nombre del bloque ("Gastos del mes", el de hoy);
   - el total del mes, **en tinta (`ink`), no en rojo**;
   - la línea de comparación con el mes anterior, igual que hoy;
   - debajo, **las tres categorías más grandes** del mes, en filas de nombre y
     monto, **sin barras**;
   - toda la tarjeta es un link a `/movimientos`, con chevron;
   - con gastos en más de una moneda, el total va con `MoneyStack`, y las tres
     categorías son las de la moneda local, que es el primer grupo de
     `groupByCategory`;
   - los estados vacíos ("Todavía no cargaste ningún gasto…") quedan como hoy.

**Lo que se va de Inicio en el teléfono:**

- los tres botones (i) (`InfoButton`);
- las marquitas de moneda (`badge` con ARS/USD);
- el desglose por cuenta dentro de la tarjeta del disponible;
- los gráficos de evolución;
- la serie de 12 meses;
- las barras de categorías y su animación `animate-grow-x`: borrá también los
  keyframes `grow-x` de `index.css` si nadie más los usa.

**Esqueleto y revelado.** El recordatorio y la tarjeta de los mundos se revelan
**juntos**: se espera a `useLiquid`, `usePortfolio`, `useDebts` y
`useDuePayments` antes de mostrar esa parte. La tarjeta de gastos, que está
abajo, puede llegar después. El esqueleto es la misma tarjeta con marcadores en
los montos.

**Resultado esperado:** con recordatorio y deudas, **todo entra en una pantalla
de 844 px** (alrededor de 650 a 780 px de contenido). Sin ellos, sobra aire.
Eso es buscado.

### 2. Inicio en escritorio

Con ancho de sobra, Inicio de escritorio **conserva la evolución del
portafolio** (`PortfolioEvolutionChart`) **al lado de la tarjeta de gastos**.

- La tarjeta de los mundos va arriba.
- Decidí la grilla con `impeccable`: por ejemplo, la tarjeta de los mundos a lo
  ancho, y abajo el gráfico en dos tercios y los gastos en un tercio.
- **En el teléfono el gráfico no se monta.** Montalo solo cuando el layout es
  de escritorio (un `matchMedia`), no con `hidden`, porque si no el teléfono
  descarga recharts igual.

### 3. Las mudanzas

**Nada puede quedar sin lugar en este bloque:** todo lo que sale de Inicio
aparece en su destino en el mismo commit.

| Qué | A dónde | Cómo |
|---|---|---|
| **Evolución del portafolio** (los dos gráficos, el selector de rango y el pie con "Aportado a hoy" y "Rendimiento acumulado") | **Inversiones** (`src/pages/Portfolio.jsx`), debajo de la tarjeta del total | El mismo componente `PortfolioEvolutionChart`, **tal cual**: sus números y su "Rendimiento acumulado" **no se tocan**. Nacho decidió dejar el rendimiento de Inversiones como está y revisarlo aparte. Pasale `outdatedAssetNames` como hoy. |
| **Serie de gastos de 12 meses en dólares** | **Movimientos** (`src/pages/Movements.jsx`), debajo de "Gastos por categoría" | Extraé la serie de `src/components/ExpensesBlock.jsx` a un componente propio, con su propio "Reintentar". Usa la consulta de la serie de `useExpenses`. El bloque 08 la mete dentro del resumen plegable: acá solo tiene que estar. |
| **El desglose del disponible y su total** | **Mi plata** (`src/pages/settings/Accounts.jsx`) | Arriba de todo, antes de los botones: el total del disponible, grande (`--text-display`, `Money` o `MoneyStack`), y debajo en chico el total ahorrado si hay. Las cuentas con su saldo ya están en la lista de abajo, así que el desglose ya existe ahí. |
| **Las explicaciones de los (i)** | **La descripción de cada pantalla destino** | La del disponible y la del ahorro, en Mi plata: la del disponible como línea bajo el total, la del ahorro como nota al pie del grupo "Ahorro". La de lo invertido, como `description` del `PageHeader` de Inversiones. Usá **los mismos textos** que hoy tienen los `info` de las tarjetas de `Dashboard.jsx`. |

## Qué se reutiliza

- `MoneyStack`, `Money`, `CommitmentReminder`, `PortfolioEvolutionChart` y el
  comportamiento de `TotalSummary`.
- `summarizeSavingsCard`, `summarizeDebts`, `groupByCategory` y
  `monthOverMonthPct`: se **llaman**, no se tocan.
- Los hooks de datos existentes.

## Qué se borra

- `SummaryCard` en `Dashboard.jsx`, reemplazada por la tarjeta de filas.
- Los `InfoButton` y los `badge` de moneda en Inicio.
- Las barras con `animate-grow-x`.
- La serie de `ExpensesBlock`, que se muda.
- El `ChartPlaceholder` de Inicio en el teléfono.

## Qué NO tocar

- **Cómo se calcula cualquier monto,** incluido el Total convertido
  (`sumToUsd`, `toUsd`) y el rendimiento.
- **La decisión de que los mundos no se mandan entre sí:** las tres filas van
  iguales.
- **Los textos existentes:** no se reescriben. Nacho los trabaja en
  `docs/ux/textos.md`, y ese archivo **no se toca**.
- **Los colores del recordatorio y de los avisos de valuación:** son el bloque
  12.

## Qué se ve distinto en pantalla

- **Inicio en el teléfono entra en una pantalla:** el recordatorio si hay, tus
  tres mundos en una tarjeta con el total al pie, y tus gastos del mes con las
  tres categorías más grandes.
- **Inversiones gana la evolución.**
- **Movimientos gana la serie de 12 meses.**
- **Mi plata dice cuánta plata tenés, arriba de todo.**

## Cómo se verifica

**Tests:** con `renderToStaticMarkup`, la tarjeta de los mundos:

- muestra tres filas con deudas y dos sin deudas;
- muestra la línea de ahorro solo con ahorro;
- con dos monedas, muestra dos montos del mismo tamaño y ninguna marquita;
- la tarjeta de gastos muestra como mucho tres categorías y el total sin la
  clase de rojo.

**Playwright:**

- **A 390 × 844, en Inicio:** `document.documentElement.scrollHeight` ≤ 844
  más el alto de la barra de pestañas. Con la cuenta de prueba, que tiene
  deudas y ahorro, tiene que entrar. Capturas en claro y en oscuro.
- **Pedidos.** En el teléfono, Inicio **no** pide `get_portfolio_series` ni
  descarga el chunk de gráficos (`dashboardCharts`). En escritorio sí.
- **A 1440 × 900:** Inicio con el gráfico al lado de los gastos.
- **Destinos:** Inversiones muestra los gráficos y el rendimiento acumulado
  igual que antes (compará el número con una captura previa); Movimientos
  muestra la serie; Mi plata muestra el total arriba.
- **Script de altos cuadro por cuadro** al entrar a Inicio con red lenta: el
  recordatorio y la tarjeta aparecen juntos, sin nada que empuje desde arriba.

**📱 Para Nacho, en el iPhone:**

- Abrir la app: ¿se siente calma? ¿Se entiende de un vistazo cuánto tengo,
  cuánto invertí y cuánto gasté?
- Tocar cada fila lleva a su pantalla.
- El pie del Total se abre y se cierra bien.
- Inversiones con los gráficos arriba: ¿la lista de activos queda demasiado
  abajo? Anotalo para el bloque 09 si molesta.

## Qué puede salir mal

- **Romper sin querer la regla de igual peso** con un tamaño o un color
  distinto en una fila.
- **Que el total del pie parezca un cuarto mundo.** Tiene que verse claramente
  menor.
- **Que la tarjeta de gastos quede vacía de sentido** con pocos datos. Revisá
  el mes en curso con cero, uno y muchos gastos.
- **Que se pierda el "Rendimiento acumulado" en la mudanza.** No puede cambiar
  ni un número.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **`docs/FUNCTIONAL.md`:** actualizá la sección 1 (Inicio), la 3 (Inversiones,
  que gana la evolución), la 2 (Movimientos, la serie) y Mi plata.
- **`CLAUDE.md`:** actualizá el mapa (Dashboard) y la regla del chip de moneda
  en "Sistema visual", que en Inicio desaparece siempre.
- **El resumen para Nacho,** con capturas descriptas, y la lista para el
  iPhone.
- **El commit:** proponé algo como `feat(home): Inicio en una pantalla, y cada
  detalle a su pantalla`, y **esperá su OK** antes de commitear.
- **Playwright:** nunca credenciales. Borrá `.playwright-mcp/`.
