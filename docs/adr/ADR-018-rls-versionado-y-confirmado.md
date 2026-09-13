# ADR-018: el estado de RLS queda versionado, no solo activado a mano

Fecha: 2026-09-12
Estado: aceptada
Migraciones: 0044

## Contexto

Al auditar el aislamiento entre usuarios antes de abrir el registro por
invitación (ADR-017), se encontró que las 8 tablas originales de la migración
0001 (`categories`, `transactions`, `assets`, `contributions`,
`asset_valuations`, `debts`, `debt_payments`, `settings`) **no tienen ningún
`alter table ... enable row level security` en ningún archivo del repo**.

La migración 0002 ("Políticas RLS para app-finances") es solo comentario, sin
una sola sentencia SQL. La 0005 reemplaza policies (`drop policy
"authenticated full access"` → `create policy "own rows"` / `"own via
asset"` / `"own via debt"`) que ya asumían RLS activo, pero nunca lo activa
ella misma. El interruptor se prendió en algún momento desde el dashboard de
Supabase, a mano, y esa acción nunca quedó en un archivo versionado.

Esto no es una fuga: es un hueco de **reproducibilidad**. Si alguna vez se
reconstruyera la base solo con `supabase/migrations/`, esas 8 tablas se
crearían con sus policies pero RLS **apagado** — las policies quedarían
escritas y completamente inertes, y cualquier `authenticated` vería las filas
de todos los usuarios.

## Verificación del estado real

Antes de escribir la migración que cierra esto, se confirmó el estado actual
corriendo esto contra la base de producción (2026-09-12):

```sql
select relname as tabla, relrowsecurity as rls_activado
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
```

Resultado: las 15 tablas de `public` dieron `relrowsecurity = true`. No hay
fuga activa hoy — el hueco es que el repo por sí solo no lo demuestra, no que
la base esté mal configurada.

De paso se revisó si había otra configuración del mismo tipo —viva en la base,
ausente del repo— y no apareció nada nuevo:

- **Grants de tabla a `anon`/`authenticated`**: ninguna migración los otorga
  explícitamente para tablas de `public`, y no hace falta — es un default de
  plataforma que Supabase aplica a todo proyecto nuevo (`alter default
  privileges ... grant ... to anon, authenticated`), no algo que se haya
  tocado a mano en este proyecto. RLS es, a propósito, el único control real.
- **El cron de precios** (`pg_cron`/`pg_net`, migración 0018) ya estaba
  versionado por completo, agenda incluida; solo el secreto vive en Supabase
  Vault, fuera del repo — que es la excepción correcta (nunca se commitea un
  secreto), no una omisión.
- **Configuración de Auth** (confirmación de email, si el registro público
  está habilitado, Site URL/Redirect URLs): son ajustes del dashboard que no
  tienen equivalente en una migración SQL. Quedan fuera del alcance de esta
  migración por naturaleza —no son parte del esquema— y ya están señalados en
  la conversación que introdujo el registro por invitación.

## Decisión

Migración 0044: activa explícitamente RLS en las 8 tablas originales.
Idempotente por la naturaleza de la sentencia —`alter table ... enable row
level security` sobre una tabla que ya lo tiene activado es un no-op
silencioso, no un error como pasaría con `create table` o `create policy`
repetidos—, verificado contra Postgres local antes de escribirla
(`src/lib/enableRlsSql.test.js`). Correrla sobre la base de producción, donde
ya está todo en `true`, no cambia nada.

## Consecuencias

- Ningún cambio de comportamiento en producción: el estado ya era el correcto.
- Reconstruir la base solo con `supabase/migrations/` da, a partir de esta
  migración, exactamente lo que corre hoy: RLS activo en las 15 tablas de
  `public`, no en 7 de 15.
- Sigue habiendo configuración fuera del repo por diseño (secretos de Vault,
  ajustes de Auth del dashboard) — la diferencia con lo que corrige esta
  migración es que esa configuración no tiene una forma correcta de vivir en
  una migración SQL, mientras que el estado de RLS sí la tiene y no la estaba
  usando.
