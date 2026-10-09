> **BORRADOR generado por Claude Design. Sin validar: no es fuente de verdad hasta que Nacho lo revise sección por sección.**

# EnCuenta — decisiones de diseño

Fuente de verdad del producto: `uploads/PRODUCT.md`. Fuente de verdad de los datos: `uploads/inventario-de-datos.md` (qué existe y qué no se suma; no define cómo se ve). Prototipo vivo: `EnCuenta Prototipo.dc.html`.

## Tono
- Calma, silenciosa, espaciosa, con la información justa. Nada de banco, trading ni gamificación.
- El nombre se escribe siempre "EnCuenta", con la C mayúscula.
- Minimalista en qué se muestra, no en la vida: animaciones que responden a lo que hace el usuario, nunca solas.
- Las animaciones se apagan con "Reducir movimiento" de iOS.
- Ilustraciones solo en momentos puntuales (estados vacíos, "estás al día"). Estilo pendiente; los huecos ya están reservados.

## Voz de los textos
- Lo más corto que una persona diría. Sin explicar de más, sin tono de manual, sin títulos que describen en vez de nombrar. Como mucho, una línea de aclaración.
- Ejemplos:
  - "De dónde vino" → "Origen", con el contenido directo: "Pago de Spotify · 5 sept." y el enlace.
  - "Las dos partes" → sin título, solo las dos filas.
  - Las consecuencias se dicen al confirmar, no en la pantalla: "Se borra el conteo del 22/9 completo."
  - "Mover plata" → "Transferir" en toda la app. "Contar cuánto tiene" → "Contar".
  - "Vaciarla con un ajuste" → "Dejarla en $ 0", con "Se registra un ajuste" debajo.
  - "Sin precio de hoy. Último: jueves 19."
  - "No se guardó. Probá de nuevo."
  - Archivar con valor: "Ethereum todavía vale US$ 820" · "¿Lo vendiste? Cargá el retiro." · "Cargar retiro" / "Archivar".
- No se muestran campos vacíos (nada de "Sin descripción").

## Paleta: Lavanda
- La estructura viene de "Lámpara" (anillo, tarjetas redondeadas, un solo acento); se descartó su crema y su ámbar.
- Base neutra y levemente fría: blancos limpios y grises azulados. Nada de crema ni beige.
- La protagonista es la lavanda pastel: botón principal, anillo, chips activos y relleno de gráficos.
- El texto sobre un pastel va en una versión oscura del mismo tono, con contraste legible.
- Modo claro y oscuro, con los mismos roles de color.
- Tipografía provisoria: Manrope. Pendiente de definir.

## Buenas y malas noticias
- Pérdida, gasto que sale, deuda y vencido van en coral suave (texto coral oscuro, fondo coral pastel). Nunca un rojo de alarma.
- Ganancia, lo que sube, en verde salvia calmo: el equivalente tranquilo del coral.
- Siempre con los signos + y −: el color nunca es la única señal.
- Lo que entra (un ingreso) va en el color del texto, sin verde.
- Lo que solo cambia de lugar (transferencias, ahorro, aportes) va en gris y no cuenta como gasto.
- El vencido lleva un punto coral chico, y la urgencia la dice el texto ("Venció hace 12 días").

## Pasteles de distinción
- 8 pasteles para billeteras, tarjetas y tortas: lavanda, manteca, agua, orquídea, menta, azul, pistacho y pizarra.
- Ordenados para que dos vecinos en una torta nunca se parezcan, y lejos del coral.
- Los grupos de inversión usan 8 tonos propios, sin verdes ni rosados: lavanda, agua, arena, pizarra, azul, uva, miel y piedra. Así la ganancia salvia y la pérdida coral se leen sobre cualquier grupo.
- Los tintes de grupo son suaves pero con tono claro: más marcado en el encabezado, más clarito en los activos.

## Regla de datos
- Nunca sumar sin decir cómo. Si se suman monedas distintas, se aclara la cotización ("en dólares, a la cotización de cada mes").
- Pesos y dólares no van en la misma torta.
- El ahorro no se suma al disponible.
- Un grupo "fuera del total" no suma arriba.
- El pago de deuda no es gasto.

