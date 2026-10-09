# EnCuenta — Documento de traspaso (8 de octubre de 2026)

Este documento resume todo lo trabajado en el chat largo de septiembre y octubre. Va en `docs/traspaso-2026-10.md`. Es la base para armar `ESTADO.md`, `ROADMAP.md` y el registro de decisiones. Cuando esos tres existan, este archivo queda como histórico.

---

## 1. Qué es EnCuenta

- App de finanzas personales para gente argentina que no sabe de finanzas. Nació como PWA (React + Vite + Tailwind + Supabase, deployada en Vercel). Hoy la usan a diario Nacho y un par de amigos invitados.
- **Nombre:** EnCuenta, siempre con C mayúscula. Es un juego entre "darse cuenta" y "la cuenta" donde está la plata. La promesa es ser consciente de en qué se te va la plata, sin retarte.
  - `encuenta.app` estaba libre. **Verificar si se compró.**
  - `encuenta.com.ar` falta mirarlo en nic.ar.
  - La búsqueda gratuita en INPI (ENCUENTA, EN CUENTA, ENKUENTA) no dio resultados. Hay que registrar la marca antes de publicar en las tiendas.
- **Dirección de producto:** calma, silenciosa, espaciosa, con la información justa. Está escrita en `PRODUCT.md`.
- **Objetivo final:**
  - Tres frentes: iOS nativo (primero), Android nativo y web.
  - Toda la lógica de plata vive en Supabase. Las apps solo muestran, cargan y hacen sumas instantáneas mientras el servidor confirma.
  - Tiene que soportar miles de usuarios, ser segura y llegar a las dos tiendas.
  - No es un negocio: con que se pague sola alcanza.

## 2. Forma de trabajo

- **Roles:**
  - **El chat (Claude) es el ingeniero.** Diseña, decide con Nacho, arma los prompts y supervisa.
  - **Claude Code implementa.**
  - **Claude Design diseña las pantallas.**
- **Modelos:** Opus cuando hay que leer y razonar sobre el código, cuando toca plata o para decisiones de diseño. Sonnet para especificaciones cerradas.
- **Informe antes de decidir:** si una decisión depende de cómo está el código por dentro, el prompt pide un informe primero.
- **Migraciones:** las aplica Nacho a mano en el SQL editor de Supabase.
  - El MCP de Supabase está conectado a Code en modo **solo lectura** y limitado al proyecto de producción.
  - Desde la 0052, el MCP no puede ejecutar funciones (es una consecuencia buscada de los permisos). Los números se verifican con tests de paridad y mirando la pantalla.
- **Formato de cada bloque de backend:**
  - una rama;
  - migraciones numeradas;
  - tests de paridad con errores provocados a propósito;
  - CI en verde;
  - todo el SQL en el orden de aplicación, con UNA verificación combinada;
  - qué mirar en pantalla;
  - no mergear hasta que Nacho aplique y verifique.
- **Preferencias de comunicación de Nacho:**
  - Mensajes cortos, y una decisión por vez.
  - Explicar qué pasa en la pantalla, no el código.
  - Distinguir siempre "está roto" de "sería más prolijo".
  - Los prompts para Code van en un bloque de código copiable.
  - Nada de cajas de preguntas con opciones: hablar en texto.

## 3. Estado por frente

### 3.1 Base (Supabase): migraciones aplicadas hasta la 0060

La mudanza de reglas de plata a la base sigue `docs/informe-reglas-de-plata.md` y la receta `docs/mudanza-reglas.md`. Lo hecho:

