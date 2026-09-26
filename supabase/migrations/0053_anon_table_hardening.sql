-- 0053: anon deja de tener permisos sobre las tablas, vistas y secuencias de
-- public, y authenticated pierde los que la app no usa (truncate, references,
-- trigger).
--
-- POR QUÉ: medido con el MCP antes de escribir esto, anon tenía TODOS los
-- permisos (select, insert, update, delete, truncate, references, trigger) en
-- las 18 tablas y en la vista instrument_prices_usd. Venían del default de
-- Supabase, que se los da a anon en todo objeto nuevo de public (la misma
-- causa que la 0052 cerró para las funciones). Hoy no entraba ni leía nada:
-- todas las tablas tienen RLS y ninguna policy alcanza a anon. Pero TRUNCATE
-- no pasa por RLS (Supabase no lo expone por la API, así que no era
-- explotable), y un visitante sin sesión no tiene por qué tener nada de esto.
--
-- NADA SIN SESIÓN LEE UNA TABLA: la pantalla de registro llama solo a
-- validate_invite (0052), y login y recuperación van por Supabase Auth. Lo que
-- anon consultó en la base (pg_stat_statements) es el chequeo "sin login no se
-- ve ninguna fila" de scripts/verify-rls.mjs, que trata un error como
-- bloqueado: sigue pasando, ahora con "sin permiso" en vez de "0 filas".
--
-- authenticated conserva select, insert, update y delete: RLS sigue siendo lo
-- que decide qué filas ve y escribe cada uno.

-- ── 1. Lo que ya existe ─────────────────────────────────────────────────────
-- "all tables" incluye las vistas (instrument_prices_usd, debt_balances).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ── 2. Lo que se cree de ahora en más ──────────────────────────────────────
-- Rige para los objetos que cree el rol que corre esta migración (postgres, en
-- el SQL editor de Supabase). A diferencia de las funciones (0052), Postgres no
-- le da ningún permiso a PUBLIC sobre tablas ni secuencias nuevas: alcanza con
-- el default por schema.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- ── Verificación (solo lectura, correr después de aplicar) ─────────────────
-- 1) Nada de public queda abierto para anon, y authenticated sin truncate,
--    references ni trigger. Tiene que dar 0 filas.
--
--   select c.relname, c.relkind from pg_class c
--   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'S')
--     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
--          or (c.relkind <> 'S' and has_table_privilege('authenticated', c.oid, 'truncate,references,trigger')));
--
-- 2) authenticated sigue pudiendo leer y escribir las tablas (RLS decide las
--    filas). Tiene que dar 0 filas.
--
--   select c.relname from pg_class c
--   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
--     and not (has_table_privilege('authenticated', c.oid, 'select')
--          and has_table_privilege('authenticated', c.oid, 'insert')
--          and has_table_privilege('authenticated', c.oid, 'update')
--          and has_table_privilege('authenticated', c.oid, 'delete'));
--
-- 3) Los defaults de postgres en public: ni tablas (r) ni secuencias (S) le
--    dan algo a anon, y el de tablas para authenticated no trae D, x ni t.
--
--   select d.defaclobjtype, array_to_string(d.defaclacl, ' ')
--   from pg_default_acl d
--   where pg_get_userbyid(d.defaclrole) = 'postgres'
--     and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype in ('r', 'S');
