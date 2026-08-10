import { describe, it, expect } from 'vitest'
import {
  debtBalance,
  totalPaid,
  isSettled,
  payoffProgress,
  summarizeDebts,
} from './debts.js'

const debt = (original, payments = []) => ({
  id: 'd1',
  creditor: 'Alguien',
  original_amount_usd: original,
  start_date: '2025-01-01',
  payments: payments.map((amount_usd, i) => ({ id: `p${i}`, amount_usd })),
})

describe('debtBalance', () => {
  it('sin pagos → debe el monto original completo', () => {
    expect(debtBalance(debt(1000))).toBe(1000)
  })

  it('con pagos parciales → original menos lo pagado', () => {
    expect(debtBalance(debt(1000, [300, 200]))).toBe(500)
  })

  it('pagos que cubren el total exacto → 0', () => {
    expect(debtBalance(debt(1000, [1000]))).toBe(0)
  })

  it('pagar de más no genera saldo negativo: la deuda queda saldada, no a favor', () => {
    expect(debtBalance(debt(1000, [1200]))).toBe(0)
  })

  it('payments ausente (deuda recién creada) no rompe', () => {
    expect(debtBalance({ original_amount_usd: 500 })).toBe(500)
  })

  it('numeric de Supabase como string: resta, no concatena', () => {
    expect(debtBalance(debt('1000.50', ['200.25']))).toBe(800.25)
  })

  it('decimales: no arrastra ruido de punto flotante', () => {
    expect(debtBalance(debt(1000, [333.33, 333.33, 333.33]))).toBe(0.01)
  })
})

describe('totalPaid', () => {
  it('suma todos los pagos sin importar si afectaron el líquido', () => {
    // affects_liquid decide si el pago tocó los pesos, NO si bajó la deuda:
    // pagar con dólares del colchón baja la deuda igual.
    const d = {
      original_amount_usd: 1000,
      payments: [
        { amount_usd: 100, affects_liquid: true },
        { amount_usd: 200, affects_liquid: false },
      ],
    }
    expect(totalPaid(d)).toBe(300)
    expect(debtBalance(d)).toBe(700)
  })
})

describe('isSettled', () => {
  it('con saldo pendiente → no está saldada', () => {
    expect(isSettled(debt(1000, [999]))).toBe(false)
  })

  it('sin saldo → saldada', () => {
    expect(isSettled(debt(1000, [1000]))).toBe(true)
  })
})

describe('payoffProgress', () => {
  it('sin pagos → 0', () => {
    expect(payoffProgress(debt(1000))).toBe(0)
  })

  it('mitad pagada → 0,5', () => {
    expect(payoffProgress(debt(1000, [500]))).toBe(0.5)
  })

  it('pagada de más → se corta en 1, la barra nunca se pasa', () => {
    expect(payoffProgress(debt(1000, [1500]))).toBe(1)
  })
})

describe('summarizeDebts', () => {
  it('separa activas de saldadas y suma solo el saldo de las activas', () => {
    const debts = [debt(1000, [200]), debt(500, [500]), debt(300)]
    const s = summarizeDebts(debts)
    expect(s.active).toHaveLength(2)
    expect(s.settled).toHaveLength(1)
    // 800 (de la primera) + 300 (de la tercera); la saldada no suma nada
    expect(s.totalBalance).toBe(1100)
    expect(s.totalOriginal).toBe(1800)
    expect(s.totalPaid).toBe(700)
  })

  it('sin deudas → todo en cero, sin NaN', () => {
    const s = summarizeDebts([])
    expect(s.totalBalance).toBe(0)
    expect(s.totalOriginal).toBe(0)
    expect(s.active).toEqual([])
    expect(s.settled).toEqual([])
  })

  it('todas saldadas → saldo total 0 pero el original se sigue reportando', () => {
    const s = summarizeDebts([debt(1000, [1000])])
    expect(s.totalBalance).toBe(0)
    expect(s.totalOriginal).toBe(1000)
  })
})
