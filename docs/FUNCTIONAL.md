# Especificación funcional — app-finances

Documento de diseño funcional. Define QUÉ hace la app hoy y QUÉ va a hacer (el diseño acordado). Las decisiones técnicas y el modelo de datos están en ARCHITECTURE.md.

Estados usados en este documento: ✅ implementado · 🟡 parcial · 🔜 pendiente.

## Propósito

App de finanzas personales para un inversor amateur que arranca. Objetivo del usuario: hacer crecer su capital ("bola de nieve"), protegerlo de la inflación, y avanzar hacia la independencia financiera (FIRE). Uso personal real + pieza de portfolio.

Multiusuario con registro semi-cerrado: las cuentas las crea el administrador (no hay registro público). Cada usuario opera 100% aislado: sus categorías, movimientos, portafolio, deudas y ajustes son propios.

## Principios de diseño

- Mobile-first: el uso principal es desde iPhone. Estética minimalista estilo iOS, prolija, profesional.
- Idioma de la interfaz: español (Argentina). Código en inglés.
- Se registran EVENTOS (movimientos, aportes, pagos, reconciliaciones); los totales siempre se calculan, nunca se cargan a mano.
- **Tres mundos separados**: la app maneja tres magnitudes que se muestran SIEMPRE por separado — el dinero líquido (pesos, operativo, día a día), lo invertido (USD, con rendimiento) y la deuda (saldo restante). NO existe un "patrimonio total" que sume líquido + invertido: pesos inflacionarios y dólares no son comparables ni sumables de forma útil.
- Monedas: gastos, ingresos y líquido en ARS. Todo lo invertido se mide y se muestra en USD, siempre, porque en pesos las estadísticas se distorsionan por inflación. Cada inversión congela su tipo de cambio en el momento del aporte; las métricas históricas no dependen de la cotización de hoy.
- Extensible: activos y categorías los gestiona el usuario, no están fijos en el código.

## Dinero líquido ✅

El líquido es el dinero disponible en pesos (efectivo + cuentas). Es un acumulado GENERAL y continuo, no una métrica mensual. Se calcula siempre al vuelo como la suma de todos los eventos:

> líquido = + ingresos − gastos − inversiones que afectan el líquido (cada una a su tipo de cambio congelado) − pagos de deuda (ídem)

Los aportes marcados como tenencia preexistente ("ya lo tenía": inversiones anteriores a la app, efectivo que ya se poseía) no restan del líquido; sí suman al portafolio.

**Reconciliación**: función de corrección. El usuario declara cuánto líquido tiene realmente; el sistema calcula la diferencia contra lo esperado y registra un movimiento de ajuste (ingreso o gasto según el signo) que realinea el saldo con la realidad. Los ajustes cuentan como gastos/ingresos normales en las estadísticas — no se excluyen de ningún cálculo — y quedan identificados y agrupados bajo su categoría propia "Ajuste de saldo", una categoría del sistema: protegida, el usuario no puede renombrarla ni archivarla. Cubre rendimientos de billeteras (ej: Mercado Pago) y movimientos que no se cargaron.

El cálculo y la reconciliación siguen intactos (`lib/liquid.js`); dejaron de mostrarse en Movimientos y por ahora no se ven en ninguna pantalla, a la espera del Dashboard (ver Secciones).

## Secciones

### 1. Inicio / Dashboard 🔜

La home. Muestra los tres mundos, separados y en este orden:

- Líquido disponible (destacado, lo primero que se ve).
- Invertido, con su rendimiento.
- Deudas (saldo restante).
- NO muestra un patrimonio total (ver Principios).

Más adelante, además: gráficos (gastos del mes por categoría, evolución del líquido, aportado vs. valor del portafolio, distribución por tipo de activo) y avance hacia el objetivo FIRE.

✅ Ya existe el botón flotante "+ Gasto" siempre visible (la acción más frecuente, carga en segundos).

La curva histórica aportado vs. valor se calcula agrupando las valuaciones por mes (última valuación de cada activo en el mes) contra el acumulado de aportes a esa fecha. No se guarda ninguna foto precalculada del portafolio (ADR-002).

### 2. Movimientos 🟡

Su función principal es CAPTURAR gastos e ingresos rápido y mostrar en qué se va la plata (estadísticas por categoría). La lista cronológica es secundaria.

