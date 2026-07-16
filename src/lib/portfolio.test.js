import { describe, it, expect } from 'vitest'
import { computeContributed, decomposeWithdrawal } from './portfolio.js'

describe('decomposeWithdrawal', () => {
  it('retiro parcial: no excede el aportado ni vacía el activo → resta directo, sin ganancia', () => {
    expect(
      decomposeWithdrawal({ contributedBefore: 500, amount: 200, emptiesAsset: false })
        .realizedGain,
    ).toBe(0)
  })

  it('retiro con ganancia realizada: excede el aportado → el excedente se cristaliza', () => {
    expect(
      decomposeWithdrawal({ contributedBefore: 500, amount: 600, emptiesAsset: false })
        .realizedGain,
    ).toBe(100)
  })

  it('retiro en pérdida que vacía el activo: no excede el aportado pero el usuario declara que vendió todo → pérdida realizada', () => {
    expect(
      decomposeWithdrawal({ contributedBefore: 500, amount: 400, emptiesAsset: true })
        .realizedGain,
    ).toBe(-100)
  })

  it('retiro sobre aportado 0 ("plata de la casa"): todo el monto es ganancia realizada', () => {
    expect(
      decomposeWithdrawal({ contributedBefore: 0, amount: 200, emptiesAsset: false }).realizedGain,
    ).toBe(200)
  })
})

describe('computeContributed', () => {
  it('aporte posterior a un retiro clampeado: el agregado coincide con el fold cronológico', () => {
    // aportaste 500, retirás 600 (realized_gain=100 ya congelado), después aportás 50 → aportado 50, no 0.
    const contributions = [
      { amount_usd: 500, direction: 'in' },
      { amount_usd: 600, direction: 'out', realized_gain: 100 },
      { amount_usd: 50, direction: 'in' },
    ]
    expect(computeContributed(contributions)).toBe(50)
  })

  it('retiro en pérdida que vacía el activo dentro del agregado: el aportado queda en 0, no en positivo', () => {
    const contributions = [
      { amount_usd: 500, direction: 'in' },
      { amount_usd: 400, direction: 'out', realized_gain: -100 },
    ]
    expect(computeContributed(contributions)).toBe(0)
  })

  it('secuencia completa: aporte → retiro con ganancia → retiro sobre aportado 0 → aportado final 0', () => {
    // aporte 500 → retiro 600 (aportado 500→0, rg=100) → retiro 100 sobre
    // aportado 0 ("plata de la casa", rg=100) → aportado final 0.
    const contributions = [
      { amount_usd: 500, direction: 'in' },
      { amount_usd: 600, direction: 'out', realized_gain: 100 },
      { amount_usd: 100, direction: 'out', realized_gain: 100 },
    ]
    expect(computeContributed(contributions)).toBe(0)
  })
})
