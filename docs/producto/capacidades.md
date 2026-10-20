# Capacidades de EnCuenta (capa 1)

Es la lista simple de todo lo que la app permite hacer, neutra para iOS y Android. Se usa para encontrar problemas de diseño antes de construir.

Marcas: **Existe** (está en la web hoy) · **Decidida** (definida, todavía no existe) · **Nueva** (sumada en esta revisión, va al plan de acción) · **Hueco** (nadie la definió) · **Duda** (los documentos se contradicen o falta decidir) · **Fuera** (descartada por ahora).

Estado: grupos 1 a 4 revisados (2026-10-09) y con sus pendientes cerrados (2026-10-20, ADR-029). Grupo 5 revisado (2026-10-20, ADR-030 y 031). Los grupos 6 a 8 están pendientes.

Regla de negocio transversal: **todo movimiento sale de una cuenta o entra a una. No hay movimientos sin cuenta.**

## 1. Cargar gastos e ingresos
- Cargar un gasto: monto, categoría, descripción opcional, cuenta, fecha. Existe
- Cargar un ingreso. Existe. Su flujo y su celebración en el diseño nuevo: Decidida (sin bocetar)
- Crear una categoría sin salir del formulario. Existe
- Ver las categorías más usadas primero. Decidida
- Editar y borrar un gasto o ingreso. Existe
- Cambiar un movimiento a una cuenta de otra moneda, con la pregunta "¿Los 10 eran en dólares?". Decidida
- Gasto cargado tarde, con fecha igual o anterior a un conteo con ajuste, que cabe en la diferencia: cartel al guardar con Sí/No (ADR-027). Decidida
- Gasto cargado tarde mayor que la diferencia del conteo: no se vincula ni se absorbe. Cartel de aviso con dos opciones, «Cargar de todas formas» o «Cancelar» (ADR-029; reemplaza la absorción entera de ADR-022). Decidida
- Cargar una compra con tarjeta en un pago: ver el grupo 5. Decidida
- Gastar desde una cuenta de ahorro. Decidida (la base está lista)
- Cargar sin conexión, con marca "Sin subir" y subida automática. Decidida (la base está lista, migración 0060)
- Corregir lo que la base rechazó al subir ("No se subió"). Decidida
- Recordar la última cuenta y categoría usadas. Nueva
- Deshacer después de guardar. Nueva
- Fuera: atajo de iPhone o widget (etapa final). Repetir o duplicar un gasto (idea futura: detectar el mismo gasto, misma categoría y descripción, dos días o dos meses seguidos, y proponerlo).

## 2. Ver qué pasó (Movimientos)
- Movimientos del período, agrupados por día. Existe (agrupados por día: Decidida)
- Elegir el período: mes con flechas, año, todo, dos fechas. Existe
- Resumen: Gastos, Ingresos, Invertido, Ahorrado y «Sobró» o «Faltó» (sin «Te»). Existe (hoy dice «Balance»)
- «Sobró» / «Faltó» = ingresos − gastos − invertido, sin deudas (hoy el Balance suma el renglón Deudas, ADR-021). Decidida; falta el informe previo de impacto (`verificaciones-2026-10.md`, sección 2026-10-20). Cambia ADR-021 en este punto
- Renglón Deudas en el Resumen, solo si hubo movimiento. Duda: si se muestra o no queda para la capa 2 (la web lo tiene, el diseño nuevo no lo menciona)
- En qué categorías se fue el dinero. Existe
- Gráfico mes a mes en dólares cuando el período abarca varios meses. Decidida
- Filtrar por tipo. Existe (sin el filtro Deudas en la Lista: Decidida)
- Filtrar por categoría en la Lista. Fuera (la web lo tiene; el diseño nuevo no). Cuánto se gastó en una categoría en un período se ve tocando la categoría en el Resumen
- Una transferencia como una sola línea. Existe
- Aportes y retiros de inversión en la lista, solo lectura, con enlace al activo. Existe
- Detalle de un movimiento con su origen (conteo, transferencia, vencimiento). Decidida
- Un conteo como una fila, con su detalle. Decidida
- En el detalle de un conteo, botón «Cargar un gasto que faltaba»: crea el gasto ya vinculado a ese conteo. Decidida (ADR-029)
- Tocar un renglón o una categoría del Resumen y ver los movimientos que lo componen. Nueva (reemplaza al filtro por categoría)
- Búsqueda por texto. Nueva
- Filtro por rango de monto. Nueva
- Ver, desde un gasto, de qué cuota o suscripción salió. Decidida: lo cubre el origen en el detalle de un movimiento

