import { describe, it, expect } from 'vitest'
import { currencyLines, hasAmount, amountInCurrency, LOCAL_CURRENCY } from './currencyTotals.js'

describe('currencyLines', () => {
  // El requisito que ordena todo el cambio: con datos solo en pesos, todo
  // tiene que dar y verse exactamente igual que antes. Una sola línea, en
  // pesos, es "igual que antes".
  it('una sola moneda → una sola línea', () => {
    expect(currencyLines(new Map([['ARS', 506213.43]]))).toEqual([
      { currency: 'ARS', amount: 506213.43 },
    ])
  })

  it('sin nada → el cero local, no una lista vacía', () => {
    expect(currencyLines(new Map())).toEqual([{ currency: 'ARS', amount: 0 }])
  })

  it('la moneda extranjera en cero no se muestra: es el caso normal', () => {
    expect(
      currencyLines(
        new Map([
          ['ARS', 100000],
          ['USD', 0],
        ]),
      ),
    ).toEqual([{ currency: 'ARS', amount: 100000 }])
  })

  it('menos de medio centavo también es cero', () => {
    expect(
      currencyLines(
        new Map([
          ['ARS', 100000],
          ['USD', 0.004],
        ]),
      ),
    ).toEqual([{ currency: 'ARS', amount: 100000 }])
  })

  it('con saldo en las dos, las dos, la local primero', () => {
    expect(
      currencyLines(
        new Map([
          ['USD', 1240],
          ['ARS', 506213.43],
        ]),
      ),
    ).toEqual([
      { currency: 'ARS', amount: 506213.43 },
      { currency: 'USD', amount: 1240 },
    ])
  })

  it('todo en dólares → no se agrega un "$ 0" que nadie pidió', () => {
    expect(
      currencyLines(
        new Map([
          ['ARS', 0],
          ['USD', 1240],
        ]),
      ),
    ).toEqual([{ currency: 'USD', amount: 1240 }])
  })

  it('un saldo negativo sí se muestra: cero no es lo mismo que en rojo', () => {
    expect(currencyLines(new Map([['USD', -50]]))).toEqual([{ currency: 'USD', amount: -50 }])
  })

  it('el orden es estable y no depende del monto', () => {
    const lines = currencyLines(
      new Map([
        ['USD', 5],
        ['ARS', 1],
        ['EUR', 999999],
      ]),
    )
    expect(lines.map((l) => l.currency)).toEqual(['ARS', 'EUR', 'USD'])
  })

  it('redondea a dos decimales, como cualquier monto de la app', () => {
    expect(currencyLines(new Map([['ARS', 10.005]]))[0].amount).toBeCloseTo(10.01, 2)
  })
})

describe('hasAmount', () => {
  it('solo el cero local es "nada"', () => {
    expect(hasAmount(currencyLines(new Map()))).toBe(false)
    expect(hasAmount(currencyLines(new Map([['ARS', 0]])))).toBe(false)
    expect(hasAmount(currencyLines(new Map([['USD', 12]])))).toBe(true)
  })
})

describe('amountInCurrency', () => {
  // La regla que replica la migración 0039 y que el test de paridad verifica
  // contra Postgres de verdad.
  it('a una cuenta en la moneda local: convierte con la tasa congelada', () => {
    expect(amountInCurrency(100, 1200, LOCAL_CURRENCY)).toBe(120000)
  })

  it('a una cuenta en dólares: entra tal cual, no convirtió nada', () => {
    expect(amountInCurrency(100, 1200, 'USD')).toBe(100)
  })

  it('sin tasa vale 0 en la moneda local, y el monto entero en dólares', () => {
    // Number(null) es 0: no se inventa la cotización de hoy para una
    // operación vieja. Pero a una cuenta en dólares nunca hizo falta ninguna.
    expect(amountInCurrency(100, Number(null), LOCAL_CURRENCY)).toBe(0)
    expect(amountInCurrency(100, Number(null), 'USD')).toBe(100)
  })
})
