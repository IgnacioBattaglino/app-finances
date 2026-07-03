# Especificación funcional — app-finances

Documento de diseño funcional. Define QUÉ hace la app. Las decisiones técnicas y el modelo de datos están en ARCHITECTURE.md.

## Propósito

App de finanzas personales para un inversor amateur que arranca. Objetivo del usuario: hacer crecer su capital ("bola de nieve"), protegerlo de la inflación, y avanzar hacia la independencia financiera (FIRE). Uso personal real + pieza de portfolio.

## Principios de diseño

- Mobile-first: el uso principal es desde iPhone. Estética minimalista estilo iOS, prolija, profesional.
- Idioma de la interfaz: español (Argentina). Código en inglés.
- Se registran EVENTOS (movimientos, aportes, pagos); los totales siempre se calculan, nunca se cargan a mano.
- Monedas: gastos e ingresos diarios en ARS; patrimonio, inversiones y métricas FIRE en USD. Conversión por dólar MEP (automático vía API).
- Extensible: activos y categorías los gestiona el usuario, no están fijos en el código.

## Secciones

### 1. Dashboard (home)
- Patrimonio total (USD) y avance hacia el objetivo FIRE (%).
- Resumen del mes: ingresos, gastos, tasa de ahorro, % invertido.
- Gráfico de gastos del mes por categoría.
- Curva histórica del patrimonio: aportado vs. valor actual (permite distinguir crecimiento por aportes de crecimiento por rendimiento).
- Botón flotante "+ Gasto" siempre visible (la acción más frecuente, carga en segundos).

### 2. Movimientos
- Lista de gastos e ingresos individuales (fecha, categoría, descripción, monto ARS).
- Alta, edición y borrado. Filtros por mes, tipo (gasto/ingreso) y categoría.
- Vistas históricas: mes actual, por año, desde el inicio, por categoría.
- Gestión de categorías de gasto y de ingreso (crear, renombrar, archivar).

### 3. Portafolio
- Activos gestionables por el usuario: nombre + tipo (cripto / CEDEAR / bono / fondo / efectivo USD). Ej: "Bitcoin", "Colchón USD".
- Por activo: total aportado (USD), valor actual (USD), ganancia en USD y %.
- Total general: aportado, valor, ganancia.
- Distribución actual vs. distribución objetivo (% por tipo de activo), con alerta de rebalanceo si el desvío supera un umbral.
- Alta de aportes: fecha, activo, monto USD; para cripto además la cantidad comprada (ej: 0.001 BTC).
- Valor actual: automático para Bitcoin (cantidad acumulada × precio en vivo); carga manual mensual para el resto (v1).
- Snapshot mensual: al actualizar los valores del mes, se guarda una foto del portafolio (fecha, valor por activo). Con esas fotos se construye la curva histórica del dashboard.

### 4. Objetivo (FIRE)
- Parámetros visibles: capital actual vs. objetivo (objetivo = ingreso mensual deseado × 12 / tasa de retiro segura).
- % de avance.
- Proyección: meses restantes y edad estimada al llegar, calculado con interés compuesto (retorno esperado configurable) sobre el ritmo de aporte actual. El ritmo de aporte usa el promedio de los últimos 6 meses (ventana configurable en Ajustes), no el promedio histórico completo, para reflejar el ritmo real actual.
- Simulador: aporte mensual necesario para llegar a una edad elegida (ej: 30, 35).

### 5. Deudas
- Lista de deudas: acreedor, monto original (USD), saldo actual.
- Registrar pagos con fecha; el saldo baja automáticamente. Historial de pagos por deuda.
- Los pagos de deuda NO cuentan como gasto ni como ahorro: se muestran por separado.

### 6. Ajustes
- Parámetros FIRE: ingreso mensual deseado (USD), tasa de retiro segura (%), retorno anual esperado (%), edad, fecha de inicio del plan, ventana de meses para la proyección.
- Distribución objetivo del portafolio (% por tipo de activo, debe sumar 100).
- Gestión de categorías (acceso alternativo al de Movimientos).

## Indicadores definidos

- Tasa de ahorro = (ingresos del mes − gastos del mes) / ingresos del mes.
- % invertido = aportes a inversión del mes / ingresos del mes. Los aportes en USD se convierten a ARS al dólar MEP de la fecha de cada aporte (no al MEP actual), para no distorsionar meses pasados por la devaluación.
- Ganancia por activo = valor actual − total aportado; % = ganancia / total aportado.
- Patrimonio = suma del valor actual de todos los activos.
- Los pagos de deuda quedan fuera de estos indicadores (se reportan aparte).

## Datos automáticos (v1)

- Precio de Bitcoin en USD: API pública (CoinGecko).
- Dólar MEP: API pública (dolarapi.com).
- Todo lo demás: carga manual.

## Fuera de alcance de v1 (fase 2, el diseño debe soportarlo sin romperse)

- Tracking de CEDEARs por ticker individual (unidades por ticker + precios automáticos).
- Atajo de iPhone que registra gastos pegándole a la misma operación que usa la app.
- Snapshot mensual automático programado (v1: lo dispara el usuario).
- Modo demo con datos ficticios para visitantes del portfolio (deploy público sin exponer datos reales).
- Multiusuario. La app es de un solo usuario.

## Privacidad (regla de proyecto)

Los datos financieros reales viven solo en la base de datos (Supabase), nunca en el repositorio ni hardcodeados. El repo es público; los datos son privados.
