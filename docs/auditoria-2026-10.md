# Auditoría del proyecto — 2026-10-08

Instancia nueva, sin memoria de las conversaciones anteriores. Fuentes: el repo (main, ramas, etiqueta, worktree), `docs/`, `PRODUCT.md`, `CLAUDE.md`, `gh` (CI) y el MCP de Supabase **solo lectura** (`list_tables`, `list_migrations`, `get_advisors`, consultas `select`). No se cambió código, ramas, documentos ni base; este archivo es lo único escrito.

## Resumen en 15 líneas

1. EnCuenta (repo `app-finances`) es una app de finanzas personales para Nacho y gente cercana invitada; hoy existe como **web/PWA en producción** (React + Vite + Supabase, v0.9.1). iOS y Android están previstos.
2. **Web**: funcional y en uso. `main` (295ac18, 2026-09-27) coincide con `origin/main` y el CI de main está en verde (5 corridas seguidas OK, con Postgres real).
3. **iOS**: solo existe un proyecto de Xcode con la pantalla vacía, en la rama `docs/native-architecture` (2 commits, 2026-09-29), sin mergear. **Android**: no existe.
4. **Base**: 60 migraciones en el repo, numeradas sin huecos ni repetidos. Todas las que pude comprobar por objeto están aplicadas. Pero Supabase tiene `list_migrations` **vacío**: se aplican a mano y la base no sabe cuáles tiene.
5. **Mudanza de reglas de plata a la base**: hechos los pasos 0 a 4 del orden del informe (CI, deudas, moneda por trigger, resumen del disponible, gastos y totales), más lo de deudas/ahorro (0059) y carga sin conexión (0060). **Faltan** los pasos 5 a 12 (conteo en SQL, lista, cuotas, precios en vivo, ganancia realizada, foto del portafolio, Total USD, ganancia por período).
6. **Hallazgo más importante de git**: 25 commits del trabajo "ui-polish" de la web (navegación, caché, sheet que se agarra, Inicio calmo…) existen **solo en la etiqueta `archivo/ui-polish`**. No están en main ni en ninguna rama. Varios documentos (`docs/ux/plan/*`, informe de reglas) describen ese código como si estuviera.
7. Las 8 ramas `feat/*` ya están mergeadas en main (se pueden borrar); `docs/native-architecture` está viva, atrasada 2 commits pero **mergea sin conflictos**.
8. Worktrees: `../app-finances-native` (limpio, sin stashes). Sin stashes en ningún lado. `../app-finanzas` es un archivo vacío de 0 bytes (basura).
9. **Base real**: 5 usuarios, 83 movimientos, 4 usuarios con movimientos, 2 invitaciones usadas. Datos chicos pero reales.
10. **Riesgo n.º 1**: según los documentos, Supabase está en plan **Free, sin backups diarios**; el único respaldo es el CSV de la web. No pude confirmar el plan desde el MCP.
11. **Riesgo n.º 2**: deriva entre repo y producción — el cron de precios corre **cada hora** (`0 * * * *`) y el repo/los docs dicen **una vez por día** (`0 12 * * *`).
12. Seguridad: RLS activo en las 18 tablas; `anon` solo ejecuta `validate_invite` y no tiene permisos de tablas; no encontré secretos en el repo. Pendientes de `pendientes-base.md` **sin hacer**: 15 policies sin `(select auth.uid())`, 6 FK sin índice, contraseñas filtradas apagado, 2 funciones sin `search_path`.
13. Documentación: abundante y en general vigente en base/arquitectura, pero **FUNCTIONAL.md quedó viejo en Movimientos**, `informe-reglas-de-plata.md` dice cosas ya falsas ("no hay CI"), y los documentos nuevos del frente nativo (`arquitectura-nativa.md`, `pendientes-base.md`) solo existen en la rama no mergeada.
14. Contradicciones: `PRODUCT.md` (plataforma iOS, "A pagar", cinco pestañas) vs `CLAUDE.md`/FUNCTIONAL (web, "Compromisos"); cron diario vs horario; "sin offline" vs carga sin conexión.
15. Propuesta: tres archivos de cabecera (`docs/ESTADO.md`, `docs/ROADMAP.md`, `docs/decisiones/` con formato fijo) y una regla de cierre de sesión en `CLAUDE.md`. Plan de limpieza en la sección 10; nada se ejecuta sin tu OK.

---

## 1. Qué es

- **La app.** Finanzas personales con enfoque en independencia financiera (FIRE). Registra gastos e ingresos, cuentas del disponible (pesos, dólares, ahorro), inversiones en USD con rendimiento, deudas y compromisos (tarjetas, cuotas, suscripciones). Muestra **tres mundos separados** (plata, invertido, deudas) que nunca se suman a ciegas. Nombre de producto: **EnCuenta**.
- **Para quién.** Nacho (uso diario desde el iPhone) y gente cercana invitada: el registro es solo por link de un solo uso que genera el admin (ADR-017). Pieza de portfolio "de rebote".
- **Idea técnica que ordena todo** (`arquitectura-nativa.md`, `informe-reglas-de-plata.md`): las reglas de plata viven en Supabase; las apps muestran lo que devuelve la base.

| Frente | Estado | Evidencia |
|---|---|---|
| **Web / PWA** | En producción, en uso real. v0.9.1. Sigue siendo el único frente usable | `src/`, CI verde en main, `vercel.json` |
| **iOS nativo** | Arrancado: proyecto Xcode con pantalla vacía y carpetas por pestaña. Sin login, sin SDK, sin pantallas | rama `docs/native-architecture` (275e0b5), worktree `../app-finances-native` |
| **Android** | No existe. Planeado para cuando iOS llegue al paso 4 y el contrato esté probado | `arquitectura-nativa.md` §10 |