## 3. Saber dónde está el dinero (pestaña "Mi dinero")
- Nombre de la pestaña: «Mi dinero». «Cuenta» es el término solo para las cuentas del dinero, nunca «billetera». La sección de Ajustes con el nombre y el email se llama «Perfil». Decidida (ADR-029)
- Primera versión: solo pesos y dólares en pantalla (la base admite más monedas). Decidida
- Pantalla: arriba el total por moneda, con control Pesos | Dólares (solo si hay dos monedas). Debajo, una fila por cuenta con su saldo (la fila es el botón para entrar). "Nueva cuenta" al final. El ahorro en un sector aparte. Sin torta. Decidida (reemplaza la torta de `design/decisiones.md`)
- Crear una cuenta: nombre, moneda, si es de ahorro. Existe
- Color de cuenta. Duda: el diseño lo promete y la base no lo guarda. Pasa a la capa 3 (`para-diseno.md`; recomendación: sacarlo de la primera versión)
- Ordenar y editar cuentas. Existe
- Ocultar una cuenta (con saldo: mover el dinero o dejarla en $ 0). Existe (ver verificación 4). Dejarla en $ 0 registra un gasto o ingreso real del mes (verificación 4): cómo se dice en pantalla pasa a la capa 3
- Borrar una cuenta sin historia. Existe
- Ver los movimientos de una cuenta. Existe
- Transferir entre cuentas de la misma moneda. Existe. Entre monedas distintas: Decidida (falta en la base, Bloque A)
- Ahorrar y retirar de una cuenta de ahorro. Existe
- Contar disponible (ver ADR-026). Decidida
- Aviso tenue «Contada hace N días» en cada cuenta: Decidida; necesita la fecha del último conteo de cada cuenta (capa 2).
- Capa 3 (`para-diseno.md`): botón Transferir a la vista en la pantalla principal; si el sector de ahorro sigue al control Pesos | Dólares o se muestra siempre.
- Fuera: curva de evolución del disponible. Recordatorio periódico para contar (idea para después).

## 4. Invertir (pestaña Inversiones)
Para quién: quien invierte de forma mensual o anual y quiere saber cómo va, no quien hace trading. Todo se muestra en dólares. Ver ADR-028.
- Valor hoy y cuánto pusiste. Existe
- Ganancia del período (Semana, Mes, Año, Todo; sin 24 h), descontando aportes y retiros, con (i). Decidida (fórmula pendiente; la base no la calcula)
- En el detalle de un grupo: su valor en el tiempo y la ganancia del período, con la misma fórmula que el total y el activo. Decidida (ADR-029). No hay pantalla para comparar grupos
- Gráfico de evolución con aportes y retiros marcados. Decidida
- Lista de grupos y activos sueltos con valor y ganancia del período. Existe (hoy muestra la ganancia total)
- Gestión de grupos (crear, renombrar, ordenar, archivar, borrar, color, "suma al total", "busca rendimiento"), dentro de Editar y en lenguaje llano. Existe (textos nuevos: Decidida)
- Arrastrar activos entre grupos o dejarlos sueltos. Decidida (la base no guarda el orden de los activos)
- Crear un activo empezando por el buscador. Si lo encuentra, se completan solos nombre, tipo, valuación y grupo. Si no, botón "¿No está? Cargalo a mano" ("Para un auto, una casa o algo que no encuentres acá"). Decidida
- Buscador: pastillas por tipo, sugerencias antes de escribir, último precio visible en cada resultado (en la moneda en que cotiza, solo para reconocer el papel), tolerancia a errores de tipeo, botón directo a carga manual si no hay resultados. Nueva. Es una función clave: pulir al máximo.
- Catálogo lo más completo posible sin pagar APIs: sumar acciones y ADRs de EE.UU. (data912 `/live/usa_stocks` y `/live/usa_adrs`, sin historial) y fondos comunes (CAFCI). Nueva
- Fondos comunes en pesos: en el catálogo como un tipo más, precio = valor de la cuotaparte en pesos, convertido a dólares como un CEDEAR. Nueva
- Plazo fijo: tipo de activo nuevo (capital, TNA, fecha y plazo; valor calculado día a día; al vencer, "Renovar" o "Cobrar"). Se muestra en dólares; el monto en pesos solo en el detalle. Nueva
- Valuación manual (por unidad si tiene unidades). Existe (por unidad: Decidida)
- Aportar: monto en pesos o en dólares, lado a lado, con tipo de cambio editable; unidades; fecha; de dónde salió el dinero. Existe (cargar en pesos en el diseño nuevo: Decidida)
- Aviso suave si el precio por unidad que resulta se aleja mucho del precio de mercado de ese día. Nueva
- Retirar, con la ganancia o pérdida antes de guardar, y atajo "Retirar todo" con opción de archivar (reemplaza a "Liquidar posición"). Decidida
- Cobrar renta (cupones, amortizaciones, dividendos): retiro sin vender unidades. Nueva (ver verificación 6)
- Transferir entre activos: se mantiene, como acción secundaria. Existe
- Detalle de activo y de grupo. Existe
- Archivados, con la ganancia realizada. Existe (ganancia realizada en pantalla: Decidida)
- Avisos "valor desactualizado", "no rinde", "fuera del total". Existe
- "¿Cómo está repartido?": distribución por grupo y moneda, sin objetivo ni alertas. Nueva
- Cuánto aportaste este año y el promedio mensual. Nueva
- Recordatorio mensual opcional para actualizar las valuaciones manuales. Nueva
- Orden de la lista, tanto de grupos como de activos: manual (arrastrando) o por valor de mayor a menor. No hay otros modos. Decidida (ADR-029; la web tiene 5 modos, que se reducen)
- «Dinero que rinde / no rinde»: ver verificación 5 (el renglón doble ya no existe).
- Fuera: rebalanceo contra una distribución objetivo (por ahora).

