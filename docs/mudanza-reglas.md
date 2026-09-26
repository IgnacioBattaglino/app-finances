# Receta: mudar una regla de plata a Supabase

Una regla por rama. El piloto fue el saldo de deudas (0049, `debt_balances`, regla de lectura); la segunda, la moneda de cada movimiento (0050, triggers, regla de escritura). Contexto y orden en `informe-reglas-de-plata.md`.

## 0. Medir los datos actuales

- Antes de escribir la migración, contar con el MCP (solo lectura, conteos y no montos) cuántas filas violan la regla nueva.
- Si hay alguna, la migración tiene que decidir qué hace con ellas — y esa decisión se consulta antes. Si no hay, se confirma de nuevo justo antes de escribirla.
- Filas viejas que son testimonio (no se deben corregir): un CHECK `not valid` rige para las nuevas sin tocarlas.

## 1. Migración

- Regla de escritura: trigger `before insert or update of <columnas>`, `security invoker`, con mensajes en castellano (`raise exception`, que la app muestra). Restricciones declarativas (`not null`, `check`) además del trigger, no en su lugar.
- Vista si es una lectura sin parámetros; función SQL (`get_…`, `stable`, `security invoker`) si recibe fechas o filtros. Si depende de "hoy", `p_today date default current_date`.
- **Vista con datos de usuario: `with (security_invoker = true)`, sin condicional.** Sin eso corre como su dueño, saltea RLS y devuelve filas de todos. Mejor que la migración falle en un Postgres viejo a que filtre.
- `revoke all … from public, anon` y `grant select` (o `execute`) `to authenticated`. **Nombrar a `anon` siempre**: Supabase le da EXECUTE (y SELECT en tablas y vistas) directamente a `anon` en todo objeto nuevo de `public`, y revocárselo a `public` no se lo saca. El test lo imita con `alter default privileges … to anon`. Desde la 0052 una función nueva ya nace cerrada para anon (y desde la 0053, una tabla, vista o secuencia), pero el `revoke` explícito se sigue escribiendo: el archivo tiene que decir lo que quiere, no depender de un default.
- Al pie, comentada, la consulta de verificación (solo lectura) para después de aplicar.
- No se aplica desde la rama: la aplica Nacho.

## 2. Paridad

- La función JS queda como **definición ejecutable**. No se toca su lógica.
- Test `src/lib/<regla>Sql.test.js`: base scratch, el archivo de migración **tal cual**, el mismo dataset a las dos, comparación fila por fila.
- Regla de escritura: cada caso se escribe contra la base (como `authenticated`) y lo que quedó guardado se compara con lo que da la función JS. Además, **un test por cada caso que la base rechaza**: esos no existen en la versión JS.
- Dataset: casos de borde con nombre + lote aleatorio con semilla fija. Un test que confirme que los bordes están en el dataset.
- Seguridad: RLS encendido con las mismas policies que la base, consulta con `set role authenticated` + usuario en sesión, y un segundo usuario cuyas filas no pueden aparecer. Un chequeo de que `anon` no lee.
- Probar que el test muerde: sacar `security_invoker` (o romper la regla) y ver que falla.
- Si un trigger impide limpiar la base entre tests (ej. borrar la última cuenta), limpiar con `set session_replication_role = replica`.
- Sin Postgres ≥ 15 local: `initdb` + `pg_ctl -o "-p 5433 -k ''"` con el de Homebrew, `PGHOST=localhost PGPORT=5433`.

## 3. La app

- `lib/<x>.js` lee la vista/función y le pega los campos calculados a las filas. Las pantallas leen esos campos; ninguna importa la regla JS.
- Lo que queda en el cliente es presentación (sumar lo ya calculado para un total, anchos de barra, formato).
- Una vista sin FK no se embebe en PostgREST: consulta aparte en paralelo y merge por id.
- Si se lee por RPC y hay caché con lista de RPC de lectura, agregarla ahí (o que empiece con `get_`) para no disparar invalidaciones.
- Los fixtures de tests de componentes arman los campos nuevos con la definición JS.
- Lo visible no cambia: si cambia algo, es otro PR.

## 4. Después de aplicar

- Correr la consulta del pie de la migración con el MCP (solo lectura): la columna de control tiene que dar `true` en todas las filas.
- Si la migración **reemplaza** una función existente, la versión vieja deja de existir al aplicar. Antes, tomar con el MCP una huella de su resultado (`count` + `md5` de las filas ordenadas, sin montos a la vista) y anotarla en el pie: después de aplicar tiene que dar igual. Solo vale si no se cargó nada en el medio.
- Mirar la pantalla una vez con datos reales.

## 5. Cuándo borrar la versión JS

- Regla de escritura: la parte que decidía qué se guarda deja de importar con el mismo cambio (la base la pisa). Lo que queda en JS para mostrar (un símbolo, un aviso) es presentación y no se borra.

- Cuando la vista está aplicada y verificada en producción, y la app lleva un tiempo leyéndola sin diferencias.
- En un PR aparte: los casos del test de paridad se reescriben como aserciones SQL (valores esperados fijos) y se borran la función JS y sus tests unitarios.

## Pendiente atado a un paso

- El conteo retroactivo (`informe-conteo-retroactivo.md`: opción A más el aviso al crear, solo gastos e ingresos, solo conteos de la 0041 en adelante, un gasto mayor que la diferencia se absorbe entero) se implementa junto con el paso que lleva el conteo a SQL (vista previa del conteo, `planReconciliation`).
