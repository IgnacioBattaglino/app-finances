-- Marca si un activo busca rendimiento. false = reserva de valor (ej: efectivo/colchón):
-- se excluye del cálculo de rendimiento del portafolio para no aguar el promedio.
alter table assets add column yields boolean not null default true;

-- Los activos tipo cash no buscan rendimiento
update assets set yields = false where type = 'cash';
