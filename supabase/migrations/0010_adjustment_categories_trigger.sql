-- 0010: soporte para reconciliación de líquido.
-- 1. Los usuarios nuevos reciben las categorías "Ajuste de saldo" (gasto e ingreso),
--    que usa la reconciliación para registrar diferencias.
--    Para usuarios existentes: correr supabase/seeds/adjustment_categories.sql.
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
    ('Ajuste de saldo', 'expense', new.id),
    ('Sueldo', 'income', new.id),
    ('Otros ingresos', 'income', new.id),
    ('Ajuste de saldo', 'income', new.id);

  -- Fila de settings con valores por defecto
  insert into public.settings (user_id) values (new.id);

  return new;
end;
$$;

-- 2. MEP congelado en pagos de deuda, igual que en contributions.
-- La agrega el líquido (convierte pagos USD→ARS por el MEP de su fecha);
-- la futura feature de Deudas la consume, no la recrea. Nullable: filas
-- históricas sin MEP quedan fuera del cálculo del líquido.
alter table debt_payments add column mep_rate numeric(10,2);
