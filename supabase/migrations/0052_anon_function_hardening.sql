-- 0052: anon deja de poder ejecutar las funciones de la app, salvo la que el
-- registro necesita sin sesión.
--
-- POR QUÉ: al verificar la 0051 apareció que anon podía ejecutar 15 de las 16
-- funciones de public (verificado con el MCP). Por dos caminos:
--   · Supabase tiene privilegios por defecto que le dan EXECUTE directamente a
--     anon en toda función nueva del schema public.
--   · Postgres le da EXECUTE a PUBLIC en toda función nueva, y anon hereda de
--     PUBLIC. Por eso `revoke ... from public` solo, o `from anon` solo, no
--     alcanzan: hay que cerrar los dos.
-- Hoy no es una fuga: casi todas son SECURITY INVOKER y las policies solo
-- alcanzan a authenticated, así que sin sesión no ven ni escriben ninguna fila.
-- Pero la API no tiene por qué ofrecerle a un visitante sin sesión funciones
-- que nunca va a poder usar, y una función SECURITY DEFINER nueva quedaría
-- expuesta sin que nadie lo decida.
--
-- LA EXCEPCIÓN (una sola):
--   · validate_invite(uuid): la pantalla /registro la llama ANTES de que exista
--     una sesión, para decir si el link sirve. Es SECURITY DEFINER a propósito
--     (0043) y devuelve solo el estado, nunca la fila.
-- Lo demás que pasa sin sesión no necesita EXECUTE de anon:
--   · handle_new_user la dispara el trigger de auth.users; Postgres chequea
--     EXECUTE al CREAR un trigger, no al dispararlo.
--   · Login, recuperación y alta de cuenta van por Supabase Auth, no por
--     funciones de public.
--   · refresh_prices (Edge Function) usa la service_role.
-- authenticated conserva todo lo que tenía: sus permisos son explícitos (los
-- da el default de Supabase por schema), no dependen de PUBLIC.

-- ── 1. Las funciones que ya existen ─────────────────────────────────────────
-- Todas las de public salvo validate_invite y las que pertenezcan a una
-- extensión (esas no son nuestras; Supabase las instala en `extensions`, pero
-- si alguna cayera en public no se toca).
do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname <> 'validate_invite'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon', v_fn);
  end loop;
end $$;

-- La excepción, dicha de nuevo acá para que el archivo la muestre entera.
revoke all on function public.validate_invite(uuid) from public;
grant execute on function public.validate_invite(uuid) to anon, authenticated;

-- ── 2. Las funciones que se creen de ahora en más ──────────────────────────
-- Rige para las funciones que cree el rol que corre esta migración (postgres,
-- en el SQL editor de Supabase), que es el que crea todas las de la app.
--
--   · El default de Supabase, por schema: deja de darle EXECUTE a anon.
alter default privileges in schema public revoke execute on functions from anon;
--   · El default de Postgres es GLOBAL (para PUBLIC, en todo schema), y uno por
--     schema no lo puede sacar, solo sumarle: tiene que ser sin `in schema`.
--     authenticated y service_role siguen recibiendo EXECUTE por el default de
--     Supabase en public. Una función que se cree en OTRO schema necesitará
--     su grant explícito, que es lo correcto.
alter default privileges revoke execute on functions from public;

-- ── Verificación (solo lectura, correr después de aplicar) ─────────────────
-- 1) Qué funciones de public puede ejecutar anon. Tiene que dar una sola fila:
--    validate_invite(p_id uuid).
--
--   select p.oid::regprocedure from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--     and has_function_privilege('anon', p.oid, 'execute');
--
-- 2) authenticated sigue pudiendo ejecutar lo que la app llama. Tiene que dar 0.
--
--   select p.oid::regprocedure from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('confirm_commitment_charge', 'create_account_transfer', 'create_transfer',
--       'delete_reconciliation', 'get_liquid_by_account', 'get_liquid_summary', 'get_portfolio_series',
--       'is_admin', 'reconcile_liquid', 'unconfirm_commitment_charge', 'validate_invite')
--     and not has_function_privilege('authenticated', p.oid, 'execute');
--
-- 3) Los defaults del rol postgres: ningún EXECUTE para anon en public, y el
--    global de funciones ya no incluye a PUBLIC (aparece como una fila sin
--    `=X/postgres`).
--
--   select coalesce(n.nspname, '(global)') as schema, d.defaclobjtype, array_to_string(d.defaclacl, ' ')
--   from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
--   where pg_get_userbyid(d.defaclrole) = 'postgres' and d.defaclobjtype = 'f';
