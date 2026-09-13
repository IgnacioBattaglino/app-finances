-- 0045: compromisos — tarjetas, compras en cuotas y suscripciones.
--
-- ── LA PIEZA QUE FALTABA ────────────────────────────────────────────────────
--
-- En toda la app no existía el concepto de "esto VA A PASAR": una fecha futura
-- cuenta exactamente igual que una pasada. `debtBalance` y
-- `get_liquid_by_account` suman TODAS las filas sin mirar la fecha, así que
-- cargar por adelantado las 6 cuotas de una compra dejaba la deuda saldada al
-- instante y el disponible de hoy 6 cuotas más bajo (ver
-- docs/ux/deudas-y-gastos-del-mes.md, sección 4).
--
-- Esta migración agrega esa pieza UNA sola vez, y sirve igual para cuotas,
-- suscripciones y cualquier gasto que se repita.
--
-- ── LA DECISIÓN QUE ORDENA TODO EL DISEÑO ───────────────────────────────────
--
-- **Un vencimiento pendiente NO es una fila en ninguna tabla.**
--
-- Principio #1 de ARCHITECTURE.md: se guardan EVENTOS y CONFIGURACIÓN; los
-- totales se calculan siempre al vuelo. Un pendiente todavía no ocurrió, así
-- que no es un evento: es una consecuencia de la configuración del plan
-- (desde cuándo, cada cuánto, hasta cuándo), igual que el saldo de una deuda
-- es una consecuencia de sus pagos. Se CALCULA (lib/commitments.js, función
-- pura y testeable), no se guarda.
--
-- Esto no es elegancia: es la garantía más fuerte posible de la regla "un
-- pendiente no cuenta en ningún total, ni en el disponible, ni en los gastos
-- del mes". No hay nada que excluir en `monthTotals`, ni en `getExpenses`, ni
-- en `get_liquid_by_account`, ni en `movementType`, porque no hay ninguna fila
-- que pueda entrar por error. Ni una línea de esas funciones cambia.
--
-- Lo que SÍ se guarda es qué pasó con un vencimiento cuando se resolvió:
-- `commitment_charges`. Y "confirmado" es, como el saldo de una deuda o como
-- `isSettled`, un estado CALCULADO — no una columna: es tener
-- `transaction_id`. De ahí sale gratis una propiedad que la app ya tiene en
-- deudas ("editar o borrar un pago devuelve la deuda a activas sola"): borrar
-- el gasto desde Movimientos devuelve la cuota a pendiente sola, sin ningún
-- trigger ni ningún código que se acuerde de hacerlo.
--
-- ── LO QUE NO CAMBIA ────────────────────────────────────────────────────────
--
-- Una cuota confirmada es un GASTO COMÚN: una fila de `transactions` con la
-- categoría de USUARIO que eligió el plan, indistinguible de una cargada a
-- mano. No es un pago de deuda (que sigue fuera de los totales del mes, sin
-- tocar), no lleva categoría del sistema, y por lo tanto `movementType`
-- (lib/systemCategories.js) NO gana un tipo nuevo: cae en 'expense', que es
-- exactamente lo que es.
--
-- Ninguna tabla existente se modifica. Ninguna función existente se redefine.

-- ── 1. Tarjetas ─────────────────────────────────────────────────────────────
--
-- Una tarjeta agrupa compras en cuotas y, sobre todo, LES DA LA FECHA: si hay
-- tres compras en la misma tarjeta, las tres vencen el mismo día, porque en la
-- vida real se paga un solo resumen. Esa es la razón de que la tarjeta exista
-- como tabla y no sea un texto libre en cada compra.
--
-- Tabla raíz: user_id con default auth.uid() y RLS "own rows", igual que
-- liquid_accounts (0032) y categories.
--
-- NO es una liquid_account: la plata no está ahí. Una cuenta del disponible
-- tiene saldo y suma al "Dinero disponible"; una tarjeta es lo contrario, un
-- lugar del que sale plata que todavía no salió.
create table payment_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  -- Los dos OPCIONALES, a propósito. Quien no sabe de memoria el día de cierre
  -- de su tarjeta tiene que poder cargarla igual: sin día, cada compra usa su
  -- propia fecha, que es lo que la app hacía hasta ahora.
  due_day int check (due_day between 1 and 31),
  credit_limit numeric(14,2) check (credit_limit > 0),
  -- La moneda del límite, y la que se sugiere para las compras de esta
  -- tarjeta. Mismo formato y mismo criterio que liquid_accounts.currency
  -- (0036): validada por FORMA, no contra una lista cerrada.
  currency text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table payment_cards enable row level security;

