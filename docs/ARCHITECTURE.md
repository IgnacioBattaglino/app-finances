# Arquitectura — app-finances

Decisiones técnicas y modelo de datos. La especificación funcional está en FUNCTIONAL.md.

## Stack

- Frontend: React + Vite, Tailwind CSS. PWA instalable.
- Backend y base de datos: Supabase (PostgreSQL). El frontend consulta Supabase directamente vía supabase-js.
- Deploy: Vercel.
- APIs externas: CoinGecko (precio BTC/USD), dolarapi.com (dólar MEP).

## Principios del modelo de datos

1. Se guardan EVENTOS y CONFIGURACIÓN. Los totales (saldos, líquido, tasas, ganancias) se calculan siempre al vuelo; nunca se almacenan.
2. Nada se borra si tiene historia: categorías y activos se archivan (is_archived), no se eliminan, para no romper datos históricos.
3. Las cotizaciones del momento se congelan en el evento: cada aporte guarda el MEP de su fecha (ídem debt_payments.mep_rate). Las métricas históricas no dependen de reconstruir cotizaciones pasadas.
4. Moneda: transactions y liquid_reconciliations en ARS (vida diaria); contributions, valuations y deudas en USD (inversión).
5. Multiusuario: las tablas raíz (categories, transactions, assets, debts, settings, liquid_reconciliations) llevan user_id → auth.users; las tablas hijas (contributions, asset_valuations, debt_payments) heredan el dueño vía su FK. El aislamiento lo garantiza RLS (user_id = auth.uid()).
6. El frontend nunca envía user_id: lo completa la base con default auth.uid(), y el with check de RLS garantiza la pertenencia. Defensa en dos capas: la base completa, RLS valida.

## Tablas

### categories
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila |
| name | text NOT NULL | ej: "Comida", "Cafetería" |
| kind | text NOT NULL | 'expense' o 'income' (CHECK) |
| is_archived | boolean NOT NULL default false | |
| created_at | timestamptz default now() | |

### transactions
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila |
| date | date NOT NULL | |
| kind | text NOT NULL | 'expense' o 'income' (CHECK) |
| category_id | uuid FK → categories | NOT NULL |
| description | text | opcional |
| amount_ars | numeric(14,2) NOT NULL | CHECK > 0 |
| created_at | timestamptz default now() | |

### assets
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila |
| name | text NOT NULL | ej: "Bitcoin", "Colchón USD" |
| type | text NOT NULL | 'crypto', 'cedear', 'bond', 'fund', 'cash' (CHECK) |
| coingecko_id | text | solo cripto, ej: "bitcoin"; habilita precio automático |
| ticker | text | opcional; símbolo del activo (ej: AAPL, AL30, BTC). Hoy informativo; habilita valuación automática por API en el futuro |
| is_archived | boolean NOT NULL default false | |
| created_at | timestamptz default now() | |

### contributions
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| asset_id | uuid FK → assets | NOT NULL |
| date | date NOT NULL | |
| amount_usd | numeric(14,2) NOT NULL | CHECK > 0 |
| quantity | numeric(20,8) | opcional; unidades compradas (ej: 0.001 BTC) |
| mep_rate | numeric(10,2) NOT NULL | dólar MEP del día del aporte (congelado) |
| affects_liquid | boolean NOT NULL default true | true = inversión con plata del bolsillo, resta del líquido; false = tenencia preexistente / carga inicial, no resta (sí suma al portafolio) |
| created_at | timestamptz default now() | |

### asset_valuations
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| asset_id | uuid FK → assets | NOT NULL |
| date | date NOT NULL | |
| value_usd | numeric(14,2) NOT NULL | CHECK >= 0 |
| created_at | timestamptz default now() | |
| | | UNIQUE (asset_id, date): una valuación por activo por día |

La "curva histórica" del dashboard se calcula agrupando valuations por mes (última de cada mes por activo) contra el acumulado de contributions a esa fecha. Decisión documentada: NO se materializan snapshots (ver ADR-002).

Los activos con coingecko_id no requieren valuación manual: su valor = SUM(quantity) × precio API en vivo.

### debts
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila |
| creditor | text NOT NULL | ej: "Papá" |
| original_amount_usd | numeric(14,2) NOT NULL | |
| start_date | date NOT NULL | |
| created_at | timestamptz default now() | |

### debt_payments
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| debt_id | uuid FK → debts | NOT NULL |
| date | date NOT NULL | |
| amount_usd | numeric(14,2) NOT NULL | CHECK > 0 |
| mep_rate | numeric(10,2) | nullable; tipo de cambio congelado del día del pago. Los pagos sin mep_rate quedan fuera del cálculo del líquido |
| created_at | timestamptz default now() | |

