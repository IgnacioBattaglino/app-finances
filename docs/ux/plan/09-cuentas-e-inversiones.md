# Bloque 09 de 13 · Acciones por cuenta, y un orden que no salta

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`) y Supabase. La
  interfaz está en español rioplatense y el código en inglés. Se usa sobre todo
  desde un iPhone, instalada como app.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan. Leé "Convenciones de
  formularios".
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 09 de 13 de
  un plan aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.

**Lo que ya existe:**

- **Una capa de datos compartida** (hooks en `src/hooks/`, caché que se
  invalida sola en cada escritura).
- **Mi plata** (`src/pages/settings/Accounts.jsx`) muestra arriba el total
  disponible, los botones "Contar mi plata" y "Transferir", y las cuentas.
- **El detalle de una cuenta** (`src/pages/settings/AccountDetail.jsx`) muestra
  el saldo, el historial y la configuración. Solo las cuentas de **ahorro**
  tienen acciones: Retirar y Aportar.
- **Inversiones** (`src/pages/Portfolio.jsx`) muestra el total, la evolución y
  los grupos de activos, con un selector de orden. Los precios en vivo llegan
  aparte, por su propia consulta.

## Skills

- **`ux-designer`**: es la principal.
- **`impeccable`**: leé `reference/craft-floor.md`.
- **`ponytail:ponytail`**: reutilizar los formularios que ya existen.

## Los problemas

1. **Se entra a una cuenta del día a día y no se puede hacer nada con ella.**
   Para contarla o transferir desde ahí hay que volver a Mi plata.
2. **Con el orden "por monto" o "por rendimiento",** cuando llegan los precios
   en vivo **las tarjetas se reordenan delante del usuario**.

## Qué hay que hacer

### 1. Acciones en el detalle de una cuenta del día a día

Pegadas al saldo, en el mismo lugar donde una cuenta de ahorro tiene
Retirar/Aportar, y con la misma forma: dos botones en una fila.

- **"Contar esta cuenta"** abre `LiquidModal` (`src/components/LiquidModal.jsx`),
  el mismo formulario de "Contar mi plata", con **esta cuenta enfocada**.
  - Agregale al modal una prop opcional (algo como `focusAccountId`) que haga
    scroll hasta esa fila y le dé el foco visual.
  - **No** tiene que abrir el teclado: `CLAUDE.md` prohíbe el autofocus en ese
    formulario.
  - El modal sigue declarando cuenta por cuenta como siempre: las cuentas que
    se dejan en blanco no se tocan. **No cambia nada de cómo se reconcilia.**
- **"Transferir desde acá"** abre `AccountTransferModal`
  (`src/components/account/AccountTransferModal.jsx`) con **esta cuenta ya
  elegida como origen**.
  - Agregale una prop opcional (algo como `defaultFromAccountId`) que siembre
    el origen al abrir.
  - Sin la prop, se comporta igual que hoy.
- **Las cuentas de ahorro** siguen con Retirar/Aportar, sin cambios.

### 2. El orden de Inversiones no salta

Con los modos de orden por monto o por rendimiento:

- **El orden se decide la primera vez** que la pantalla tiene datos en esta
  visita y **se queda quieto** hasta salir de la pantalla. Los montos sí se
  actualizan en su lugar cuando llegan los precios.
- **Un activo nuevo** que aparezca en la visita va al final.
- **Cambiar el modo de orden a mano** reordena en ese momento, que es algo que
  hizo el usuario.
- **El orden manual y el alfabético** no dependen de los precios y siguen igual.

Hacelo guardando el orden de ids en una referencia dentro de la pantalla.
`sortPortfolioEntries` (`src/lib/portfolio.js`) **no se toca**: se sigue
llamando igual y solo se "congela" su resultado.

## Qué se reutiliza

- `LiquidModal`, `AccountTransferModal` y `sortPortfolioEntries`, tal como
  están, más dos props opcionales en los modales.

## Qué NO tocar

- **Cómo se reconcilia y cómo se transfiere:** `reconcile`,
  `planReconciliation` y `createAccountTransfer`.
- **Cómo se ordena:** solo cuándo se aplica el orden.
- **El rendimiento de Inversiones:** Nacho lo revisa aparte.

## Qué se ve distinto en pantalla

- **En el detalle de una cuenta como "Efectivo"** aparecen "Contar esta cuenta"
  y "Transferir desde acá", arriba, junto al saldo.
- **En Inversiones,** con orden por monto, las tarjetas ya no se mueven solas
  cuando llegan los precios.

## Cómo se verifica

**Tests:** si extraés la lógica de congelar el orden a una función pura
(del estilo `stableOrder(prevIds, entries)`), testeala:

- conserva el orden anterior;
- agrega los nuevos al final;
- descarta los que ya no están.

**Playwright:**

- **Entrá a "Efectivo"** → "Contar esta cuenta": se abre el conteo con esa fila
  a la vista y **sin** foco en un input (`document.activeElement` no es un
  input).
- **"Transferir desde acá"**: el origen viene elegido.
- **En Inversiones, con el orden por monto,** registrá el orden de los
  encabezados de grupo cada 100 ms durante 4 s desde que se entra, con red
  lenta. Tiene que ser el mismo en todas las mediciones.

**📱 Para Nacho, en el iPhone:**

- Contar una sola cuenta desde su detalle: se entiende qué cuenta está
  contando.
- Inversiones: nada se reacomoda solo.

## Qué puede salir mal

- **Que "Contar esta cuenta" se lea como "contá solo esta"** cuando el modal
  muestra todas. Si hace falta, el título del modal o un subtítulo puede
  nombrar la cuenta, pero **sin cambiar la lógica**. Consultá con Nacho el
  texto.
- **Que el orden congelado quede mal** al volver a la pantalla con la caché ya
  llena. Se congela en el primer render con datos, que ahí es inmediato: está
  bien.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **`docs/FUNCTIONAL.md`:** actualizá el detalle de cuenta en la sección de Mi
  plata y el orden en la sección 3.
- **El resumen para Nacho** y la lista para el iPhone.
- **El commit:** proponé algo como `feat(accounts): contar y transferir desde
  la cuenta, y un orden que no salta`, y **esperá su OK** antes de commitear.
- **Playwright:** nunca credenciales. Borrá `.playwright-mcp/`.