## Esqueleto: 5 pestañas, una pregunta cada una
- Inicio: ¿cómo estoy hoy?
- Movimientos: ¿qué pasó? Una línea en el tiempo.
- Mi plata: ¿dónde está mi plata ahora? Una foto del presente.
- Inversiones: ¿cómo va lo que invertí?
- A pagar: ¿qué tengo que pagar?

## Urgente (regla global)
- Urgente = lo vencido más lo que vence en los próximos 3 días (antes eran 2). Vale para Inicio y A pagar.
- Lo vencido va en coral (punto coral y texto coral oscuro). Lo que vence pronto va en el color del texto normal, sin punto.

## Inicio
Ver `Inicio y Ajustes.dc.html`. Pregunta: ¿cómo estoy hoy? Resume las otras cuatro pestañas, no las repite. La forma sale del borrador anterior (anillo, dos tarjetas lado a lado, A pagar con "Ver todo"); el contenido, de esta vuelta. Cada bloque se toca y lleva a su pantalla.
- Arriba, "Hola, Nacho" y el círculo con la inicial, que abre Ajustes.
- De arriba hacia abajo:
  1. Tarjeta grande con el anillo: el anillo marca cuánto pasó del mes ("quedan 5 días del mes"). Adentro, "Disponible", una línea por moneda con el mismo peso (nunca sumadas); lleva a Mi plata. Al pie de la misma tarjeta, "Invertido · valor hoy · US$ 8.410", que lleva a Inversiones. Se sacó el reparto en 3 cuentas (está en Mi plata).
  2. A pagar: solo si hay algo urgente. Título afuera con "Ver todo"; una fila por vencimiento (nombre, cuándo, monto), como mucho 3, y "y N más". El punto coral solo en lo vencido. Sin "Ya lo pagué": eso se hace en A pagar.
  3. Dos tarjetas lado a lado:
     - "Gastaste este mes", la comparación en chico con el mes pasado a la misma fecha ("$ 12.400 menos que agosto a esta altura"), siempre en gris porque gastar no es alarma, y "Te sobró". Lleva al Resumen de Movimientos.
     - "Inversiones": la ganancia del mes en una pastilla salvia o coral, con signo, y la curva del mes sin ejes. Lleva a Inversiones.
  4. Meta, opcional y sin tarjeta: "Llevás el 1,9 % de tu meta" con una barra fina (abre la hoja de Meta); si no hay meta, una línea tenue "Poné una meta".
- Sin gráfico de 12 meses (está en el Resumen de Movimientos) ni bloque de pendientes.
- Botón principal: "Cargar gasto".
- Primera vez: hueco de ilustración, "¿Cuánto tenés hoy?", "Contá la plata de cada cuenta y arrancamos de ahí." y el botón "Contar" (abre Contar con Efectivo). Debajo, "Poné una meta". No se muestra ningún número que la app no pueda afirmar.

## Meta (independencia financiera)
- Hoja propia, de la familia de hojas de carga. Se abre desde Inicio y desde Ajustes.
- Un solo dato obligatorio: "Cuánto querrías por mes", en dólares, como monto protagonista con teclado propio.
- Debajo, en chico: "Necesitás US$ 450.000 invertidos." (mensual × 12 ÷ retiro por año) con un (i) que lo explica en palabras simples y con los números del usuario.
- En edición, además, la barra y "Llevás US$ 8.410 · el 1,9 %". Se compara con lo invertido que suma al total.
- "Más opciones", plegado: "Retiro por año", 4 % por defecto, con − y + de a 0,5 (entre 2 % y 6 %), y "Menos es más prudente, pero la meta sube."
- Botón "Guardar meta" (o "Guardar cambios"). En edición, "Borrar meta" en coral, que confirma: "Se borra tu meta de US$ 1.500 por mes."
- Lo que calcula la app no se redondea para que parezca más avance: si es 1,9 %, dice 1,9 %.