Saldo de una deuda = original_amount_usd − SUM(payments). Calculado, nunca almacenado.

### liquid_reconciliations
Historial de reconciliaciones del dinero líquido: el usuario declara su líquido real (efectivo + cuentas, en ARS); la app calcula la diferencia contra lo esperado y la registra como una transaction de ajuste (categoría "Ajuste de saldo") enlazada acá.
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | NOT NULL, default auth.uid(); dueño de la fila (tabla raíz, RLS "own rows") |
| date | date NOT NULL | |
| declared_amount_ars | numeric(14,2) NOT NULL | CHECK >= 0; el líquido real declarado |
| adjustment_transaction_id | uuid FK → transactions | nullable; la transaction de ajuste generada (null si no hubo diferencia) |
| created_at | timestamptz default now() | |

### settings
Una fila por usuario (la crea el trigger de sembrado al registrarse).
| Campo | Tipo | Notas |
|---|---|---|
| user_id | uuid PK, FK → auth.users | una fila por usuario; default auth.uid() |
| desired_monthly_income_usd | numeric(10,2) | default 1500 |
| safe_withdrawal_rate | numeric(5,4) | default 0.04 |
| expected_annual_return | numeric(5,4) | default 0.08 |
| birth_date | date | para calcular edad en proyecciones |
| plan_start_date | date | |
| projection_window_months | int | default 6 |
| target_allocation | jsonb | ej: {"crypto":15,"cedear":65,"bond":10,"fund":10,"cash":0}; % por tipo, debe sumar 100 (validado en la app) |
| rebalance_threshold | numeric(5,4) | default 0.05; desvío que dispara alerta |
| updated_at | timestamptz default now() | |

Justificación de target_allocation como JSONB y no tabla: son 5 valores que se leen y escriben siempre juntos como una unidad de configuración; una tabla aparte agregaría joins sin beneficio. Si en el futuro la asignación necesitara historia propia, se migra a tabla.

## Fórmulas (referencia para implementación)

- Objetivo FIRE (USD) = desired_monthly_income_usd × 12 / safe_withdrawal_rate.
- Valor del portafolio = SUM(valor actual de cada activo activo). Valor actual: última valuación (activos manuales), SUM(quantity) × precio vivo (cripto con coingecko_id), o lo aportado (efectivo). No existe un "patrimonio total" que sume líquido + portafolio: son magnitudes separadas (ver FUNCTIONAL.md).
- Dinero líquido (ARS) = SUM(ingresos) − SUM(gastos) − SUM(aportes con affects_liquid × su mep_rate) − SUM(pagos de deuda con mep_rate × su mep_rate). Acumulado general, no mensual; los ajustes de reconciliación son transactions comunes, así que ya están incluidos en la suma.
- Ganancia por activo = valor actual − SUM(contributions del activo). % = ganancia / aportado.
- Tasa de ahorro (mes) = (ingresos − gastos) / ingresos [todo ARS, de transactions].
- % invertido (mes) = SUM(amount_usd × mep_rate de cada aporte del mes) / ingresos ARS del mes.
- Proyección FIRE: aporte mensual promedio de los últimos projection_window_months, capital actual, expected_annual_return mensualizado → NPER de interés compuesto hasta el objetivo.
- Pagos de deuda: excluidos de tasa de ahorro y % invertido; se reportan aparte.

## Seguridad y privacidad

- Credenciales de Supabase en .env (nunca en el repo).
- Datos reales solo en Supabase. El repo no contiene datos financieros.
- Multiusuario con Supabase Auth (email + contraseña). Registro semi-cerrado: las cuentas las crea el administrador; no hay signup público.
- RLS habilitado en todas las tablas con políticas de aislamiento por usuario (migración 0005, reemplazan a las "authenticated full access" de la 0002; liquid_reconciliations nace con la suya en la 0009): "own rows" en las tablas raíz (user_id = auth.uid()) y "own via asset" / "own via debt" en las hijas, que heredan el dueño vía su tabla raíz.
- Trigger handle_new_user (migración 0007, redefinido en 0010): al crearse un usuario en auth.users, siembra sus categorías iniciales — incluidas "Ajuste de saldo" (expense e income), que usa la reconciliación del líquido — y su fila de settings. Para usuarios anteriores a la 0010, las categorías de ajuste se siembran con supabase/seeds/adjustment_categories.sql.

## Decisiones registradas (ADRs en docs/adr/)

- ADR-001: Supabase en lugar de Google Sheets como backend.
- ADR-002: No materializar snapshots mensuales; la historia se calcula desde asset_valuations.
- ADR-003: target_allocation como JSONB en settings, no tabla propia.
- ADR-004: migración temprana a multiusuario con aislamiento a nivel base de datos.
