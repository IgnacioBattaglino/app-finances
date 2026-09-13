-- 0047: últimos 4 dígitos, opcionales, por tarjeta.
--
-- Compromisos dibuja la tarjeta como una tarjeta de verdad (0046); esto es lo
-- que le falta para que se reconozca de un vistazo cuando hay dos del mismo
-- color: los últimos cuatro dígitos, mostrados enmascarados ("•••• 4417")
-- sobre el rectángulo.
--
-- SOLO los últimos cuatro, nunca el número completo: no hay ninguna razón
-- para que esta app guarde un número de tarjeta, y guardar cuatro dígitos que
-- no alcanzan para cobrar nada no es un dato sensible en el mismo sentido.
--
-- text y no int a propósito: un dígito inicial en cero ("0032") es un valor
-- legítimo y numeric se lo comería.
--
-- Nullable y sin default: null = sin dígitos cargados, que es exactamente lo
-- que se ve hoy (la tarjeta con su color y su nombre, nada más). El CHECK
-- exige CUATRO dígitos exactos cuando el campo no es null -- ni más corto (un
-- dato a medio cargar) ni más largo (el número completo por error).
alter table payment_cards add column last4 text
  constraint payment_cards_last4_format check (last4 is null or last4 ~ '^[0-9]{4}$');