---

## 2. Qué está hecho

### Base (Supabase)
- 18 tablas en `public`, todas con RLS (`list_tables`). 60 migraciones en el repo; evidencia de aplicación por objeto en la sección 5.
- Funciones de la mudanza ya en la base: `get_liquid_by_account`, `get_liquid_summary`, `get_period_totals`, `get_expenses_by_category`, `get_monthly_expenses_usd`, `get_usd_rate`, `get_top_categories` (con `p_today`), `get_portfolio_series`, `get_instrument_series`; vistas `debt_balances`, `debt_payment_parts`, `expense_lines`, `transaction_movement_types`, `instrument_prices_usd`; transaccionales `reconcile_liquid`, `delete_reconciliation`, `create_transfer`, `create_account_transfer`, `confirm_/unconfirm_commitment_charge`, `save_debt`.
- Reglas de escritura por trigger: moneda desde la cuenta (0050), cuenta oculta rechazada (0060), intereses de deuda (0059), `captured_at` (0060), guarda de cuentas (0050/0054).
- Cron de precios activo y exitoso (última corrida 2026-10-08 22:00 UTC); precios al día (`max(date)` = 2026-10-08); 121.951 filas de precios, 41 instrumentos.

### Reglas de plata (pasos del `informe-reglas-de-plata.md` §6)

