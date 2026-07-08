-- Marca si un aporte descuenta del dinero líquido.
-- true (default) = inversión hecha ahora con plata del bolsillo → resta del líquido.
-- false = tenencia preexistente / carga inicial / efectivo que ya se tenía → NO resta del líquido.
alter table contributions add column affects_liquid boolean not null default true;

-- Los aportes ya existentes a activos tipo cash no deberían haber restado del líquido:
-- marcarlos como affects_liquid = false (corrige el efectivo USD ya cargado).
update contributions set affects_liquid = false
where asset_id in (select id from assets where type = 'cash');
