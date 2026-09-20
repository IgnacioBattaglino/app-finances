import { describe, expect, test } from 'vitest'
import { shouldComplete } from './EdgeSwipeBack.jsx'

describe('shouldComplete', () => {
  test('quieto a menos de la mitad: vuelve', () => {
    expect(shouldComplete(100, 0, 400)).toBe(false)
  })

  test('rápido a poca distancia: completa', () => {
    expect(shouldComplete(60, 3000, 400)).toBe(true)
  })

  test('quieto a más de la mitad: completa', () => {
    expect(shouldComplete(250, 0, 400)).toBe(true)
  })

  test('en el borde exacto de la mitad, sin velocidad, no completa (estrictamente mayor)', () => {
    expect(shouldComplete(200, 0, 400)).toBe(false)
  })
})
