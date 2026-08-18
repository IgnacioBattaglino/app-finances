-- 0024: contributions.mep_rate pasa a nullable.
--
-- Hasta ahora era NOT NULL (migración 0001): el tipo de cambio del día era
-- obligatorio en TODO aporte, retiro y transferencia, incluso "de afuera"
-- (plata que nunca pasó por el líquido y por lo tanto no necesita traducirse
-- a pesos para nada). Mismo criterio que ya tenía debt_payments.mep_rate
-- desde la migración 0010: si la operación no afecta el líquido
-- (affects_liquid = false), el tipo de cambio es un dato de registro
-- opcional — se guarda si se consigue (MEP del día), pero no se le pide al
-- usuario ni bloquea el guardado si la cotización no está disponible. Las
-- operaciones que sí afectan el líquido lo siguen exigiendo, pero a nivel
-- app (lib/liquid.js ya ignora toda fila con affects_liquid = false).
--
-- Filas existentes no se tocan: todas ya tenían mep_rate (era obligatorio),
-- así que no hace falta backfill.
alter table contributions alter column mep_rate drop not null;
 