# ADR-004: Migración temprana a multiusuario

**Estado:** Aceptada — Julio 2026

## Contexto
El proyecto arrancó single-user por simplicidad: autenticación con Supabase Auth pero sin user_id en las tablas (un solo dueño implícito de todos los datos). A mitad del desarrollo se decidió soportar múltiples usuarios (amigos del autor). Se evaluó migrar al final del desarrollo versus migrar temprano, con menos features construidas.

## Decisión
Migrar temprano (migraciones 0004 a 0007):
- user_id en las tablas raíz (categories, transactions, assets, debts) con default auth.uid(): la base completa el dueño en cada insert; el with check de RLS es la garantía de pertenencia.
- Las tablas hijas (contributions, asset_valuations, debt_payments) heredan el dueño por su FK a la tabla raíz; no llevan user_id propio.
- settings pasa de fila única (id = 1) a una fila por usuario con PK user_id.
- Trigger handle_new_user: al crearse un usuario se siembran sus categorías iniciales y su fila de settings.
- Registro semi-cerrado: las cuentas las crea el administrador; no hay signup público.

## Consecuencias
- (+) Las features restantes (Movimientos, Portafolio, Objetivo, Deudas) se construyen ya multiusuario, sin retrabajo.
- (+) Aislamiento a nivel base de datos (RLS), no de aplicación: un bug en el frontend no puede filtrar datos de otro usuario.
- (−) Cada feature nueva debe considerar el aislamiento en sus políticas RLS.
- (−) La migración incluyó un fix (0007, luego renumerada 0006) por un default heredado del diseño single-user en settings (id default 1, que rompía el alta del segundo usuario), detectado en revisión antes de ejecutarse.
