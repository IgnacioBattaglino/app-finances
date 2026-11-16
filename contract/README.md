# Contrato entre la base y las apps

La única puerta de las apps al dinero: funciones, vistas y unas pocas tablas. Las sumas y las reglas las hace la base; las apps muestran lo que devuelve y cargan datos. Decisión y motivos en `docs/arquitectura-nativa.md` §3 y ADR-023.

**Regla:** nunca se cambia la forma de algo de esta lista de manera incompatible. Agregar una columna al final, sí. Renombrar, sacar o cambiar un tipo, no: se crea `<nombre>_v2` y la vieja se borra cuando ninguna versión en uso la llame. Un iPhone puede quedarse semanas con una versión vieja de la app.

Actualizado: 2026-11-16. Lo marcado **(sin aplicar)** existe como migración en el repo y todavía no está en la base.

## Lo que usa la app de iOS

| Pantalla | Lee | Escribe |
|---|---|---|
| Entrada | Auth (email y contraseña) | — |
| Toda la app | `liquid_accounts`, `categories`; `app_config` **(sin aplicar, 0063)** | — |
| Cargar gasto o ingreso | `get_top_categories` | `transactions` (insert con `id` del teléfono y `captured_at`, `on_conflict=id` ignorando duplicados: contrato de la 0060); `categories` (alta) |
| Editar o borrar un movimiento | — | `transactions` (update, delete) |
| Inicio | `get_liquid_summary`, `get_period_totals` | — |
| Movimientos | `get_period_totals`, `get_expenses_by_category`; `transactions`, `contributions`, `debt_payments` (filas del período) | — |
| Mi dinero | `get_liquid_summary`, `get_liquid_by_account`, `transactions` de una cuenta | `create_account_transfer`; `liquid_accounts` (alta, nombre, orden, borrar u ocultar) |
| Contar disponible | `get_reconciliation_preview` **(sin aplicar, 0064)** | `reconcile_liquid`, `delete_reconciliation` |
| A pagar: vencimientos | `get_commitment_occurrences`, `get_commitment_status` **(sin aplicar, 0062)**; `commitments`, `payment_cards` | `confirm_commitment_charge`; `commitment_charges` (saltear y deshacer); `commitments` (alta, terminar, reabrir); `payment_cards` (alta) |
| A pagar: deudas | `debts`, `debt_balances`, `debt_payments`, `get_usd_rate` | `save_debt`; `debt_payments` (alta, borrar); `debts` (borrar) |
| Inversiones | `get_portfolio_series`, `asset_types`, `assets` | — |
| Ajustes | — | `categories` (nombre, orden, borrar u ocultar); `delete_my_account` **(sin aplicar, 0063)** |

## Lo que la app todavía calcula y debería dejar de calcular

Cada punto es una regla que hoy está copiada en Swift porque la base no la devuelve. Están todas en un solo lugar cada una, con su comentario.

- **El monto de un aporte o de un pago de deuda en la moneda de su cuenta** (`amountInAccountCurrency`, `Models.swift`): para mostrar una fila de la lista. Es la misma regla que `get_liquid_by_account`. Se va cuando la lista de Movimientos venga armada de la base (paso 6 de la mudanza).
- **Juntar las dos patas de una transferencia en una línea** (`MovementsModel.items`): por `transfer_id`. Los repartos de un conteo todavía se ven como dos filas sueltas; juntarlos es justo la parte difícil (paso 6).
- **Qué movimiento es "dinero que cambió de lugar"** (`Transaction.isMovedMoney`): solo decide el color de una fila. La definición es la vista `transaction_movement_types`.
- **La ganancia del período en Inversiones** (`InvestmentsView`): valor final − valor inicial − lo aportado en el medio, con los dos números de `get_portfolio_series`. La fórmula definitiva es la del informe pendiente (ADR-028).
- **El porcentaje usado del límite de una tarjeta** (`CardDetailView`): suma de `remaining_amount` de sus compras sobre el límite, dicho como estimación (ADR-031).

## Respuestas de muestra

`ios/EnCuentaTests/Fixtures/*.json` son respuestas reales de las funciones de la 0062, generadas contra Postgres por `src/lib/commitmentOccurrencesSql.test.js` (`WRITE_FIXTURES=1`). Los tests de Swift las decodifican con sus tipos: si la forma de una función cambia, falla el test de la app en el mismo cambio. Las demás formas están como muestras escritas a mano en `ios/EnCuentaTests/ContractTests.swift`.

**Falta** (de `docs/arquitectura-nativa.md` §3): la foto del contrato entero en `contract/schema.json` regenerada por el CI, y muestras generadas para todas las funciones, no solo las de la 0062.
