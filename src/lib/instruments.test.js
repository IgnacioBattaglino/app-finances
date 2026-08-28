import { describe, it, expect } from 'vitest'
import { searchInstruments, instrumentKindLabel } from './instruments.js'

const CATALOG = [
  { id: 'i1', symbol: 'BTCUSDT', name: 'bitcoin', kind: 'crypto', currency: 'USD' },
  { id: 'i2', symbol: 'AL30', name: 'Bonar 2030 (Ley Argentina)', kind: 'bond', currency: 'ARS' },
  { id: 'i3', symbol: 'AAPL', name: 'Apple Inc. (CEDEAR)', kind: 'cedear', currency: 'ARS' },
  { id: 'i4', symbol: 'GGAL', name: 'Grupo Financiero Galicia', kind: 'stock', currency: 'ARS' },
  { id: 'i5', symbol: 'SOLUSDT', name: 'Solana', kind: 'crypto', currency: 'USD' },
  { id: 'i6', symbol: 'BNBUSDT', name: 'BNB', kind: 'crypto', currency: 'USD' },
]

describe('searchInstruments', () => {
  it('sin nada escrito no propone nada: la lista completa no es una sugerencia', () => {
    expect(searchInstruments(CATALOG, '')).toEqual([])
    expect(searchInstruments(CATALOG, '   ')).toEqual([])
  })

  it('encuentra por nombre, sin importar mayúsculas', () => {
    expect(searchInstruments(CATALOG, 'BITCO').map((i) => i.id)).toEqual(['i1'])
  })

  it('encuentra por símbolo, que es como se busca un bono o un CEDEAR', () => {
    expect(searchInstruments(CATALOG, 'al30').map((i) => i.id)).toEqual(['i2'])
  })

  it('el símbolo exacto manda sobre un nombre que apenas lo contiene', () => {
    // "bnb" está al principio del símbolo BNBUSDT y también dentro del nombre.
    const ids = searchInstruments(CATALOG, 'bnb').map((i) => i.id)
    expect(ids[0]).toBe('i6')
  })

  it('busca también en el medio de la palabra', () => {
    expect(searchInstruments(CATALOG, 'galicia').map((i) => i.id)).toEqual(['i4'])
  })

  it('ignora acentos, para que "accion" encuentre lo mismo que "acción"', () => {
    const conAcento = [{ id: 'x', symbol: 'XX', name: 'Obligación Negociable', kind: 'corp_bond' }]
    expect(searchInstruments(conAcento, 'obligacion').map((i) => i.id)).toEqual(['x'])
  })

  it('sin coincidencias devuelve vacío — de ahí sale el aviso de usar valuación manual', () => {
    expect(searchInstruments(CATALOG, 'tesla motors sa')).toEqual([])
  })

  it('corta la lista para que no tape la pantalla', () => {
    expect(searchInstruments(CATALOG, 'a', 2)).toHaveLength(2)
  })
})

describe('instrumentKindLabel', () => {
  it('traduce el tipo a algo legible', () => {
    expect(instrumentKindLabel('cedear')).toBe('CEDEAR')
    expect(instrumentKindLabel('crypto')).toBe('Cripto')
  })

  it('un tipo que no conoce se muestra tal cual, nunca vacío', () => {
    expect(instrumentKindLabel('otra_cosa')).toBe('otra_cosa')
  })
})
