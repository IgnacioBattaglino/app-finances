import { describe, it, expect } from 'vitest'
import {
  parseAmountInput,
  deriveUsdFromPesos,
  derivePesosFromUsd,
  deriveRateFromPair,
  applyRateChoice,
} from './ExchangeRateField.jsx'

describe('parseAmountInput', () => {
  it('acepta coma o punto decimal', () => {
    expect(parseAmountInput('1500,5')).toBe(1500.5)
    expect(parseAmountInput('1500.5')).toBe(1500.5)
  })

  it('acepta números, no solo texto de input', () => {
    expect(parseAmountInput(1500)).toBe(1500)
  })

  it('vacío, basura y cero son "todavía nada"', () => {
    expect(parseAmountInput('')).toBe(null)
    expect(parseAmountInput('  ')).toBe(null)
    expect(parseAmountInput('abc')).toBe(null)
    expect(parseAmountInput('0')).toBe(null)
    expect(parseAmountInput(null)).toBe(null)
    expect(parseAmountInput(undefined)).toBe(null)
  })
})

describe('deriveUsdFromPesos (dirección pesos → dólares)', () => {
  it('divide por el tipo de cambio y redondea a centavos', () => {
    expect(deriveUsdFromPesos('150000', 1500)).toBe(100)
    expect(deriveUsdFromPesos('150000', 1480)).toBe(101.35)
  })

  it('acepta coma decimal', () => {
    expect(deriveUsdFromPesos('150000,5', 1500)).toBe(100)
  })

  it('no deriva nada sin pesos o sin tipo de cambio', () => {
    expect(deriveUsdFromPesos('', 1500)).toBe(null)
    expect(deriveUsdFromPesos('150000', null)).toBe(null)
    expect(deriveUsdFromPesos('150000', 0)).toBe(null)
  })
})

describe('derivePesosFromUsd (dirección dólares → pesos)', () => {
  it('multiplica por el tipo de cambio y redondea a centavos', () => {
    expect(derivePesosFromUsd('100', 1500)).toBe(150000)
    expect(derivePesosFromUsd('101,35', 1480)).toBe(149998)
  })

  it('no deriva nada sin monto o sin tipo de cambio', () => {
    expect(derivePesosFromUsd('', 1500)).toBe(null)
    expect(derivePesosFromUsd('100', null)).toBe(null)
  })
})

describe('las dos direcciones son consistentes entre sí', () => {
  it('ida y vuelta con una tasa exacta devuelve el mismo monto', () => {
    const usd = deriveUsdFromPesos('150000', 1500)
    expect(derivePesosFromUsd(String(usd), 1500)).toBe(150000)
  })
})

describe('deriveRateFromPair (el par de montos define la tasa)', () => {
  it('es pesos ÷ dólares, sin importar si coincide con el MEP', () => {
    expect(deriveRateFromPair('150000', 100)).toBe(1500)
    expect(deriveRateFromPair('150000', '120')).toBe(1250)
  })

  it('no deriva nada si falta alguno de los dos', () => {
    expect(deriveRateFromPair('150000', 0)).toBe(null)
    expect(deriveRateFromPair('', 100)).toBe(null)
  })
})

// El caso de la pregunta "cambiaste el tipo de cambio, ¿cuál monto está
// bien?": el elegido queda intacto y el otro se recalcula con la tasa nueva.
describe('applyRateChoice (recálculo tras elegir qué monto vale)', () => {
  const base = { pesos: '150000', dolares: '100' } // par cuadrado a 1500

  it('eligiendo los pesos, recalcula los dólares con la tasa nueva', () => {
    expect(applyRateChoice({ ...base, rate: 1200, keep: 'pesos' })).toEqual({
      pesos: '150000',
      dolares: '125',
    })
  })

  it('eligiendo los dólares, recalcula los pesos con la tasa nueva', () => {
    expect(applyRateChoice({ ...base, rate: 1200, keep: 'dolares' })).toEqual({
      pesos: '120000',
      dolares: '100',
    })
  })

  it('el monto elegido se devuelve tal cual lo escribió el usuario', () => {
    expect(applyRateChoice({ pesos: '150000,50', dolares: '100', rate: 1500, keep: 'pesos' })).toEqual(
      { pesos: '150000,50', dolares: '100' },
    )
  })

  it('el monto recalculado sale en el idioma numérico de los inputs (coma, sin miles)', () => {
    expect(applyRateChoice({ pesos: '150000', dolares: '100', rate: 1480, keep: 'pesos' })).toEqual({
      pesos: '150000',
      dolares: '101,35',
    })
  })

  it('flipear entre las dos opciones desde el mismo par no acumula redondeo', () => {
    const snapshot = { pesos: '150000', dolares: '100' }
    const first = applyRateChoice({ ...snapshot, rate: 1480, keep: 'pesos' })
    const second = applyRateChoice({ ...snapshot, rate: 1480, keep: 'dolares' })
    const back = applyRateChoice({ ...snapshot, rate: 1480, keep: 'pesos' })
    expect(first).not.toEqual(second)
    expect(back).toEqual(first)
  })

  it('sin tasa usable deja vacío el monto que habría que recalcular', () => {
    expect(applyRateChoice({ ...base, rate: null, keep: 'pesos' })).toEqual({
      pesos: '150000',
      dolares: '',
    })
  })

  it('con un solo monto cargado, la elección igual completa el otro', () => {
    expect(applyRateChoice({ pesos: '150000', dolares: '', rate: 1500, keep: 'pesos' })).toEqual({
      pesos: '150000',
      dolares: '100',
    })
  })
})
