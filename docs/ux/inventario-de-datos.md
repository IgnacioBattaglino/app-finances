# Inventario de datos de la app

La app es de finanzas personales en Argentina, con enfoque en independencia financiera. Hay tres mundos que **nunca se suman en un "patrimonio total"**:

- **Plata del día a día**: se maneja en pesos y es la plata operativa.
- **Plata invertida**: se maneja en dólares y busca rendimiento.
- **Deudas**: se miden en dólares.

Hay una excepción. Inicio muestra un Total en dólares como pie de tarjeta, y la serie de gastos de 12 meses también unifica a dólares. Todo lo demás se ve por moneda.

Este inventario sale de la documentación y el código del proyecto. No se contrastó pantalla por pantalla, así que la última sección es la que más conviene revisar.

**Palabras que se repiten:**
- **Dólar MEP**: la cotización del dólar que la app usa para pasar pesos a dólares y al revés.
- **Tasa congelada**: cuando algo se convierte de verdad, se guarda la cotización de ese día y no se recalcula después.

---

## 1. Cuentas y billeteras

**Qué datos existen**
- Cada cuenta es un lugar donde está físicamente la plata: efectivo, Mercado Pago, Cuenta DNI, etc.
- Tiene nombre libre, moneda (pesos o dólares, en principio cualquiera), un orden manual y una marca de "cuenta de ahorro".
- El saldo no se guarda. Se calcula sumando todo lo que entró y salió de esa cuenta.
- Cada persona arranca con una cuenta "Efectivo" ya creada.
- Puede haber plata "sin cuenta": movimientos que no se asignaron a ninguna. Cuentan para el total, pero no son una cuenta real.

**Qué se puede calcular**
- Saldo por cuenta.
- Total del dinero disponible, que es exactamente la suma de las cuentas. Nunca puede diferir de sus partes.
- Cuánto hay "sin cuenta".
- Cuántos movimientos tiene cada cuenta (para saber si se puede borrar sin reasignar).
- El disponible en una fecha pasada, y su evolución, se podría reconstruir desde los movimientos.

**Qué NO se puede mezclar**
- **Pesos con dólares**: el total del disponible es una línea por moneda. Nunca se convierte una en la otra dentro de la misma tarjeta.
- **Ahorro con disponible**: las cuentas de ahorro quedan fuera del total del día a día, porque es plata guardada y no operativa. Además mezclaría monedas.
- Una cuenta con movimientos no se puede borrar. Primero hay que pasar sus movimientos a otra.
- Cambiar la moneda de una cuenta no cambia sus movimientos viejos: cada movimiento recuerda la moneda que tenía cuando se cargó.

---

## 2. Movimientos

**Tipos que existen y qué distingue a cada uno**

| Tipo | Qué es | Cambia el disponible | Cuenta como gasto o ingreso real |
|---|---|---|---|
| **Gasto** | Plata que salió | Sí, resta | Sí |
| **Ingreso** | Plata que entró | Sí, suma | Sí |
| **Aporte a inversión** | Plata del disponible que pasó a un activo | Sí, resta, pero solo si salió "del bolsillo" | No: es plata que cambió de lugar |
| **Retiro de inversión** | Plata que vuelve de un activo (puede traer ganancia o pérdida realizada) | No | No |
| **Pago de deuda** | Pago en dólares a un acreedor | Resta, si se pagó con plata del día a día | No cuenta como gasto |
| **Transferencia entre cuentas** | Dos movimientos ligados: sale de una cuenta, entra en otra | Suma cero en total | No: es plata que cambió de lugar |
| **Ahorro / retiro de ahorro** | Plata que entra o sale de una cuenta de ahorro | Sale del disponible o vuelve a él | No |
| **Ajuste de saldo** | Lo que registra "Contar mi plata" cuando lo declarado no coincide con lo esperado | Sí | Sí, es un gasto o ingreso "de la diferencia" |
| **Transferencia entre activos** | Retiro de un activo y aporte a otro, del mismo monto | No | No |
| **Gasto confirmado de A pagar** | Un vencimiento que se confirmó y pasó a ser un gasto real | Sí | Sí |

**Datos de un gasto o ingreso**
- Fecha, tipo, categoría, descripción opcional y monto.
- Moneda de la cuenta de la que salió o entró.
- Cuenta (opcional).
- Si viene de una transferencia, se sabe cuál es la otra pata.
- Si viene de un conteo, se sabe cuál.
- Si viene de un vencimiento, se sabe cuál.