## Ajustes
- Se abre desde el círculo con la inicial, arriba en Inicio, y entra como una pantalla más (con "‹ Inicio"). La barra de pestañas sigue a la vista; el botón "Cargar gasto", no.
- Lista agrupada al estilo iOS, con el nombre del grupo arriba en gris:
  - Cuenta: nombre y email; "Cerrar sesión" (confirma).
  - Meta: "Tu meta · US$ 1.500 por mes", o "Poné una meta".
  - Seguridad: "Pedir Face ID al abrir" (interruptor).
  - Avisos: "Recordarme los vencimientos" (interruptor) y, si está prendido, "Días antes" con pastillas 1 · 2 · 3 · 5 (3 por defecto, igual que lo urgente).
  - Organizar: Categorías, Grupos de inversión y Cuentas (Cuentas abre Mi plata en modo Editar).
  - Apariencia: control segmentado Claro | Oscuro | Automático.
  - Datos: "Exportar mis datos" · CSV.
  - Invitaciones: "Invitar a alguien", y debajo "Solo se entra con invitación."
  - Al pie, la versión.
- Categorías: control Gastos | Ingresos. Fuera de edición es solo la lista. "Editar" (arriba a la derecha) muestra agarres para ordenar y "Ocultar" por fila; "Listo" sale. Las ocultas van en su grupo, con "Mostrar" y "Sus movimientos las siguen mostrando." "Nueva categoría" al final de la lista, en el lugar. Las categorías del sistema (ajuste, ahorro, transferencia) no aparecen.

## Movimientos
- Selector de período arriba: Mes (con flechas), Año, Todo o Fechas (dos fechas). Maneja toda la pantalla.
- Debajo, un control segmentado de iOS: Lista / Resumen.
- Lista: los movimientos del período agrupados por día.
- Resumen: Gastos, Ingresos, Invertido, Ahorrado y "Te sobró" (o "Te faltó", en coral), más en qué categorías se fue la plata.
- Si el período abarca varios meses, se suma un gráfico mes a mes, en dólares a la cotización de cada mes.

## Mi plata
- Foto del presente: tortas, sin listas en el tiempo ni barritas.
- Disponible en una sola torta. Arriba, un control segmentado "Pesos | Dólares" (como "Lista | Resumen" en Movimientos): se ve una moneda a la vez, y los recuadros de billeteras debajo siguen a la moneda elegida. Abre en Pesos.
- Si toda la plata está en una sola moneda, el control no aparece.
- Se descartaron las dos tortas apiladas: competían entre sí y alargaban la pantalla.
- El ahorro va en un sector apartado, con la etiqueta "fuera del disponible".
- "Contar mi plata" queda siempre a la vista, junto a la fecha del último conteo.

## Inversiones: pantalla principal
- Arriba, estilo la app Bolsa de iOS:
  - El valor con "Valor hoy" al costado y, debajo, "Pusiste US$ X".
  - La ganancia del período con su (i).
  - El gráfico como protagonista.
  - El selector de período debajo del gráfico: 24 h · Semana · Mes · Año · Todo.
- Abre en "Mes". En "24 h" el gráfico se reemplaza por un texto tenue del mismo alto, así la pantalla no salta.
- La ganancia descuenta lo que se puso o sacó en el período. La explicación va en una hoja que abre el (i); el texto es provisorio.
- El gráfico va sin ejes ni grillas. Los aportes y retiros son puntitos huecos sobre la curva.
- Lista: grupos como cajas con tinte y activos sueltos sin tinte. Todas las filas llevan ">" y abren su detalle; no hay acordeones.
- Cada fila muestra su valor y un solo número de ganancia, el del período elegido.
- Grupos por defecto: Cripto, CEDEARs, Renta fija y Fondos. El efectivo en dólares es ahorro y va en Mi plata.
- Casos especiales:
  - Activo que no busca rendimiento (por ejemplo, un auto): muestra "no rinde" en tono tenue.
  - Valuación manual vieja: muestra "valor desactualizado".
  - Grupo que no suma: lleva la etiqueta "fuera del total".
  - Origen del precio: "en vivo" o "cierre de ayer".
- Acciones:
  - El botón principal dice "Cargar aporte". Arriba a la derecha solo está "Editar". "Nuevo activo" y "Nuevo grupo" se explican en Botones.
  - Editar funciona al estilo iOS: agarres para arrastrar, mover activos entre grupos o dejarlos sueltos, y "Listo" para salir.
  - "Archivados" es un acceso en texto al final de la lista.

