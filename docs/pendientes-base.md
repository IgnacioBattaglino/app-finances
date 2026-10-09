# Pendientes de la base

Fecha: 2026-09-29. Qué encontró la instancia de la app nativa en la base, para la instancia que hace la mudanza. Fuente: los avisos de Supabase del proyecto (`get_advisors`, solo lectura, 2026-09-27) y la lectura de las migraciones hasta la 0060. Nada de esto lo toca la instancia nativa.

Contexto: `docs/arquitectura-nativa.md` (secciones 3, 5 y 7).

## 1. Seguridad y rendimiento (lo que marcó Supabase)

> **2026-10-09: hecho en la migración 0061** (rama `chore/seguridad-rendimiento-base`, pendiente de aplicar): §1.1 completo, los 6 índices de §1.2, y en §1.4 el `search_path` de las dos funciones y el `revoke` de `handle_new_user`. **Sigue pendiente:** los índices compuestos por período (§1.2, medir primero), §1.3 (lo prende Nacho en el panel) y `pg_net`, que se deja.

### 1.1 Reglas de acceso que se recalculan fila por fila — prioridad alta

- **Qué pasa:** 15 policies escriben `auth.uid()` directo. Postgres lo vuelve a calcular **por cada fila** que mira, en vez de una vez por consulta. Con pocos datos no se nota; con miles de usuarios y años de movimientos es el costo más grande que se puede evitar.
- **Arreglo:** una migración que recrea cada policy con `(select auth.uid())` en lugar de `auth.uid()`. Mismo significado, sin cambiar qué filas ve nadie.
- **Tablas:** `categories`, `transactions`, `assets`, `debts`, `settings`, `contributions` ("own via asset"), `asset_valuations` ("own via asset"), `debt_payments` ("own via debt"), `liquid_reconciliations`, `asset_types`, `liquid_accounts`, `app_admins` ("leer la propia marca"), `payment_cards`, `commitments`, `commitment_charges`.
- **Test:** con la receta de siempre, RLS encendido y dos usuarios, cada tabla sigue mostrando solo las filas propias. La migración no tiene que cambiar ningún resultado.
- Docs: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

### 1.2 Índices

**Claves foráneas sin índice** (6). Sin índice, borrar o actualizar la fila apuntada recorre la tabla entera, y los joins por esa columna también:

| Tabla | Columna | Importa |
|---|---|---|
| `transactions` | `category_id` | **Sí**: la usan los gastos por categoría y borrar una categoría |
| `commitment_charges` | `user_id` | Sí: es la columna de la policy |
| `liquid_reconciliations` | `adjustment_transaction_id` | Sí: borrar un movimiento la revisa |
| `liquid_reconciliations` | `redistribution_transaction_id` | Sí: ídem |
| `invitations` | `created_by`, `used_by` | Poco: tabla chica, solo el admin |

Docs: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

**Índices compuestos para las consultas por período.** `get_period_totals`, `get_expenses_by_category` y `get_monthly_expenses_usd` filtran por usuario y fecha, y `transactions` solo tiene índice por `user_id`. Candidatos: `transactions (user_id, date)` y `contributions (asset_id, date)`. **Confirmarlo con `EXPLAIN ANALYZE` sobre un set de datos grande** (miles de filas por usuario, varios usuarios) antes de agregarlos: con los datos de hoy el planificador ni los usaría, así que medir en producción no dice nada.

**Índices "sin uso" (7).** Supabase marca `liquid_reconciliations_batch_id_idx`, `assets_instrument_id_idx`, `idx_debt_payments_debt`, `idx_commitments_card`, `idx_commitments_category`, `idx_debt_payments_account` e `idx_assets_savings_account`. **No borrarlos:** con tan pocas filas Postgres prefiere leer la tabla entera, así que "sin uso" hoy no dice nada sobre mañana. Varios cubren claves foráneas y los necesitan los borrados.

### 1.3 Contraseñas filtradas — no es una migración

- **Qué pasa:** Auth acepta contraseñas que ya aparecen en filtraciones públicas (HaveIBeenPwned).
- **Arreglo:** Nacho lo prende en el panel de Supabase → Authentication → contraseñas. Es un switch; no hay nada que escribir en el repo.
- Docs: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

### 1.4 Funciones

- **`confirm_commitment_charge` y `unconfirm_commitment_charge` no fijan `search_path`.** Todas las demás llevan `set search_path = public`. Sin eso, la función resuelve nombres según quién la llama. Arreglo: `alter function ... set search_path = public` (o redefinirlas cuando las cuotas pasen a SQL, paso 7 de la mudanza).
  Docs: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- **`handle_new_user` se puede ejecutar por la API** como `authenticated`. Es SECURITY DEFINER; llamada por RPC falla porque es una función de trigger, pero no tiene por qué estar expuesta. Arreglo: `revoke execute on function public.handle_new_user() from public, anon, authenticated`. El trigger sigue funcionando (lo ejecuta Postgres, no el rol).
- **`validate_invite` ejecutable por `anon` (SECURITY DEFINER): es a propósito** (ADR-017, pantalla de registro sin sesión). No tocar; el aviso va a seguir apareciendo.
- **`pg_net` instalada en `public`.** Aviso menor. Moverla de esquema puede romper la llamada del cron a `refresh_prices`; si se hace, probar el cron después. Se puede dejar.

## 2. Lo que necesita la app nativa (en el orden en que la app lo va a pedir)

1. **`delete_account`** — **decidido: borrar la cuenta va dentro de la app desde la primera versión** (lo exige Apple, guía 5.1.1(v)). Edge Function con la service_role: borra todos los datos del usuario en el orden que piden las FK (varias no tienen `on delete cascade` a propósito) y después el usuario de Auth. Una sola transacción para los datos (función SQL SECURITY DEFINER llamada solo por la Edge Function, sin grant a `authenticated`) y el borrado de Auth al final. Test: después de borrar, ninguna tabla tiene filas de ese usuario y las del otro usuario siguen intactas.
2. **`app_config`** — una fila con `min_ios_version` y `min_android_version`, lectura para `authenticated`, sin escritura por la API. Es el freno de emergencia cuando un cambio de contrato sea incompatible.
3. **La lista de Movimientos armada en el servidor** (paso 6 de la mudanza: apareo de transferencias y repartos).
4. **Vista previa del conteo en SQL** (paso 5 de la mudanza).
5. **Qué vence y cuándo, en SQL** (paso 7 de la mudanza). También lo necesitan las notificaciones push, más adelante.

## 3. Reglas para las funciones que use la app

- **No cambiar la forma de una función ya publicada**: agregar columnas al final sí; renombrar, sacar o cambiar tipos, no — se crea `<nombre>_v2`. Un iPhone puede tener la versión vieja de la app durante semanas.
- Toda función nueva de lectura empieza con `get_` (también resuelve la trampa de `READONLY_RPCS` de la web).

## 4. Configuración, no código

- **SMTP propio** antes de invitar gente: el mail que trae Supabase manda muy pocos por hora y es para pruebas.
- **Supabase Pro:** decidido postergarlo hasta producción real (usuarios desconocidos). Mientras tanto, Free no hace backups diarios.
