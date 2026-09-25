# Bloque 01 de 13 · La app recuerda: la base

> **Cómo usar este archivo.** Pegalo entero como primer mensaje de una sesión
> nueva. No depende de nada que no esté acá o en el repo.

## Contexto que necesitás

- **El proyecto.** `app-finances` es una PWA de finanzas personales con enfoque
  FIRE, hecha con React 19, Vite, Tailwind 4 (con clases propias en
  `src/index.css`) y Supabase. La interfaz está en español rioplatense y el
  código en inglés. Se usa sobre todo desde un iPhone, instalada como app.
- **`CLAUDE.md`.** Se carga solo y sus reglas mandan: sistema visual,
  formularios, commits y credenciales. Leelo.
- **La rama y el plan.** Rama `feat/ui-polish`. Este es el bloque 01 de un plan
  de 13, ya aprobado por Nacho, el dueño del proyecto.
  - **El plan está aprobado:** no pidas OK para empezar.
  - **Sí frená antes de commitear:** Nacho prueba cada bloque en su iPhone
    antes de seguir.
- **La dirección.** La app tiene que sentirse **calma**: silenciosa, espaciosa,
  con la información justa. En el teléfono tiene que poder **agarrarse con el
  dedo**. El usuario tipo arranca de cero con sus finanzas.
- **El diagnóstico,** si lo necesitás, está en `docs/ux/auditoria-frontend.md`
  y `docs/ux/propuesta-frontend.md` (sección A). Este archivo trae todo lo que
  te toca.

## Skills

Cargalas con la herramienta Skill. Cada una tiene su carril y ninguna limita a
las otras:

- **`ponytail:ponytail`**: calidad de código. Reutilizá lo que existe y borrá
  lo que sobra. En este proyecto se optimiza el resultado final, no el tamaño
  del diff. Es la principal de este bloque.
- **`impeccable`**: solo si tocás algo visible.
- **`ux-designer` y `apple-design`**: no hacen falta en este bloque.

## Por qué existe este bloque

Hoy cada pantalla pide todo a Supabase al montarse y lo tira al desmontarse.
No existe "lo último que sé": la pantalla siempre arranca vacía, aparece un
esqueleto, llegan los datos y todo salta. La causa técnica es que no hay una
capa de datos. Hay 17 pantallas con el mismo patrón escrito a mano
(`useState` de `loading`, `error` y los datos, una `load()` y un `useEffect`).

Este bloque pone **la base** de esa capa y migra solo dos consultas chicas que
usa todo formulario: **categorías y cuentas**. Las pantallas se migran en los
bloques 05 y 06. Por eso este bloque casi no se ve, pero es lo que habilita
todo lo demás.

## Qué hay que hacer

### 1. Instalar TanStack Query con persistencia

Ya está aprobado agregar estas dependencias:

- `@tanstack/react-query` (v5);
- `@tanstack/react-query-persist-client`;
- `@tanstack/query-sync-storage-persister`.

La caché se guarda en `localStorage` del teléfono, así la app abre con los
últimos números conocidos.

### 2. Un módulo nuevo, `src/lib/queryClient.js`

Tiene cuatro piezas:

- **El `QueryClient`.**
  - Frescura: `staleTime` de unos 30 s. Volver a una pantalla vista hace menos
    de eso no pide nada.
  - Vida en caché: `gcTime` de 24 h, que tiene que ser al menos el `maxAge` de
    la persistencia.
  - Refresco al volver: `refetchOnWindowFocus` activado. Refresca al volver a
    la app, porque se dispara con `visibilitychange`.
  - Reintentos: `retry` 1.
- **El persister sobre `localStorage`.**
  - Clave: `finanzas:cache`.
  - `maxAge`: 24 h.
  - `buster`: la versión de la app (`APP_VERSION` de `src/version.js`) más el
    id del usuario logueado.
  - Filtro al guardar: solo consultas exitosas, y **nunca** las que lleven
    `meta: { persist: false }`. Los precios en vivo, que llegan en el bloque
    07, van a usar esa marca.
- **`invalidateUserData()`.** Marca como viejas todas las consultas de datos
  del usuario y refresca las que están a la vista. Es el único lugar que decide
  qué se refresca después de una escritura, y la regla es deliberadamente
  simple: **toda escritura invalida todo lo del usuario**. No hay un mapa fino
  de "qué toca qué". Un mapa mal armado deja un monto viejo en pantalla; esto
  no puede.
