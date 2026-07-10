-- Seed puntual: categorías "Ajuste de saldo" para usuarios existentes.
-- (Los usuarios nuevos las reciben por el trigger handle_new_user, migración 0010.)
-- Idempotente: correrlo dos veces no duplica. Requiere la migración 0012 (is_system).

with target_users(uid) as (
  values
    ('ead9a24a-5fd3-4e70-a79e-b4098f6b3ae4'::uuid), -- Nacho
    ('4cc2b9ba-a58b-4b32-b5fe-42a5bbafae48'::uuid)  -- usuario de test
),
target_kinds(kind) as (
  values ('expense'), ('income')
)
insert into public.categories (name, kind, user_id, is_system)
select 'Ajuste de saldo', k.kind, u.uid, true
from target_users u
cross join target_kinds k
where not exists (
  select 1 from public.categories c
  where c.user_id = u.uid
    and c.name = 'Ajuste de saldo'
    and c.kind = k.kind
);
