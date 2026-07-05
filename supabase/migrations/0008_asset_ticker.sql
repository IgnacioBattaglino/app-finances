-- Ticker/símbolo opcional del activo (ej: AAPL, AL30, BTC).
-- Hoy informativo; habilita valuación automática por API en fase 2.
alter table assets add column ticker text;
