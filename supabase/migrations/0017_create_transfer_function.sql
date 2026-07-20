-- 0017: transferencia atómica entre activos + índice de lectura por activo +
-- dos columnas nuevas en contributions (presentes, lógica pendiente).
--
-- Antes createTransfer (cliente) hacía dos escrituras separadas (retiro +
-- aporte); si la segunda fallaba quedaba un retiro huérfano: plata que salía
-- de un activo y nunca entraba en el otro, corrompiendo ambos saldos.
-- create_transfer inserta las dos patas en UNA transacción (un solo INSERT
-- de dos filas) con el mismo transfer_id.
--
-- La ganancia realizada del retiro (realized_gain, Opción A "primero
-- capital") se sigue calculando en el cliente y se pasa como parámetro: la
-- lógica de negocio vive en un solo lugar (lib/portfolio.js, con tests). La
-- función solo garantiza atomicidad y pertenencia.
--
-- SECURITY INVOKER (default): corre con los permisos del usuario, así que RLS
-- ("own via asset") ya bloquearía insertar en un activo ajeno. La validación
-- explícita de pertenencia agrega un error claro y defensa en profundidad, y
-- corre ANTES del insert, así que un activo ajeno se rechaza sin escribir
-- nada.

-- Columnas presentes, lógica pendiente: se agregan ahora (nullable, sin
-- default forzado) para no encadenar otra migración cuando llegue su lógica
-- de aplicación. Hoy NINGÚN código de la app las lee ni las escribe, y
-- create_transfer tampoco las setea (quedan NULL). Se agregan antes de crear
-- la función para que su tipo de retorno (setof contributions) ya refleje la
-- forma final de la tabla.
--   via_mep: marca de que la operación se hizo vía dólar MEP.
--   empties_asset: marca explícita de liquidación (vaciado del activo). El
--     formulario de retiro/liquidación ya captura ese dato pero hoy lo
--     descarta; cuando se persista, reemplazará la inferencia por posición
--     de classifyOperations.
alter table contributions
  add column via_mep boolean,
  add column empties_asset boolean;

create or replace function public.create_transfer(
  p_from_asset_id uuid,
  p_to_asset_id uuid,
  p_date date,
  p_amount_usd numeric,
  p_from_quantity numeric,
  p_to_quantity numeric,
  p_mep_rate numeric,
  p_realized_gain numeric
)
returns setof contributions
language plpgsql
set search_path = public
as $$
declare
  v_transfer_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from assets where id = p_from_asset_id and user_id = auth.uid()) then
    raise exception 'Activo de origen inexistente o de otro usuario';
  end if;
  if not exists (select 1 from assets where id = p_to_asset_id and user_id = auth.uid()) then
    raise exception 'Activo de destino inexistente o de otro usuario';
  end if;

  return query
  insert into contributions
    (asset_id, date, amount_usd, quantity, mep_rate, affects_liquid, direction, realized_gain, transfer_id)
  values
    (p_from_asset_id, p_date, p_amount_usd, p_from_quantity, p_mep_rate, false, 'out', p_realized_gain, v_transfer_id),
    (p_to_asset_id,   p_date, p_amount_usd, p_to_quantity,   p_mep_rate, false, 'in',  null,             v_transfer_id)
  returning *;
end;
$$;

-- Solo usuarios autenticados pueden llamarla (la app es de registro
-- semi-cerrado; anon no opera). auth.uid() nulo haría fallar la validación
-- igual, pero mejor no exponerla.
revoke all on function public.create_transfer(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.create_transfer(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- Índice de lectura: getContributions filtra por asset_id en todas las
-- consultas del portafolio y del detalle de activo.
create index if not exists contributions_asset_id_idx on contributions (asset_id);