## Inversiones: detalles
- Activo:
  - Arriba, lo mismo que la pantalla principal. Abre en "Mes".
  - Gráfico: con precio automático alterna entre "Valor" y "Precio". En manual muestra solo "Valor", con un punto por valuación.
  - Tu posición: unidades, precio promedio, precio actual y su origen. En manual, la fecha de la última valuación.
  - Historial: aportes, retiros, transferencias y valuaciones, por mes, del más nuevo al más viejo.
  - Acciones: Aportar · Retirar · Cargar valuación (solo manual) · Transferir. En "···": Editar y Archivar.
- Grupo:
  - Arriba lo mismo, con el tinte del grupo en el encabezado, y abajo sus activos, tocables.
  - En "···": nombre, color (solo pasteles de grupo) y "Suma al total".
  - Archivar solo aparece si el grupo no tiene activos vivos.
- Hoja de aporte:
  - Es la misma desde "Cargar aporte" y desde "Aportar". Desde un activo llega con el activo ya elegido; desde la pantalla principal, lo primero es elegir el activo.
  - Campos: monto en dólares, unidades (opcional), fecha y "¿De dónde salió la plata?".
  - Si sale del disponible, pide el dólar del día.

## A pagar
- Regla: un solo monto por fila. Lo demás va en texto chico sin cifras, o en el detalle.
- Arriba, lo urgente: lo que ya venció y lo que vence en los próximos 3 días (ver "Urgente").
  - Lo vencido lleva el punto coral y el texto en coral; lo que vence pronto, sin punto y en el color del texto. La urgencia la dice el texto ("Venció hace 3 días", "Vence mañana").
  - Cada uno tiene "Ya lo pagué" y, al deslizarlo, "Saltear". Al tocar "Saltear" el vencimiento desaparece y queda un aviso "Salteado" con "Deshacer" durante unos segundos. Si es una suscripción, el aviso suma "¿La cancelaste? Terminarla", que termina el plan para que no aparezcan más vencimientos.
  - Si no hay nada urgente, esta parte no aparece.
- Debajo, "Próximos este mes · N pagos": una fila desplegable, cerrada por defecto.
  - En la misma línea, chico, el total por moneda uno al lado del otro ("$ X · US$ Y"). Nunca sumados ni apilados.
  - Abierta, muestra los próximos por fecha, cada uno con "Ya lo pagué".
- Sin totales grandes arriba.
- El resumen de una tarjeta es un solo vencimiento.
- Si no queda nada pendiente en el mes, aparece "Estás al día".
- Cajas:
  - Tarjetas: color, nombre, últimos 4 dígitos y lo comprometido este mes. El límite va en el detalle.
  - Suscripciones: el total por mes en el encabezado de la caja. Cada fila lleva nombre y monto; la frecuencia solo se aclara si no es mensual.
  - Cuotas y Deudas: solo aparecen si existen, con un monto por fila.
- Agregar se hace desde cada caja (ver Botones).
- Se evalúa con datos realistas y pocos, no con una pantalla llena.

## Botones
- El botón principal de abajo:
  - Inicio y Movimientos: "Cargar gasto".
  - Inversiones y el detalle de un activo: "Cargar aporte".
  - Mi plata y A pagar: sin botón grande. En Mi plata, "Contar mi plata" queda donde está.
- Sin "+" arriba en Inversiones ni en A pagar.
- Inversiones:
  - El aporte se carga con "Cargar aporte" o, desde el activo, con "Aportar". Es la misma hoja.
  - Al final de "¿A qué activo?" hay una opción "Nuevo activo" con tres campos: nombre, cómo se valúa y grupo. Se crea ahí mismo y vuelve al aporte con ese activo elegido.
  - "Nuevo grupo" es una fila al final de la lista en modo Editar. Abre su propia hoja, de la misma familia que la de aporte:
    - Nombre, obligatorio: "Crear grupo" queda deshabilitado hasta que haya nombre.
    - Color: los 8 pasteles de grupo.
    - "Suma al total de tus inversiones": interruptor, prendido por defecto.
    - "Los activos de este grupo buscan rendimiento": interruptor, prendido por defecto, con una aclaración chica ("Apagalo para cosas que no buscan ganar plata, como un auto o una casa…"). Es la sugerencia para los activos nuevos del grupo.
    - Al crear, la hoja baja, el grupo aparece al final de la lista con una entrada suave y el aviso "Grupo creado".
