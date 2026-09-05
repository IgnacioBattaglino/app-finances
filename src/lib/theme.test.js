import { describe, it, expect } from 'vitest'
import { ACCENTS, getAccent, getGroupColor } from './theme.js'

// El color de un grupo de activos sale de la MISMA paleta que el acento de la
// app, pero se resuelve distinto. Esa diferencia es la única razón por la que
// getGroupColor existe en vez de reusar getAccent, así que es lo que se prueba.
describe('getGroupColor', () => {
  it('resuelve un id conocido al color de la paleta', () => {
    const color = getGroupColor('oceano')
    expect(color).toBe(ACCENTS.find((a) => a.id === 'oceano'))
  })

  it('devuelve los dos tonos que necesita el tinte (claro y oscuro)', () => {
    const color = getGroupColor('pino')
    expect(color.fill).toBe('#0a7a55')
    expect(color.inkDark).toBe('#3ed598')
  })

  it('sin color es null, no un color por default', () => {
    expect(getGroupColor(null)).toBe(null)
    expect(getGroupColor(undefined)).toBe(null)
    expect(getGroupColor('')).toBe(null)
  })

  // Un id que ya no está en la paleta (una versión anterior de la app, o un
  // valor editado a mano en la base) tiene que caer a neutro: pintar el grupo
  // de un color que el usuario nunca eligió es peor que no pintarlo.
  it('un id desconocido cae a "sin color", no al primero de la paleta', () => {
    expect(getGroupColor('turquesa')).toBe(null)
    // Justamente lo contrario de getAccent, que SÍ cae al default porque la
    // app siempre tiene que tener un color de marca.
    expect(getAccent('turquesa')).toBe(ACCENTS[0])
  })
})