- **`isWriteRequest(method, url)`.** Una función pura que dice si un pedido HTTP
  a Supabase escribe datos:
  - `POST`, `PATCH`, `PUT` o `DELETE` sobre `/rest/v1/` escriben.
  - Se excluyen las RPC que solo leen: `get_liquid_by_account`,
    `get_portfolio_series`, `get_instrument_series`, `is_admin` y
    `validate_invite`.
  - Todo lo que esté fuera de `/rest/v1/` (`/auth/v1/`, `/functions/`) no
    cuenta como escritura.

### 3. Enganchar la invalidación en un solo punto

En `src/lib/supabase.js`, creá el cliente con un `global.fetch` propio que
llame al `fetch` normal y, si la respuesta es exitosa y `isWriteRequest` da
verdadero, llame a `invalidateUserData()`.

- **Agrupar.** Una operación puede hacer varias escrituras seguidas. Juntá las
  invalidaciones del mismo tick en una sola.
- **Por qué acá.** Así es **imposible olvidarse una escritura**, incluidas las
  que se agreguen en el futuro, y no se tocan las ~50 funciones de escritura de
  `src/lib/`. Si un día se agrega una RPC de lectura y nadie la suma a la lista
  de exclusión, lo peor que pasa es un refresco de más, nunca un dato viejo.
  Dejá un comentario que explique esto.
- **Ojo con la importación circular.** `queryClient.js` no puede importar
  `supabase.js`.

### 4. Aislar a cada usuario

El caché de un usuario **nunca** puede mostrarse a otro, ni siquiera un cuadro.

- Al cerrar sesión: `queryClient.clear()` y borrar la caché persistida.
- Al cambiar el usuario de la sesión: lo mismo.
- El `buster` con el id del usuario agrega una segunda protección: una caché
  guardada con otro usuario se descarta al hidratar.

Mirá `src/hooks/useAuth.jsx`, donde está `signOut` y el listener de sesión.
Esperá a que la sesión esté leída antes de montar el provider persistido, así
el `buster` ya conoce al usuario.

### 5. Montar el provider

En `src/main.jsx` o donde corresponda, montá `PersistQueryClientProvider`
envolviendo la app, dentro de `AuthProvider`.

### 6. Migrar categorías y cuentas

- **Hook nuevo `src/hooks/useCategories.js`.** Envuelve `getCategories()` de
  `src/lib/categories.js`, que no cambia. Devuelve las categorías y el estado,
  y trae un `addCategory(created)` para el alta al vuelo, que escribe en la
  caché (`setQueryData`) en vez de volver a pedir.
- **Reescribir `src/hooks/useAccounts.js`** sobre una consulta, **conservando
  exactamente la forma que devuelve hoy**: `{ accounts, defaultAccountId,
  loading, reload, addAccount }`, con las cuentas de ahorro filtradas igual que
  ahora.
  - `loading` pasa a significar **"no hay nada que mostrar todavía"** (primera
    carga sin caché), no "está refrescando".
  - `addAccount` escribe en la caché.
- **Reemplazar las llamadas sueltas a `getCategories()`** por `useCategories()`
  en `src/pages/Dashboard.jsx`, `src/pages/Movements.jsx`,
  `src/pages/settings/AccountDetail.jsx`, `src/pages/Commitments.jsx`,
  `src/pages/CardDetail.jsx` y `src/pages/CommitmentDetail.jsx`.
  - Esas pantallas guardaban las categorías en un `useState`. Borrá ese estado
    y el `.catch(() => {})` que se tragaba el error.
  - Si la consulta falla, el formulario muestra el selector vacío como hoy. El
    manejo visible del error llega en el bloque 02.
  - **No toques** `src/pages/settings/Categories.jsx` (la administración de
    categorías): se migra en el bloque 06.
- **Pedir categorías y cuentas por adelantado.** Al entrar a la app (al montar
  `src/components/Layout.jsx`), prefetch de las dos consultas, para que ya estén
  cuando alguien abra un formulario.

### 7. Una regla para todos los bloques siguientes

Lo que devuelve una consulta tiene que ser **JSON puro**: arrays y objetos,
nunca `Map`, `Set` ni `Date`. Al guardarse en `localStorage` un `Map` vuelve
como `{}` y rompe la pantalla.