create policy "own rows" on payment_cards
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_payment_cards_user_position on payment_cards(user_id, position);

-- ── 2. El plan ──────────────────────────────────────────────────────────────
--
-- UNA tabla para las dos formas, porque son la misma cosa con distinto final:
-- un plan genera vencimientos a partir de una fecha, cada cierto tiempo. Una
-- compra en cuotas TERMINA (tiene `installments`); una suscripción NO (no lo
-- tiene, y eso es literalmente toda la diferencia en el modelo).
--
-- Esa diferencia es la que la pantalla tiene que dejar ver: un "comprometido
-- este mes" que sube y baja solo, sin decir qué parte se apaga y cuándo, no
-- explica nada.
create table commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),

  kind text not null check (kind in ('installments', 'subscription')),
  name text not null,

  -- La categoría de USUARIO con la que se va a cargar cada gasto confirmado.
  -- Sin `on delete cascade`, igual que transactions.category_id (0001): una
  -- categoría en uso no se borra, `deleteCategory` la oculta (0028).
  category_id uuid not null references categories(id),

  -- De qué cuenta sale la plata. Se define al crear el plan y se puede cambiar
  -- en el momento de confirmar. Nullable = "sin cuenta", el mismo balde que en
  -- transactions/contributions (0032).
  account_id uuid references liquid_accounts(id),

  -- Solo las compras en cuotas cuelgan de una tarjeta, y de ahí sacan su
  -- fecha de vencimiento. Una suscripción se debita su propio día.
  card_id uuid references payment_cards(id),

  -- La moneda del plan. NO se deriva de la cuenta al leer, se copia acá: un
  -- plan se mira durante meses antes de confirmarse, y cambiar la moneda de
  -- una cuenta no puede reinterpretar un monto ya cargado (mismo criterio que
  -- transactions.currency, ADR-013).
  --
  -- Al confirmar tiene que COINCIDIR con la moneda de la cuenta elegida: la
  -- fila de transactions que se escribe hereda la moneda de su cuenta, y
  -- get_liquid_by_account (0039) suma el monto en el balde de esa cuenta dando
  -- por sentado que está en esa moneda. Un plan en dólares se paga desde una
  -- cuenta en dólares; si no coinciden, la app pide el monto de nuevo en vez
  -- de convertir (no hay ninguna conversión en todo este archivo).
  currency text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),

  -- El monto de CADA vencimiento. Se carga a mano, siempre.
  amount numeric(14,2) not null check (amount > 0),
  -- La primera cuota, cuando dividir el total no da exacto: $100.000 en 3 son
  -- 33.333,34 + 33.333,33 + 33.333,33. La PRIMERA absorbe la diferencia porque
  -- es lo que suelen hacer los bancos, así que coincide más seguido con el
  -- resumen real contra el que se compara. Null = todas iguales, que es el
  -- caso normal y el único que existe en una suscripción.
  first_amount numeric(14,2) check (first_amount > 0),

  -- Cuántas cuotas son EN TOTAL (incluidas las que ya pagaste antes de cargar
  -- el plan, ver first_installment). Null en una suscripción: no tiene final,
  -- no le debo nada a Netflix el año que viene.
  installments int check (installments > 0),
  -- Desde qué cuota arranca a generar. Sirve para cargar una compra ya
  -- empezada ("tengo 3 de 6 pagadas" → 4). Las anteriores no se inventan como
  -- confirmadas: se pagaron afuera de la app y la app no tiene con qué
  -- afirmar cuándo ni cuánto (mismo criterio que empties_asset en ADR-011).
  first_installment int not null default 1 check (first_installment >= 1),

  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),

  -- El PRIMER vencimiento que genera este plan. No hay una columna
  -- "día del mes" aparte: el día de esta fecha ES el día del mes, y tenerlo
  -- dos veces sería tenerlo mal la mitad de las veces.
  start_date date not null,

  -- TERMINADO: no genera ningún vencimiento con fecha posterior a este día.
  -- Es lo que pasa al cancelar una suscripción o al terminar un plan de
  -- cuotas — que son la MISMA operación con dos nombres, así que en el modelo
  -- son una sola columna. Lo ya confirmado queda intacto; un vencimiento
  -- anterior a esta fecha que todavía no se confirmó sigue pendiente, porque
  -- de verdad se debe.
  ends_on date,

  created_at timestamptz not null default now(),

  -- Una compra en cuotas tiene cuotas; una suscripción, no. Es la única
  -- diferencia real entre las dos, así que la base la garantiza en vez de
  -- confiar en que el formulario no se equivoque.
  constraint commitments_installments_only_for_installments
    check ((kind = 'installments') = (installments is not null)),
  -- Arrancar en la cuota 7 de un plan de 6 no significa nada.
  constraint commitments_first_installment_in_range
    check (installments is null or first_installment <= installments),
  -- Una suscripción no cuelga de una tarjeta: su fecha es propia.
  constraint commitments_card_only_for_installments
    check (card_id is null or kind = 'installments'),
  -- Una primera cuota distinta solo tiene sentido si hay cuotas.
  constraint commitments_first_amount_only_for_installments
    check (first_amount is null or kind = 'installments')
);