- A pagar:
  - Cada caja termina en su fila para agregar: "Nueva tarjeta", "Nueva suscripción", "Nueva compra en cuotas" o "Nueva deuda".
  - Cuotas y Deudas vacías no desaparecen: quedan como una línea tenue ("Agregar deuda").

## Familia de hojas de carga
Vale para toda hoja que carga o edita algo (gasto, ingreso, aporte, grupo, cuenta, retiro, transferencia, valuación, mover plata):
- Sube desde abajo, como la de gasto y la de aporte.
- Si la hoja tiene un monto, es el protagonista, arriba, con teclado numérico propio que se abre solo.
- Orden fijo de las preguntas: cuánto → qué → de dónde / a dónde → cuándo. Un paso que no aplica a esa hoja se salta.
- La fecha usa un control compartido: pastillas "Hoy" y "Ayer" y, al tocar "Otra fecha", un calendario.
- Los títulos de campo son descriptivos, no preguntas: "Cuenta", "Categoría", "Fecha", "Origen", "Destino", "Nombre", no "¿En qué?" ni "¿Cómo se llama?".
- El teclado numérico propio aparece en todo campo de monto, no solo en el principal: unidades, tipo de cambio, lo que llega en un movimiento. Reemplaza al teclado del sistema mientras ese campo está activo; nunca se ven los dos juntos. Los campos de texto (nombre, categoría nueva) usan el teclado normal de iOS.
- Cotización: el campo se llama "Tipo de cambio", viene cargado con el dólar MEP de hoy (aclarado abajo en chico: "Dólar MEP de hoy"), es editable y lleva un (i) que explica en palabras simples qué es, por qué la app lo usa y que se puede cambiar si se operó a otra cotización.
- Un aviso solo aparece si el usuario tiene que decidir algo. Nada de avisos que solo informan.
- El botón principal va abajo y queda deshabilitado mientras falte algo obligatorio.
- Cada hoja sirve para crear y para editar: en edición llega con los datos cargados, el botón dice "Guardar cambios" y al final aparece "Borrar", en coral y con confirmación.
- Los errores, en castellano y sin culpa.

## Formularios (vuelta 1, cerrada)
Ver `Formularios.dc.html`, con cada hoja en un teléfono.
- Gasto: suma un control "Gasto | Ingreso" arriba; en Ingreso cambian las categorías. Guardar un ingreso dispara su celebración. La grilla de categorías muestra las más usadas y termina en "Otra" (abre una lista completa con scroll propio, se cierra al elegir o con "Listo") y "Nueva" (crea una sin salir de la hoja).
- Gasto e ingreso suman "Descripción" (opcional, teclado normal de iOS) entre Categoría y Cuenta. Si existe, es el título de la fila en Movimientos; si no, el título es la categoría.
- Conteo previo: al crear o editar un gasto o ingreso con fecha igual o anterior a un "Contar mi plata" que encontró diferencia en esa misma cuenta y moneda (faltante para un gasto, sobrante para un ingreso), aparece una línea discreta con un interruptor apagado por defecto: "¿Es parte de lo que faltaba/sobraba al contar el [fecha]?". Prendido, aclara en chico si el saldo contado sigue igual o si, por ser el movimiento mayor a la diferencia, en realidad sobró/faltó el resto. Si el conteo no tuvo diferencia o es de otra cuenta o moneda, no aparece nada.
- Editar y cambiar a una cuenta de otra moneda: el monto NO se vacía. Aparece una pregunta dentro de la hoja ("Este movimiento estaba en pesos/dólares. ¿Los X eran en dólares/pesos?") y no se puede guardar hasta responder. "Sí": el número queda igual y cambia la moneda. "No, convertir": el monto pasa a la conversión al MEP del día del movimiento (mostrando la cotización usada, o la última anterior si ese día no tiene, diciéndolo), y queda editable.
- Aporte: se reordenó para cumplir la familia (monto arriba, después el activo, después el origen, después la fecha) y su fecha ahora usa el control compartido en vez de un texto fijo. Si el origen es "Del disponible", aparece "Cuenta" para elegir de cuál sale; el "Tipo de cambio" solo se pide si esa cuenta es en pesos.
- Unidades (aporte, retiro y transferencia entre activos): si el activo tiene precio automático, el monto va primero y la app sugiere las unidades (monto ÷ precio del día) en un campo editable con la aclaración "Revisá que coincida con lo que te dio el broker"; son obligatorias. Si el activo es de valuación manual, las unidades son opcionales.
- Cargar valuación: si el activo tiene unidades, la hoja pide "Precio por unidad" y muestra el total calculado; si no tiene (un auto, una casa), pide el valor total, como antes.
- Nueva cuenta: al crearla, la hoja no cierra sola — muestra una confirmación ("Cuenta creada") con el botón "Contar cuánto tiene", que lleva a Contar mi plata con esa cuenta ya elegida.

