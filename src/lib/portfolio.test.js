import { describe, it, expect } from 'vitest'
import {
  computeContributed,
  decomposeWithdrawal,
  heldQuantity,
  averagePurchasePrice,
  classifyOperations,
  mergeAssetHistory,
} from './portfolio.js'

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

describe('heldQuantity', () => {
  const asset = { id: 'btc' }

  it('suma aportes y resta retiros del mismo activo', () => {
    const contributions = [
      { asset_id: 'btc', quantity: 0.5, direction: 'in' },
      { asset_id: 'btc', quantity: 0.2, direction: 'out' },
      { asset_id: 'other', quantity: 10, direction: 'in' },
    ]
    expect(heldQuantity(asset, contributions)).toBe(0.3)
  })

  it('ignora filas de otros activos', () => {
    const contributions = [{ asset_id: 'other', quantity: 10, direction: 'in' }]
    expect(heldQuantity(asset, contributions)).toBe(0)
  })

  it('redondea a 8 decimales para no arrastrar ruido de punto flotante', () => {
    const contributions = [
      { asset_id: 'btc', quantity: 0.1, direction: 'in' },
      { asset_id: 'btc', quantity: 0.2, direction: 'in' },
    ]
    expect(heldQuantity(asset, contributions)).toBe(0.3)
  })
})

describe('averagePurchasePrice', () => {
  it('promedio ponderado entre varias compras a distinto precio', () => {
    const contributions = [
      { direction: 'in', amount_usd: 1000, quantity: 0.02 }, // 50000/un.
      { direction: 'in', amount_usd: 600, quantity: 0.01 }, // 60000/un.
    ]
    // (1000+600) / (0.02+0.01)
    expect(averagePurchasePrice(contributions)).toBeCloseTo(53333.33, 2)
  })

  it('un retiro en el medio no altera el promedio', () => {
    const contributions = [
      { direction: 'in', amount_usd: 1000, quantity: 0.02 },
      { direction: 'in', amount_usd: 600, quantity: 0.01 },
      { direction: 'out', amount_usd: 500, quantity: 0.005 },
    ]
    expect(averagePurchasePrice(contributions)).toBeCloseTo(53333.33, 2)
  })

  it('una pata de entrada de transferencia sí altera el promedio, igual que un aporte', () => {
    const contributions = [
      { direction: 'in', amount_usd: 1000, quantity: 0.02 },
      { direction: 'in', amount_usd: 600, quantity: 0.01 },
      { direction: 'in', amount_usd: 300, quantity: 0.005, transfer_id: 'tx1' },
    ]
    // (1000+600+300) / (0.02+0.01+0.005)
    expect(averagePurchasePrice(contributions)).toBeCloseTo(54285.71, 2)
  })

  it('sin ninguna entrada con cantidad → null', () => {
    expect(averagePurchasePrice([{ direction: 'out', amount_usd: 500, quantity: 0.01 }])).toBe(
      null,
    )
    expect(averagePurchasePrice([{ direction: 'in', amount_usd: 500, quantity: null }])).toBe(null)
    expect(averagePurchasePrice([])).toBe(null)
  })
})