alter table commitments enable row level security;

create policy "own rows" on commitments
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_commitments_user on commitments(user_id);
create index idx_commitments_card on commitments(card_id);
create index idx_commitments_category on commitments(category_id);
create index idx_commitments_account on commitments(account_id);

-- ── 3. El vencimiento YA RESUELTO ───────────────────────────────────────────
--
-- Acá está la parte contraintuitiva y es la que hay que leer despacio: esta
-- tabla NO tiene una fila por cada vencimiento. Tiene una fila por cada
-- vencimiento que YA SE RESOLVIÓ. Un pendiente no está acá — no está en ningún
-- lado, se calcula del plan (ver el encabezado).
--
-- Dos formas de resolver un vencimiento:
--
--   · CONFIRMADO: `transaction_id` apunta al gasto que se creó. Ese gasto es
--     un gasto común y corriente, que ya cuenta en todos los totales del mes y
--     que ya salió del disponible.
--   · DESCARTADO: `dismissed_at`. No lo pagué y no lo voy a pagar (el mes que
--     no fui al gimnasio). Sin esto un vencimiento solo se podría sacar de
--     encima inventando un gasto que no existió.
--
-- NO hay un CHECK que exija exactamente uno de los dos, y es deliberado:
-- `on delete set null` en transaction_id es un UPDATE, y un CHECK así haría
-- que borrar el gasto desde Movimientos FALLE con un error de constraint. Una
-- fila con los dos en null es exactamente lo que queremos que pase ahí: el
-- vencimiento vuelve a estar pendiente, que es la verdad después de borrar su
-- gasto. La lectura la trata como pendiente y la próxima confirmación la
-- reusa (por eso el unique de abajo).
create table commitment_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  commitment_id uuid not null references commitments(id),

  -- QUÉ vencimiento del plan es. La fecha es la identidad de la ocurrencia:
  -- la calcula el cliente con la misma función que dibuja la lista, y el
  -- unique de abajo es lo que hace que confirmar dos veces el mismo
  -- vencimiento sea imposible incluso con dos pestañas abiertas.
  due_date date not null,

  -- El gasto que generó la confirmación. `on delete set null` y no cascade:
  -- borrar el gasto no borra el vencimiento, lo devuelve a pendiente.
  transaction_id uuid references transactions(id) on delete set null,
  dismissed_at timestamptz,

  created_at timestamptz not null default now(),

  constraint commitment_charges_one_per_due unique (commitment_id, due_date)
);

alter table commitment_charges enable row level security;

create policy "own rows" on commitment_charges
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Sin este índice, borrar una transaction obliga a Postgres a recorrer la
-- tabla entera buscando referencias para aplicar el `set null`.
create index idx_commitment_charges_transaction on commitment_charges(transaction_id);
create index idx_commitment_charges_commitment on commitment_charges(commitment_id, due_date);