## Formularios (vuelta 2, A pagar)
- Nueva tarjeta: nombre, últimos 4 dígitos (opcional), color (los 8 pasteles), moneda, día de vencimiento del resumen (opcional) y límite (opcional, en la moneda elegida, con teclado propio). Aclaración chica: "Las compras de una tarjeta vencen todas el mismo día, como el resumen."
- Nueva suscripción: monto arriba con su propia "Moneda del precio" (Pesos | Dólares) separada de la cuenta —ChatGPT cuesta US$ 20 aunque se pague desde una cuenta en pesos—, nombre, categoría (mismo patrón que gasto: más usadas + "Otra" que expande la lista completa sin salir de la hoja, sin scroll, + "Nueva"), cuenta ("De dónde se debita el pago"), frecuencia, cuenta y primer vencimiento con el control de fecha compartido.
- Nueva compra en cuotas: monto de cada cuota arriba con el total calculado debajo, en la moneda de la cuenta elegida (o pesos si es con tarjeta); nombre, categoría, cantidad de cuotas y "Ya pagué" (cuántas se pagaron antes de cargarla). Tarjeta opcional: si se elige, la fecha sale del resumen de esa tarjeta y no se pide cuenta ni fecha; si no, pide cuenta y fecha de la primera cuota.
- Plata que me prestaron (antes "nueva deuda"): monto en dólares, de quién y fecha.
- Pagar una deuda: arriba del monto, a quién se le paga y cuánto se debe hoy; si se abre sin una deuda elegida, lo primero es elegirla. Origen (del disponible, con cuenta y tipo de cambio si es en pesos; o "Ya la tenía o vino de afuera", igual que en el aporte) y fecha. Debajo, en chico, cuánto queda de deuda después del pago; si la salda, celebración distinta ("Deuda saldada").
- Ya lo pagué: hoja corta, todo precargado y editable (monto, cuenta, fecha de hoy). Si es una suscripción y el monto cambió en su propia moneda, aparece "Es el precio nuevo de acá en adelante" (apagado por defecto); en cuotas no aparece, porque no cambian de precio. Si la cuenta elegida es de otra moneda que el precio de la suscripción (por ejemplo, un plan en dólares pagado desde una cuenta en pesos), pide "Monto debitado" en la moneda de la cuenta, vacío, con una referencia chica del mes pasado y el precio; en ese caso no aparece el interruptor de precio nuevo, porque cambió la cotización y no el precio.
- Saltear reemplaza "No lo voy a pagar" en toda la app: sin hoja, se revela al deslizar. Al tocarlo, el vencimiento desaparece con un aviso "Salteado" y "Deshacer" por unos segundos; si es una suscripción, el aviso suma "¿La cancelaste? Terminarla".
- Transferir (nueva): de qué cuenta a qué cuenta y cuánto. La app nombra sola el movimiento ("transferencia", "ahorro" o "retiro de ahorro") según las cuentas elegidas. Si cambian de moneda, pide también cuánto llega, con la cotización del día sugerida y editable.
- Nueva cuenta (nueva): nombre, moneda, color (los 8 pasteles) y si es de ahorro. Sin saldo inicial; después de crearla se sugiere contarla.
- Retirar de un activo (nueva): monto en dólares, unidades opcionales, a dónde va la plata (una cuenta, con cotización si es en pesos, o afuera de la app) y, antes de guardar, cuánto de eso es ganancia o pérdida.
- Transferir entre activos (nueva): desde, hacia, monto y unidades, con la aclaración de que no toca el disponible.
- Cargar valuación (nueva, activos manuales): valor en dólares y fecha, con la valuación anterior de referencia.

