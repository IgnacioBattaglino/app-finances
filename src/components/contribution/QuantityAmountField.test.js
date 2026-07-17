import { describe, it, expect } from 'vitest'
import { deriveAmountFromQuantity, deriveQuantityFromAmount } from './QuantityAmountField.jsx'

describe('deriveAmountFromQuantity (dirección cantidad → monto)', () => {
  it('deriva el monto multiplicando por el precio unitario', () => {
    expect(deriveAmountFromQuantity('0.001', 65000)).toBe(65)
  })

  it('acepta coma decimal', () => {
    expect(deriveAmountFromQuantity('0,001', 65000)).toBe(65)
  })

  it('no deriva nada si la cantidad está vacía o no es numérica', () => {
    expect(deriveAmountFromQuantity('', 65000)).toBe(null)
    expect(deriveAmountFromQuantity('abc', 65000)).toBe(null)
  })

  it('no deriva nada sin precio unitario', () => {
    expect(deriveAmountFromQuantity('0.001', null)).toBe(null)
  })
})

describe('deriveQuantityFromAmount (dirección monto → cantidad)', () => {
  it('deriva la cantidad dividiendo por el precio unitario', () => {
    expect(deriveQuantityFromAmount('65', 65000)).toBe(0.001)
  })

  it('acepta coma decimal', () => {
    expect(deriveQuantityFromAmount('65', 65000)).toBe(0.001)
  })

  it('no deriva nada si el monto está vacío o no es numérico', () => {
    expect(deriveQuantityFromAmount('', 65000)).toBe(null)
    expect(deriveQuantityFromAmount('abc', 65000)).toBe(null)
  })

  it('no deriva nada sin precio unitario', () => {
    expect(deriveQuantityFromAmount('65', null)).toBe(null)
  })
})