**Datos de un aporte o retiro de inversión**
- Fecha, activo, monto en dólares y cantidad de unidades (opcional).
- Dólar MEP del día, congelado. Es obligatorio si salió del bolsillo y opcional si fue "de afuera".
- Si salió del disponible o fue plata que ya se tenía.
- Si es aporte o retiro.
- En un retiro: la ganancia o pérdida realizada, congelada al momento, y si vació el activo.
- Si es parte de una transferencia.

**Qué se puede calcular** (los cinco renglones del período)
- **Gastos**, **Ingresos**, **Invertido** y **Ahorrado**.
- **"Te sobró"**: lo que quedó después de todo lo anterior.
- Gastos por categoría.
- Serie de gastos de 12 meses, en dólares.
- Tasa de ahorro del mes: (ingresos − gastos) / ingresos.
- Porcentaje invertido del mes: lo aportado convertido a pesos sobre los ingresos.
- Todo eso para un mes, un año, todo el historial o dos fechas cualquiera.

**Qué NO se puede mezclar**
- **Los movimientos de plata que cambió de lugar** (transferencias, aportes, ahorro, repartos de un conteo) no cuentan como gasto real. Sumarlos a Gastos inflaría todo.
- **Gastos en pesos y en dólares** no se suman entre sí, salvo en la serie histórica de 12 meses y el Total de Inicio.
- Un gasto **no lleva tasa congelada**: no hubo conversión. Solo los aportes y pagos de deuda la llevan.
- **Los pagos de deuda** quedan fuera de la tasa de ahorro y del porcentaje invertido. Se reportan aparte.
- Un vencimiento **pendiente** de A pagar no cuenta en ningún total hasta que se confirma.

---

## 3. Categorías

**Qué datos existen**
- Nombre, tipo (gasto o ingreso) y orden manual, que es el mismo orden en que aparecen al cargar un movimiento.
- Hay categorías **del sistema** que la app maneja sola y el usuario no puede renombrar ni borrar: "Ajuste de saldo", "Movimiento de ahorro" y "Transferencia de cuenta". Cada una existe en versión gasto y en versión ingreso.
- Una categoría puede estar **oculta**. Eso pasa solo cuando se la "borra" teniendo movimientos: sale de los selectores, pero sus movimientos viejos la siguen mostrando por nombre.
- Cada persona arranca con un set inicial de categorías sembradas.

**Qué se puede calcular**
- Gasto e ingreso por categoría en cualquier período.
- Uso de cada categoría en los últimos 90 días, medido en cantidad de veces y no en monto. De ahí salen las seis "más usadas".
- Cuántos movimientos tiene cada una.

**Qué NO se puede mezclar**
- Las categorías del sistema **no son gastos que el usuario decidió hacer**. Se excluyen de "Gastos por categoría". Lo que las distingue entre sí, y cambia cómo se cuentan, es qué significa cada una: ajuste, ahorro o transferencia.
- Una categoría de gasto y una de ingreso con el mismo nombre son cosas distintas.

---

## 4. Repartos

Un "reparto" no es un objeto independiente. Es un movimiento que nace cuando se cuenta la plata (ver punto 5) y hay que acomodar el dinero entre cuentas.

**Qué datos existen**
- Cada reparto es un movimiento de tipo "Transferencia de cuenta", con la cuenta afectada y el monto.
- La cuenta principal de cada moneda, la que mejor explica el faltante, lleva además el movimiento de ajuste.
- Cada reparto queda ligado al conteo que lo generó.

**Qué se puede calcular**
- Cuánto se movió entre cuentas en un conteo.
- Los repartos de un mismo conteo **suman cero**: lo que sale de una cuenta entra en otra.

**Qué NO se puede mezclar**
- **El reparto no es un gasto ni un ingreso.** Solo el neto de cada moneda es un gasto o ingreso real (el ajuste). El reparto no cuenta en ninguna estadística.
- Los repartos de un conteo no se pueden borrar sueltos. Si se borra uno, se borra el conteo entero, porque si no la aritmética queda rota.

---

## 5. Contar mi plata

**Qué datos existen**
- Es una foto del presente: la persona declara cuánto hay realmente **en cada cuenta**, y no un total. La app no puede saber cómo repartir un total entre cuentas.
- Un conteo tiene fecha y una fila por cada cuenta declarada. Cada fila lleva el monto declarado, la cuenta y el movimiento de ajuste o de reparto asociado.
- Todas las filas de un mismo conteo comparten una marca de grupo, para saber cuáles se hicieron juntas.
- Una cuenta que se deja vacía simplemente no se cuenta.
- Los conteos anteriores a las cuentas quedan como "el disponible entero", sin cuenta.

