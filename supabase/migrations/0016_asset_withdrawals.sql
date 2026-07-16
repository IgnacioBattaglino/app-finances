-- 0016: retiros de activos (bajas de capital) y transferencias entre activos.
-- Un retiro es la misma fila de contributions con signo opuesto: direction
-- distingue entrada ('in', default) de salida ('out'). amount_usd sigue
-- guardándose siempre positivo (el CHECK > 0 no cambia); direction decide
-- el signo en los cálculos, no el monto.
--
-- realized_gain: ganancia (positivo) o pérdida (negativo) que un retiro
-- cristaliza por encima del capital aportado. Se calcula y congela en el
-- momento del retiro — mismo principio que mep_rate en debt_payments — y no
-- se recalcula si después se editan aportes anteriores. Null en entradas.
--
-- transfer_id: vincula el retiro con el aporte que lo reinvierte en otro
-- activo (transferencia). No es FK: dos filas comparten el mismo uuid,
-- generado en el cliente. Sin unicidad — agrupa, no referencia.
alter table contributions
  add column direction text not null default 'in' check (direction in ('in', 'out')),
  add column realized_gain numeric(14,2),
  add column transfer_id uuid;