| Migración | Qué hizo |
|---|---|
| 0048 | Los usuarios nuevos ya no arrancan con el grupo "Efectivo USD" |
| 0049 | Saldo de deudas en una vista (`debt_balances`) |
| 0050 | La moneda de cada movimiento la pone la base. Movimientos sin cuenta prohibidos. No se puede borrar la última cuenta del día a día. Una cuenta con historia no cambia de moneda. Editar y pasar a una cuenta de otra moneda requiere mandar la moneda nueva |
| 0051 | `get_liquid_summary`: disponible y ahorro por moneda |
| 0052 | Permisos: anon solo puede ejecutar `validate_invite`. Se cortó de raíz que las funciones nuevas nazcan abiertas |
| 0053 | Permisos de tablas y vistas: anon sin nada; authenticated sin truncate, references ni trigger |
| 0054 | No se puede ocultar una cuenta con saldo |
| 0055–0057 | Tipo de cada movimiento (vista), cinco renglones del período, gastos por categoría, cotización del MEP por día, serie de 12 meses y categorías más usadas |
| 0058 | Categorías más usadas hasta hoy, sin fechas futuras |
| 0059 | Deudas (entrada opcional del préstamo, intereses a mano y automáticos, renglón "Deudas") y gastar desde el ahorro |
| 0060 | Carga sin conexión (`captured_at`, id generado en el teléfono). Una cuenta oculta no recibe movimientos, y los suyos no se editan en lo que mueve el saldo |

Además:
- Hay CI con Postgres.
- Node 22 está fijado (`.nvmrc`; Nacho usa fnm).
- La rama `feat/ui-polish` se archivó con la etiqueta `archivo/ui-polish`, después de rescatar lo útil.

### 3.2 Web actual

Está en uso diario. Se va a reemplazar, así que solo lleva arreglos. **Hallazgo reciente:** el buscador de instrumentos falla con nombres de varias palabras. Buscar "Mercado Libre" no encuentra MELI.
- Causa: hace un `includes()` del texto entero.
- Arreglo: separar lo que se busca en palabras y exigir que coincidan todas (en el nombre o el símbolo), tratando el guion como un espacio.
- Además, a `getInstruments()` le falta `limit`. Pasando las 1000 filas, el catálogo se corta sin avisar, y hay que resolverlo antes de cargar los ~385 CEDEARs.
- Está en `src/lib/instruments.js` (`searchInstruments`).
- Actualización 2026-10-09: el arreglo de búsqueda por palabras ya está en main (3687576); falta solo el limit.

### 3.3 App nativa de iOS: EN PAUSA

Se retoma cuando cierren el diseño y la base.

- **Arquitectura:** `docs/arquitectura-nativa.md`, con decisiones en `docs/pendientes-base.md`. Estaba en la rama `docs/native-architecture`, en la copia `../app-finances-native`. **Verificar si está pusheada o mergeada.**
- **Proyecto creado:** pantalla vacía "EnCuenta" que compila en el simulador. Xcode 27, Swift 6, iOS 18 como mínimo, solo iPhone.
- **Decisiones tomadas:**
  1. Un solo repo con `ios/`, `android/`, `contract/` y `design/`, y una copia de trabajo por instancia de Code.
  2. iOS 18 como mínimo.
  3. Tipos de Swift escritos a mano, con un test contra respuestas reales de la base.
  4. La letra sigue el tamaño elegido en el iPhone.
  5. Face ID al abrir y a los 5 minutos en segundo plano, con opción de apagarlo.
  6. Registro y "olvidé mi contraseña" en la web en la primera versión. **Borrar la cuenta dentro de la app desde el inicio, porque Apple lo exige.**
  7. TestFlight cuando se pague la cuenta de Apple; hasta entonces, solo el iPhone de Nacho.
  8. Pasar a Supabase Pro antes de invitar a alguien nuevo, sobre todo por los backups.
  9. Avisos locales primero, push después.
  10. Orden de construcción: cargar un gasto (con y sin conexión), totales y saldos. Después, a medida que la base esté lista: la lista, el conteo, A pagar e Inversiones.
- **Diseño compartido:** los colores, la tipografía y las medidas viven en un JSON del que salen Swift, Kotlin y CSS.
- **Animaciones:** se evalúa Rive (sirve para iOS, Android y web).

### 3.4 Diseño (Claude Design)

El proyecto es "EnCuenta: Identidad visual". La fuente de verdad es `decisiones.md` de ese proyecto. **Hay que copiarlo al repo como `design/decisiones.md`.**

- **Cerrado:**
  - paleta Lavanda (provisoria);
  - esqueleto de 5 pestañas;
  - Movimientos, Mi plata e Inversiones (con sus detalles);
  - A pagar;
  - Formularios (vueltas 1 y 2);
  - Detalles y Estados;
  - Contar mi plata (dos pasos: "Contá" y "Revisá");
  - Ajustes y Meta.
