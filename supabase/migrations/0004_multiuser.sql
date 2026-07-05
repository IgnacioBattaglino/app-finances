-- Migración a multiusuario: cada usuario tiene sus propios datos.
-- user_id referencia auth.users. Las tablas hijas (contributions, asset_valuations,
-- debt_payments) heredan el dueño vía su FK, no llevan user_id propio.

-- 1. Agregar user_id a las tablas raíz
alter table categories add column user_id uuid references auth.users(id);
alter table transactions add column user_id uuid references auth.users(id);
alter table assets add column user_id uuid references auth.users(id);
alter table debts add column user_id uuid references auth.users(id);

-- 2. Asignar los datos existentes al usuario actual (Nacho)
update categories set user_id = 'ead9a24a-5fd3-4e70-a79e-b4098f6b3ae4' where user_id is null;
update transactions set user_id = 'ead9a24a-5fd3-4e70-a79e-b4098f6b3ae4' where user_id is null;
update assets set user_id = 'ead9a24a-5fd3-4e70-a79e-b4098f6b3ae4' where user_id is null;
update debts set user_id = 'ead9a24a-5fd3-4e70-a79e-b4098f6b3ae4' where user_id is null;

-- 3. Ahora que no hay nulos, hacer user_id obligatorio
alter table categories alter column user_id set not null;
alter table transactions alter column user_id set not null;
alter table assets alter column user_id set not null;
alter table debts alter column user_id set not null;

-- 4. settings: de fila única a una por usuario
-- Quitar la restricción de fila única (id = 1) y ligar settings a un usuario
alter table settings drop constraint if exists settings_id_check;
alter table settings add column user_id uuid references auth.users(id);
update settings set user_id = 'ead9a24a-5fd3-4e70-a79e-b4098f6b3ae4' where user_id is null;
alter table settings alter column user_id set not null;
alter table settings add constraint settings_user_unique unique (user_id);

-- 5. Índices para las búsquedas por usuario (rendimiento)
create index idx_categories_user on categories(user_id);
create index idx_transactions_user on transactions(user_id);
create index idx_assets_user on assets(user_id);
create index idx_debts_user on debts(user_id);
