# Estado de EnCuenta

Una página. Cada línea lleva su fecha. **Quien termina una sesión de trabajo actualiza este archivo antes de proponer un commit** (regla en `CLAUDE.md`).

Última actualización: 2026-11-16.

## Repo y CI
- `main` en `25e77c9` (el commit de `ESTADO.md` posterior al merge de `docs/especificacion-grupo-5`). **Hay dos ramas subidas sin mergear**, ver «Ramas y etiquetas». — 2026-11-16

## Base (Supabase)
- **Última migración aplicada: 0061** (confirmado el 2026-11-16 con el MCP en solo lectura: existe el índice de la 0061 y ninguna función de las 0062 a 0064), verificada por Nacho con la consulta combinada del pie del archivo (todo `ok = true`) y con `get_advisors`. La 0060 se había verificado por objetos (`transactions.captured_at`, `reject_hidden_account`, `save_debt`, etc.). — 2026-10-09
- **Tres migraciones escritas y SIN APLICAR** (rama `feat/ios-app`), cada una con su test contra Postgres local y su consulta de verificación al pie. Se aplican en orden: **0062** (qué vence y cuándo: `get_commitment_occurrences`, `get_commitment_status`; paso 7 de la mudanza), **0063** (`delete_my_account` y `app_config`; redefine `guard_liquid_account` con una línea más), **0064** (`get_reconciliation_preview`; `delete_reconciliation` ya solo borra el último conteo de cada moneda, lo que también cambia la web). `ARCHITECTURE.md` no las describe todavía: se actualiza al aplicarlas. — 2026-11-16
- Los archivos van de la 0001 a la 0064, sin huecos ni repetidos; aplicados hasta la 0061. `list_migrations` de Supabase devuelve vacío: las migraciones se aplican a mano y la base no guarda cuáles tiene. La única forma de saberlo es buscar objetos. — 2026-10-08
- 18 tablas en `public`, todas con RLS. — 2026-10-08
- Mudanza de reglas de plata a la base: hechos los pasos 0 a 4, más 0059 (deudas, ahorro) y 0060 (carga sin conexión). Faltan los pasos 5 a 12: ver la tabla de `docs/informe-reglas-de-plata.md`. — 2026-10-08
- `docs/pendientes-base.md`: la parte de seguridad y rendimiento (§1) está hecha en la migración 0061, aplicada. Lo que pide la app nativa (§2) y los índices compuestos por período (§1.2) siguen sin hacer. — 2026-10-09

## Frentes
| Frente | Estado | Fecha |
|---|---|---|
| Web / PWA | En uso diario, v0.9.1. Solo recibe arreglos: se va a reemplazar. Arreglos del 2026-11-16 por pedido de un usuario: Compromisos lista todos los vencimientos para confirmar (antes uno solo y un link que no hacía nada), Movimientos muestra el saldo de la cuenta después de cada movimiento (`lib/runningBalance.js`; calculado en el cliente, la versión definitiva es una función SQL) y reordenar cuentas arrastrando ya no vuelve la fila a su lugar. Pendiente conocido: a `getInstruments()` le falta `limit`; hacerlo cuando se amplíe el catálogo (el buscador de varias palabras ya está en `main` desde `3687576`; `docs/traspaso-2026-10.md` §3.2) | 2026-10-08 |
| iOS | **En construcción** (rama `feat/ios-app`, sin mergear). Funciona en el simulador con el usuario de prueba: entrar, candado con Face ID, cargar gasto o ingreso (también sin conexión, con cola local), editar y borrar, Inicio, Movimientos (Lista y Resumen), Mi dinero (saldos, transferir, cuentas), deudas completas, Inversiones de solo lectura, categorías, cerrar sesión. **Escrito pero sin ver funcionando** porque depende de las migraciones 0062 a 0064: los vencimientos de A pagar (tarjetas, cuotas y suscripciones sí se pueden cargar), el paso 2 de Contar disponible y Borrar mi cuenta. 24 tests de Swift. No se probó en un iPhone real. Decisiones en ADR-032; qué le pide a la base en `contract/README.md`; cómo correrla en `ios/README.md` | 2026-11-16 |
| Android | No existe (no hay carpeta `android/`) | 2026-10-08 |
| Diseño (Claude Design) | Borrador copiado en `design/decisiones.md`, **sin validar**. La app de iOS NO lo sigue: usa componentes estándar y los colores de la web, en `design/tokens.json` (ADR-032). Pendientes: Inicio con tarjetas por moneda, prototipo con selector de paletas, flujos que faltan, paleta e identidad (`docs/traspaso-2026-10.md` §3.4) | 2026-10-08 |