## Detalles (patrón)
Ver `Detalles.dc.html`.
- Todo detalle sigue al del activo: arriba el dato principal; debajo una fila de botones con las acciones (abren las hojas de Formularios); después el historial agrupado por mes.
- Editar, archivar, ocultar, terminar y borrar van en el menú "···", nunca en la fila de acciones.
- Movimiento: excepción al "···": sus datos (sin campos vacíos), "Origen" si viene de un conteo, una transferencia o un vencimiento, y al pie dos botones, "Editar" (hoja de gasto en modo editar) y "Borrar", que confirma diciendo la consecuencia.
- Transferencia: muestra sus dos partes, en gris.
- Cuenta: saldo, "Transferir" y "Contar cuánto tiene", y sus movimientos. En "···": Editar y Ocultar. Ocultar con saldo pide elegir: mover la plata o vaciarla con un ajuste.
- Cuenta de ahorro: igual, con "Gastar" (hoja de gasto con esa cuenta), "Ahorrar" y "Retirar" (abren Transferir ya orientada).
- Gastar desde el ahorro: en la hoja de gasto, el campo Cuenta ofrece también las cuentas de ahorro, en un grupo aparte "Ahorro".
- Suscripción: Editar (desde "···") abre la hoja de suscripción con todo editable, incluida la cuenta de la que se debita.
- Tarjeta: encabezado con su color, lo comprometido este mes contra el límite (barra, solo si hay límite), el próximo resumen, las cuotas activas ("quedan N") y los resúmenes pagados por mes.
- Compra en cuotas: cuota, barra de avance ("quedan N de M"), falta pagar, próxima cuota e historial de vencimientos. Las cuotas previas a cargarla se nombran, no se inventan. En "···": Editar y Terminar.
- Suscripción: precio en su moneda, frecuencia, próximo vencimiento, total pagado (en la moneda en que se debitó, aclarado) e historial, incluidos los salteados. En "···": Editar y Terminar, con confirmación que aclara que es reversible.
- Deuda: cuánto debés hoy en coral, lo original, barra de avance y pagos con su origen ("del disponible" o "ya la tenía o vino de afuera"). Botón "Pagar".
- Inversiones: Archivados muestra activos y grupos con la ganancia realizada al retirar. Archivar no pide confirmación (es reversible) y deja un aviso con "Deshacer"; solo pregunta si el activo todavía vale algo ("Cargar retiro" o "Archivar igual").
- Mi plata en modo Editar: agarres para ordenar, secciones Pesos, Dólares y Ahorro, tocar una cuenta la edita y "Nueva cuenta" al final. Arriba a la derecha, "Listo".
- Movimientos: pastillas de tipo debajo de Lista | Resumen, solo en Lista (Gastos, Ingresos, Transferencias, Ahorro, Inversiones). Ninguna prendida = todo. Son delineadas para no confundirse con las del período.

## Estados de toda la app
- Cargando: esqueletos suaves que laten despacio, con la estructura real (título, período, filas). Nunca pantalla en blanco. Con "Reducir movimiento" quedan quietos.
- Sin conexión: aviso gris arriba ("Sin conexión · Actualizado 14:32") y los últimos números. Se pueden cargar gastos e ingresos nuevos: se guardan en el teléfono, se suben solos al volver la señal y llevan una marca chica "Sin subir". Editar, borrar, contar, transferir y aportar quedan deshabilitados hasta que vuelva.
- Rechazado al subir: la fila queda marcada "No se subió" en coral; al tocarla abre la hoja con lo que hay que corregir.
- Error al guardar: dentro de la misma hoja, en coral suave, "No se guardó. Probá de nuevo." El botón pasa a "Reintentar".
- Activo sin precio: el último valor con su fecha ("último valor", "Con el precio del jueves 19"), sin ganancia hasta tener precio. Nunca se estima.
- Cotización que falta: se usa la última conocida y se dice cuál ("Es el del jueves 25"), editable.

