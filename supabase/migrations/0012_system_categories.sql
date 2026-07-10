-- 0012: categorías del sistema.
-- Las categorías de las que depende la app (hoy "Ajuste de saldo", que la
-- reconciliación del líquido usa para registrar ajustes) se identifican por un
-- flag en el dato, no por su nombre visible. La UI las muestra pero no permite
-- renombrarlas ni archivarlas; el código las busca por is_system + kind.

alter table categories add column is_system boolean not null default false;

-- Backfill: marcar las "Ajuste de saldo" ya sembradas (todos los usuarios)
update categories set is_system = true where name = 'Ajuste de saldo';

-- El trigger de sembrado marca las categorías del sistema al crearlas
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Categorías iniciales de gasto e ingreso
  insert into public.categories (name, kind, user_id) values
    ('Comida', 'expense', new.id),
    ('Salidas', 'expense', new.id),
    ('Auto', 'expense', new.id),
    ('Transporte', 'expense', new.id),
    ('Ropa', 'expense', new.id),
    ('Suscripciones', 'expense', new.id),
    ('Regalos', 'expense', new.id),
    ('Otros', 'expense', new.id),
    ('Sueldo', 'income', new.id),
    ('Otros ingresos', 'income', new.id);

  -- Categorías del sistema: las usa la reconciliación del líquido
  insert into public.categories (name, kind, user_id, is_system) values
    ('Ajuste de saldo', 'expense', new.id, true),
    ('Ajuste de saldo', 'income', new.id, true);

  -- Fila de settings con valores por defecto
  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;
