# Bloque 06 de 13 · Detalles y Ajustes sin parpadeo

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. Es autosuficiente.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales hecha con
  React 19, Vite, Tailwind 4 (clases propias en `src/index.css`) y Supabase. La
  interfaz está en español rioplatense y el código en inglés. Se usa sobre todo
  desde un iPhone, instalada como app.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan.
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 06 de 13 de
  un plan aprobado por Nacho.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** lo prueba en su iPhone.
- **La dirección.** La app tiene que sentirse **calma**: nada salta, nada late.

**Lo que ya existe (bloques 01 y 05), úsalo y no lo reinventes:**

- **La capa de datos.** TanStack Query en `src/lib/queryClient.js`, con caché
  persistida en el teléfono e invalidación de todo en cada escritura
  (enganchada en el `fetch` de Supabase). **Nadie recarga a mano después de
  guardar.**
- **Una regla de las consultas:** devuelven JSON puro. Los `Map` se arman en
  `select`.
- **Hooks en `src/hooks/`:** `useCategories`, `useAccounts`, `usePortfolio`,
  `useCommitments`/`useDuePayments`, `useLiquid`, `useDebts`, `useCards`,
  `useMovements`, `useAccountBalances`, `useExpenses` y `usePortfolioSeries`.
- **Las pestañas ya siguen las reglas de abajo.** Mirá
  `src/pages/Movements.jsx` y `src/pages/settings/Accounts.jsx` como ejemplo:
  - esqueletos con la forma de la pantalla (clase `placeholder` de
    `index.css`, sin latido, aparecen a los ~150 ms);
  - nada que llegue tarde aparece arriba de algo visible;
  - refrescar no muestra nada;
  - guardar no vacía la pantalla;
  - la fila guardada se ilumina una vez.

## Skills

- **`ponytail:ponytail`**: es la principal. Hay que borrar el patrón repetido.
- **`impeccable`**: los esqueletos. Leé `reference/craft-floor.md`.
- **`apple-design`**.

## El problema

Los detalles y las pantallas de Ajustes todavía tienen el patrón viejo: su
propio `loading`, `error`, `load()` y `useEffect`, con `ListSkeleton` (tres
renglones, latiendo) y el vaciado después de guardar. Además:

- **El detalle de un activo arranca con el título vacío,** aunque Inversiones
  acaba de tener su nombre. Pide **todos** los activos y pide sus aportes **dos
  veces** (todos, y la primera página).
- **El detalle de una cuenta dice "Cuenta"** mientras carga y después cambia al
  nombre.
- **En Ajustes, la fila "Invitaciones" aparece tarde** (se pregunta si sos
  admin) y corre lo de abajo.

## Qué hay que hacer

### Pantallas a migrar

Cada una a hooks o consultas de la caché, con su esqueleto con forma, sin
vaciar al guardar:

- **`src/pages/AssetDetail.jsx`**
  - **Arranca con lo que ya se sabe:** el nombre, el valor y el grupo salen de
    `usePortfolio()`, que ya está en caché si se vino de Inversiones. Nunca
    muestra un título vacío.
  - **El historial** es una consulta propia con su paginación ("Ver más"). Usá
    `useInfiniteQuery`, o la paginación existente adaptada.
  - **Sacá el pedido duplicado de aportes:** los aportes completos del activo
    salen de `usePortfolio`, filtrando por `asset_id`.
  - **Borrá la rama muerta `onlyContributed`,** el modo "vale lo aportado", que
    está en retirada y que la migración 0038 convirtió en cuentas de ahorro.
  - **Guardar un aporte o un retiro** cierra el formulario y deja la pantalla
    quieta. Los números cambian en su lugar y la fila nueva del historial se
    ilumina una vez.
- **`src/pages/settings/AccountDetail.jsx`**
  - **El nombre y el saldo arrancan desde la caché** de `useAccountBalances`.
  - **El historial** es una consulta propia con "Ver más".
  - **El renombrar, la moneda y el switch de ahorro** pueden actualizar la caché
    al volver la respuesta. La invalidación global igual lo cubre.
- **`src/pages/CardDetail.jsx`**: la tarjeta sale de `useCards` y sus planes de
  `useCommitments`.
- **`src/pages/CommitmentDetail.jsx`**: el plan y sus cargos salen de
  `useCommitments`.
- **`src/pages/settings/Categories.jsx`**: pasa a `useCategories`. El reordenar
  escribe en la caché de forma optimista y la invalidación lo confirma.
- **`src/pages/settings/CategoryDetail.jsx`**: la categoría sale de
  `useCategories` y la pantalla arranca con el nombre.