## Contar mi plata
Prototipo navegable: `Contar prototipo.dc.html`. (`Contar.dc.html` quedó de la primera vuelta, con el paso "Comparar" ya descartado.)
- Se abre desde "Contar mi plata" en Mi plata (todas las cuentas), desde el detalle de una cuenta (solo esa) y al crear una cuenta nueva (solo esa).
- Dos pasos en la misma hoja. Las cuentas de ahorro no entran.
- Paso 1, "Contá": solo las cuentas agrupadas por moneda, cada una con su campo (teclado propio, coma para decimales). Cada fila lleva debajo del nombre un cartel chico "Actual: $ X" con el saldo de la app. Una fila sin tocar muestra "—" en el campo; el campo nunca se precarga. Un 0 escrito sí cuenta. Nada de resultado, "Esperaba" ni textos debajo. Botón "Listo", activo con al menos una cuenta contada.
- Paso 2, "Revisá":
  - Una fila por cuenta contada: nombre, "esperaba $ X" y "contaste $ Y". Si coinciden, la fila dice "cierra".
  - "Se va a registrar": los movimientos que se crean, con el formato de la lista de Movimientos. "Ajuste de saldo · Mercado Pago · −$ 54.112" (coral si falta, color de texto si sobra) y, solo si la plata cambió de cuenta, "Transferencia · Mercado Pago → Efectivo · $ 40.000" en gris. Sin diferencia: "Nada que registrar".
  - Al final, en chico: "No contaste: Efectivo, Cuenta DNI."
  - Botones "Corregir" (vuelve al paso 1 con lo cargado) y "Guardar".
  - Sin frases explicativas: las filas se entienden solas. Nunca "reparto" ni "cuenta ancla".
- Guardar muestra solo "Guardado", sin celebración. Cada cuenta contada queda "Contada hoy".
- Detalle de un conteo (desde "Ver conteo"): fecha, cuentas contadas con lo declarado, resultado por moneda en pasado ("Faltaban", "Todo cerraba") y "Borrar conteo", que confirma: "Se borra el conteo del 22/9 completo."
- En el historial de una cuenta, el conteo es una fila: "Contaste · faltaban $ 12.300", con el monto del ajuste. Reemplaza a la fila del ajuste en esa cuenta.

## Huecos para ilustraciones
- Todo estado tranquilo o vacío deja un espacio reservado: un marco tenue punteado con una etiqueta ("ilustración · al día"). La ilustración no se dibuja todavía.
- Hoy hay huecos en: A pagar al día, Movimientos sin movimientos en el período, Inversiones sin inversiones.
- Primera vez: en Movimientos, Inversiones e Inicio.

## Celebraciones
- Premian una acción positiva: son breves y suaves, responden a lo que hizo la persona y no pasan solas.
- Con "Reducir movimiento" no hay animación: el cambio aparece directo y el aviso de texto queda igual.
- Sensación buscada: un "listo" tranquilo, como tildar algo en una lista. Nada de confeti, sonido ni vibración larga.
- Marcar un vencimiento como pagado (bocetado):
  - El botón "Ya lo pagué" se convierte en una pastilla lavanda "✓ Pagado", con un pequeño rebote de escala (0,3 s).
  - Después de una pausa corta, la fila se desliza hacia la derecha y se desvanece (0,24 s). Total: menos de 0,8 s.
  - El aviso de abajo lleva un círculo lavanda con tilde que crece con un rebote suave y deja un halo que se desvanece (0,5 s).
- Quedar al día en A pagar, el último pago del mes (bocetado):
  - Además de lo anterior, el marco de la ilustración y los textos de "Estás al día" suben y aparecen escalonados (0,56 s cada uno, 90 ms entre sí).
  - El aviso dice "Pagado. Estás al día".
- Crear una inversión o hacer un aporte (bocetado): el aviso con el círculo lavanda con tilde ("Activo creado", "Aporte guardado", "Grupo creado").
- Cargar un ingreso (no bocetado: todavía no existe el flujo de ingreso):
  - Al guardar, el número del disponible (en Inicio y Mi plata) sube contando hasta el valor nuevo (0,7 s, como hoy al cargar un gasto, pero hacia arriba).
  - El anillo de Inicio no cambia: marca el mes, no la plata.
  - El aviso lleva el círculo con tilde.
- La construcción final se hace después: los bocetos solo fijan qué se mueve, cuánto dura y qué se siente.

## Pendiente
- Pasar el Inicio y los Ajustes nuevos al prototipo vivo.
- Grupos de inversión desde Ajustes; flujo de invitación.
- Hojas de Nueva tarjeta, suscripción, compra en cuotas y deuda.
- Flujo de ingreso (y su celebración).
- El texto final del (i).
- Ilustraciones, tipografía y logo.