**Qué se puede calcular**
- La diferencia entre lo esperado y lo declarado, por cuenta y por moneda.
- Una vez netada, cuánto es gasto o ingreso real (el ajuste) y cuánto es solo reparto entre cuentas.
- El historial de conteos.
- Con los conteos se puede ver cuánto "desaparece" cada mes sin registrar.

**Qué NO se puede mezclar**
- **Un conteo no mezcla monedas**: el neto se calcula por moneda.
- Las cuentas de ahorro no entran en el conteo del disponible.
- Un conteo se borra completo o no se borra.

---

## 6. Ahorro

**Qué datos existen**
- Una cuenta de ahorro es una cuenta común con la marca de ahorro. Tiene nombre, moneda y saldo.
- Se le aporta o se le retira. Cada aporte o retiro es un movimiento que dice "Ahorro" o "Retiro de ahorro".
- Antes eran inversiones que "valían exactamente lo aportado". Se convirtieron en cuentas de ahorro, y esos activos viejos quedaron archivados con un enlace a la cuenta en la que se transformaron.

**Qué se puede calcular**
- Saldo de cada cuenta de ahorro.
- Total ahorrado en un período (el renglón "Ahorrado").
- Aportes y retiros a lo largo del tiempo.

**Qué NO se puede mezclar**
- **El ahorro no es disponible.** No está en el total de "Dinero disponible" ni en el conteo, y no se ofrece como origen de un gasto.
- **No es una inversión**: no rinde, no cotiza y no tiene ganancia.
- Ahorro en pesos y en dólares no se suman.
- Un activo convertido no vuelve a aparecer entre los archivados de inversiones, porque contaría la misma plata dos veces.

---

## 7. Inversiones

### Grupos de activo
Son carpetas que la persona puede crear, renombrar, ordenar, archivar y borrar. Cada usuario arranca con **cinco grupos sembrados**, que son un punto de partida y se pueden cambiar:

| Grupo | Rinde por defecto | Suma al total |
|---|---|---|
| Cripto | Sí | Sí |
| CEDEARs | Sí | Sí |
| Renta fija | Sí | Sí |
| Fondos | Sí | Sí |
| Efectivo USD | No (reserva de valor) | Sí |

Cada **grupo** tiene:
- nombre libre;
- un color opcional, que es solo un punto al lado del nombre;
- un orden;
- una marca de "sugerir rendimiento para los activos nuevos";
- una marca de "suma al total". Un grupo puede quedar fuera del total y entonces lleva la etiqueta "fuera del total".

Un grupo solo se puede archivar o borrar si no tiene activos vivos. Un activo **puede no tener grupo**, y en ese caso se muestra suelto, al mismo nivel que un grupo.

El grupo no determina cómo se valúa el activo. Un mismo grupo puede mezclar activos de distintos tipos.

### Cómo se valúa cada activo
Esto es lo que realmente distingue a un activo de otro.

| Modo | Cómo se sabe cuánto vale | Ejemplos |
|---|---|---|
| **Precio automático** | Cantidad × precio del instrumento. Cripto va en vivo desde el navegador. Acciones, CEDEARs y bonos argentinos usan el último cierre diario. | Bitcoin, un CEDEAR |
| **Valuación manual** | La última valuación que cargó la persona. Se carga como fecha + valor en dólares, una por día. | Un auto, un departamento, un fondo |
| **Aportado** | Vale exactamente lo aportado. Está en retirada: los que había se convirtieron en cuentas de ahorro. | (ya no se crean) |

### Datos de un activo
- **Comunes:** nombre, grupo (opcional), modo de valuación, si "busca rendimiento", si está archivado.
- **Si es de precio automático:** el instrumento elegido de un buscador. Cada instrumento tiene:
  - símbolo, nombre y fuente;
  - tipo: cripto, acción, ETF, bono, CEDEAR, obligación negociable o moneda;
  - moneda en la que cotiza (dólares o pesos);
  - precio diario guardado.
- **Calculados:**
  - Total aportado (en dólares).
  - Valor actual.
  - Ganancia en dólares y en porcentaje.
  - **Cantidad** total de unidades (en activos de precio en vivo).
  - **Precio promedio de compra.**
  - Precio actual.
  - Cuánto "equivale" el valor a unidades.
  - Fecha de la última valuación (activos manuales).
  - De dónde salió el precio ("en vivo a las HH:MM" o "cierre de tal fecha").
