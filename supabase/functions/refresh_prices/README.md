# Edge Function: `refresh_prices`

Alimenta `instrument_prices` (historial de precios diarios compartido). La llama
el cron diario (`pg_cron` → `pg_net`) y también sirve para el backfill histórico.

> El nombre lleva **guion bajo** (`refresh_prices`), no guion medio. Tiene que
> coincidir exactamente con el nombre de la función desplegada en el dashboard
> de Supabase y con la URL cargada en el Vault (paso B) — un guion distinto
> rompe la URL y el cron falla en silencio. (El jobname del cron,
> `refresh-prices-daily`, sí lleva guion medio: es un identificador de
> `pg_cron` sin relación con el nombre de la función, no lo cambies.)

Todo lo de acá se hace **una sola vez, a mano** (asumo que no tenés el CLI de
Supabase). Orden recomendado: **A) desplegar la función → B) cargar los secretos
del Vault → C) correr la migración `0018` → D) backfill → E) verificar**.

---

## A. Desplegar la función (dashboard, sin CLI)

1. Elegí un secreto para `CRON_SECRET` (una cadena larga al azar, tratala como
   password: no la commitees). Guardala a mano en algún lado seguro.
2. Dashboard de Supabase → **Edge Functions** → **Deploy a new function** (o
   "Create function").
3. Nombre: **`refresh_prices`** (exacto — la URL sale de acá).
4. **Verify JWT: apagado (OFF).** La función hace su propia auth con
   `CRON_SECRET`; el cron no manda un JWT de Supabase, así que si dejás la
   verificación de JWT prendida rechaza la llamada del cron.
5. Pegá el contenido de `index.ts` de esta carpeta y desplegá.
6. En la función → **Secrets / Environment variables**, agregá:
   - `CRON_SECRET` = el valor del paso 1.
   - `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` **NO hace falta cargarlos**:
     Supabase los inyecta solos en toda Edge Function.

La URL queda: `https://<TU-REF>.supabase.co/functions/v1/refresh_prices`
(`<TU-REF>` es el ref del proyecto, lo ves en la URL del dashboard).

---

## B. Cargar los secretos del Vault (SQL Editor, una vez)

El cron lee la URL y el secreto del Vault para no tenerlos hardcodeados en la
migración. Corré esto en el **SQL Editor** reemplazando los dos placeholders.
**No commitees este snippet con los valores reales.**

```sql
select vault.create_secret(
  'https://<TU-REF>.supabase.co/functions/v1/refresh_prices',
  'edge_refresh_prices_url'
);
select vault.create_secret(
  '<EL_MISMO_CRON_SECRET_DEL_PASO_A1>',
  'cron_secret'
);
```

Si ya los habías cargado y querés cambiarlos, usá `vault.update_secret` en vez
de `create_secret` (el nombre es único):

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_secret'),
  '<NUEVO_VALOR>'
);
```

---

## C. Correr la migración

Corré `supabase/migrations/0018_price_history.sql` en el SQL Editor. Crea las
tablas, migra los `coingecko_id`, siembra el catálogo y agenda el cron leyendo
los secretos del paso B. (Si corrés la migración antes del paso B, el cron
quedará agendado pero fallará al ejecutarse hasta que existan los secretos —
reordenar es gratis, no hay que re-agendar nada.)

---

## D. Backfill histórico (una vez, re-ejecutable)

`days` **solo controla mep** (cuántos días hacia atrás). coingecko y data912
siempre traen historia completa: coingecko pide `days=max` a CoinGecko, data912
ignora cualquier rango de fechas (la API no lo soporta) y siempre devuelve
todo lo que tenga por ticker (para acciones/bonos líderes puede ser +20 años).
Es idempotente (upsert): si se corta a la mitad, volvés a correrlo y listo.

**coingecko** además saltea monedas que ya tienen historia "profunda" (más de
`COINGECKO_BACKFILL_COVERAGE_DAYS` = 90 días de antigüedad en el precio más
viejo guardado; ver `coingeckoBackfillTargets` en `index.ts`), upsertea moneda
por moneda apenas la descarga (no al final), y procesa como máximo `?limit=N`
monedas pendientes **por invocación** (default `COINGECKO_BACKFILL_DEFAULT_LIMIT`
= 3). El espaciado grande para respetar el rate limit de la API pública
(~5-15 req/min) NO es un sleep largo adentro de la función -- eso fue lo que
agotaba el presupuesto de ejecución (`WORKER_RESOURCE_LIMIT`) antes de llegar
a cubrir las 13 monedas del catálogo en una sola corrida. En cambio, es el
espaciado ENTRE invocaciones, a tu cargo:

```sh
# Llamada 1: procesa hasta 3 monedas pendientes.
curl -s -X POST \
  "https://<TU-REF>.supabase.co/functions/v1/refresh_prices?mode=backfill&limit=3" \
  -H "Authorization: Bearer <TU_CRON_SECRET>"