## Ramas y etiquetas
- `main`: lo publicado. — 2026-11-16
- `fix/feedback-pwa` (subida a `origin`, sin mergear, un commit sobre `main`): los tres arreglos de la web del 2026-11-16. Mergearla a `main` y subirla los publica en Vercel. Verificada con lint, tests, build, `verify:rls` y, el saldo por movimiento, mirándolo en el navegador con el usuario de prueba. — 2026-11-16
- `feat/ios-app` (subida a `origin`, sin mergear, en el worktree `../app-finances-native`): la app de iOS, las migraciones 0062 a 0064 y su documentación. **Ya contiene `fix/feedback-pwa`.** No mergear a `main` sin revisar ADR-032; las migraciones se pueden aplicar antes o después, la app tolera que falten. — 2026-11-16
- Etiqueta `archivo/ui-polish`: el trabajo de pulido de la web (25 commits) que **no está en `main`**; se archivó a propósito tras rescatar lo útil (ADR-024). — 2026-10-08
- Etiqueta `respaldo/pre-limpieza-2026-10-08`: `main` justo antes de la limpieza (295ac18). — 2026-10-08

## Advertencias activas
1. **Cron de precios con deriva.** En producción el job `refresh-prices-daily` corre cada hora (`0 * * * *`); el repo (0018), `ARCHITECTURE.md` y el ADR-006 dicen una vez por día. Sin resolver: falta decidir si la hora es a propósito. — verificado 2026-10-08
2. **Email del admin hardcodeado** en `supabase/migrations/0043_signup_invitations.sql` y en `src/lib/invitationsSql.test.js`, en un repo público (ADR-017 lo aclara: el email está solo en la migración, una vez, para sembrar `app_admins`; no en funciones que corran en producción). Lo maneja Nacho. — 2026-10-08
3. **Contraseña débil del usuario test** (4 caracteres). Lo maneja Nacho. — 2026-10-08
4. **Supabase en plan Free, sin backups diarios: por confirmar.** Lo dice `docs/arquitectura-nativa.md` §7; no se puede verificar desde el MCP. El respaldo es la exportación CSV de la web. Pasar a Pro antes de invitar gente nueva (`docs/traspaso-2026-10.md` §3.3). — 2026-10-08
5. **Avisos de Supabase resueltos con la 0061** (policies, claves foráneas, `search_path`, `handle_new_user`; verificado con `get_advisors` el 2026-10-09). Quedan: `validate_invite` (a propósito, ADR-017), `pg_net` en `public`, los índices "sin uso" (13, incluidos los 6 nuevos: con tan pocas filas es normal, no se borran) y **contraseñas filtradas, que prende Nacho** en Supabase → Authentication → contraseñas. — 2026-10-09
6. **Documentos con marcas pendientes:** `PRODUCT.md` tiene 4 marcas [PROPUESTA] sin aprobar; `design/decisiones.md` es un borrador con contradicciones conocidas (Inicio, rojo/coral, archivar, etiquetas de formulario) y promesas que la base no tiene (Meta sin estado «sin meta», orden manual de activos, ganancia por período, color de cuenta). `FUNCTIONAL.md` se corrigió el 2026-10-08 pero no se revisó entero. `docs/ux/inventario-de-datos.md` tiene 4 datos viejos (dice que el ahorro no es origen de un gasto, pero sí lo es desde la 0059; habla de 5 grupos sembrados y son 4 desde la 0048; dice cron a las 9:00 y corre cada hora; dice que los parámetros de independencia financiera no tienen pantalla y la Meta está decidida), y `design/decisiones.md` tiene secciones reemplazadas por ADR-026 y ADR-028. No se corrigen todavía. — 2026-10-09
7. **`delete_reconciliation` deja desfasados los conteos posteriores.** Permite borrar un conteo que tiene conteos posteriores. Está roto frente a ADR-026 (solo se borra el último de cada moneda). **El arreglo está escrito en la 0064, sin aplicar**: hasta que se aplique, sigue roto en producción. — 2026-11-16
8. **`get_top_categories` usa `current_date` en UTC por defecto** (`p_today`); entre las 21:00 y las 24:00 argentinas el «hoy» es el día siguiente. Borde menor. — verificado 2026-10-09