- **Historial del activo:** cada aporte, retiro, transferencia y liquidación, con valuaciones manuales intercaladas.

### Qué se puede calcular
- Por activo, por grupo y del portafolio entero: aportado, valor, ganancia y porcentaje.
- **Dinero que rinde** frente a **Dinero que no rinde**. El porcentaje se calcula sobre su propio aportado.
- Curva de evolución del portafolio, diaria y resampleada a mensual.
- Ganancia realizada acumulada, de los retiros.
- Valor de una posición en una fecha pasada.
- Distribución del portafolio por grupo.

### Qué NO se puede sumar ni comparar
- **Una valuación desactualizada no muestra ganancia ni porcentaje.** Si hubo aportes o retiros después de la última valuación manual, comparar valor viejo con aportado nuevo daría una pérdida que nunca ocurrió. El valor sí se muestra y sí suma, con su fecha, y el activo queda fuera del cálculo de rendimiento.
- **Los activos que no rinden** (efectivo, colchón) suman al valor total, pero no entran en el rendimiento. Si entraran, diluirían el porcentaje.
- **Los grupos "fuera del total"** no suman ni al valor ni al rendimiento.
- **Los precios en pesos** se pasan a dólares con el dólar MEP del día de cada precio. Es una aproximación. Si no hay cotización del dólar para esa fecha, se cae a la valuación manual.
- **La ganancia realizada** (ya cristalizada al retirar) y la ganancia no realizada (la del valor actual) son cosas distintas.
- Una **transferencia entre activos** es un movimiento de plata invertida y no toca el disponible. Tampoco es una ganancia.

---

## 8. A pagar (vencimientos, cuotas, deudas)

Esta pestaña responde "¿qué tengo que pagar?" y junta tres cosas.

### Tarjetas
- **Datos:** nombre, día de vencimiento del resumen (opcional), límite de crédito (opcional), moneda, últimos 4 dígitos (nunca el número completo), color y orden.
- **Para qué existen:** darle **la misma fecha a todas sus compras**, porque se paga un solo resumen. No son cuentas: no tienen saldo y no suman al disponible.

### Planes
Hay dos formas, que son la misma cosa con distinto final.
- **Compra en cuotas** (termina): nombre, categoría, monto de cada cuota, cantidad total de cuotas, desde qué cuota se carga (para compras ya empezadas), tarjeta y cuenta.
- **Suscripción** (no termina): nombre, categoría, monto y cuenta.
- **Comunes:** frecuencia (semanal, mensual, trimestral o anual), fecha del primer vencimiento, moneda y, si hay una diferencia de centavos, el monto especial de la primera cuota.
- **Terminado:** un plan terminado deja de generar vencimientos futuros. Es reversible.

### Vencimientos (cada cobro concreto)
- **Un vencimiento pendiente no existe como dato guardado.** Se calcula a partir del plan. Solo se guarda lo que **ya se resolvió**, de dos maneras:
  - **Confirmado**: se convirtió en un gasto real.
  - **Descartado**: "no lo pagué y no lo voy a pagar".
- Si se borra el gasto desde Movimientos, el vencimiento vuelve a pendiente solo.
- **Estados que se pueden derivar:** pendiente, vencido (atrasado hace N días), confirmado o descartado.

### Deudas
- **Datos:** acreedor, monto original en dólares y fecha de inicio.
- **Pagos:** fecha, monto en dólares, dólar MEP del día (opcional) y si se pagó con plata del día a día o con dólares que ya se tenían.
- **Saldo** = monto original − pagos, con piso en cero. Está saldada cuando el saldo es cero o menos. No se guarda ninguna de las dos cosas.

### Qué se puede calcular
- Qué vence próximamente y qué está atrasado.
- Cuánto llevás comprometido por tarjeta y contra su límite.
- Cuántas cuotas quedan de cada plan, y cuánto falta pagar de cada compra.
- Total mensual de suscripciones.
- Saldo restante de cada deuda y cuánto se pagó a lo largo del tiempo.
- Historial de vencimientos de un plan.

### Qué NO se puede mezclar
- **Ningún pendiente entra en ningún total** (ni disponible, ni gastos del mes, ni balance) hasta que se confirma.
- **No hay conversión de monedas en las cuotas y suscripciones.** Si el plan está en una moneda y la cuenta elegida en otra, la app pide el monto de nuevo.
- **Las deudas están en dólares** y no se mezclan con los vencimientos en pesos.
- **Un pago de deuda no es un gasto.** Pagar con dólares propios baja la deuda pero no toca el disponible.
- Las cuotas anteriores a cuando se cargó el plan **no se inventan como pagadas**: se pagaron afuera de la app.
- Un plan con historial no se puede eliminar, solo terminar.

