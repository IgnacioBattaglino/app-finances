# Informe: un movimiento cargado después de contar, con fecha anterior

Fecha: 2026-09-25. Contexto: `informe-reglas-de-plata.md` y `mudanza-reglas.md`.

## Decisión

- **Opción A (preguntar y absorber), más el aviso al crear.** Al crear un gasto o ingreso con fecha igual o anterior a un conteo que encontró diferencia, la app pregunta "¿Esto es parte de esa diferencia?". "Sí" achica el ajuste; "No" lo carga aparte, como hoy. Si el conteo no encontró diferencia, solo un aviso chico.
- **Solo gastos e ingresos.** Aportes y pagos de deuda quedan para después (están en dólares con MEP congelado).
- **Solo conteos de la 0041 en adelante** (los que tienen neteo). Para los anteriores, solo el aviso.
- **Si el gasto es mayor que la diferencia, se absorbe entero**: el ajuste da vuelta y pasa a decir "sobraba". Es lo único que mantiene el saldo en lo que contaste.
- Se implementa junto con el paso de la mudanza que lleva el conteo a SQL (vista previa del conteo, `planReconciliation`).

## Resumen

1. Un conteo compara lo declarado contra el saldo calculado con **todos** los movimientos cargados en ese momento, sin mirar su fecha.
2. Por eso, un gasto cargado **después** de contar, con fecha anterior, queda contado dos veces: como gasto y dentro del ajuste.
3. Achicar el ajuste toca hasta tres movimientos: el ajuste neto vive en la cuenta ancla, que puede no ser la del gasto.
4. Para deshacerlo al borrar o editar el gasto hay que guardar qué gasto se absorbió en qué conteo, y la diferencia original de cada cuenta. Hoy esa diferencia no está en una columna, pero se deduce exacta de lo guardado.
5. En otra moneda no se absorbe nada: el neteo es por moneda.
6. Con varios conteos posteriores alcanza con tocar el primero; los siguientes vuelven a cerrar solos.
7. La alternativa automática (recalcular el ajuste sola) cambia en silencio ajustes guardados y no resuelve un gasto con la misma fecha del conteo.

## 1. Cómo funciona hoy

- `reconcile_liquid` calcula por cuenta `diff = declarado − saldo actual`. El saldo sale de `get_liquid_by_account()`, que suma todo lo cargado, **sin filtrar por fecha**.
- Por moneda, `neto = Σ diff`. Escribe **un** "Ajuste de saldo" por el neto en la cuenta **ancla** (la que deja menos resto) y un "Reparto entre cuentas" por lo que le falte a cada cuenta. Los repartos suman cero.
- Guarda una fila por cuenta en `liquid_reconciliations` con lo declarado, los dos movimientos y un `batch_id`. No guarda la diferencia ni el neto como número.
- Si después se carga un gasto con fecha anterior, el saldo queda por debajo de lo contado y el gasto cuenta dos veces. Hoy solo hay un aviso, y solo al **editar**.
- "Anterior al conteo" en realidad significa **cargado después de contar, con fecha igual o anterior**: lo que ya estaba cargado al contar, aunque tuviera fecha futura, ya entró en la cuenta.

## 2. Viabilidad, caso por caso

- **Gasto en una cuenta, ajuste en otra (la ancla).** Achicar el ajuste le devuelve la plata a la ancla, no a la cuenta del gasto: hay que correr también los repartos de las dos. Lo seguro es **recalcular el conteo entero** con `diff' = diff original + lo absorbido en cada cuenta`, con la ancla fija. Solo aplica si la cuenta del gasto fue declarada en ese conteo.
- **Gasto mayor que la diferencia.** Se absorbe entero y el ajuste da vuelta a ingreso ("con esto, sobraban $X"). El texto de la pregunta tiene que decirlo.
- **Varios conteos después.** Se absorbe en el primero con fecha igual o posterior que declaró esa cuenta. Si ese no encontró diferencia en esa moneda, o la encontró con el signo contrario, no se pregunta.
- **Borrar o editar el gasto absorbido.** No vuelve solo si solo se achica el número. Hace falta el vínculo guardado, la diferencia original por cuenta y un recálculo al cambiar un gasto vinculado. Borrar el gasto devuelve el ajuste; cambiarle monto recalcula; cambiarle cuenta, fecha o moneda suelta el vínculo. Si el ajuste llega a cero se borra el movimiento (el monto tiene que ser mayor que cero) y reaparece si hace falta. Borrar el conteo entero deja los gastos y borra el vínculo.
- **Otra moneda.** No se absorbe: solo se pregunta si el conteo encontró diferencia en la moneda de la cuenta del gasto.
- **Ingreso olvidado con plata de más.** Simétrico: un ingreso absorbe un sobrante. Gasto contra sobrante o ingreso contra faltante no se pregunta.

## 3. Alternativas

| Opción | Pros | Contras |
|---|---|---|
| **A. Preguntar y absorber** (elegida) | Explícito. Resuelve el caso de la misma fecha. Los ajustes cambian solo cuando alguien lo pide. | Dos datos nuevos y un trigger que reescribe hasta tres movimientos. Un paso más en la carga. |
| **B. Monto contado fijo, ajuste recalculado solo** | No pregunta nada. | Cambia ajustes viejos sin pedirlo. Necesita definir "anterior", y la fecha no alcanza con un gasto del mismo día. Cambia qué significan los conteos ya hechos. Recalcula en cascada. |
| **C. Lo de hoy: avisar y volver a contar** | Riesgo cero. | El gasto cuenta dos veces hasta recontar, y Gastos e Ingresos quedan inflados. |
| **D. Movimiento compensatorio** | Una escritura, no modifica nada guardado. | Gastos e Ingresos inflados, salvo que las pantallas aprendan a netear por conteo. |

## 4. Choques con lo decidido

- **"Los ajustes viejos quedan tal cual"** prohíbe *inferir*; en A lo dice el usuario, así que no infiere. Pero A no se aplica a conteos anteriores a la 0041: recalcularlos con el neteo los convertiría al modelo nuevo. B choca de frente. C y D no la tocan.
- **Neteo por moneda:** A lo respeta absorbiendo solo en la misma moneda y con la ancla fija. B tiene que volver a netear en cada recálculo.

## 5. Dónde vive y riesgo

En SQL, como regla de escritura:

- La diferencia original de cada cuenta en `liquid_reconciliations`, completada exacta desde el ajuste y el reparto de cada fila.
- El vínculo en `transactions`: a qué conteo se absorbió.
- `recompute_reconciliation(batch_id)`: reescribe ajuste y repartos desde las diferencias originales más lo absorbido, con la ancla fija, creando o borrando movimientos al cruzar cero.
- Un trigger en `transactions` que la llama al crear, editar o borrar un gasto vinculado.
- Una lectura para la pregunta: el primer conteo posterior que declaró esa cuenta, con su diferencia en esa moneda.
- Paridad contra `planReconciliation` con las diferencias ajustadas, más un test por cada rechazo (otra moneda, cuenta no declarada, signo contrario, conteo anterior a la 0041).

**Riesgo medio-alto**: reescribe movimientos que escribió otra función, y convive con `delete_reconciliation` y los triggers de la 0050. Lo baja que todo sale de datos guardados, sin inferir, y que el recálculo es una sola función probada contra el JS.
