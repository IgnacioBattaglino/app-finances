-- 0046: color opcional por tarjeta.
--
-- Compromisos muestra cada tarjeta como una tarjeta de verdad (rectángulo,
-- color, nombre encima), para distinguirlas de un vistazo cuando hay varias —
-- igual que en la billetera. El color es de la TARJETA, no del dispositivo:
-- viaja con la cuenta, como asset_types.color (migración 0031).
--
-- Nullable y sin default a propósito: null = sin color, que es exactamente lo
-- que se ve hoy (rectángulo neutro). Las tarjetas que ya existen no cambian de
-- aspecto al aplicar esta migración.
--
-- Sin CHECK sobre los valores posibles, mismo criterio que asset_types.color:
-- el id de un color vive en la paleta de presentación (CARD_COLORS,
-- src/lib/paymentCards.js — deliberadamente DISTINTA de la paleta de los
-- grupos de activos y del acento de la app, ver ese archivo), que es una
-- decisión de diseño y puede cambiar sin una migración. El cliente resuelve el
-- id contra la paleta y uno desconocido cae a "sin color".

alter table payment_cards add column color text;
