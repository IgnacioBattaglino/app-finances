# ADR-010 — Una posición está cerrada según el aportado neto, no según la cantidad

Fecha: 2026-09-02
Estado: aceptado

## Contexto

`get_portfolio_series` (migración 0022, vigente en la 0026) necesita decidir,
para cada activo y cada día de la serie, si su posición ya está cerrada (vale
0) o todavía abierta. Lo decidía con un flag **global** por activo:

```sql
asset_position_basis.uses_quantity =
  exists (select 1 from contributions c
          where c.asset_id = ma.id and coalesce(c.quantity, 0) > 0)

-- y después, primera regla de la cascada valued:
when (case when uses_quantity then quantity else contributed end) = 0
  then 0
```

Ese `exists` no tiene cota de fecha: se calcula sobre toda la historia del
activo y se aplica por igual a todos los días de la serie, incluidos los
anteriores a que esa cantidad existiera. En cuanto UNA sola operación trae
`quantity`, el activo pasa a medirse en cantidad **desde siempre**, y todos los
días previos —donde la cantidad acumulada todavía es 0— quedan valiendo 0
aunque el aportado acumulado ya fuera mayor a 0. Dicho de otro modo: cargar una
operación con cantidad reescribía hacia atrás la historia del activo, borrando
el valor de todos los días anteriores.

Medido en la cuenta de prueba: un activo tenía tres aportes (100, 458,72 y
195,87, en ese orden) y solo el último traía cantidad. El activo valía 0 hasta
el día anterior al tercer aporte, con 558,72 dólares ya aportados, y en el día
del tercer aporte aparecía de golpe con 754,59. Ese era el escalón vertical más
grande del gráfico de evolución: el total pasaba de 439,11 a 1192,04 en un solo
día.

## Decisión

La pregunta "¿esta posición está cerrada?" no se responde con la cantidad: la
cantidad es un dato **opcional** de la contribución (hay aportes que no la
traen), así que su ausencia significa "no lo sé", no "no tengo nada". El
aportado acumulado **neto**, en cambio, existe siempre y ya descuenta los
retiros — es el único dato que distingue "todavía no compré" de "ya vendí
todo".

Entonces: un activo vale 0 únicamente cuando su aportado acumulado al día D es
`<= 0`. Con aportado positivo, cada modo de valuación valúa como sabe, y un
activo de precio en vivo que ese día todavía no tiene cantidad cargada cae al
aportado en vez de a 0 — que es lo que vale una posición recién comprada de la
que todavía no se conocen las unidades.

Con este cambio, `asset_position_basis` se queda sin lectores y desaparece: el
flag global era el bug, no un dato que hiciera falta conservar.

### Por qué la guarda es `<= 0` y no `= 0`

El aportado neto se acumula restando retiros, y ahora es él quien puede
terminar siendo el valor mostrado del activo (la rama de precio en vivo sin
cantidad). Un residuo negativo por redondeo, o un retiro cargado de más,
pintaría un valor negativo en el gráfico si la guarda fuera estricta. Una
posición sobre-retirada vale 0, no menos que nada.

## Lo que no cambia

- **Liquidación total**: al vaciar el activo el aportado neto vuelve a 0, así
  que la primera regla lo sigue dejando en 0 desde ese día. La cascada nueva
  no lo resucita.
- **Retiro parcial**: el aportado queda positivo y el activo sigue valuando
  por su modo, igual que antes.
- **Un activo de precio en vivo con cantidad en todas sus compras**: nunca
  pasa por la rama nueva (la cantidad acumulada es positiva desde el primer
  día con aportado), así que da exactamente lo mismo que antes de este ADR.
- **`contributed` y `manual`**: intactos. Un activo manual sin valuaciones
  hasta ese día sigue valiendo 0 aunque tenga aportado — es otro efecto, con
  su propia decisión detrás (la serie no inventa una valuación que el usuario
  no cargó), y este ADR no lo toca.
- Todo lo demás de la 0022 y la 0026 sigue igual: se incluyen los archivados,
  el precio es el último cierre y no el vivo, `include_in_total` afecta a las
  dos columnas de la serie, y el precio sale de `instrument_prices_usd` ya
  convertido a dólares (ver ADR-008).

## Verificación

Probado en Postgres local con las dos versiones de la función instaladas lado
a lado, sobre datos sintéticos: liquidación total, retiro parcial, un activo
de precio en vivo con cantidad en todas sus compras, y los modos `contributed`
y `manual` dan delta 0,00 en todos los días frente a la versión anterior — el
único caso que cambia es el del activo con un aporte sin cantidad.
