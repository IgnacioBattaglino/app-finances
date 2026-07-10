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

Hoy el líquido se ve en Movimientos; su lugar definitivo es el Dashboard (ver Secciones).

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

- ✅ Alta, edición y borrado (fecha, categoría, descripción, monto ARS). Filtros por mes, tipo (gasto/ingreso) y categoría. Totales del período.
- ✅ Gestión de categorías de gasto y de ingreso (crear, renombrar, archivar) — la pantalla vive en Ajustes.
- ✅ El líquido y su reconciliación se muestran acá — transitorio: se mudan al Dashboard cuando exista.
- 🔜 Estadísticas por categoría como vista protagonista (hoy solo hay filtro por categoría).
- 🔜 Vistas históricas: por año, desde el inicio.

### 3. Portafolio 🟡

El RENDIMIENTO es lo protagonista: ganancia/pérdida por activo y total, en USD y %.

- ✅ Activos gestionables por el usuario: nombre + tipo (cripto / CEDEAR / bono / fondo / efectivo USD) + ticker opcional. Ej: "Bitcoin", "Colchón USD".
- ✅ Por activo: total aportado (USD), valor actual (USD), ganancia en USD y %. Total general: aportado, valor, ganancia.
- ✅ Alta de aportes: fecha, activo, monto (en ARS convertido al MEP del día, o directo en USD); para cripto además la cantidad comprada (ej: 0.001 BTC). Marca "ya lo tenía" para tenencias preexistentes que no descuentan del líquido.
- ✅ Valor actual: automático para cripto con precio en vivo (cantidad acumulada × precio, con caída al último valor manual si la API falla); carga manual mensual para el resto; el efectivo vale lo aportado.
- ✅ Distribución actual vs. distribución objetivo (% por tipo de activo). 🔜 El aviso de rebalanceo pasa a segundo plano, discreto (hoy es un cartel prominente).
- ✅ Tipo de cambio en aportes: interruptor "va por MEP" (default: la app trae el MEP del día automáticamente) o "cambio manual", donde el usuario carga los pesos invertidos y los dólares que representan y la app deriva el tipo de cambio. Para dólares que no van al MEP (colchón/blue).
- ✅ Rendimiento selectivo: cada activo tiene una marca de si "busca rendimiento" (yields) o no. Los que no rinden (ej: efectivo USD / colchón) se excluyen del cálculo de rendimiento del portafolio, para que el % de ganancia no quede aguado por dinero que por naturaleza no genera retorno. Siguen sumando al valor total mostrado.

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