- Si hace falta un `Map`, se arma en el `select` de la consulta o en un
  `useMemo`. El `select` no se persiste.
- Dejalo escrito como comentario en `queryClient.js`.

## Qué se reutiliza

- Todo `src/lib/*.js` tal como está: las funciones de lectura siguen siendo las
  mismas y la capa nueva las llama.
- `APP_VERSION` de `src/version.js`.

## Qué se borra

- Los `useState` de categorías y sus `useEffect` en las 6 pantallas listadas.
- El `useState` y el `useEffect` internos de `useAccounts`.

## Qué NO tocar

- **Ningún cálculo de plata**, ni en `src/lib/` ni en `supabase/`.
- **Ninguna pantalla más allá de lo listado.** Las demás siguen con su
  `load()` propio hasta los bloques 05 y 06, y conviven bien: después de una
  escritura, su `load()` refresca lo suyo y la invalidación global refresca lo
  que está en caché.
- **El aspecto visual.** Este bloque no cambia nada visible a propósito.

## Qué se ve distinto en pantalla

Casi nada, y es lo esperado:

- **Los formularios tienen las categorías y las cuentas al instante**, incluso
  la primera vez de la visita.
- **Al abrir la app**, las categorías y las cuentas vienen de la caché del
  teléfono.

## Cómo se verifica

**Tests (vitest, entorno `node`):**

- `isWriteRequest`, con casos:
  - un `GET` a `/rest/v1/transactions` no escribe;
  - un `POST` a `/rest/v1/transactions` sí escribe;
  - un `POST` a `/rest/v1/rpc/reconcile_liquid` sí escribe;
  - un `POST` a `/rest/v1/rpc/get_liquid_by_account` no escribe;
  - cualquier pedido a `/auth/v1/token` no escribe;
  - un `DELETE` escribe.
- El filtro de persistencia: una consulta con `meta.persist === false` no se
  guarda y una exitosa normal sí.

**Playwright** (levantá `npm run dev`):

- Entrá a la app, andá a Movimientos, volvé a Inicio y volvé a Movimientos.
  Contá los pedidos a `/rest/v1/categories`: tiene que haber **uno solo** en
  toda la sesión, salvo los refrescos por volver a la ventana.
- Recargá la página: las categorías tienen que estar en `localStorage` bajo
  `finanzas:cache`.
- Cerrá sesión desde Ajustes y confirmá que `finanzas:cache` desapareció.
- Abrí el formulario de gasto desde Inicio y desde Movimientos y confirmá que
  el selector tiene categorías.

**📱 Para Nacho, en el iPhone** (no se puede dar por bueno en Playwright):

- Cerrar la app del todo y volver a abrirla: funciona igual que antes.
- Cerrar sesión y entrar con otro usuario: no aparece ningún dato del anterior,
  ni por un instante.
- Cargar un gasto: se guarda y el disponible de Inicio se actualiza.

## Qué puede salir mal

- **Un dato de otro usuario se ve por un cuadro.** Es el riesgo más grave. Por
  eso son dos protecciones: el borrado al cerrar sesión y el `buster` con el id
  de usuario. Probalo explícitamente.
- **Invalidar demasiado seguido** en operaciones con muchas escrituras (un
  conteo de plata escribe varias filas). Agrupá por tick.
- **Una consulta que devuelve un `Map`** y se rompe al hidratar. Regla de la
  sección 7.
- **`useAccounts` cambia de semántica** (`loading` solo en la primera carga).
  Revisá los lugares que lo usan: si alguno dependía de `loading` para algo más,
  adaptalo sin cambiar lo que se ve.

## Al terminar

- **`CLAUDE.md`:** agregá al "Mapa del proyecto" `src/lib/queryClient.js` y
  `src/hooks/useCategories.js`, con una línea que diga que la capa de datos
  vive ahí y que toda escritura invalida todo.
- **La verificación de siempre:** `npm run lint`, `npm test`, `npm run build` y
  `npm run verify:rls`.
- **El resumen para Nacho,** en español rioplatense:
  - qué cambió;
  - qué verificaste y cómo;
  - la lista de qué probar en el iPhone.
- **El commit:** proponé algo como `feat(data): caché compartida y persistida
  con invalidación en cada escritura`, y **esperá su OK** antes de commitear.