# -> {"mode":"backfill","sources":{"coingecko":{"procesadas":3,"filas":18742,
#     "salteadas_completas":0,"fallidas":[],"quedan_pendientes":10}, ...}}

# Esperás ~1 min (a mano, o con cualquier scheduler) y repetís. Cada llamada
# saltea las que ya quedaron completas en la anterior, así que avanza:
curl -s -X POST \
  "https://<TU-REF>.supabase.co/functions/v1/refresh_prices?mode=backfill&limit=3" \
  -H "Authorization: Bearer <TU_CRON_SECRET>"
# -> {"...":{"procesadas":3,"filas":21005,"salteadas_completas":3,"fallidas":[],"quedan_pendientes":7}}
```

`quedan_pendientes` es la cuenta a mirar: cuando llega a 0, terminaste. Si
`fallidas` no está vacío, esas monedas agotaron los 3 reintentos (ver
`fetchJsonWithRetry`) y van a reintentarse solas en la próxima invocación
(siguen sin historia profunda, así que `coingeckoBackfillTargets` no las
saltea).

**data912** además NO recorre todo el catálogo activo: solo trae historia para
instrumentos ya referenciados por algún activo de usuario o que ya tengan
precios cargados (ver el comentario de `data912BackfillTargets` en
`index.ts`). Instrumentos sembrados pero que nadie usa todavía no se
backfillean hasta que alguien los use.

```sh
curl -i -X POST \
  "https://<TU-REF>.supabase.co/functions/v1/refresh_prices?mode=backfill&days=365" \
  -H "Authorization: Bearer <TU_CRON_SECRET>"
```

**`&force=true`** salta ese filtro para data912 y backfillea **todos** los
instrumentos data912 activos, los usados y los que no. Sirve para el arranque
inicial de instrumentos recién sembrados (todavía sin ningún `asset` que los
referencie ni precios cargados — sin `force` esa corrida no trae nada). Ojo
con un catálogo grande: es un request HTTP por instrumento, secuencial, sin
delay pero ~1s cada uno — con muchos instrumentos sembrados puede tardar
varios minutos y arriesgar el timeout de la Edge Function. Usalo puntualmente
después de sembrar instrumentos nuevos, no como corrida de rutina.

```sh
curl -i -X POST \
  "https://<TU-REF>.supabase.co/functions/v1/refresh_prices?mode=backfill&force=true" \
  -H "Authorization: Bearer <TU_CRON_SECRET>"
```

Respuesta esperada: `200` con un JSON tipo
`{"mode":"backfill","sources":{"coingecko":"N filas","mep":"M filas","data912":"N filas"}}`.
Tarda un rato: el backfill de CoinGecko espera ~2,5 s entre cada moneda para
respetar el rate limit de la API pública.

Podés disparar una corrida **diaria** manual igual pero sin `?mode=backfill`.

---

## E. Verificar a mano que quedó bien

En el SQL Editor:

```sql
-- ¿El cron está agendado?
select jobname, schedule, active from cron.job where jobname = 'refresh-prices-daily';

-- ¿Corrió? (status 'succeeded' y sin error). Se llena tras la primera corrida.
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'refresh-prices-daily')
order by start_time desc limit 5;

-- ¿Guardó precios? (últimos upserts)
select i.source, i.symbol, p.date, p.price, p.fetched_at
from instrument_prices p
join instruments i on i.id = p.instrument_id
order by p.fetched_at desc limit 20;
```

Para probar el cron sin esperar a las 12:00 UTC, reprogramalo un par de minutos
adelante (ej. si son las 14:05 UTC, `'8 14 * * *'`), esperá, revisá
`cron.job_run_details`, y volvé a dejarlo en `'0 12 * * *'`.