- **Pendiente:**
  - **Inicio:** se eligió la opción de **tarjetas** (2c: una tarjeta pastel por moneda, e Invertido incluye la ganancia del mes). Falta mandárselo a Design.
  - **Prototipo completo navegable,** con un selector de paletas para elegir la definitiva.
  - **Flujos que faltan:** el de ingreso con su celebración, Grupos de inversión desde Ajustes y la invitación.
  - **El texto final del (i) de la ganancia,** que depende de la fórmula que defina el backend.
  - **Identidad:** tipografía (Manrope es provisoria), logo e ilustraciones (los huecos ya están reservados). La paleta se elige antes del logo.

## 4. Decisiones de producto vigentes

- **Esqueleto:** cada pestaña responde una pregunta.
  - Inicio: ¿cómo estoy hoy?
  - Movimientos: ¿qué pasó?
  - Mi plata: ¿dónde está ahora?
  - Inversiones: ¿cómo va lo que invertí?
  - A pagar: ¿qué tengo que pagar?
- **Nunca sumar sin decir cómo:** se puede unir plata de distintos mundos solo si queda a la vista que es una conversión y a qué cotización.
- **Ahorro:** es parte de la plata, en un sector apartado. No es un cuarto mundo y no entra al conteo.
- **Movimientos sin cuenta:** prohibidos. Todo usuario nace con "Efectivo".
- **Deudas:**
  - La entrada del préstamo es opcional, y se registra como plata que cambió de lugar.
  - Una deuda que ya existía antes de usar la app se carga con lo que falta pagar.
  - Devolver capital no es gasto. Los intereses sí: a mano, más una red automática para lo pagado de más.
  - El renglón "Deudas" aparece solo si hubo movimiento, y en la nativa se lee con palabras ("Te prestaron $ X" / "Pagaste de deudas $ X").
- **Gastar desde el ahorro:** cuenta en Gastos y resta en Ahorrado. Es lo mismo que transferir primero y gastar después.
- **Cuotas y deudas, separadas:** cada cuota es un gasto del mes. Cuotas y suscripciones son el mismo mecanismo. El pago de cada mes no se carga solo: se confirma con "Ya lo pagué", y "Saltear" descarta un vencimiento puntual.
- **Urgente:** lo vencido (en coral) más lo que vence en los próximos 3 días (en color normal).
- **Suscripciones:** tienen su moneda de precio propia, separada de la cuenta. Al confirmar una en dólares pagada en pesos, se pide el monto debitado.
- **Contar mi plata:**
  - Vacío no es cero.
  - No se muestra lo esperado antes de que el usuario escriba.
  - El paso "Revisá" muestra los movimientos que se van a crear.
  - Las cuentas sin contar quedan como están.
- **Conteo retroactivo:** al cargar un gasto viejo, un interruptor apagado por defecto pregunta "¿Es parte de lo que faltaba al contar el 20/9?". Si el gasto es mayor que la diferencia, se absorbe entero (opción A, solo gastos e ingresos, solo contra conteos de la 0041 en adelante).
- **Sin conexión:** solo se pueden crear gastos e ingresos. Lo demás se deshabilita, y lo que la base rechaza al subir queda marcado para corregirlo.
- **Cambiar un movimiento a una cuenta de otra moneda:** se pregunta "¿Los 10 eran en dólares?". Sí deja el número; no lo convierte al MEP de ese día.
- **Unidades:**
  - Activo automático: primero el monto, después las unidades sugeridas, que son obligatorias.
  - Activo manual: unidades opcionales. Si las tiene, la valuación es por unidad.
- **Formularios:** una familia (misma hoja para crear y editar), con teclado propio para todos los montos y títulos descriptivos, no preguntas.
- **Voz:** lo más corto que una persona diría, sin explicar de más. Los avisos aparecen solo si hay que decidir algo.
- **Celebraciones:** marcar pagado, cargar un ingreso, aportar o crear una inversión, quedar al día, saldar una deuda.
- **Meta de independencia financiera:** opcional, en Ajustes. Se carga cuánto querrías por mes y se muestra el avance al final de Inicio.

