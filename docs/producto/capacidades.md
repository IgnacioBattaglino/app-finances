# Capacidades de EnCuenta (capa 1)

Es la lista simple de todo lo que la app permite hacer, neutra para iOS y Android. Se usa para encontrar problemas de diseño antes de construir.

Marcas: **Existe** (está en la web hoy) · **Decidida** (definida, todavía no existe) · **Nueva** (sumada en esta revisión, va al plan de acción) · **Hueco** (nadie la definió) · **Duda** (los documentos se contradicen o falta decidir) · **Fuera** (descartada por ahora).

Estado: grupos 1 a 4 revisados (2026-10-09). Los grupos 5 a 8 están pendientes.

## 1. Cargar gastos e ingresos
- Cargar un gasto: monto, categoría, descripción opcional, cuenta, fecha. Existe
- Cargar un ingreso. Existe. Su flujo y su celebración en el diseño nuevo: Decidida (sin bocetar)
- Crear una categoría sin salir del formulario. Existe
- Ver las categorías más usadas primero. Decidida
- Editar y borrar un gasto o ingreso. Existe
- Cambiar un movimiento a una cuenta de otra moneda, con la pregunta "¿Los 10 eran en dólares?". Decidida
- Gasto cargado tarde, con fecha igual o anterior a un conteo con ajuste: cartel al guardar (ADR-027). Decidida
- Gastar desde una cuenta de ahorro. Decidida (la base está lista)
- Cargar sin conexión, con marca "Sin subir" y subida automática. Decidida (la base está lista, migración 0060)
- Corregir lo que la base rechazó al subir ("No se subió"). Decidida
- Recordar la última cuenta y categoría usadas. Nueva
- Deshacer después de guardar. Nueva
- Fuera: atajo de iPhone o widget (etapa final). Repetir o duplicar un gasto (idea futura: detectar el mismo gasto, misma categoría y descripción, dos días o dos meses seguidos, y proponerlo).

## 2. Ver qué pasó (Movimientos)
- Movimientos del período, agrupados por día. Existe (agrupados por día: Decidida)
- Elegir el período: mes con flechas, año, todo, dos fechas. Existe
- Resumen: Gastos, Ingresos, Invertido, Ahorrado y "Sobró" o "Faltó" (sin "Te"). Existe (hoy dice "Balance")
- Renglón Deudas, solo si hubo movimiento. Duda: la web lo tiene, el diseño nuevo no lo menciona
- En qué categorías se fue el dinero. Existe
- Gráfico mes a mes en dólares cuando el período abarca varios meses. Decidida
- Filtrar por tipo. Existe (el filtro Deudas: Duda)
- Filtrar por categoría. Duda: la web lo tiene, el diseño nuevo no lo menciona
- Una transferencia como una sola línea. Existe
- Aportes y retiros de inversión en la lista, solo lectura, con enlace al activo. Existe
- Detalle de un movimiento con su origen (conteo, transferencia, vencimiento). Decidida
- Un conteo como una fila, con su detalle. Decidida
- Tocar un renglón o una categoría del Resumen y ver los movimientos que lo componen. Nueva
- Búsqueda por texto. Nueva
- Filtro por rango de monto. Nueva
- Ver, desde un gasto, de qué cuota o suscripción salió. Hueco

## 3. Saber dónde está el dinero (pestaña "Mi dinero")
- Nombre de la pestaña: "Mi dinero" (recomendado frente a "Billetera"; **pendiente de confirmar**). Término único "cuenta", nunca "billetera" (**pendiente de confirmar**).
- Pantalla: arriba el total por moneda, con control Pesos | Dólares (solo si hay dos monedas). Debajo, una fila por cuenta con su saldo (la fila es el botón para entrar). "Nueva cuenta" al final. El ahorro en un sector aparte. Sin torta. Decidida (reemplaza la torta de `design/decisiones.md`)
- Crear una cuenta: nombre, moneda, si es de ahorro. Existe
- Color de cuenta. Duda: el diseño lo promete y la base no lo guarda (propuesta: columna nueva; **pendiente de confirmar**)
- Ordenar y editar cuentas. Existe
- Ocultar una cuenta (con saldo: mover el dinero o dejarla en $ 0). Existe (ver verificación 4). Dejarla en $ 0 registra un gasto o ingreso real del mes (verificación 4): **pendiente de confirmar** cómo se dice en pantalla
- Borrar una cuenta sin historia. Existe
- Ver los movimientos de una cuenta. Existe
- Transferir entre cuentas de la misma moneda. Existe. Entre monedas distintas: Decidida (falta en la base, Bloque A)
- Ahorrar y retirar de una cuenta de ahorro. Existe
- Contar disponible (ver ADR-026). Decidida
- **Pendientes de confirmar:** botón Transferir a la vista en la pantalla principal; aviso tenue "Contada hace N días" en cada cuenta; en la primera versión, solo pesos y dólares en pantalla.
- Duda: si el sector de ahorro sigue al control Pesos | Dólares o se muestra siempre.
- Fuera: curva de evolución del disponible. Recordatorio periódico para contar (idea para después).

## 4. Invertir (pestaña Inversiones)
Para quién: quien invierte de forma mensual o anual y quiere saber cómo va, no quien hace trading. Todo se muestra en dólares. Ver ADR-028.
- Valor hoy y cuánto pusiste. Existe
- Ganancia del período (Semana, Mes, Año, Todo; sin 24 h), descontando aportes y retiros, con (i). Decidida (fórmula pendiente; la base no la calcula)
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
- Dudas: orden de la lista (la web tiene 5 modos, el diseño nuevo solo el manual); "dinero que rinde / no rinde" (ver verificación 5); rendimiento de un grupo a lo largo del tiempo (Hueco).
- Fuera: rebalanceo contra una distribución objetivo (por ahora).

## 5 a 8 — Pendientes de revisar
5. Lo que hay que pagar (A pagar) · 6. Meta y preferencias (Ajustes) · 7. Cuenta y acceso · 8. Inicio (resume las demás; idea a evaluar: barra de % gastado de los ingresos del mes).

Sin contenido todavía: se arman en el próximo chat.
