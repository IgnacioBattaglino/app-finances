# ADR-012: el disponible se subdivide en cuentas, y se reconcilia por cuenta

Fecha: 2026-09-05
Estado: aceptada
Migración: 0032

## Contexto

El "dinero disponible" era un solo número: la suma de todos los movimientos en
pesos. Pero esa plata no está en un solo lado — hay efectivo en el bolsillo,
saldo en Mercado Pago, saldo en Cuenta DNI. Eso tenía dos consecuencias:

1. El número no se podía verificar contra nada concreto. "Tenés $480.000" no se
   compara con ningún lugar del mundo real.
2. La reconciliación pedía un total. Contar la plata para declarar un total
   obliga a contar TODO el mismo día, y a sumarlo mentalmente antes de
   escribirlo — justo el trabajo que la app debería estar haciendo.

## Decisión

Una **cuenta** (`liquid_accounts`) es una subdivisión del disponible por dónde
está FÍSICAMENTE la plata. Se crean a mano, sin límite, con nombre libre.
`transactions`, `contributions` y `debt_payments` llevan un `account_id`
nullable.

Tres decisiones que van juntas:

**El total no cambia, y se define como la suma del desglose.** No hay un
cálculo del total y otro de las partes: `computeLiquidFromCollections` suma lo
que devuelve `computeLiquidByAccount`. Si divergieran, la pantalla mostraría un
total que sus propias líneas contradicen.

**La reconciliación se declara por cuenta, no como un total repartido.**
Repartir proporcionalmente una diferencia entre cuentas es inventar
información: si contás $50.000 en el bolsillo y la app esperaba $30.000, esos
$20.000 aparecieron en el bolsillo — no un poco en cada cuenta. Cada cuenta
declarada se compara contra SU disponible calculado y genera su propio ajuste
(una transaction con la categoría del sistema "Ajuste de saldo" y su
`account_id`) y su propia fila en `liquid_reconciliations`. Una cuenta que se
deja vacía no se reconcilia: contar el bolsillo un martes y Mercado Pago otro
día es cómo se cuenta la plata de verdad.

**"Sin cuenta" es un balde, no una cuenta.** Un `account_id` null suma al total
pero no se muestra como cuenta ni se puede declarar. Es donde caen las filas que
ninguna migración alcanzó a asignar, y las que apuntan a una cuenta que ya no
existe. Se define por resta (total − cuentas conocidas), así que las líneas del
desglose siempre dan exactamente el total.

## Consecuencias

- **La migración de datos es real, no un default a futuro.** Los usuarios que ya
  existían reciben una cuenta "Efectivo" y TODOS sus movimientos que tocan el
  disponible quedan asignados a ella. Sin eso, el historial entero caería en
  "sin cuenta" y el desglose arrancaría vacío.
- **Una cuenta no se puede ocultar, a diferencia de una categoría.** Una
  categoría oculta sigue nombrando a sus movimientos viejos; una cuenta borrada
  dejaría su plata sin lugar. Por eso el rechazo de la FK (23503) no es el final
  del camino: se ofrece reasignar los movimientos a otra cuenta y recién ahí
  borrar.
- **Una operación que no toca el disponible nunca lleva cuenta.** Se fuerza null
  al escribir la fila, no solo escondiendo el campo del formulario: el usuario
  puede elegir la cuenta y recién después cambiar el origen a "de afuera".
- **Lo que NO es esto**: "billeteras" o "cajas" (de quién es o para qué es la
  plata) son otro eje. Esta decisión no lo prepara ni lo insinúa.