- ✅ Orden de la pantalla: acceso a captura (botón flotante "+", prominente) → estadísticas del mes → historial de movimientos, como sección secundaria.
- ✅ Estadísticas del mes calendario en curso (día 1 hasta hoy, sin selector de período): total de gastos, total de ingresos, y desglose de gastos por categoría (ordenado de mayor a menor). Los ajustes de reconciliación ("Ajuste de saldo") cuentan igual que cualquier categoría, sin excluirse. Se recalculan también al crear, editar o borrar un movimiento.
- ✅ Historial (sección secundaria): alta, edición y borrado (fecha, categoría, descripción, monto ARS); navegador de mes, filtros por tipo y categoría, totales del período navegado.
- ✅ Gestión de categorías de gasto y de ingreso (crear, renombrar, archivar) — la pantalla vive en Ajustes.
- 🔜 El balance líquido y su reconciliación se movieron de acá al Dashboard (ver sección 1); hoy no se muestran en ninguna pantalla.
- 🔜 Vistas históricas: por año, desde el inicio.

### 3. Portafolio 🟡

El RENDIMIENTO es lo protagonista: ganancia/pérdida por activo y total, en USD y %.

- ✅ Jerarquía de la pantalla, de arriba hacia abajo: (1) resumen general — valor total y rendimiento total, con el rendimiento destacado en tamaño y color (pine/clay) justo debajo del valor; (2) grupos por bolsa, colapsables, con su valor y rendimiento visibles en el header sin necesidad de expandir; (3) dentro de cada grupo, cada activo con su valor y rendimiento individual. El aportado (dato de referencia, no protagonista) queda como línea secundaria en los tres niveles.
- ✅ Bolsas de activos personalizables por usuario (reemplazan a los 5 tipos fijos anteriores): cada bolsa tiene un nombre libre y organiza y agrega activos — rendimiento agrupado, si busca rendimiento por default para los activos nuevos que se creen en ella, y si suma al valor total del portafolio. El modo de valuación NO es de la bolsa: es del activo (ver viñeta siguiente) — una bolsa puede mezclar activos de distinto modo, y mover un activo de bolsa no le cambia la valuación. Cada usuario arranca con 5 bolsas sembradas (Cripto, CEDEARs, Renta fija, Fondos, Efectivo USD) que reproducen el comportamiento anterior, pero son solo un punto de partida: se pueden crear, renombrar y archivar/eliminar bolsas propias desde el modal de activo ("+ Nueva bolsa", ícono de lápiz para renombrar, "Gestionar bolsa" para archivar/eliminar).
- ✅ Regla de archivado/eliminación de bolsas (sin pantalla propia, resuelta en la app): una bolsa sin ningún activo (ni archivado) se puede eliminar; una bolsa solo con activos archivados se puede archivar; una bolsa con algún activo activo no permite ninguna de las dos acciones — hay que mover o archivar esos activos primero. Bolsas fuera del total llevan un badge "fuera del total" en el header de su grupo.
- ✅ Activos gestionables por el usuario: nombre + bolsa + modo de valuación + ticker opcional. Ej: "Bitcoin", "Colchón USD". Editar (tocar el nombre del activo, señalado con un ícono de lápiz) y archivar están implementados; archivar pide confirmación y aclara que por ahora la restauración es solo desde la base — restaurar desde la app queda en backlog. Mover un activo de bolsa es simplemente cambiar la bolsa en este mismo modal; no tiene ningún efecto sobre su valuación, que se elige y edita aparte, por activo. Al elegir bolsa se sugiere el modo predominante de esa bolsa como punto de partida, pero siempre queda editable.
- ✅ Por activo: total aportado (USD), valor actual (USD), ganancia en USD y %. Total general: aportado, valor, ganancia — excluye bolsas marcadas fuera del total.
- ✅ Alta de aportes: fecha, activo, monto (en ARS convertido al MEP del día, o directo en USD); si el activo es de precio en vivo, además la cantidad comprada (ej: 0.001 BTC), obligatoria. Marca "ya lo tenía" para tenencias preexistentes que no descuentan del líquido.
- ✅ Valor actual según el modo de valuación del activo: automático para precio en vivo con identificador (cantidad acumulada × precio, con caída al último valor manual si la API falla o falta el identificador — hoy solo cripto vía CoinGecko resuelve precio real); carga manual periódica para activos de valuación manual; vale lo aportado sin pedir carga para activos de ese modo (hoy Efectivo USD).
- 🔜 Rebalanceo (distribución actual vs. objetivo, alerta de desvío): se saca de Portafolio; a futuro será una vista propia — necesitará rediseñarse por bolsa (asset_type_id), no por nombre fijo.
- ✅ Tipo de cambio en aportes: interruptor "va por MEP" (default: la app trae el MEP del día automáticamente) o "cambio manual", donde el usuario carga los pesos invertidos y los dólares que representan y la app deriva el tipo de cambio. Para dólares que no van al MEP (colchón/blue).
- ✅ Rendimiento selectivo: cada activo tiene una marca de si "busca rendimiento" (yields) o no, independiente de su bolsa (la bolsa solo sugiere el default al crear el activo). Los que no rinden (ej: efectivo USD / colchón) se excluyen del cálculo de rendimiento del portafolio, para que el % de ganancia no quede aguado por dinero que por naturaleza no genera retorno. Siguen sumando al valor total mostrado (salvo que su bolsa esté fuera del total).
- 🔜 Ver/restaurar activos archivados desde la UI (hoy solo desde la base).
- 🔜 Pantalla propia de administración de bolsas en Ajustes (hoy la gestión mínima vive embebida en el modal de activo).