## 5. Lo que hay que pagar (A pagar)
Pestaña de compromisos: tarjetas, suscripciones, cuotas y deudas. Un pendiente no es una fila en ninguna tabla: se calcula del plan (ADR-019). Ver ADR-030 (deudas y préstamos) y ADR-031 (tarjetas). Investigación en `investigacion-tarjetas-prestamos-ar.md`.

### Vencimientos y planes
- Lista de lo que vence, con «Ya lo pagué» y «No lo voy a pagar» (descartar). Existe
- Planes de cuotas y suscripciones; terminar un plan; eliminarlo si no tiene historia. Existe
- Estado «Estás al día» cuando no hay nada pendiente. Existe (animación o ilustración: capa 3)
- «Próximos»: navegar a los meses siguientes, con el total por moneda y la separación entre cuotas que terminan y suscripciones que siguen. Decidida
- Pagos de monto variable (luz, gas, expensas): «Ya lo pagué» se precarga con el último monto pagado, y el plan se puede marcar como «el monto cambia». Decidida
- Confirmar un vencimiento en una cuenta de otra moneda: la app pide el monto debitado. Existe
- Ver desde un gasto de qué plan salió: lo cubre el grupo 2 (origen en el detalle de un movimiento). Decidida
- Avisos de vencimientos con días de anticipación: grupo 6.

### Tarjetas
- Crear una tarjeta: nombre, últimos 4 dígitos, color, límite opcional. Existe (los últimos 4 dígitos y el color ya existen)
- Día de cierre (opcional) y día de pago. Con ambos se calcula a qué resumen va cada compra. Decidida (hoy la tarjeta tiene un solo día, `due_day`)
- La tarjeta no tiene moneda propia: la moneda va en cada compra. El vencimiento de un resumen muestra los totales por moneda lado a lado. Decidida (hoy la tarjeta tiene un campo de moneda: eso cambia)
- Compra en cuotas con tarjeta. Existe
- Compra en un pago con tarjeta, en un toque: la tarjeta aparece como opción al elegir de dónde sale el gasto en Cargar gasto, y crea un vencimiento de una cuota (1 de 1) en su próximo resumen. El gasto cuenta al pagar el resumen, igual que las cuotas. Decidida
- Guardar la fecha de la compra de cada plan (hoy hay que verificar si la base la guarda). Nueva (capa 2)
- Vista de cada mes: lo gastado ese mes (lo pagado), cuánto de eso son cuotas de compras de meses anteriores y cuánto compras de este mes, y lo comprometido para los meses siguientes. Decidida
- Límite de la tarjeta (campo opcional): el porcentaje usado se calcula contra todo lo que queda por pagar en esa tarjeta (el resumen más las cuotas restantes) y se presenta como estimación, porque el disponible real lo calcula el banco. Aviso tranquilo, sin tono de reto, cuando se acerca al límite. Decidida (texto, tono y umbrales: capa 3)
- Fuera: pago parcial o mínimo del resumen, percepción de consumos en dólares (pendientes de decisión).

### Deudas y préstamos
- Cada deuda tiene su moneda (pesos o dólares) y su saldo en esa moneda. Pagar desde una cuenta de otra moneda pide el monto debitado, como en las suscripciones. Decidida
- Dos entradas separadas: «Registrar un préstamo que recibí» (siempre pide la cuenta donde entró el dinero) y «Cargar una deuda que ya tenía» (solo el saldo). Decidida (hoy hay un formulario con la entrada del préstamo opcional)
- Pagar una deuda siempre sale de una cuenta. Se saca la opción «de afuera»; los pagos viejos «de afuera» se conservan. Decidida
- Pagar una deuda con intereses (capital e intereses). Existe
- Préstamo en cuotas fijas (banco o fintech): se carga con lo recibido, el monto de la cuota y la cantidad de cuotas. La app calcula los intereses totales (total a devolver − recibido) y los reparte parejo entre las cuotas, como gasto de la categoría Intereses. Genera vencimientos con el mismo mecanismo de las suscripciones. Es una aproximación, no la tabla del banco. Nueva
- Deudas informales (familia, amigos): siguen como hoy. Existe
- «Estimar cuándo se termina de pagar»: queda cubierto por la cuota.
- Fuera de la primera versión: préstamos UVA y dinero que el usuario presta a otros.

## 6 a 8 — Pendientes de revisar
6. Meta y preferencias (Ajustes) · 7. Cuenta y acceso · 8. Inicio (resume las demás; idea a evaluar: barra de % gastado de los ingresos del mes).

Sin contenido todavía: se arman en el próximo chat.