## 5. Lo que falta, en orden

### 5.1 Base

- **Bloque 5 (no arrancó):**
  - Vista previa del conteo en SQL, para la pantalla "Revisá".
  - Conteo retroactivo con `captured_at`, según `docs/informe-conteo-retroactivo.md`.
- **Bloque A:**
  - Lista de movimientos con apareo de transferencias y repartos (#2, #5).
  - Cuotas y suscripciones en la base: fechas, estados, lo urgente (vencido + 3 días), validar el vencimiento al confirmar (D10), Saltear y Terminar.
  - Transferencias entre cuentas de distinta moneda (sale un monto, llega otro), con su nombre automático.
  - Orden manual de los activos (`assets.position`).
  - Meta de independencia financiera.
  - `delete_account`, primero de la lista, porque Apple lo exige.
  - Todo `docs/pendientes-base.md`: reglas de acceso que se recalculan fila por fila, índices y protección contra contraseñas filtradas.
  - D4: un aporte del disponible sin tipo de cambio tiene que ser imposible.
- **Bloque B, inversiones:**
  - Precios en vivo y MEP desde el servidor (#14, #21).
  - Ganancia realizada calculada en la base (#15, D6).
  - Foto del portafolio unificada con la curva (D1: la tarjeta y el último punto del gráfico tienen que dar lo mismo).
  - Valuación manual por unidad, y unidades obligatorias en los activos automáticos.
  - Total de Inicio en USD.
  - Ganancia por período (24 h, semana, mes, año, todo), descontando aportes y retiros, con la fórmula y el texto del (i).
- **Arreglos de la web:** el buscador de instrumentos y el `limit` del catálogo (sección 3.2).
- **Pendiente sin decidir:** si las cuentas de ahorro deberían seguir entrando al conteo. Hoy está resuelto que no entran.

### 5.2 Diseño

Inicio con tarjetas, el prototipo completo con el selector de paletas, los flujos que faltan, elegir la paleta y la identidad.

### 5.3 App nativa

Se retoma cuando cierren el diseño y la base (sección 3.3).

### 5.4 Operativo y seguridad

- Pasar a Supabase Pro por los backups.
- Comprar `encuenta.app`, mirar `.com.ar` y registrar la marca antes de las tiendas.
- Limpiar las ramas viejas. Hay siete `feat/*` ya mergeadas.

### 5.5 Ideas para después

- Carga automática desde Mercado Pago y bancos, leyendo los mails de aviso o importando el resumen. La app lo propone y el usuario confirma.
- Informe del mes con IA.

## 6. Protocolo de documentos y cambio de chat

**Objetivo:** que ninguna información importante viva solo en un chat.

- **`docs/ESTADO.md`:** dónde estamos hoy por frente, ramas abiertas, última migración aplicada y lo que está en curso. Corto, de una página. **Cada sesión de Code termina actualizándolo.**
- **`docs/ROADMAP.md`:** qué falta, en qué orden y por qué. Se actualiza cuando cambia el plan.
- **`docs/decisiones/`:** un archivo por decisión importante, numerado (continúa la numeración de los ADR existentes), con un formato fijo: contexto, opciones, decisión, por qué y consecuencias. **Nada se decide en un chat sin quedar acá.**
- **`design/decisiones.md`:** la copia del `decisiones.md` de Claude Design, actualizada cada vez que Design la cambia.
- **Cambio de chat:** cuando un chat se pone largo o lento, o al cerrar un bloque grande:
  1. el chat que se va deja `ESTADO.md` y `ROADMAP.md` al día, y registra las decisiones pendientes de escribir;
  2. el chat nuevo arranca leyendo, en este orden: `docs/ESTADO.md`, `docs/ROADMAP.md`, las decisiones más recientes y `design/decisiones.md`;
  3. el primer mensaje del chat nuevo es un resumen de 10 líneas de dónde estamos, para que Nacho confirme antes de seguir.
- **Cambio de instancia de Code:** lo mismo. Toda instancia nueva lee `ESTADO.md` antes de tocar nada.