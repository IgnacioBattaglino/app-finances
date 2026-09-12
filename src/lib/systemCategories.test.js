import { describe, it, expect } from 'vitest'
import {
  movementType,
  isMovedMoneyType,
  isMovedMoney,
  isBalanceAdjustment,
  EXPENSE,
  INCOME,
  BALANCE_ADJUSTMENT,
  RECONCILIATION_SPLIT,
  ACCOUNT_TRANSFER,
  SAVINGS_MOVEMENT,
  CONTRIBUTION,
} from './systemCategories.js'

// Los siete tipos de docs/ux/movimientos.md, sección 3.1 — uno por fila de esa
// tabla, en el mismo orden.
describe('movementType', () => {
  it('un gasto o un ingreso de categoría de usuario', () => {
    expect(movementType({ kind: 'expense', category: { system_key: null } })).toBe(EXPENSE)
    expect(movementType({ kind: 'income', category: { system_key: null } })).toBe(INCOME)
  })

  it('sin categoría (una consulta que no la trajo) cae al kind, no revienta', () => {
    expect(movementType({ kind: 'expense' })).toBe(EXPENSE)
  })

  it('el ajuste de saldo es su propio tipo, sin importar el kind', () => {
    const category = { system_key: 'balance_adjustment' }
    expect(movementType({ kind: 'expense', category })).toBe(BALANCE_ADJUSTMENT)
    expect(movementType({ kind: 'income', category })).toBe(BALANCE_ADJUSTMENT)
  })

  it('el reparto de un conteo: categoría account_transfer, sin transfer_id', () => {
    const row = { kind: 'income', transfer_id: null, category: { system_key: 'account_transfer' } }
    expect(movementType(row)).toBe(RECONCILIATION_SPLIT)
  })

  it('una transferencia entre cuentas: la misma categoría, CON transfer_id', () => {
    const row = { kind: 'expense', transfer_id: 'xfer-1', category: { system_key: 'account_transfer' } }
    expect(movementType(row)).toBe(ACCOUNT_TRANSFER)
  })

  it('una fila vieja (pre-0041) con transfer_id sigue siendo transferencia aunque la categoría diga savings_movement', () => {
    const row = { kind: 'income', transfer_id: 'xfer-2', category: { system_key: 'savings_movement' } }
    expect(movementType(row)).toBe(ACCOUNT_TRANSFER)
  })

  it('un movimiento de ahorro "de afuera": savings_movement sin transfer_id', () => {
    const row = { kind: 'income', transfer_id: null, category: { system_key: 'savings_movement' } }
    expect(movementType(row)).toBe(SAVINGS_MOVEMENT)
  })

  it('una inversión o un retiro: cualquier fila de contributions, por su `direction`', () => {
    expect(movementType({ direction: 'in', amount_usd: 100 })).toBe(CONTRIBUTION)
    expect(movementType({ direction: 'out', amount_usd: 50 })).toBe(CONTRIBUTION)
  })
})

describe('isMovedMoneyType', () => {
  it('solo el reparto, la transferencia y el ahorro "de afuera" son plata que cambió de lugar', () => {
    expect(isMovedMoneyType(RECONCILIATION_SPLIT)).toBe(true)
    expect(isMovedMoneyType(ACCOUNT_TRANSFER)).toBe(true)
    expect(isMovedMoneyType(SAVINGS_MOVEMENT)).toBe(true)
    expect(isMovedMoneyType(EXPENSE)).toBe(false)
    expect(isMovedMoneyType(INCOME)).toBe(false)
    expect(isMovedMoneyType(BALANCE_ADJUSTMENT)).toBe(false)
    expect(isMovedMoneyType(CONTRIBUTION)).toBe(false)
  })
})

// isMovedMoney/isBalanceAdjustment no cambiaron de firma (siguen recibiendo
// solo la categoría): movementType las usa como bloques, no las reemplaza.
describe('isMovedMoney / isBalanceAdjustment (sin cambios)', () => {
  it('siguen mirando category.system_key a secas', () => {
    expect(isMovedMoney({ system_key: 'account_transfer' })).toBe(true)
    expect(isMovedMoney({ system_key: 'savings_movement' })).toBe(true)
    expect(isMovedMoney({ system_key: 'balance_adjustment' })).toBe(false)
    expect(isBalanceAdjustment({ system_key: 'balance_adjustment' })).toBe(true)
  })
})