### 4. Objetivo (FIRE) 🔜 — baja prioridad

- Se mide SOLO sobre el capital invertido, nunca sobre el líquido en pesos.
- Capital invertido vs. objetivo (objetivo = ingreso mensual deseado × 12 / tasa de retiro segura). % de avance.
- Proyección: meses restantes y edad estimada al llegar, con interés compuesto (retorno esperado configurable) sobre el ritmo de aporte actual. El ritmo usa el promedio de los últimos 6 meses (ventana configurable en Ajustes), no el histórico completo.
- Simulador: aporte mensual necesario para llegar a una edad elegida (ej: 30, 35).

### 5. Deudas 🔜

- Lista de deudas: acreedor, monto original (USD), saldo restante (= original − pagos, calculado).
- Registrar pagos con fecha; el saldo baja automáticamente. Historial de pagos por deuda.
- Los pagos de deuda NO cuentan como gasto ni como ahorro: se muestran por separado. Sí restan del líquido, al tipo de cambio del día del pago.
- Más adelante: estimado de cuándo se termina de pagar al ritmo actual.

### 6. Ajustes 🟡

- ✅ Gestión de categorías (crear, renombrar, archivar, restaurar).
- ✅ Las categorías del sistema ("Ajuste de saldo", gasto e ingreso) se muestran pero no se pueden renombrar ni archivar.
- ✅ Cuenta: email y cierre de sesión.
- 🔜 Parámetros FIRE: ingreso mensual deseado (USD), tasa de retiro segura (%), retorno anual esperado (%), fecha de nacimiento, fecha de inicio del plan, ventana de meses para la proyección.
- 🔜 Distribución objetivo del portafolio (% por tipo de activo, debe sumar 100) y umbral de rebalanceo. Hoy solo se editan directo en la base.

## Indicadores definidos

- ✅ Líquido (ARS) = acumulado de todos los eventos (ver Dinero líquido). General, no mensual.
- ✅ Ganancia por activo = valor actual − total aportado; % = ganancia / total aportado. Un activo sin valuación no cuenta como pérdida: queda fuera del cálculo hasta valuarse. Los activos marcados como "no rinden" (yields = false) también quedan fuera del rendimiento total del portafolio, aunque siguen sumando a su valor.
- 🔜 Tasa de ahorro = (ingresos del mes − gastos del mes) / ingresos del mes.
- 🔜 % invertido = aportes a inversión del mes / ingresos del mes. Los aportes en USD se convierten a ARS al tipo de cambio de la fecha de cada aporte (no al actual), para no distorsionar meses pasados por la devaluación.
- Los pagos de deuda quedan fuera de estos indicadores (se reportan aparte).
- NO existe un indicador de "patrimonio total": líquido, invertido y deuda se leen por separado.

## Datos automáticos (v1)

- Precios cripto en USD: API pública (CoinGecko), para cualquier activo con coingecko_id.
- Dólar MEP: API pública (dolarapi.com).
- Todo lo demás: carga manual.

## Fuera de alcance de v1 (fase 2, el diseño debe soportarlo sin romperse)

- Tracking de CEDEARs por ticker individual (unidades por ticker + precios automáticos; el campo ticker ya existe, hoy informativo).
- Atajo de iPhone que registra gastos pegándole a la misma operación que usa la app.
- Actualización mensual de valuaciones disparada automáticamente (v1: el usuario actualiza los valores cuando quiere).
- Modo demo con datos ficticios para visitantes del portfolio (deploy público sin exponer datos reales).

## Privacidad (regla de proyecto)

Los datos financieros reales viven solo en la base de datos (Supabase), nunca en el repositorio ni hardcodeados. El repo es público; los datos son privados.
