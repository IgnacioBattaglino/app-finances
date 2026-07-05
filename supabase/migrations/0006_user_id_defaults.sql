-- 0006: settings con PK por usuario + user_id automático en los inserts.
-- Debe correr antes que el trigger de sembrado (0007), que inserta en settings
-- y necesita este esquema (con el id viejo, el segundo usuario rompería la PK).

-- 1. settings: la PK pasa a ser user_id y desaparece la columna id.
-- Ya existía unique(user_id); esto formaliza que settings es una fila por usuario.
-- Solo DDL: la fila existente sobrevive intacta.
alter table settings drop constraint settings_pkey;
alter table settings drop constraint settings_user_unique;
alter table settings drop column id;
alter table settings add primary key (user_id);

-- 2. user_id se completa solo en cada insert: default auth.uid().
-- El frontend no envía user_id; el default de la base completa el dueño,
-- y el with check de las políticas RLS (0005) valida que la fila pertenezca
-- a quien la inserta. Defensa en dos capas: la base completa, RLS garantiza.
alter table categories alter column user_id set default auth.uid();
alter table transactions alter column user_id set default auth.uid();
alter table assets alter column user_id set default auth.uid();
alter table debts alter column user_id set default auth.uid();
alter table settings alter column user_id set default auth.uid();
