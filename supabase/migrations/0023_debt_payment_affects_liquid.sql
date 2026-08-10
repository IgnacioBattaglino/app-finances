-- Marca si un pago de deuda descuenta del dinero líquido en pesos.
-- true (default) = pagaste con tu plata del día a día → resta del líquido, a su
--   mep_rate congelado (mismo mecanismo que un aporte a inversión).
-- false = pagaste con dólares que ya tenías (colchón, un retiro de inversión que
--   nunca pasó por el líquido) → baja el saldo de la deuda pero NO toca el líquido.
--
-- Espejo exacto de contributions.affects_liquid (migración 0011): la pregunta que
-- lo completa en la app es "¿De dónde sale?", igual que en Aportar.
alter table debt_payments add column affects_liquid boolean not null default true;

-- Los pagos ya cargados se asumen hechos con plata del líquido (el default), que
-- es lo que la app venía calculando para todo pago con mep_rate. Los que quedaron
-- sin mep_rate siguen fuera del cálculo del líquido por esa vía, no por esta.

-- Todas las consultas de la pantalla de Deudas traen los pagos por deuda; sin
-- este índice cada una es un seq scan (mismo motivo que contributions(asset_id)
-- en la migración 0017).
create index if not exists idx_debt_payments_debt on debt_payments(debt_id);
