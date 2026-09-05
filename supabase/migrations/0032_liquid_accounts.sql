-- 0032: cuentas dentro del disponible.
--
-- Hasta ahora el "dinero disponible" era UN número: la suma de todos los
-- movimientos en pesos del usuario. Pero esa plata no está en un solo lado
-- --hay efectivo en el bolsillo, saldo en Mercado Pago, saldo en Cuenta DNI--
-- y al reconciliar había que contar todo junto y declarar un total, que es
-- justo lo que nadie sabe de memoria. Una CUENTA es una subdivisión del
-- disponible por DÓNDE ESTÁ FÍSICAMENTE la plata.
--
-- No es "de quién es" ni "para qué es" esa plata (billeteras/cajas): eso es
-- otro eje, y esta migración no lo prepara ni lo insinúa.
--
-- El total del disponible NO cambia: es la suma de las cuentas. Lo que se
-- agrega es el desglose, y con él una reconciliación por cuenta (declarás
-- cuánto hay en cada una, y cada una genera su propio ajuste).

-- ── 1. La tabla ─────────────────────────────────────────────────────────────
-- Tabla raíz: user_id directo con default auth.uid() y RLS "own rows", igual
-- que categories/asset_types/liquid_reconciliations. El frontend nunca manda
-- user_id.
--
-- `position` es el mismo patrón de orden manual de categories.position (0028)
-- y asset_types.display_order (0014): 0-based dentro del usuario, sin unique
-- --un empate lo desempata el nombre, no invalida nada-- y lo renumera el
-- cliente al soltar el arrastre.
create table liquid_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table liquid_accounts enable row level security;

create policy "own rows" on liquid_accounts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_liquid_accounts_user_position on liquid_accounts(user_id, position);

-- ── 2. El vínculo desde los movimientos ─────────────────────────────────────
-- Las tres tablas que mueven el disponible (ver la fórmula en ARCHITECTURE.md:
-- transactions ± , contributions con affects_liquid, debt_payments con
-- affects_liquid) llevan la cuenta de la que salió o a la que entró la plata.
--
-- Nullable a propósito: null = "sin cuenta". No es un estado a completar ni un
-- error -- es el balde donde caen las filas que ninguna migración alcanzó a
-- asignar. Suman al total igual que cualquier otra, pero no se muestran como
-- una cuenta real (no lo son).
--
-- SIN `on delete cascade`, exactamente por el mismo motivo que
-- transactions.category_id (0001): borrar una cuenta con movimientos no puede
-- llevarse los movimientos puestos. La base rechaza el delete con 23503 y el
-- cliente ofrece reasignarlos a otra cuenta antes de borrar (ver
-- deleteAccount en lib/liquidAccounts.js, mismo mecanismo que deleteCategory).
alter table transactions  add column account_id uuid references liquid_accounts(id);
alter table contributions add column account_id uuid references liquid_accounts(id);
alter table debt_payments add column account_id uuid references liquid_accounts(id);

-- Un delete sobre la fila referenciada hace que Postgres busque referencias en
-- cada tabla hija; sin índice eso es un seq scan de toda la tabla. Además son
-- los índices que usa la reasignación masiva al eliminar una cuenta.
create index idx_transactions_account  on transactions(account_id);
create index idx_contributions_account on contributions(account_id);
create index idx_debt_payments_account on debt_payments(account_id);

-- ── 3. La reconciliación pasa a ser POR CUENTA ──────────────────────────────
-- Antes una reconciliación era una fila: un total declarado y su ajuste. Ahora
-- el usuario declara cuánto hay en CADA cuenta, así que se graba una fila por
-- cuenta declarada, cada una con su monto y su propio ajuste.
--
-- Esto no es decoración: la última reconciliación tiene que poder consultarse
-- POR CUENTA (una cuenta recién reconciliada y otra sin reconciliar desde hace
-- meses son dos historias distintas, y el aviso de edición retroactiva
-- necesita saber cuál es cuál).
--
-- Nullable: las filas anteriores a esta migración quedan con account_id null y
-- se leen como lo que son -- reconciliaciones del disponible entero, cuando
-- todavía no había cuentas. No se backfillean a "Efectivo": no reconciliaron
-- Efectivo, reconciliaron el total. Mismo criterio que empties_asset en
-- ADR-011: un dato que no se registró no se inventa.
alter table liquid_reconciliations add column account_id uuid references liquid_accounts(id);

create index idx_liquid_recon_account on liquid_reconciliations(account_id, date desc);

