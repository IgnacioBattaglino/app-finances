-- Sembrado automático para usuarios nuevos:
-- al crearse un usuario en auth.users, se le generan sus categorías iniciales y su fila de settings.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Categorías iniciales de gasto
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

  -- Fila de settings con valores por defecto
  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