- **`src/pages/settings/AssetTypes.jsx`**: consultas de grupos activos y
  archivados.
- **`src/pages/settings/AssetTypeDetail.jsx`**: el grupo sale de la caché de
  grupos, y sus activos de `usePortfolio`. Borrá el "Cargando…" suelto que tiene
  adentro.
- **`src/pages/settings/Invitations.jsx`**: consulta propia.
- **`src/hooks/useIsAdmin.js`**
  - Pasa a ser una consulta persistida.
  - Ajustes (`src/pages/settings/SettingsHome.jsx`) ya sabe desde el primer
    cuadro si mostrar "Invitaciones".
  - Con el `buster` por usuario del bloque 01, no hay riesgo de que otro
    usuario vea la fila.

### Al final del bloque

- Borrá `src/components/ListSkeleton.jsx`, que ya no lo usa nadie. Confirmalo
  con una búsqueda.
- **`animate-pulse`** no puede quedar en ninguna pantalla con datos.
  `AppLoading` (el anillo mientras se lee la sesión) queda como está: es de
  arranque, no de datos.
- **Revisá con una búsqueda** que no quede ningún
  `const [loading, setLoading] = useState(true)` en `src/pages/`.

**Tamaños de texto.** En los archivos que tocás, reemplazá los `text-[Npx]`
sueltos por los tokens que agregó el bloque 05 (`--text-title2`,
`--text-title1`, `--text-display`, etc., en `@theme` de `src/index.css`).

## Qué se reutiliza

- Los hooks y el patrón de los bloques 01 y 05.
- `ErrorNotice`, la clase `placeholder` y la animación de fila iluminada.

## Qué se borra

- El cuarteto `loading` / `error` / `load` / `useEffect` en las 10 pantallas.
- `ListSkeleton.jsx`.
- La rama `onlyContributed`.
- El pedido duplicado de aportes.

## Qué NO tocar

- **Ningún cálculo:** `valueAsset`, `classifyOperations`, `mergeAssetHistory`,
  `decomposeWithdrawal` y cualquier otro de `portfolio.js`, ni los de
  `commitmentSchedule.js`. Solo se llaman.
- **Los formularios.**
- **Las pestañas:** ya están hechas.
- **Inicio:** es el bloque 07.

## Qué se ve distinto en pantalla

- **Entrar a un activo desde Inversiones** muestra su nombre y su valor al
  instante, y el historial aparece enseguida debajo.
- **Entrar a una cuenta** muestra su nombre y su saldo al instante.
- **Aportar, retirar o editar** no vacía la pantalla.
- **Ajustes aparece entero de una.**

## Cómo se verifica

**Tests:** si agregaste transformaciones puras (por ejemplo, los aportes de un
activo a partir de la lista completa), testealas.

**Playwright:**

- **Script de altos cuadro por cuadro** al entrar a un activo, a una cuenta, a
  una tarjeta y a Categorías, con red lenta. Viniendo de su lista, **una sola
  forma**: el título nunca vacío, nunca "Cuenta".
- **Pedidos.** Al entrar a un activo, no se piden de nuevo todos los activos, y
  los aportes del activo se piden a lo sumo una vez.
- **Guardar.** Editá la descripción de un aporte de prueba y guardá: el alto no
  pasa por un esqueleto y el scroll se mantiene.
- **Ajustes.** La fila "Invitaciones" (con la cuenta admin) está desde el
  primer cuadro.

**📱 Para Nacho, en el iPhone:**

- Entrar y salir de activos y cuentas: nada vacío, nada que cambie de texto.
- Aportar a un activo: la pantalla queda quieta y el historial suma la fila
  iluminada.
- Ajustes: nada se corre.

## Qué puede salir mal

- **Datos iniciales del listado desactualizados.** El detalle se refresca por
  detrás igual. Verificá que el valor del activo que se ve primero no sea
  "otro" que el de Inversiones.
- **La paginación del historial** con la caché. Al invalidar, "Ver más" vuelve a
  la primera página: aceptable. Que no duplique filas.
- **Mutaciones optimistas del reordenar** que dejen un orden viejo si falla.
  Revertí al error, como hoy.

## Al terminar

- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build`
  y `npm run verify:rls`.
- **`CLAUDE.md`:** actualizá el mapa: sacá `ListSkeleton` y sumá los hooks
  nuevos.
- **El resumen para Nacho** y la lista para el iPhone.
- **El commit:** proponé algo como `feat(data): detalles y ajustes arrancan con
  lo que ya se sabe`, y **esperá su OK** antes de commitear.
- **Playwright:** nunca credenciales. Borrá `.playwright-mcp/`.