describe('classifyOperations', () => {
  it('(a) retiro parcial que ya excede el aportado (realized_gain≠0) pero deja cantidad abierta → Retiro', () => {
    const contributions = [
      { id: 'c1', date: '2024-01-01', direction: 'in', amount_usd: 1000, quantity: 1 },
      {
        id: 'c2',
        date: '2024-02-01',
        direction: 'out',
        amount_usd: 2500,
        quantity: 0.5,
        realized_gain: 1500,
      },
    ]
    expect(classifyOperations(contributions).c2).toBe('Retiro')
  })

  it('(b) el retiro siguiente que deja la cantidad en 0 → Liquidación', () => {
    const contributions = [
      { id: 'c1', date: '2024-01-01', direction: 'in', amount_usd: 1000, quantity: 1 },
      {
        id: 'c2',
        date: '2024-02-01',
        direction: 'out',
        amount_usd: 2500,
        quantity: 0.5,
        realized_gain: 1500,
      },
      {
        id: 'c3',
        date: '2024-03-01',
        direction: 'out',
        amount_usd: 1300,
        quantity: 0.5,
        realized_gain: 1300,
      },
    ]
    const labels = classifyOperations(contributions)
    expect(labels.c2).toBe('Retiro')
    expect(labels.c3).toBe('Liquidación')
  })

  it('(c) dos retiros después de agotado el capital: el primero no vacía (Retiro), el último sí (Liquidación)', () => {
    const contributions = [
      { id: 'c1', date: '2024-01-01', direction: 'in', amount_usd: 1000, quantity: 1 },
      // agota el aportado (contributedBefore 1000 < amount 2500) pero deja 0.5 abierto
      {
        id: 'c2',
        date: '2024-02-01',
        direction: 'out',
        amount_usd: 2500,
        quantity: 0.5,
        realized_gain: 1500,
      },
      // parcial sobre una posición ya "sin capital": realized_gain≠0 de nuevo, pero no vacía
      {
        id: 'c3',
        date: '2024-03-01',
        direction: 'out',
        amount_usd: 600,
        quantity: 0.2,
        realized_gain: 600,
      },
      // vacía la cantidad restante
      {
        id: 'c4',
        date: '2024-04-01',
        direction: 'out',
        amount_usd: 700,
        quantity: 0.3,
        realized_gain: 700,
      },
    ]
    const labels = classifyOperations(contributions)
    expect(labels.c3).toBe('Retiro')
    expect(labels.c4).toBe('Liquidación')
  })

  it('(d) una pata de salida de transferencia que vacía la posición sigue siendo Transferencia enviada', () => {
    const contributions = [
      { id: 'c1', date: '2024-01-01', direction: 'in', amount_usd: 1000, quantity: 1 },
      {
        id: 'c2',
        date: '2024-02-01',
        direction: 'out',
        amount_usd: 1000,
        quantity: 1,
        transfer_id: 'tx1',
        realized_gain: 0,
      },
    ]
    expect(classifyOperations(contributions).c2).toBe('Transferencia enviada')
  })

  it('aportes y transferencia recibida se etiquetan por direction + transfer_id', () => {
    const contributions = [
      { id: 'c1', date: '2024-01-01', direction: 'in', amount_usd: 500, quantity: null },
      { id: 'c2', date: '2024-01-02', direction: 'in', amount_usd: 300, transfer_id: 'tx1' },
    ]
    const labels = classifyOperations(contributions)
    expect(labels.c1).toBe('Aporte')
    expect(labels.c2).toBe('Transferencia recibida')
  })
})

describe('mergeAssetHistory', () => {
  it('una valuación dentro del rango ya cargado entra', () => {
    const contributions = [
      { date: '2024-03-10' },
      { date: '2024-02-05' }, // la más vieja cargada (floor)
    ]
    const valuations = [{ date: '2024-02-20', value_usd: 100 }]
    const events = mergeAssetHistory({ contributions, valuations, hasMore: true })
    expect(events.some((e) => e.type === 'valuation' && e.date === '2024-02-20')).toBe(true)
  })

  it('una valuación más vieja que la última operación cargada no entra mientras haya más por cargar', () => {
    const contributions = [{ date: '2024-03-10' }, { date: '2024-02-05' }]
    const valuations = [{ date: '2024-01-01', value_usd: 100 }]
    const events = mergeAssetHistory({ contributions, valuations, hasMore: true })
    expect(events.some((e) => e.type === 'valuation')).toBe(false)
  })

  it('esa misma valuación entra una vez que no hay más operaciones por cargar', () => {
    const contributions = [{ date: '2024-03-10' }, { date: '2024-02-05' }]
    const valuations = [{ date: '2024-01-01', value_usd: 100 }]
    const events = mergeAssetHistory({ contributions, valuations, hasMore: false })
    expect(events.some((e) => e.type === 'valuation' && e.date === '2024-01-01')).toBe(true)
  })

  it('el orden final es por fecha descendente', () => {
    const contributions = [{ date: '2024-03-10' }, { date: '2024-01-15' }]
    const valuations = [{ date: '2024-02-01', value_usd: 100 }]
    const events = mergeAssetHistory({ contributions, valuations, hasMore: false })
    expect(events.map((e) => e.date)).toEqual(['2024-03-10', '2024-02-01', '2024-01-15'])
  })
})

describe('guard de retiro contra la tenencia (integración con QuantityAmountField)', () => {
  it('un monto que implica más cantidad que la tenencia debe bloquear el retiro', () => {
    const asset = { id: 'btc' }
    const contributions = [{ asset_id: 'btc', quantity: 0.001, direction: 'in' }]
    const held = heldQuantity(asset, contributions)
    const unitPrice = 65000
    // el usuario carga monto (no cantidad): 100 USD a 65000 → deriva 0.00153846 un.
    const derivedQuantity = Math.round((100 / unitPrice) * 1e8) / 1e8
    expect(derivedQuantity).toBeGreaterThan(held)
  })

  it('un monto que implica menos cantidad que la tenencia no bloquea', () => {
    const asset = { id: 'btc' }
    const contributions = [{ asset_id: 'btc', quantity: 0.01, direction: 'in' }]
    const held = heldQuantity(asset, contributions)
    const unitPrice = 65000
    const derivedQuantity = Math.round((10 / unitPrice) * 1e8) / 1e8
    expect(derivedQuantity).toBeLessThan(held)
  })
})