| Paso | Estado | Evidencia |
|---|---|---|
| 0 Preparación: CI con Postgres | **Hecho** | `.github/workflows/test.yml`; 17 archivos `*Sql.test.js` |
| 0 `READONLY_RPCS` / prefijo `get_` | **No aplica en main**: `src/lib/queryClient.js` no existe en main (solo en la etiqueta). La regla "toda función de lectura empieza con `get_`" está escrita en `pendientes-base.md` | `git grep` |
| 1 Deudas como vista | Hecho | 0049 `debt_balances` |
| 2 Moneda por trigger | Hecho | 0050 |
| 3 Resumen del disponible, categorías más usadas | Hecho | 0051, 0057, 0058. El "aviso de conteo previo" (#26) sigue en JS |
| 4 Gastos del mes, por categoría, cinco renglones, serie 12 meses | Hecho (arregla D2 y D3) | 0055, 0056 |
| Extra: deudas, intereses, gastar desde ahorro | Hecho | 0059 (commit 2fc319b) |
| Extra: carga sin conexión | Hecho | 0060 (2d7ed9f, e0b9bbd) |
| Extra: endurecimiento anon / tablas / cuenta con saldo | Hecho | 0052, 0053, 0054 |
| 6 (parte) Tipo de cada movimiento en SQL | Hecho | vista `transaction_movement_types` (0055) |

### Web
- Registro por invitación, recuperación de contraseña, Inicio, Movimientos (con rango de fechas y seis filtros), Mi plata, Inversiones, Compromisos (tarjetas, cuotas, suscripciones, deudas), Ajustes, exportación CSV.
- 45 archivos de test de lib/componentes + 17 de SQL; CI en verde.

### App nativa
- Decisiones aprobadas el 2026-09-29 (monorepo, iOS 18, SwiftUI puro, supabase-swift, Keychain + Face ID, locales primero, Free hasta producción real) — `arquitectura-nativa.md` (solo en la rama).
- Proyecto de Xcode vacío (`ios/EnCuenta.xcodeproj`). CI sin job de iOS todavía.

### Documentación
- ARCHITECTURE.md (385 líneas, muy completo), FUNCTIONAL.md, 19 ADRs, `mudanza-reglas.md` (receta), tres informes de decisión (reglas, conteo retroactivo, deudas/ahorro/offline), PRODUCT.md (nuevo, con marcas **[PROPUESTA]** sin aprobar).

---

## 3. Qué falta

En el orden en que los documentos lo plantean.

### 3.1 Mudanza de reglas a la base (`informe-reglas-de-plata.md` §6, `mudanza-reglas.md`)
5. **Vista previa del conteo en SQL** (`planReconciliation`) **junto con el conteo retroactivo** (opción A de `informe-conteo-retroactivo.md`: columnas nuevas, vínculo en `transactions`, `recompute_reconciliation`, trigger). Riesgo medio-alto.
6. **La lista de Movimientos armada en el servidor**: apareo de transferencias y repartos (Edge Function que reusa `movementList.js`). El tipo de movimiento ya está en SQL.
7. **Cuotas y suscripciones en SQL** (`commitmentSchedule.js` → SQL; valida `due_date` al confirmar, D10).
8. **MEP de los formularios y precios en vivo** del lado del servidor (Edge Function `live_prices`; verificar región por el bloqueo de Binance).
9. **Ganancia realizada en el servidor** (hoy la calcula y escribe el cliente, D6).
10. **Foto del portafolio en SQL unificada con la curva** — resuelve D1 (tarjeta y gráfico dan números distintos). Riesgo alto.
11. **Total de Inicio en USD**.
12. **Ganancia por período** (nueva).
- Después de cada paso aplicado y estable: borrar la versión JS (receta §5).

### 3.2 Pendientes de la base que pidió el frente nativo (`pendientes-base.md`, solo en la rama)
- **Seguridad/rendimiento** (verificado hoy, **nada hecho**): 15 policies con `auth.uid()` sin `select`; 6 FK sin índice (`transactions.category_id`, `commitment_charges.user_id`, dos de `liquid_reconciliations`, dos de `invitations`); candidatos `transactions (user_id, date)` y `contributions (asset_id, date)` a medir con `EXPLAIN`; `confirm_/unconfirm_commitment_charge` sin `search_path`; `handle_new_user` ejecutable por `authenticated`; contraseñas filtradas apagado (switch del panel).
- **Para la app**: `delete_account` (exigido por Apple, va en la v1), `app_config` (versión mínima), lista de Movimientos, vista previa del conteo, vencimientos en SQL.
- **Configuración**: SMTP propio antes de invitar gente; Supabase Pro al ir a producción real.

### 3.3 App nativa (`arquitectura-nativa.md` §10)
- 0 Esqueleto: SDK, login, Keychain, Face ID, cinco pestañas, `design/tokens.json`, `contract/` (esquema + respuestas de muestra), CI de iOS. 0b Cerrar sesión y borrar cuenta.
- 1 Cargar gasto/ingreso con cola sin conexión (lo primero y más valioso). 2 Renglones del período. 3 Saldos. 4 Transferir. Luego lista, conteo, deudas, A pagar, Ajustes, Inicio, Inversiones, publicación (TestFlight, política de privacidad, cuenta demo).
- Android: después del paso 4 de iOS.

### 3.4 Documentación
- Actualizar FUNCTIONAL.md (Movimientos, Inicio, deudas con intereses, offline, cuenta de ahorro).
- Mergear (o decidir) la rama nativa para que `arquitectura-nativa.md` y `pendientes-base.md` estén en main.
- Resolver las marcas **[PROPUESTA]** de PRODUCT.md y alinear CLAUDE.md/FUNCTIONAL con él.
- Decidir qué pasa con los documentos de `docs/ux/` que describen la rama `ui-polish`.
- Faltan ADRs de las decisiones nuevas (mudanza de reglas, 0059, conteo retroactivo, monorepo/nativo).

---

## 4. Inventario de git

### 4.1 Estado general
- `main` local = `origin/main` = **295ac18** (0 commits de diferencia). Último commit: 2026-09-27 18:03 -03. 215 commits; el primero es del 2026-07-03.
- **CI de main**: verde (workflow `test`, 5 últimas corridas `success`, la última 2026-09-27 21:03Z, 48 s). La rama nativa también pasó (2026-10-02, 50 s).
- Repo **público** en GitHub. Sin PRs listados.
- Sin stashes. Sin cambios sin commitear en tracked.
- Sin seguir en main: `.agents/`, `.claude/`, `.codex/`, `skills-lock.json` (herramientas de skills/hooks de Claude; ver plan de limpieza).

### 4.2 Ramas

Clasificación: (a) mergeada en main · (b) viva y al día · (c) viva pero atrasada o con conflictos · (d) abandonada o superada · (e) con trabajo que no existe en otro lado.

| Rama (local y remota) | Último commit | Fecha | Contiene | Clase |
|---|---|---|---|---|
| `main` / `origin/main` | 295ac18 Merge feat/offline-capture | 2026-09-27 | línea principal | — |
| `feat/account-currency-rules` | 98082ef | 2026-09-25 | moneda por trigger, no hay plata sin cuenta (0050) | **(a)** |
| `feat/anon-hardening` | b41e3e1 | 2026-09-25 | anon solo `validate_invite` (0052) | **(a)** |
| `feat/liquid-summary` | 8918521 | 2026-09-25 | `get_liquid_summary` (0051) | **(a)** |
| `feat/anon-tables-hardening` | 2b35f8d | 2026-09-26 | permisos de tablas (0053), cuenta con saldo no se oculta (0054) | **(a)** |
| `feat/expenses-in-sql` | 8918a6e | 2026-09-26 | gastos y totales en SQL (0055–0058) | **(a)** |
| `feat/movement-types-debts-savings` | df60711 | 2026-09-27 | deudas, intereses, ahorro (0059) | **(a)** |
| `feat/offline-capture` | e0b9bbd | 2026-09-27 | carga sin conexión (0060) | **(a)** |
| `docs/native-architecture` | 275e0b5 | 2026-09-29 | `arquitectura-nativa.md`, `pendientes-base.md`, proyecto Xcode vacío, 1 línea en CLAUDE.md | **(c)** técnicamente: 2 adelante / 2 atrás, pero `merge-tree` da **merge limpio**. Además **(e)**: los dos docs y el proyecto iOS no existen en otro lado (sí están en `origin`) |

- Las 7 ramas (a) tienen 0 commits propios y están a 1–21 commits detrás de main: borrarlas no pierde nada (local y remoto).
- **Etiqueta `archivo/ui-polish`** (6c47870, 2026-09-25; local y en `origin`): **28 commits sobre main**, de los cuales `git cherry` marca **25 con parche que no está en main** y 3 equivalentes (el versionado de PRODUCT.md). Base: 46c473d (2026-09-13). Diferencia total contra main: 214 archivos, +8.319/−14.707. Clase **(e)**: trabajo web (caché persistida, navegación de 5 pestañas, captura al primer toque, Inicio en una pantalla, sheet que se agarra, el rojo acotado, volver deslizando, etc.) que no existe en ninguna rama. Parece archivado a propósito ("archivo/") al pasar al plan nativo, pero **ningún documento lo dice**.
  - Consecuencia: `src/lib/queryClient.js` y `READONLY_RPCS` (citados en `informe-reglas-de-plata.md`) solo existen allí; `src/pages/Goal.jsx` (`/objetivo`) sigue en main aunque el bloque 04 de ese plan lo borraba.

### 4.3 Copias de trabajo
| Copia | Estado |
|---|---|
| `/Users/nacho/Proyectos/app-finances` (main) | worktree principal, limpio salvo los 4 sin seguir de arriba |
| `../app-finances-native` (rama `docs/native-architecture`) | limpio (0 cambios, 0 stashes). Contiene `ios/build/` y `ios/…/Index.noindex` generados por Xcode; están ignorados (`ios/.gitignore`). Atiende al diseño: una instancia por worktree |
| `../app-finanzas` | **archivo vacío de 0 bytes** (2026-07-03), no es un repo. Resto de un nombre anterior |
| `app-finances/dist/`, `auditoria-capturas/` | ignorados por git. `auditoria-capturas/` tiene 25 capturas y un `INFORME.md` (74 KB) de pantallas **con datos financieros reales** (sus propias palabras en `.gitignore`); no se suben pero conviene borrarlas |

### 4.4 Archivos sin seguir y locales
- `.env`, `.env.test.local`, `.impeccable/`, `.DS_Store`, `.claude/settings.local.json`, `.claude/scheduled_tasks.lock`: ignorados por git (correcto).
- `docs/relevamiento/` (7 informes del 2026-09-02): ignorado a propósito por `.gitignore`; existe solo en tu disco, sin respaldo.

---

## 5. Migraciones

- **Archivos**: `0001` a `0060`, **sin huecos y sin números repetidos** (60 archivos).
- **Registro en la base**: `list_migrations` devuelve `[]`. Las migraciones se aplican a mano (editor SQL) y **Supabase no guarda cuáles tiene aplicadas**. La única forma de saberlo es buscar objetos, como hice acá.
- **Aplicadas sin archivo**: no encontré ninguna. Cada función, vista y trigger de `public` corresponde a una migración. Dos observaciones de deriva (abajo).
- **Escritas sin aplicar**: ninguna detectada (0060 está aplicada: existen `captured_at`, `transaction_captured_at`, `reject_hidden_account`).

Verificación por objeto (✔ = encontrado en la base hoy):

| Migración(es) | Objeto buscado | |
|---|---|---|
| 0001, 0002, 0005, 0044 | tablas originales con RLS activo; 18 policies | ✔ |
| 0008 | `assets.ticker` | ✔ |
| 0009, 0032, 0033 | `liquid_reconciliations`, `liquid_accounts`, `get_liquid_by_account` | ✔ |
| 0014, 0031 | `asset_types`, `asset_types.color` | ✔ |
| 0016, 0017 | `create_transfer` | ✔ |
| 0018, 0019, 0021 | `instruments` (41), `instrument_prices`, 13 en Binance, cron `refresh-prices-daily` | ✔ (con deriva, ver abajo) |
| 0022, 0026 | `get_portfolio_series`, `instrument_prices_usd` | ✔ |
| 0023 | `debt_payments.affects_liquid` | ✔ |
| 0027 | SPY/IBIT en `data912` activos, 0 en `pending` | ✔ |
| 0028 | `categories.position` | ✔ |
| 0034 | `reconcile_liquid` | ✔ |
| 0035 | `liquid_accounts.is_archived` | ✔ |
| 0036 | `transactions.currency`, `amount`, `liquid_accounts.currency/is_savings`, `declared_amount` | ✔ |
| 0037 | `categories.system_key` (40 filas de sistema) | ✔ |
| 0038 | `assets.savings_account_id` | ✔ |
| 0039 | `get_liquid_by_account` con regla de moneda | ✔ |
| 0040 | `create_account_transfer`, `transactions.transfer_id` | ✔ |
| 0041 | `redistribution_transaction_id`, `system_category_id` | ✔ |
| 0042 | `delete_reconciliation`, `batch_id` | ✔ |
| 0043 | `app_admins`, `invitations`, `is_admin`, `validate_invite` | ✔ |
| 0045, 0046, 0047 | `commitments`, `commitment_charges`, `payment_cards.color/last4` | ✔ |
| 0048 | `handle_new_user` ya no siembra "Efectivo USD" | ✔ |
| 0049 | `debt_balances` | ✔ |
| 0050 | `transactions_currency_from_account`, `liquid_accounts_guard`, `account_id` | ✔ |
| 0051 | `get_liquid_summary` | ✔ |
| 0052, 0053 | `anon` ejecuta solo `validate_invite`; 0 permisos de tabla para `anon` | ✔ |
| 0054 | `liquid_accounts_guard` (existe; no inspeccioné el cuerpo) | ✔ parcial |
| 0055, 0056, 0057, 0058 | `transaction_movement_types`, `expense_lines`, `get_period_totals`, `get_expenses_by_category`, `get_usd_rate`, `get_monthly_expenses_usd`, `get_top_categories(p_kind,p_limit,p_today)` | ✔ |
| 0059 | `save_debt`, `debt_payment_parts`, `interest_usd`, `transactions.debt_id`, trigger de intereses | ✔ |
| 0060 | `captured_at`, `reject_hidden_account` ×3 | ✔ |
| **No verificadas por objeto** | 0003, 0004, 0006, 0007, 0010–0013, 0015, 0020, 0024, 0025, 0029, 0030 (son semillas, defaults, relajaciones de `NOT NULL` o redefiniciones de funciones). Hay evidencia indirecta (las tablas y columnas que esperan existen), pero no inspeccioné cuerpos | ? |

**Deriva repo ↔ producción**
1. **Cron de precios**: el job `refresh-prices-daily` corre `0 * * * *` (cada hora). La 0018, `ARCHITECTURE.md` y el README de la función dicen `0 12 * * *` (una vez por día, 09:00 ART). Alguien lo cambió a mano y no quedó en ningún archivo. Última corrida: `succeeded`.
2. **Advisors de rendimiento**: coinciden exactamente con `pendientes-base.md` (15 + 6 + 7), así que ese documento sigue describiendo la realidad.

---

## 6. Inventario de documentos

Vigente / **desactualizado** / **obsoleto**. Fechas = último commit que lo tocó.

| Documento | Veredicto | Detalle |
|---|---|---|
| `CLAUDE.md` | **Vigente con retoques** | Mapa del proyecto al día hasta 0060. Falta citar `mudanza-reglas.md`, el CI y la etiqueta `archivo/ui-polish`. Su convención "etiquetas de formulario = pregunta" contradice a PRODUCT.md (lo reconoce entre paréntesis). La rama nativa le suma una línea (iOS) |
| `docs/ARCHITECTURE.md` | **Vigente**, un dato mal | Muy completo y alineado con la base. Dice que el cron corre a las 12:00 UTC; en producción corre cada hora. Duplica el razonamiento de varios ADR |
| `docs/FUNCTIONAL.md` | **Desactualizado** | Movimientos: dice "mes calendario sin selector de período", "cuatro números" (Gastos, Ingresos, Invertido, Balance) y "monto ARS"; el código tiene rango de fechas (`RangeSheet`), seis filtros, cinco renglones + Deudas y multimoneda. "Sin offline" ya no vale para el frente nativo. Dice que el modo 'contributed' es "hoy Efectivo USD" (retirado, ADR-014). No menciona intereses de deuda (0059). Sigue usando "Compromisos" donde PRODUCT.md dice "A pagar" |
| `docs/adr/ADR-001…019` | **Vigentes** | Siguen la historia. Formato inconsistente: 001–006 con "Estado: Aceptada — Julio 2026", 007–017 y 019 con "Fecha:", 018 sin cabecera. **No hay ADR** de: mudanza de reglas a la base, 0059, conteo retroactivo, monorepo/nativo, archivar ui-polish |
| `docs/mudanza-reglas.md` | **Vigente** | Receta viva. Contiene un "pendiente atado" (conteo retroactivo) que duplica a `informe-conteo-retroactivo.md` |
| `docs/informe-reglas-de-plata.md` | **Parcialmente desactualizado** → histórico con tabla de estado | Dice "No hay CI" (hay); D2, D3, D7 (parte) y la verificación (a) ya están resueltas; cita `queryClient.js`/`READONLY_RPCS` que no están en main. El inventario y el orden de pasos siguen siendo la referencia |
| `docs/informe-conteo-retroactivo.md` | **Vigente** (decisión tomada, sin implementar) | Atado al paso 5 |
| `docs/informe-deudas-ahorro-offline.md` | **Implementado** → archivar | Bloques 3 y 4 hechos (0059, 0060). Queda como registro de decisión; su contenido debería pasar a un ADR |
| `docs/arquitectura-nativa.md` (solo en la rama) | **Vigente** | Aprobada el 2026-09-29. Pendiente de mergear. Duplica con `pendientes-base.md` los puntos de escala/costos |
| `docs/pendientes-base.md` (solo en la rama) | **Vigente** | Confirmado hoy contra los advisors: nada hecho |
| `PRODUCT.md` | **Vigente, no aprobado del todo** | Cinco marcas **[PROPUESTA]**; 5 preguntas abiertas; "Platform: ios". Choca con CLAUDE.md/FUNCTIONAL en nombre y en nomenclatura |
| `README.md` | **Desactualizado (leve)** | No menciona invitaciones, el frente nativo ni el nombre EnCuenta. Dice "ver FUNCTIONAL.md" para lo pendiente |
| `docs/analisis-activos-manuales.md` (2026-08-17) | **Obsoleto probable** | Relevamiento previo a ADR-014 y a la 0038; sin propuestas. Archivar |
| `docs/inventario-textos-ui.md` (2026-08-17) | **Obsoleto** | Lo reemplaza `docs/ux/textos.md` (2026-09-13) — **ambos inventarían los mismos textos**; los dos anteriores a ui-polish y a 0059 |
| `docs/ux/textos.md` | **Desactualizado** | Duplica al anterior; no refleja textos nuevos |
| `docs/ux/form-inventory.md` (09-04) | **Obsoleto** | Anterior a varias reformas de formularios |
| `docs/ux/arquitectura-informacion.md` (09-13) | **Histórico** | Propuesta de navegación; lo cumplió en parte ui-polish (etiqueta) |
| `docs/ux/auditoria-frontend.md`, `propuesta-frontend.md`, `notas-iphone.md` (09-25) | **Referidos a una rama que no está en main** | Hablan de `feat/ui-polish`. Útiles solo si se retoma esa línea |
| `docs/ux/plan/00…13` (14 archivos, 09-25) | **Referidos a ui-polish** | Son prompts de bloques ya implementados en la etiqueta, no en main. Si se descarta la rama, son historia |
| `docs/ux/movimientos.md`, `deudas-y-gastos-del-mes.md`, `reconciliacion-y-transferencias.md`, `inventario-de-datos.md` | **Históricos** | Informes de diagnóstico de septiembre, ya cubiertos por ADR-016, la 0041 y la 0059 |
| `docs/relevamiento/*` (7, sin versionar) | **Notas locales** | Ignoradas por git; del 2026-09-02; en su mayoría superadas |

**Información duplicada en más de un documento**
- Regla de reconciliación/neteo: ARCHITECTURE (`liquid_reconciliations`, `reconcile_liquid`), FUNCTIONAL (Dinero líquido), ADR-016, `informe-conteo-retroactivo`, `ux/reconciliacion-y-transferencias`.
- Inventario de textos: `inventario-textos-ui.md` y `ux/textos.md`.
- Costos y decisión de Supabase Pro: `arquitectura-nativa.md` §7 y `pendientes-base.md` §4.
- Reglas visuales: CLAUDE.md "Sistema visual" repite lo que ya dice `src/index.css`.
- Orden de pasos de la mudanza: `informe-reglas-de-plata.md` §6, `arquitectura-nativa.md` §3/§10 y `pendientes-base.md` §2.
- "Pendiente atado" del conteo retroactivo: `mudanza-reglas.md` y su informe.

---

## 7. Inconsistencias

1. **Cron**: producción cada hora vs repo, ARCHITECTURE y README de la función (diario 12:00 UTC).
2. **Producto vs documentación técnica**: PRODUCT.md (iOS, "A pagar", cinco pestañas) vs CLAUDE.md y FUNCTIONAL.md (web, "Compromisos", "Mi plata").
3. **Formularios**: CLAUDE.md manda "nombrar el campo con la pregunta que responde"; PRODUCT.md manda lo contrario ("Cuenta", no "¿En qué cuenta?").
4. **FUNCTIONAL vs código en Movimientos** (período, filtros, renglones, monedas) — CLAUDE.md ya describe la versión nueva.
5. **Offline**: FUNCTIONAL dice "sin service worker y sin modo offline a propósito"; la base ya soporta carga sin conexión (0060) y la app nativa la usa. No es un error (la PWA no cambió), pero conviene dejarlo dicho en un solo lugar.
6. **ui-polish**: `docs/ux/plan/*`, `auditoria-frontend`, `propuesta-frontend`, `notas-iphone` y partes de `informe-reglas-de-plata` (queryClient) describen código que solo está en la etiqueta.
7. **`/objetivo`**: el plan ui-polish lo borraba; en main existe `Goal.jsx` (27 líneas) y FUNCTIONAL lo marca 🔜.
8. **`informe-reglas-de-plata`** afirma "No hay CI" y "7 archivos `*Sql.test.js`"; hoy hay CI y 17.
9. **Ramas**: `CLAUDE.md` (rama nativa) y `arquitectura-nativa.md` hablan de `ios/` como parte del monorepo, pero en main no hay `ios/`, `contract/` ni `design/`.
10. **ADRs**: tres formatos de cabecera distintos.
11. **FUNCTIONAL** afirma que el modo 'contributed' vale "hoy Efectivo USD"; ADR-014 y ARCHITECTURE dicen que está en retirada y 0048 sacó el grupo del sembrado.

---

## 8. Riesgos

| # | Riesgo | Gravedad | Detalle |
|---|---|---|---|
| R1 | **Sin backups** | Alta | Según `arquitectura-nativa.md`: plan Free, sin backups diarios; el CSV de la web es el único respaldo. No pude verificar el plan (el MCP no lo expone). 5 usuarios reales y 83 movimientos. Pausa por inactividad solo aplica si no se usa |
| R2 | **Migraciones sin registro** | Alta | `list_migrations` vacío: no hay forma automática de saber qué falta aplicar ni de recrear el entorno. Ya hay una deriva (cron) |
| R3 | **Trabajo web solo en una etiqueta** | Media | 25 commits que existen únicamente como tag (local + origin). Si alguien borra la etiqueta, se pierden |
| R4 | **Trabajo nativo solo en una rama** | Media | Doc de arquitectura y proyecto Xcode, sin mergear (sí en `origin`) |
| R5 | **Rendimiento a escala** | Media (hoy baja) | 15 policies re-evalúan `auth.uid()` por fila; 6 FK sin índice; falta `(user_id, date)` en `transactions` |
| R6 | **Contraseñas filtradas permitidas** | Media | Advisor `auth_leaked_password_protection`; es un switch del panel |
| R7 | **Funciones sin `search_path`** | Baja-media | `confirm_/unconfirm_commitment_charge` |
| R8 | **`handle_new_user` ejecutable por `authenticated`** | Baja | Falla si se llama por RPC (es de trigger), pero no debería estar expuesta |
| R9 | **`validate_invite` ejecutable por `anon`** | Aceptado | Intencional (ADR-017) |
| R10 | **`pg_net` en `public`** | Baja | Mover puede romper el cron |
| R11 | **Mails de Supabase** | Media al invitar gente | Se usa el SMTP de prueba, con muy pocos mails por hora |
| R12 | **Repo público** | Informativo | No hallé secretos (`.env`, `.env.test.local` ignorados; `grep` por JWT solo coincide con hashes de `package-lock.json`; ninguna `service_role` en código de la app). Ojo con las capturas de `auditoria-capturas/` (datos reales, ignoradas) y con que `.claude/settings.local.json` queda en tu disco |
| R13 | **Dependencia del dueño para aplicar migraciones** | Media | Por regla las aplica Nacho a mano; sin CI/CD de base |
| R14 | **Funciones del contrato nativo** | Futuro | Un iPhone puede quedar semanas con la app vieja: regla de "nunca cambiar la forma de una función publicada" todavía no está escrita en `mudanza-reglas.md` (sí en `pendientes-base.md` §3) |
| R15 | **Edge Function `refresh_prices`** | Baja | Existe en el repo, el cron la llama con éxito; no pude verificar qué versión está desplegada |
| R16 | **Paridad JS↔SQL mientras dure la mudanza** | Media | Dos implementaciones de varias reglas; mitigado por tests de paridad en CI |
| R17 | **Cuenta test con datos basura** | Baja | Ya anotado: cualquier total leído ahí está distorsionado |

---

## 9. Decisiones abiertas

**De producto** (`PRODUCT.md` §8 y marcas [PROPUESTA])
1. ¿Existe desktop en la versión iOS/nativa?
2. ¿Solo Argentina o también otros países?
3. ¿El portfolio sigue siendo "de rebote"?
4. ¿Cuánto rendimiento de inversiones entra en Inicio?
5. ¿Cómo se ve el ahorro con su lugar propio?
6. Aprobar o sacar las cinco marcas [PROPUESTA] (p. ej. "No es un asesor", "No se reprocha", principio 5).

**De mudanza de reglas** (`informe-reglas-de-plata.md`)
7. Qué hacer con **cada diferencia de D1** (retiro con ganancia que deja lo aportado en 0, aporte sin cantidad, archivados, precio en vivo vs cierre).
8. D6: si `contributedBefore` usa todos los aportes o solo los anteriores a la fecha del retiro.
9. Edge Function de precios en vivo: probar desde qué región corre (bloqueo de Binance).
10. Cómo se calcula el porcentaje de la ganancia por período.
11. Un orden manual de activos (`assets.position`) — hoy no existe.

**De lo nativo / infraestructura**
12. Cuándo pagar la cuenta de Apple (TestFlight/push) y cuándo pasar a Supabase Pro.
13. Proveedor de SMTP.
14. Política de privacidad (URL pública) y cuenta demo para revisión.
15. Cuándo arranca Android (propuesta: iOS paso 4).
16. Si `tokens.css` y `design/tokens.json` se enganchan a la web.

**Del trabajo existente**
17. **Qué pasa con `archivo/ui-polish`**: retomarlo, rescatar partes o descartarlo. Hoy no hay decisión escrita.
18. Si la rama `docs/native-architecture` se mergea ya a main.
19. Cuándo borrar las versiones JS de lo ya mudado (receta §5: "cuando la app lleve un tiempo leyéndola sin diferencias").
20. Frecuencia correcta del cron de precios (¿horaria a propósito?).

**Pendientes de producto marcados 🔜 en FUNCTIONAL**
Rendimiento en la tarjeta de Inicio; FIRE (objetivo, parámetros, tasa de ahorro, % invertido); rebalanceo; transferencia total con vaciado; editar un retiro que fue liquidación; aviso de límite de tarjeta; estimado de fin de una deuda; ver de qué plan salió un gasto; modo demo; atajo de iPhone.

---

## 10. Plan de limpieza

Nada se ejecuta hasta que lo apruebes.

| # | Elemento | Acción propuesta | Riesgo |
|---|---|---|---|
| 1 | 7 ramas `feat/*` (local + `origin`) | **Borrar** (todas mergeadas, 0 commits propios) | Muy bajo |
| 2 | `docs/native-architecture` | **Mergear a main** (limpio, 2 commits) o rebasar antes; luego borrar la rama | Bajo. Trae `ios/`, 2 docs y 1 línea de CLAUDE.md; revisar que el CI siga verde |
| 3 | Worktree `../app-finances-native` | **Mantener** hasta que haya trabajo iOS; si se mergea la rama, seguir con una rama nueva para iOS desde main | Bajo |
| 4 | Etiqueta `archivo/ui-polish` | **Mantener** como está. Si se descarta, crear una rama `archivo/ui-polish` además de la etiqueta; **no borrar** sin decidir (decisión 17) | Alto si se borra |
| 5 | `../app-finanzas` (archivo vacío) | **Borrar** | Muy bajo |
| 6 | `auditoria-capturas/` (datos reales, ignorado) | **Borrar** del disco | Bajo; son capturas regenerables |
| 7 | `.agents/`, `.codex/`, `.claude/skills`, `skills-lock.json` (sin seguir) | **Decidir**: commitear (herramientas de equipo) o agregar a `.gitignore`. `.claude/settings.local.json` ya está ignorado | Bajo |
| 8 | Cron de precios | **Decidir** (decisión 20) y dejar un archivo/nota que refleje producción | Bajo |
| 9 | Migraciones sin registro | **Documentar** la última aplicada en `docs/ESTADO.md`; evaluar tabla `supabase_migrations` o registrar a mano | Medio |
| 10 | `FUNCTIONAL.md` | **Actualizar** Movimientos, Inicio, deudas, offline | Bajo |
| 11 | `informe-reglas-de-plata.md` | **Actualizar** con una tabla de estado por paso y marcar lo resuelto; conservar el resto como histórico | Bajo |
| 12 | `informe-deudas-ahorro-offline.md` | **Archivar** (`docs/archivo/`) tras escribir su ADR | Bajo |
| 13 | `inventario-textos-ui.md` + `ux/textos.md` | **Fusionar** en uno solo o archivar los dos | Bajo |
| 14 | `analisis-activos-manuales.md`, `ux/form-inventory.md`, informes `ux/` de septiembre | **Archivar** (`docs/archivo/`) | Bajo |
| 15 | `docs/ux/plan/*`, `auditoria-frontend`, `propuesta-frontend`, `notas-iphone`, `arquitectura-informacion` | **Archivar** junto con una nota que diga "implementado solo en la etiqueta `archivo/ui-polish`" (según decisión 17) | Bajo |
| 16 | `docs/relevamiento/` (sin versionar) | **Archivar** o borrar; hoy no tiene respaldo | Bajo |
| 17 | `README.md` | **Actualizar** (nombre EnCuenta, invitaciones, frentes, enlace a `ESTADO.md`) | Muy bajo |
| 18 | `CLAUDE.md` | **Actualizar**: citar `mudanza-reglas.md`, CI, `ESTADO.md`, regla de cierre de sesión; resolver la contradicción de etiquetas con PRODUCT.md | Bajo |
| 19 | `PRODUCT.md` | **Resolver** las marcas [PROPUESTA] y alinear nombres ("A pagar") con la web | Bajo |
| 20 | ADRs | **Unificar** el formato de cabecera y escribir los faltantes (mudanza, 0059/0060, conteo retroactivo, monorepo, archivo de ui-polish) | Bajo |
| 21 | Base: seguridad/rendimiento | **Aplicar** las migraciones de `pendientes-base.md` §1 (policies, índices, `search_path`, revoke de `handle_new_user`) y prender "contraseñas filtradas" en el panel | Medio (cambia producción; hay receta de test) |
| 22 | Backups | **Decidir** plan o exportación periódica manual | Medio |

Orden sugerido: 1, 5, 6, 7 (limpieza inocua) → 2 (merge) → 8, 9, 21, 22 (producción) → 10–20 (documentación).

---

## 11. Propuesta de documentación

Objetivo: que una sesión nueva sepa dónde estamos leyendo **dos páginas**.

### Archivos
| Archivo | Para qué | Quién lo toca |
|---|---|---|
| `docs/ESTADO.md` | **Foto de hoy**, ≤ 1 página: última migración aplicada y fecha de verificación, rama/commit de main, CI, qué frente está en qué estado, qué está en curso, qué quedó a medias, advertencias activas (p. ej. deriva del cron). Cada línea con fecha | Toda sesión, al cerrar |
| `docs/ROADMAP.md` | **Lo que viene**, en orden: pasos de la mudanza (5–12) con estado, pasos de iOS (0–12), pendientes de base, 🔜 de FUNCTIONAL. Una tabla con id, estado, dependencia, documento fuente | Quien cierre un ítem |
| `docs/decisiones/` | Reemplaza a `docs/adr/`: un archivo por decisión con **formato fijo**: `ADR-NNN-título.md` con cabecera `Estado / Fecha / Reemplaza / Contexto / Decisión / Consecuencias / Alternativas`. Un `README.md` índice con una línea por ADR y su estado | Quien tome la decisión |
| `docs/README.md` | Mapa de `docs/`: qué es cada documento, cuál manda en caso de choque (orden: base real > ARCHITECTURE > FUNCTIONAL > PRODUCT > informes) y qué está en `archivo/` | Al agregar o mover un doc |
| `docs/archivo/` | Informes ya implementados o superados, con una línea al inicio: "archivado el AAAA-MM-DD, reemplazado por X" | Limpieza |
| `docs/CHANGELOG-base.md` (opcional) | Una línea por migración aplicada, con fecha de **aplicación** (lo que Supabase no guarda) | Quien aplique |

Formato fijo de ADR (ejemplo mínimo):

```
# ADR-NNN: título corto
Estado: Propuesta | Aceptada | Reemplazada por ADR-MMM
Fecha: AAAA-MM-DD
Contexto: qué pasaba y qué lo hizo necesario
Decisión: qué se decide, en una frase
Consecuencias: qué cambia, qué se vuelve más difícil
Alternativas: qué se descartó y por qué
Documentos afectados: ARCHITECTURE §…, FUNCTIONAL §…
```

### Regla de cierre de sesión (para `CLAUDE.md`)

> **Antes de dar por terminada una sesión de trabajo, y siempre antes de proponer un commit o un merge:**
> 1. Actualizá `docs/ESTADO.md` (fecha, commit de main, última migración aplicada, qué quedó a medias). Si tocaste la base, verificá el estado real con el MCP en solo lectura y anotalo.
> 2. Marcá en `docs/ROADMAP.md` lo que avanzó o se cerró.
> 3. Si tomaste una decisión que cambia cómo se hace algo, escribí un ADR con el formato fijo y sumalo al índice.
> 4. Si agregaste o moviste un archivo importante, actualizá el Mapa del proyecto de `CLAUDE.md`.
> 5. Si una rama quedó mergeada o abandonada, anotalo en `ESTADO.md` y proponé borrarla; nunca dejes trabajo que solo exista en una rama o etiqueta sin mencionarlo en `ESTADO.md`.
> 6. Si un documento quedó viejo por tu cambio, corregilo en el mismo commit o anotá en `ESTADO.md` cuál queda desactualizado.

Con eso, la próxima instancia lee `CLAUDE.md` → `docs/ESTADO.md` → `docs/ROADMAP.md` y sabe dónde está parada sin reconstruir nada desde git.
