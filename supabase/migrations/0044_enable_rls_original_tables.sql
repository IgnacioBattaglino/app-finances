-- 0044: activa RLS explícitamente en las 8 tablas originales de la 0001.
--
-- EL PROBLEMA: reproducibilidad, no una fuga activa. La 0002 ("Políticas RLS
-- para app-finances") es un archivo de puro comentario — no tiene ninguna
-- sentencia SQL — y ninguna migración posterior contiene el
-- `alter table ... enable row level security` de `categories`, `transactions`,
-- `assets`, `contributions`, `asset_valuations`, `debts`, `debt_payments` ni
-- `settings`. Sí están versionadas sus policies (`"own rows"` / `"own via
-- asset"` / `"own via debt"`, migración 0005): lo que faltaba era el
-- interruptor que las hace VALER algo. Se activó en algún momento desde el
-- dashboard de Supabase, a mano, y esa acción nunca quedó en un archivo. Se
-- confirmó el 2026-09-12 que hoy está activo en las 15 tablas de `public` —
-- ver docs/adr/ADR-018-rls-versionado-y-confirmado.md, con la consulta usada.
--
-- Sin esta migración, reconstruir la base solo con `supabase/migrations/`
-- crearía esas 8 tablas con sus policies pero RLS APAGADO: las policies
-- quedarían escritas y completamente inertes, y cualquiera con acceso
-- `authenticated` vería las filas de todos los usuarios. Con esta migración,
-- reconstruir desde cero da exactamente lo que ya está corriendo hoy.
--
-- IDEMPOTENTE por naturaleza de la sentencia, no por un `if not exists`
-- agregado a mano: `alter table ... enable row level security` no es como
-- `create table` o `create policy` (que fallan con "ya existe" si se repiten)
-- — activar algo que ya está activo es un no-op silencioso, verificado contra
-- Postgres local antes de escribir este archivo. Correrla sobre tu base, donde
-- ya está todo en `true`, no cambia nada y no puede fallar.
alter table categories       enable row level security;
alter table transactions     enable row level security;
alter table assets           enable row level security;
alter table contributions    enable row level security;
alter table asset_valuations enable row level security;
alter table debts            enable row level security;
alter table debt_payments    enable row level security;
alter table settings         enable row level security;

-- Verificación (correr a mano después de aplicar; las 15 filas tienen que dar
-- `true` — la misma consulta que confirmó el estado antes de esta migración):
--
--   select relname as tabla, relrowsecurity as rls_activado
--   from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r'
--   order by relname;