-- ── 4. Confirmar un vencimiento, en UNA transacción ─────────────────────────
--
-- Confirmar son dos escrituras: el gasto y la marca de que ese vencimiento ya
-- está resuelto. Como supabase-js no puede abrir una transacción, hacerlas
-- sueltas deja el mismo agujero que ya mordió dos veces en este proyecto
-- (create_transfer 0017, reconcile_liquid 0034): si la segunda falla, queda un
-- gasto cargado y el vencimiento sigue diciendo "pendiente", así que el
-- reintento lo cobra dos veces.
--
-- SECURITY INVOKER: RLS filtra todo lo que lee y los defaults `auth.uid()`
-- completan lo que escribe. Igual valida a mano la pertenencia del plan y de
-- la cuenta antes de escribir nada, porque las FK no miran RLS (mismo criterio
-- que create_transfer y create_account_transfer).
--
-- LA MONEDA NO SE DISCUTE ACÁ: la fila de transactions hereda la moneda de su
-- cuenta, que es el invariante del que depende get_liquid_by_account (0039).
-- Si el plan está en otra moneda, es el cliente el que tiene que pedir el
-- monto de nuevo antes de llamar — acá no se convierte nada.
create or replace function confirm_commitment_charge(
  p_commitment_id uuid,
  p_due_date date,
  p_date date,
  p_amount numeric,
  p_account_id uuid,
  p_description text default null
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_category_id uuid;
  v_currency text;
  v_transaction_id uuid;
begin
  -- El plan, y de paso la validación de pertenencia: RLS ya filtra, así que
  -- un plan ajeno simplemente no aparece.
  select category_id into v_category_id
  from commitments
  where id = p_commitment_id;

  if v_category_id is null then
    raise exception 'Compromiso inexistente o de otro usuario';
  end if;

  -- La moneda sale de la CUENTA, nunca del plan (ver el comentario de arriba).
  -- Sin cuenta es ARS, que es la misma lectura que hace get_liquid_by_account
  -- del balde null.
  if p_account_id is null then
    v_currency := 'ARS';
  else
    select currency into v_currency
    from liquid_accounts
    where id = p_account_id;

    if v_currency is null then
      raise exception 'Cuenta inexistente o de otro usuario';
    end if;
  end if;

  insert into transactions (date, kind, category_id, description, amount, currency, account_id)
  values (p_date, 'expense', v_category_id, nullif(btrim(p_description), ''), p_amount, v_currency, p_account_id)
  returning id into v_transaction_id;

  -- `on conflict` y no un insert a secas: un vencimiento que había vuelto a
  -- pendiente porque se borró su gasto ya tiene su fila (con transaction_id
  -- null), y confirmarlo de nuevo tiene que reusarla, no chocar contra el
  -- unique. El `where` es la guarda real contra el doble cobro: si la fila que
  -- ya existe está confirmada, no se pisa y el insert de arriba se deshace con
  -- el raise.
  insert into commitment_charges (commitment_id, due_date, transaction_id)
  values (p_commitment_id, p_due_date, v_transaction_id)
  on conflict (commitment_id, due_date) do update
    set transaction_id = excluded.transaction_id,
        dismissed_at = null
    where commitment_charges.transaction_id is null;

  if not exists (
    select 1 from commitment_charges
    where commitment_id = p_commitment_id
      and due_date = p_due_date
      and transaction_id = v_transaction_id
  ) then
    raise exception 'Este vencimiento ya estaba confirmado';
  end if;

  return v_transaction_id;
end;
$$;

revoke all on function confirm_commitment_charge(uuid, date, date, numeric, uuid, text) from public;
grant execute on function confirm_commitment_charge(uuid, date, date, numeric, uuid, text) to authenticated;

-- ── 5. Deshacer una confirmación ────────────────────────────────────────────
--
-- Lo inverso y por el mismo motivo: son dos borrados (el gasto y la marca) y
-- tienen que ir juntos. Sueltos, un fallo a la mitad deja un vencimiento
-- "confirmado" cuyo gasto ya no existe, o un gasto suelto que nadie puede
-- rastrear hasta su plan.
--
-- Orden: primero la marca, después el gasto. Al revés también funcionaría
-- (el `on delete set null` dejaría la fila lista para borrar), pero así el
-- borrado no depende de un efecto lateral de la FK.
create or replace function unconfirm_commitment_charge(
  p_commitment_id uuid,
  p_due_date date
) returns void
language plpgsql
security invoker
as $$
declare
  v_transaction_id uuid;
begin
  delete from commitment_charges
  where commitment_id = p_commitment_id
    and due_date = p_due_date
  returning transaction_id into v_transaction_id;

  if not found then
    raise exception 'Este vencimiento no estaba confirmado';
  end if;

  if v_transaction_id is not null then
    delete from transactions where id = v_transaction_id;
  end if;
end;
$$;

revoke all on function unconfirm_commitment_charge(uuid, date) from public;
grant execute on function unconfirm_commitment_charge(uuid, date) to authenticated;

-- ── Verificación a mano, después de aplicar ─────────────────────────────────
--
--   -- Las tres tablas nuevas con RLS activo y su policy:
--   select c.relname, c.relrowsecurity, p.polname
--   from pg_class c left join pg_policy p on p.polrelid = c.oid
--   where c.relname in ('payment_cards', 'commitments', 'commitment_charges');
--
--   -- Nada cambió en lo que ya existía: el disponible tiene que dar
--   -- exactamente lo mismo que antes de la migración.
--   select sum(amount) from get_liquid_by_account();