-- ── 4. handle_new_user: toda cuenta nueva arranca con "Efectivo" ────────────
-- Se copia la versión vigente (0028) y se le suma el insert de la cuenta
-- inicial. Un usuario nuevo tiene UNA cuenta, así que los formularios la
-- preseleccionan y nunca tiene que pensar en esto: el selector de cuenta le
-- aparece resuelto, y si quiere más cuentas las crea en Ajustes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Categorías iniciales de gasto e ingreso, en el orden en que se muestran
  insert into public.categories (name, kind, user_id, position) values
    ('Comida', 'expense', new.id, 0),
    ('Salidas', 'expense', new.id, 1),
    ('Auto', 'expense', new.id, 2),
    ('Transporte', 'expense', new.id, 3),
    ('Ropa', 'expense', new.id, 4),
    ('Suscripciones', 'expense', new.id, 5),
    ('Regalos', 'expense', new.id, 6),
    ('Otros', 'expense', new.id, 7),
    ('Sueldo', 'income', new.id, 0),
    ('Otros ingresos', 'income', new.id, 1);

  -- Categorías del sistema: las usa la reconciliación del líquido
  insert into public.categories (name, kind, user_id, is_system, position) values
    ('Ajuste de saldo', 'expense', new.id, true, 100),
    ('Ajuste de saldo', 'income', new.id, true, 100);

  -- Bolsas de activos default. valuation_mode ya no se siembra acá: vive en
  -- assets, se elige por activo.
  insert into public.asset_types (user_id, name, earns_yield, include_in_total, display_order) values
    (new.id, 'Cripto', true, true, 1),
    (new.id, 'CEDEARs', true, true, 2),
    (new.id, 'Renta fija', true, true, 3),
    (new.id, 'Fondos', true, true, 4),
    (new.id, 'Efectivo USD', false, true, 5);

  -- Cuenta inicial del disponible (0032). Una sola: el usuario que no quiere
  -- pensar en cuentas carga todo acá sin tocar el selector.
  insert into public.liquid_accounts (user_id, name, position) values
    (new.id, 'Efectivo', 0);

  -- Fila de settings con valores por defecto
  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;

-- ── 5. MIGRACIÓN DE DATOS de los usuarios que ya existen ────────────────────
-- El trigger de arriba solo corre para usuarios NUEVOS. Los que ya existen
-- necesitan su cuenta "Efectivo" y, sobre todo, que sus movimientos ya
-- cargados queden asignados a ella. Sin esto todo el historial caería en el
-- balde "sin cuenta" y el desglose arrancaría vacío -- que es exactamente lo
-- que no queremos: el disponible de hoy está, físicamente, en algún lado.
--
-- La tabla se acaba de crear en esta misma migración, así que después del
-- insert hay EXACTAMENTE UNA cuenta por usuario y el join por user_id es
-- unívoco. El `where not exists` es solo para que el archivo sea idempotente
-- si se lo corre dos veces.

insert into liquid_accounts (user_id, name, position)
select u.id, 'Efectivo', 0
from auth.users u
where not exists (select 1 from liquid_accounts la where la.user_id = u.id);

-- transactions: TODAS. Cualquier gasto o ingreso ya cargado movió el
-- disponible (es la definición de la tabla: ARS, vida diaria), incluidos los
-- ajustes de reconciliaciones anteriores -- que son transactions comunes.
update transactions t
set account_id = la.id
from liquid_accounts la
where la.user_id = t.user_id
  and t.account_id is null;

-- contributions: SOLO las que afectan el disponible. Un aporte "de afuera"
-- (affects_liquid = false) nunca pasó por los pesos, y las dos patas de una
-- transferencia también son false (create_transfer, 0017): ninguna tiene
-- cuenta porque ninguna salió de una cuenta. contributions no tiene user_id
-- propio, lo hereda por assets (RLS "own via asset").
update contributions c
set account_id = la.id
from assets a
join liquid_accounts la on la.user_id = a.user_id
where a.id = c.asset_id
  and c.affects_liquid = true
  and c.account_id is null;

-- debt_payments: los que afectan el disponible. La columna es NOT NULL con
-- default true desde la 0023, así que en la práctica `is distinct from false`
-- y `= true` coinciden; se escribe así por la misma razón que lo hace
-- computeLiquidFromCollections -- solo un false explícito excluye.
--
-- Los pagos sin mep_rate SÍ se asignan: quedan fuera del CÁLCULO del líquido
-- por no tener tasa (eso no cambia), pero salieron de una cuenta igual. Si
-- algún día se les carga la tasa, ya están en su cuenta.
update debt_payments p
set account_id = la.id
from debts d
join liquid_accounts la on la.user_id = d.user_id
where d.id = p.debt_id
  and p.affects_liquid is distinct from false
  and p.account_id is null;

-- Verificación (correr a mano después de aplicar; no debería devolver filas):
--
--   select 'transactions' as tabla, count(*) from transactions where account_id is null
--   union all
--   select 'contributions', count(*) from contributions
--     where affects_liquid = true and account_id is null
--   union all
--   select 'debt_payments', count(*) from debt_payments
--     where affects_liquid is distinct from false and account_id is null;