---

## 9. Cotizaciones

**Qué datos existen**
- **Catálogo compartido de instrumentos:** es igual para todos los usuarios, porque un precio de mercado es público. Cada instrumento tiene símbolo, nombre, tipo (cripto, acción, ETF, bono, CEDEAR, obligación negociable o moneda), moneda en que cotiza (dólares o pesos) y si está activo.
- **Precio diario de cada instrumento:** lo guarda un proceso automático todos los días a las 9:00 hora argentina. Hay carga histórica hacia atrás.
- **Fuentes:** Binance para cripto (con CoinGecko de respaldo), data912 para acciones, CEDEARs y bonos argentinos, y una API de dólar para el MEP.
- **Cotización del dólar MEP:** una por día. Es la única conversión de moneda que usa la app.
- **Precio en vivo:** para cripto se pide al abrir la pantalla y no se guarda.

**Qué se puede calcular**
- Precio en dólares de cualquier instrumento en cualquier fecha. Un día sin dato hereda el último precio conocido.
- Valor histórico de un activo y curva de evolución del total.
- Cuánto "equivale" un monto a unidades del instrumento.
- **Variación diaria** de un instrumento, si se necesitara: hay precios diarios guardados, pero no hay ningún dato de variación ya calculado (ver sección 10).

**Qué NO se puede mezclar**
- **Precio en vivo y precio de cierre:** vienen de fuentes distintas y con distinta frescura. La app los distingue en pantalla.
- **Instrumentos en pesos y en dólares:** se convierten con el MEP **de la fecha de cada precio**.
- **Los CEDEARs** en la vida real arbitran contra otro dólar (el CCL). Pasarlos con el MEP es una aproximación conocida.
- **Un instrumento sin par de precio** queda sin cotización. La app no inventa un número.

---

## 10. Datos que existen pero hoy no se muestran en ningún lado

Estos puntos son los que conviene confirmar contra las pantallas actuales.

**Guardados, sin pantalla**
- **Parámetros de independencia financiera**: ingreso mensual deseado (por defecto 1.500 dólares), tasa de retiro segura (4%), retorno anual esperado (8%), fecha de nacimiento, fecha de inicio del plan y ventana de meses para proyectar. Existen en cada perfil con valores por defecto y hoy solo se editan directo en la base.
- **Distribución objetivo del portafolio** (porcentaje por tipo de activo, sumando 100) y **umbral de desvío** que dispararía una alerta de rebalanceo. Tampoco tienen pantalla.
- **Historial de precios diarios de cada instrumento por separado**: solo alimenta la curva del total. No hay una curva del precio de un activo individual.
- **Hora exacta en que se guardó cada precio.**

**Se pueden calcular pero no se calculan**
- **Variación diaria, semanal o mensual de un activo.** Hay precios diarios guardados, pero la app no calcula ni guarda ninguna variación. La cotización en vivo de cripto trae solo el precio actual, sin el cambio de 24 horas.
- **Objetivo de independencia financiera y porcentaje de avance**: el objetivo es el ingreso mensual deseado × 12 ÷ la tasa de retiro. También la proyección de cuándo se llega.
- **Aporte mensual promedio** de los últimos meses.
- **Distribución actual del portafolio contra la deseada.**
- **Evolución del dinero disponible en el tiempo.** Se puede reconstruir desde los movimientos, pero no hay curva.
- **Rendimiento por grupo a lo largo del tiempo.**
- **Ganancia realizada acumulada**, sumando los retiros. Aparece en la exportación de datos, y no se verificó cuánto se ve en pantalla.

**Datos de trazabilidad**
- **Qué movimientos escribió cada conteo.**
- **Las dos patas de cada transferencia**, entre cuentas y entre activos.
- **La cotización del dólar congelada en cada aporte y pago de deuda.** Sirve para conocer el costo en pesos de cada aporte. Puede estar visible en el historial, pero no la usa ningún cálculo mostrado.
- **Qué activos ahora archivados se convirtieron en cuentas de ahorro.**

**Datos que se descartaron pero siguen en la base**
- Campos viejos de activos y grupos que ya no se leen ni se escriben. No hay que diseñar nada a partir de ellos.
