# Estado de EnCuenta

Una página. Cada línea lleva su fecha. **Quien termina una sesión de trabajo actualiza este archivo antes de proponer un commit** (regla en `CLAUDE.md`).

Última actualización: 2026-10-09.

## Repo y CI
- `main` en `7188332`, CI verde (workflow `test`, 47 s). — 2026-10-08

## Base (Supabase)
- **Última migración aplicada: 0060**, verificada por objetos en la base (existen `transactions.captured_at`, `reject_hidden_account`, `save_debt`, `get_period_totals`, etc.). — 2026-10-08
- Los archivos van de la 0001 a la 0060, sin huecos ni repetidos. `list_migrations` de Supabase devuelve vacío: las migraciones se aplican a mano y la base no guarda cuáles tiene. La única forma de saberlo es buscar objetos. — 2026-10-08
- 18 tablas en `public`, todas con RLS. — 2026-10-08
- Mudanza de reglas de plata a la base: hechos los pasos 0 a 4, más 0059 (deudas, ahorro) y 0060 (carga sin conexión). Faltan los pasos 5 a 12: ver la tabla de `docs/informe-reglas-de-plata.md`. — 2026-10-08
- `docs/pendientes-base.md` (seguridad y rendimiento, y lo que pide la app nativa): **nada hecho**; los avisos de Supabase del 2026-10-08 coinciden con lo que ese documento describe. — 2026-10-08

## Frentes
| Frente | Estado | Fecha |
|---|---|---|
| Web / PWA | En uso diario, v0.9.1. Solo recibe arreglos: se va a reemplazar. Pendiente conocido: a `getInstruments()` le falta `limit`; hacerlo cuando se amplíe el catálogo (el buscador de varias palabras ya está en `main` desde `3687576`; `docs/traspaso-2026-10.md` §3.2) | 2026-10-08 |
| iOS | **En pausa.** Proyecto de Xcode con la pantalla vacía en `ios/` (iOS 18, Swift 6, solo iPhone). Arquitectura en `docs/arquitectura-nativa.md` | 2026-10-08 |
| Android | No existe (no hay carpeta `android/`) | 2026-10-08 |
| Diseño (Claude Design) | Borrador copiado en `design/decisiones.md`, **sin validar**. Pendientes: Inicio con tarjetas por moneda, prototipo con selector de paletas, flujos que faltan, paleta e identidad (`docs/traspaso-2026-10.md` §3.4) | 2026-10-08 |

## Ramas y etiquetas
- `main`: única rama. — 2026-10-08
- Etiqueta `archivo/ui-polish`: el trabajo de pulido de la web (25 commits) que **no está en `main`**; se archivó a propósito tras rescatar lo útil (ADR-024). — 2026-10-08
- Etiqueta `respaldo/pre-limpieza-2026-10-08`: `main` justo antes de la limpieza (295ac18). — 2026-10-08

## Advertencias activas
1. **Cron de precios con deriva.** En producción el job `refresh-prices-daily` corre cada hora (`0 * * * *`); el repo (0018), `ARCHITECTURE.md` y el ADR-006 dicen una vez por día. Sin resolver: falta decidir si la hora es a propósito. — verificado 2026-10-08
2. **Email del admin hardcodeado** en `supabase/migrations/0043_signup_invitations.sql` y en `src/lib/invitationsSql.test.js`, en un repo público (ADR-017 lo aclara: el email está solo en la migración, una vez, para sembrar `app_admins`; no en funciones que corran en producción). Lo maneja Nacho. — 2026-10-08
3. **Contraseña débil del usuario test** (4 caracteres). Lo maneja Nacho. — 2026-10-08
4. **Supabase en plan Free, sin backups diarios: por confirmar.** Lo dice `docs/arquitectura-nativa.md` §7; no se puede verificar desde el MCP. El respaldo es la exportación CSV de la web. Pasar a Pro antes de invitar gente nueva (`docs/traspaso-2026-10.md` §3.3). — 2026-10-08
5. **Avisos de seguridad de Supabase sin atender:** 15 policies con `auth.uid()` sin `select`, 6 claves foráneas sin índice, contraseñas filtradas apagado, 2 funciones sin `search_path`. — 2026-10-08
6. **Documentos con marcas pendientes:** `PRODUCT.md` tiene 4 marcas [PROPUESTA] sin aprobar; `design/decisiones.md` es un borrador con contradicciones conocidas (Inicio, rojo/coral, archivar, etiquetas de formulario) y promesas que la base no tiene (Meta sin estado «sin meta», orden manual de activos, ganancia por período, color de cuenta). `FUNCTIONAL.md` se corrigió el 2026-10-08 pero no se revisó entero. `docs/ux/inventario-de-datos.md` tiene 4 datos viejos (dice que el ahorro no es origen de un gasto, pero sí lo es desde la 0059; habla de 5 grupos sembrados y son 4 desde la 0048; dice cron a las 9:00 y corre cada hora; dice que los parámetros de independencia financiera no tienen pantalla y la Meta está decidida), y `design/decisiones.md` tiene secciones reemplazadas por ADR-026 y ADR-028. No se corrigen todavía. — 2026-10-09
7. **`delete_reconciliation` deja desfasados los conteos posteriores.** Permite borrar un conteo que tiene conteos posteriores. Está roto frente a ADR-026 (solo se borra el último de cada moneda); el arreglo va en la base. — verificado 2026-10-09
8. **`get_top_categories` usa `current_date` en UTC por defecto** (`p_today`); entre las 21:00 y las 24:00 argentinas el «hoy» es el día siguiente. Borde menor. — verificado 2026-10-09

## Qué documento manda si dos se contradicen
**Base real > `ARCHITECTURE.md` > `FUNCTIONAL.md` > `PRODUCT.md` > informes.** Los informes y `docs/archivo/` son historia. `design/decisiones.md` no manda hasta que Nacho lo revise.

## En curso
Especificación de producto: capa 1 hecha para los grupos 1 a 4 (`docs/producto/capacidades.md`, ADR-025 a 028); faltan los grupos 5 a 8 y la capa 2. Rama `docs/especificacion-capa1`, sin mergear (la revisa Nacho). — 2026-10-09

## Próximo paso
Chat nuevo para los grupos 5 a 8 de la capa 1 (leer este archivo, `docs/producto/capacidades.md` y las decisiones 025 a 028). `docs/ROADMAP.md` todavía no existe. — 2026-10-09
