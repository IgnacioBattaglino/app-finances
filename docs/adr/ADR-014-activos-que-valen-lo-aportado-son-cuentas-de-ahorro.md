# ADR-014: un activo que vale lo aportado no es una inversión, es una cuenta de ahorro

Fecha: 2026-09-08
Estado: aceptada
Migraciones: 0037, 0038

## Contexto

`valuation_mode = 'contributed'` ("Vale lo que pusiste") describía un activo
que vale exactamente lo que aportaste y nunca cambia de valor. Estaba pensado
para dólares en el colchón: no cotizan, no rinden, no hay nada que valuar.

Pero un activo así no tiene ninguna de las propiedades que hacen que algo sea
una inversión. No rinde, así que diluye el rendimiento del portafolio hacia
abajo. No se puede comparar contra un precio. Su "ganancia" es cero por
definición. Estaba en el portafolio solo porque no había otro lugar donde
ponerlo.

Desde la migración 0036 ese lugar existe: una cuenta del disponible con
`is_savings = true`.

## Decisión

**Los activos `contributed` se convierten en cuentas de ahorro.** Cada uno
genera una `liquid_account` con su mismo nombre, en dólares, marcada como
ahorro, y cada operación vieja del activo se convierte en un movimiento de esa
cuenta, con su fecha original. Es una migración automática, de una sola vez.

**"Valuación manual" NO se toca.** Un auto o un depto tampoco cotizan, pero sí
cambian de valor: la valuación periódica sigue siendo un modo válido.

### El lado en pesos del evento no se reescribe: ya está bien escrito

Una `contribution` con `affects_liquid = true` es un evento de DOS lados
guardado en una sola fila: "entraron 400 dólares al activo" y "salieron
400 × MEP pesos de la cuenta Y". El disponible lee un lado; el portafolio lee
el otro.

Después de la migración el evento sigue teniendo dos lados: los pesos salieron
de la cuenta Y —igual que antes— y los dólares entraron a la cuenta de ahorro
Z. **El lado en pesos ya está escrito y es correcto.** Así que las filas de
`contributions` no se tocan: lo único que se escribe es el lado en dólares, que
antes no existía como movimiento de ninguna cuenta.

La alternativa era el modelo más prolijo: borrar la `contribution` y escribir
dos `transactions` (un gasto en pesos + un ingreso en dólares). Se descartó por
tres razones, en orden de peso:

1. **Movería el disponible.** La base multiplica `amount_usd × mep_rate` en
   `numeric` y suma sin redondear; una `transaction` es `numeric(14,2)`, así
   que habría que redondear fila por fila, y la suma de redondeos no es el
   redondeo de la suma. La deriva es de centésimas de centavo — pero "da lo
   mismo" no puede depender de que los números tengan suerte.
2. **Perdería el tipo de cambio congelado**, que es un hecho del evento
   (ADR-013).
3. **Reescribiría la historia visible.** Esas operaciones dejarían de ser
   "Inversión" en Movimientos y pasarían a Gastos, cambiando el balance de
   meses ya cerrados. Y las patas de transferencia quedarían **huérfanas**: la
   contraparte vive en un activo que sobrevive, y borrar un lado dejaría un
   `transfer_id` con una sola pata.

Como corolario, las patas de transferencia no necesitan ningún trato especial:
al no borrarse nada, las dos siguen existiendo y el activo que sobrevive no se
entera.

### Nada se borra; el activo queda marcado, no solo archivado

El activo queda `is_archived = true` y con `savings_account_id` apuntando a la
cuenta en la que se convirtió. Esa columna no dice "el activo tiene una cuenta
asociada": dice **"esto dejó de ser un activo, y acá está en qué se
convirtió"**. Por eso es el criterio de exclusión de `get_portfolio_series` —
que incluye los archivados a propósito, así que archivar no alcanzaba— y no un
proxy como `valuation_mode = 'contributed'`.

También sale de la lista de archivados de Portafolio: restaurarlo lo devolvería
al portafolio mientras su plata ya está contada en la cuenta. El mismo dinero,
dos veces.

### El ahorro no es el disponible

Una cuenta de ahorro no entra en "Dinero disponible": no es la plata del día a
día, y además está en otra moneda —sumarla daría dólares con pesos como si
fueran la misma unidad—. `computeCurrentLiquid` la deja fuera del total y del
desglose que se reconcilia, y la devuelve aparte en `savings`. Tampoco se
ofrece en ningún selector de carga ni se listan sus movimientos en Movimientos:
guardar plata no es un gasto ni un ingreso, y todavía no existe la forma de
mover plata entre cuentas.

### Las categorías del sistema pasan a tener llave

Los movimientos nuevos necesitan una categoría (`category_id` es NOT NULL) y
tiene que ser del sistema, para que `getExpenses` no los cuente como gastos.
Pero `reconcile_liquid` buscaba la suya con `is_system + kind limit 1`, que
funcionaba solo porque había UNA sola por kind. Con una segunda, ese `limit 1`
elegiría cualquiera de las dos y el ajuste de una reconciliación podría quedar
categorizado como movimiento de ahorro, en silencio.

Por eso `categories.system_key` (migración 0037): `is_system` dice QUE es del
sistema, `system_key` dice CUÁL es. Un índice único parcial lo garantiza, en
vez de una convención que haya que recordar. Es la misma regla que el proyecto
ya venía aplicando —buscar por llave de máquina y no por el nombre visible, que
el usuario puede cambiar— extendida a un caso donde el flag había dejado de
alcanzar.

## Consecuencias

- **El disponible no se mueve, y no por poco: por construcción.** Nada de lo
  que lo alimenta se toca. Verificado contra la cuenta test: 506.213,43 antes y
  después.
- **El gráfico de evolución cambia de forma, y hay que avisarlo.** Las dos
  líneas bajan la misma cantidad desde la primera operación de cada activo
  migrado. La ganancia en dólares NO cambia (se resta lo mismo arriba y abajo),
  pero el porcentaje de rendimiento **sube**, porque el denominador se achica:
  una bolsa de dólares quietos estaba diluyendo el promedio de lo que sí rinde.
  En la cuenta test: de 0,98% a 3,31%, con la misma ganancia de US$ 10,93.
- **La migración aborta en vez de improvisar.** Si el nombre de un activo choca
  con una cuenta existente, o si dos activos del mismo usuario se llaman igual,
  para con un mensaje claro y no escribe nada — el nombre lo elige una persona.
- **Hay una ventana en la que la plata migrada no se ve.** El activo sale de
  Portafolio y la cuenta de ahorro todavía no tiene dónde mostrarse: aparece en
  Ajustes → Cuentas, pero ninguna pantalla muestra su saldo hasta que lleguen
  los cuatro números de Inicio (disponible / ahorro / invertido / total). Los
  dos pasos conviene desplegarlos cerca.
- **Lo que NO es esto**: no se saca el modo del formulario de alta ni se
  rediseña el Dashboard. Un activo `contributed` creado a mano después de esta
  migración seguiría funcionando como antes; el valor sale del CHECK y del
  formulario en un paso posterior.
