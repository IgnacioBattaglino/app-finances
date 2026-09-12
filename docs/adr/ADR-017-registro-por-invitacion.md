# ADR-017: registro por invitación, admin sin mail hardcodeado, consumo atómico

Fecha: 2026-09-12
Estado: aceptada
Migraciones: 0043

## Contexto

Hasta acá "registro semi-cerrado" era una disciplina manual: las cuentas las
daba de alta el administrador a mano en el dashboard de Supabase. Eso deja de
alcanzar en cuanto amigos van a poder registrarse solos — hace falta que la
app misma decida quién puede entrar, y que esa decisión la haga cumplir la
base, no la pantalla.

Tres preguntas separadas, con una decisión cada una:

1. ¿Quién es administrador?
2. ¿Qué hace válida una invitación?
3. ¿Cómo se garantiza que "crear la cuenta" y "consumir la invitación" pasen
   las dos o ninguna?

## Decisión

### 1. `app_admins`, no una columna en `settings`

`settings` ya tiene una fila por usuario, así que agregarle `is_admin` parecía
el camino corto. Se descartó: la RLS de `settings` es "own rows" `for all`,
que incluye UPDATE — cualquier usuario podría hacerse admin a sí mismo con un
`update settings set is_admin = true` desde la consola del navegador. Separar
la marca en su propia tabla, **sin ninguna policy de escritura para
`authenticated`** (ni siquiera para leer la de otro, ver más abajo), cierra
esa puerta por completo: no hay ningún camino de la API que la toque, con
cualquier rol que no sea el dueño de la base.

La migración te marca **a vos** buscándote por email en `auth.users` — el
email no queda hardcodeado en ninguna función que corra en producción, solo
en el texto de esta migración (un archivo versionado, corrido una vez a
mano). Si en el futuro hace falta otro admin, se inserta con SQL, igual que
esta primera fila.

`is_admin()` (STABLE, SECURITY INVOKER) es la única forma de consultarlo, y
lee a través de la policy `using (user_id = auth.uid())`: cada uno solo puede
confirmar su propia condición.

### 2. `invitations`: un link de un solo uso, sin campo de código aparte

`id` (uuid, `gen_random_uuid()`) ES el código — viaja entero en la URL
(`?invite=<uuid>`), nadie lo tipea, así que no hace falta un campo separado
con un formato más corto. 122 bits de azar son invulnerables a que alguien lo
adivine.

Vence a los 7 días (`expires_at` con default) si no se usa, y una sola
policy — `for all to authenticated using (is_admin()) with check (is_admin())`
— es toda la protección de la tabla: un no-admin no tiene ningún acceso, ni
de lectura ni de escritura. Se consideró restringir columna por columna (por
ejemplo, que el admin solo pudiera tocar `revoked_at` desde el cliente) y se
descartó: es más superficie para mantener a cambio de nada, porque el actor
que tendría ese acceso amplio ya es de confianza por definición (es admin) y
de todos modos puede hacer lo mismo desde el SQL Editor de Supabase.

Consultar si un código es válido tiene que funcionar **sin sesión** — es la
puerta de entrada a la pantalla de registro — así que existe
`validate_invite(id)`, SECURITY DEFINER (bypassa la policy de arriba a
propósito) pero que devuelve solo un estado (`valid`/`used`/`expired`/
`revoked`/`not_found`), nunca la fila entera: quien la llama no se entera de
quién creó la invitación ni de qué otras existen.

### 3. El consumo vive en `handle_new_user`, no en una función propia

Se consideró una función `accept_invite(code, email, password)` que hiciera
todo en una transacción propia — el mismo patrón que `create_transfer` o
`reconcile_liquid`. Se descartó porque **crear el usuario no es algo que una
función nuestra pueda hacer**: eso lo hace Supabase Auth (GoTrue) a través de
su propia API, no un INSERT que controlemos.

La pieza que sí controlamos es el trigger `on_auth_user_created`, que corre
`AFTER INSERT ON auth.users` **en la misma transacción** con la que GoTrue
crea la cuenta. Eso lo convierte en el único lugar donde "validar y consumir
la invitación" puede ser atómico con "crear el usuario": un `raise exception`
ahí aborta la transacción entera, incluido el INSERT en `auth.users` que
GoTrue acababa de hacer. No hay una invitación que se pueda quemar sin que
exista la cuenta, ni una cuenta que se pueda crear sin invitación.

El código viaja en `raw_user_meta_data` (vía `options.data` de `signUp`)
porque es el único metadato que un cliente público puede escribir al
registrarse — `raw_app_meta_data` requiere la service_role key. Y
`select ... for update` bloquea la fila de la invitación hasta el commit: si
dos pestañas mandan el mismo link al mismo tiempo, la segunda espera a que la
primera termine y la encuentra ya usada.

**No hay bypass, ni para el admin.** Se consideró dejar una puerta —"si el
usuario lo crea el admin desde el dashboard, no hace falta invitación"— y se
descartó: distinguir "esto lo hizo el admin" desde dentro del trigger
hubiera significado inventar otra marca (un campo en `app_metadata`, un rol
de conexión) que en la práctica es otro hardcodeo, con la superficie extra de
tener que recordar ponerlo cada vez. Es más simple, y más seguro, que **toda**
cuenta nueva pase por una invitación — incluida la que el admin se genere
para sí mismo si alguna vez necesita dar de alta a alguien a mano.

## Consecuencias

- Dar de alta un usuario deja de ser "entrar al dashboard de Supabase":
  ahora es generar un link desde la app, incluso para el propio admin.
- El aislamiento entre usuarios no cambia por esta migración: ya estaba
  cerrado (RLS "own rows"/"own via" en todas las tablas de datos, funciones
  `SECURITY DEFINER` que solo insertan con `new.id` explícito, funciones
  `SECURITY INVOKER` que validan pertenencia antes de escribir). Lo que
  cambia es quién puede *crear* una cuenta, no qué puede ver una vez creada.
- `verify-rls.mjs` gana una sección: un usuario no-admin no puede leer ni
  escribir `invitations`, ni llamando a la tabla directo ni por ninguna
  función — y `validate_invite` sigue respondiendo sin sesión.
- Si algún día hace falta un segundo admin, se inserta en `app_admins` por
  SQL. Si hace falta revocarlo, se borra la fila. Ninguna de las dos cosas
  tiene, ni necesita, una pantalla propia.
