import { describe, it, expect } from 'vitest'
import { formatARS, formatUSD, splitMoney } from './format.js'

// splitMoney es la base del componente Money: si parte mal un monto, el número
// que se ve en pantalla queda mal escrito (símbolo pegado, decimales del
// tamaño del entero). Se prueba contra la salida real de Intl, no contra
// literales inventados, porque es exactamente lo que va a recibir.
describe('splitMoney', () => {
  it('separa símbolo, entero y decimales de un monto en pesos', () => {
    expect(splitMoney(formatARS(556218.57))).toEqual({
      sign: '',
      symbol: '$',
      integer: '556.218',
      decimals: ',57',
    })
  })

  it('separa el símbolo de dos caracteres de los dólares', () => {
    expect(splitMoney(formatUSD(1095.49))).toEqual({
      sign: '',
      symbol: 'US$',
      integer: '1.095',
      decimals: ',49',
    })
  })

  it('sin decimales deja la parte decimal vacía', () => {
    expect(splitMoney(formatUSD(400))).toEqual({
      sign: '',
      symbol: 'US$',
      integer: '400',
      decimals: '',
    })
  })

  it('un solo decimal se conserva tal cual (no se rellena con ceros)', () => {
    expect(splitMoney(formatARS(1234567.8)).decimals).toBe(',8')
  })

  it('un monto negativo saca el signo del símbolo y lo normaliza a −', () => {
    expect(splitMoney(formatUSD(-430.2))).toEqual({
      sign: '−',
      symbol: 'US$',
      integer: '430',
      decimals: ',2',
    })
  })

  it('un texto sin cifras no rompe', () => {
    expect(splitMoney('—')).toEqual({ sign: '', symbol: '—', integer: '', decimals: '' })
  })
})
