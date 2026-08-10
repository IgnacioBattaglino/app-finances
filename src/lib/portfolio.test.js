import { describe, it, expect } from 'vitest'
import {
  computeContributed,
  decomposeWithdrawal,
  heldQuantity,
  averagePurchasePrice,
  currentUnitPrice,
  valueAsset,
  classifyOperations,
  mergeAssetHistory,
  totalableAssets,
  computePortfolioValue,
  computePortfolioContributed,
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

describe('currentUnitPrice', () => {
  const live = { id: 'a1', valuation_mode: 'live' }
  const own = [
    { asset_id: 'a1', direction: 'in', amount_usd: 100, quantity: 2 },
    { asset_id: 'a1', direction: 'in', amount_usd: 100, quantity: 3 },
  ]

  it('es el precio de UNA unidad, no el valor total de la tenencia', () => {
    // 5 unidades valuadas en 1000 → 200 la unidad (comparable con el promedio
    // de compra, que sobre estos aportes da 40)
    expect(currentUnitPrice(live, own, { value: 1000, contributed: 200 })).toBe(200)
    expect(averagePurchasePrice(own)).toBe(40)
  })

  it('sirve igual cuando el valor viene de una valuación manual vieja (stale)', () => {
    expect(currentUnitPrice(live, own, { value: 500, source: 'stale' })).toBe(100)
  })

  it('sin valuación, sin tenencia, o activo que no maneja cantidad → null', () => {
    expect(currentUnitPrice(live, own, { value: null })).toBe(null)
    expect(currentUnitPrice(live, [], { value: 1000 })).toBe(null)
    expect(currentUnitPrice({ id: 'a1', valuation_mode: 'manual' }, own, { value: 1000 })).toBe(null)
  })

  it('con precio de mercado resuelto lo usa tal cual, sin dividir por la tenencia', () => {
    // Un aporte de 5 un. a 200 y el precio de hoy en 250: el precio es 250,
    // no 1250/5. Que coincidan sería casualidad del ejemplo, así que el valor
    // se pone deliberadamente desalineado con value.
    expect(currentUnitPrice(live, own, { value: 9999, unitPrice: 250 })).toBe(250)
  })

  it('muestra el precio de mercado aunque no tengas NI UNA unidad', () => {
    // El caso que motivó el cambio: activo en vivo recién creado, sin aportes.
    // El precio del instrumento existe igual; antes acá salía null → "—".
    expect(currentUnitPrice(live, [], { value: 0, unitPrice: 63917.65 })).toBe(63917.65)
  })

  it('un precio de mercado de 0 sigue siendo un precio, no un dato faltante', () => {
    expect(currentUnitPrice(live, [], { value: 0, unitPrice: 0 })).toBe(0)
  })
})

describe('valueAsset — precio unitario en la valuación', () => {
  const live = { id: 'a1', valuation_mode: 'live', coingecko_id: 'bitcoin' }

  it('con precio en vivo lo adjunta como unitPrice, para que no haya que dividir después', () => {
    const own = [{ asset_id: 'a1', direction: 'in', amount_usd: 100, quantity: 2 }]
    const v = valueAsset(live, own, null, { bitcoin: { usd: 500 } })
    expect(v.unitPrice).toBe(500)
    expect(v.value).toBe(1000)
  })

  it('sin tenencia, el valor es 0 pero el precio sigue estando', () => {
    const v = valueAsset(live, [], null, { bitcoin: { usd: 500 } })
    expect(v.value).toBe(0)
    expect(v.unitPrice).toBe(500)
  })

  it('cayendo a una valuación vieja no inventa unitPrice: no hay precio de mercado', () => {
    const own = [{ asset_id: 'a1', direction: 'in', amount_usd: 100, quantity: 2 }]
    const v = valueAsset(live, own, { value_usd: 300, date: '2026-01-01' }, {})
    expect(v.source).toBe('stale')
    expect(v.unitPrice).toBeUndefined()
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

  it('(e) retiro con fecha ANTERIOR a los aportes, con la posición abierta → Retiro', () => {
    // Cargado después pero fechado antes: ordena primero y deja el acumulado
    // en negativo. No cerró ninguna posición — la posición sigue abierta.
    const contributions = [
      { id: 'c1', date: '2024-03-01', direction: 'in', amount_usd: 1000, quantity: 1 },
      {
        id: 'c2',
        date: '2024-01-01',
        direction: 'out',
        amount_usd: 300,
        quantity: 0.3,
        realized_gain: 300,
      },
    ]
    expect(classifyOperations(contributions).c2).toBe('Retiro')
  })

  it('(f) el retiro retroactivo no le roba la etiqueta al que sí cierra la posición', () => {
    const contributions = [
      { id: 'c1', date: '2024-03-01', direction: 'in', amount_usd: 1000, quantity: 1 },
      {
        id: 'c2',
        date: '2024-01-01',
        direction: 'out',
        amount_usd: 300,
        quantity: 0.3,
        realized_gain: 300,
      },
      // deja la tenencia en 0 (−0,3 + 1 − 0,7): esta sí cierra
      {
        id: 'c3',
        date: '2024-05-01',
        direction: 'out',
        amount_usd: 900,
        quantity: 0.7,
        realized_gain: 200,
      },
    ]
    const labels = classifyOperations(contributions)
    expect(labels.c2).toBe('Retiro')
    expect(labels.c3).toBe('Liquidación')
  })

  it('(g) sin cantidades (fold por aportado), un retiro retroactivo tampoco es Liquidación', () => {
    const contributions = [
      { id: 'c1', date: '2024-03-01', direction: 'in', amount_usd: 1000 },
      { id: 'c2', date: '2024-01-01', direction: 'out', amount_usd: 400, realized_gain: 400 },
    ]
    expect(classifyOperations(contributions).c2).toBe('Retiro')
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

  it('filas mixtas qty/no-qty en un activo live: el retiro que zerea la cantidad se marca Liquidación aunque quede tenencia sin cantidad (limitación documentada del invariante)', () => {
    // Al menos una fila con quantity → usesQuantity=true, así que la posición
    // se cuenta por cantidad. La compra sin quantity (c2) no suma a
    // runningQuantity, así que el retiro c3 la lleva a 0 y se marca
    // "Liquidación" aunque c2 haya cargado tenencia real. Ver el comentario
    // de classifyOperations: el invariante es que toda entrada live traiga
    // quantity; este test fija la consecuencia de romperlo.
    const contributions = [
      { id: 'c1', date: '2024-01-01', direction: 'in', amount_usd: 500, quantity: 0.5 },
      { id: 'c2', date: '2024-02-01', direction: 'in', amount_usd: 1000, quantity: null },
      {
        id: 'c3',
        date: '2024-03-01',
        direction: 'out',
        amount_usd: 700,
        quantity: 0.5,
        realized_gain: 0,
      },
    ]
    const labels = classifyOperations(contributions)
    expect(labels.c2).toBe('Aporte')
    expect(labels.c3).toBe('Liquidación')
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

  it('con la misma fecha, la operación va antes que la valuación (desempate estable)', () => {
    const contributions = [{ id: 'c1', date: '2024-02-01' }]
    const valuations = [{ id: 'v1', date: '2024-02-01', value_usd: 100 }]
    const events = mergeAssetHistory({ contributions, valuations, hasMore: false })
    expect(events.map((e) => e.type)).toEqual(['contribution', 'valuation'])
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

// Estos tres salieron de Portfolio.jsx cuando Inicio necesitó el MISMO total
// invertido. El invariante que cuidan es que las dos pantallas muestren el
// mismo número: si alguien cambia el criterio acá, cambia en las dos.
describe('totales del portafolio (compartidos entre Inicio y Portafolio)', () => {
  const bolsaQueSuma = { include_in_total: true }
  const bolsaQueNoSuma = { include_in_total: false }

  it('totalableAssets: solo un include_in_total false explícito excluye', () => {
    const assets = [
      { id: 'a', asset_type: bolsaQueSuma },
      { id: 'b', asset_type: bolsaQueNoSuma },
      { id: 'c', asset_type: {} }, // flag ausente
      { id: 'd' }, // sin bolsa resuelta
    ]
    expect(totalableAssets(assets).map((a) => a.id)).toEqual(['a', 'c', 'd'])
  })

  it('computePortfolioValue: suma los valores y descarta las bolsas excluidas', () => {
    const assets = [
      { id: 'a', asset_type: bolsaQueSuma },
      { id: 'b', asset_type: bolsaQueNoSuma },
    ]
    const valuations = {
      a: { value: 100, contributed: 80 },
      b: { value: 500, contributed: 400 },
    }
    expect(computePortfolioValue(assets, valuations)).toBe(100)
  })

  it('computePortfolioValue: un activo sin valuación (value null) no suma ni resta', () => {
    const assets = [
      { id: 'a', asset_type: bolsaQueSuma },
      { id: 'b', asset_type: bolsaQueSuma },
    ]
    const valuations = {
      a: { value: 100, contributed: 80 },
      b: { value: null, contributed: 400 },
    }
    expect(computePortfolioValue(assets, valuations)).toBe(100)
  })

  it('computePortfolioContributed: cuenta lo aportado aunque el activo no tenga valuación', () => {
    const assets = [
      { id: 'a', asset_type: bolsaQueSuma },
      { id: 'b', asset_type: bolsaQueSuma },
      { id: 'c', asset_type: bolsaQueNoSuma },
    ]
    const valuations = {
      a: { value: 100, contributed: 80 },
      b: { value: null, contributed: 400 }, // sin valuación, pero la plata se puso
      c: { value: 500, contributed: 300 }, // bolsa excluida
    }
    expect(computePortfolioContributed(assets, valuations)).toBe(480)
  })
})