9. **Un fragmento del `CRON_SECRET` quedó impreso en la conversación de Claude Code del 2026-11-16** (un `source` de `.env` falló en esa línea y el shell mostró parte del valor). No salió de la máquina ni entró al repo. Si se quiere estar tranquilo, rotarlo en Supabase Vault y en `.env`. Lo decide Nacho. — 2026-11-16
10. **La app de iOS trae, en DEBUG, dos atajos por variable de entorno** (`TEST_USER_EMAIL`/`TEST_USER_PASSWORD` para entrar sola y `SKIP_LOCK` para saltear el candado): existen solo para probar en el simulador (`scripts/ios-run.sh`) y no se compilan en Release. — 2026-11-16

## Qué documento manda si dos se contradicen
**Base real > `ARCHITECTURE.md` > `FUNCTIONAL.md` > `PRODUCT.md` > informes.** Los informes y `docs/archivo/` son historia. `design/decisiones.md` no manda hasta que Nacho lo revise.

## En curso
Dos frentes abiertos a la vez. — 2026-11-16

1. **App de iOS** (rama `feat/ios-app`): construida en una sesión sin Nacho, con decisiones propias anotadas en ADR-032 **como Propuesta**. Lo que falta, en orden de valor:
   - Aplicar las migraciones 0062 a 0064 y mirar A pagar, Contar disponible y Borrar mi cuenta contra la base real (hoy solo compilan).
   - Probarla en el iPhone de Nacho (`docs/arquitectura-nativa.md` §9).
   - La lista de Movimientos armada en el servidor (paso 6 de la mudanza): hoy los repartos de un conteo se ven como dos filas sueltas, y un movimiento que escribió la app (conteo, transferencia) no tiene detalle.
   - Inversiones completa (pasos 8 a 12 de la mudanza): valor por activo, aportar, retirar.
   - Lo de la especificación que necesita base nueva: moneda propia de la deuda y préstamos en cuotas (ADR-030), día de cierre y compra con tarjeta en un pago (ADR-031), gasto cargado tarde frente a un conteo (ADR-027/029).
   - Teclado propio en todos los campos de monto, notificaciones locales de vencimientos, apariencia, exportar datos, foto del contrato en el CI (`contract/README.md`), y el workflow `.github/workflows/ios.yml`, que nunca corrió.
2. **Especificación de producto**, capa 1: grupos 1 a 5 hechos (`docs/producto/capacidades.md`, ADR-025 a 031); faltan los grupos 6 a 8 y la capa 2. — 2026-10-20

Pendientes de decisión de Nacho:
- Revisar ADR-032 punto por punto (sobre todo 2, 5, 7, 9, 10 y 15) y pasarla a Aceptada o corregirla.
- Pago parcial o mínimo del resumen; percepción de consumos en dólares; si «Deudas» deja de ser un «mundo» propio en `PRODUCT.md`.
- Capa 2 (a definir): renglón Deudas en el Resumen; fecha del último conteo de cada cuenta; fecha de compra de cada compra con tarjeta; porcentaje del límite de la tarjeta.
- Verificaciones: `docs/producto/verificaciones-2026-10.md`, sección 2026-10-20. Notas de diseño: `docs/producto/para-diseno.md`.

## Próximo paso
1. Nacho: mergear y subir `fix/feedback-pwa` (publica los arreglos que pidió un usuario).
2. Nacho: aplicar 0062, 0063 y 0064 en ese orden, corriendo la consulta del pie de cada una.
3. Con eso aplicado: abrir la app en el simulador (`scripts/ios-run.sh`) y recorrer A pagar, Contar disponible y Borrar mi cuenta (con un usuario descartable); después, el iPhone real.
4. Chat nuevo para los grupos 6 a 8 de la capa 1 y la capa 2. `docs/ROADMAP.md` todavía no existe. — 2026-11-16
