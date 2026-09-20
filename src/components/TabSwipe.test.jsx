import { describe, expect, test } from 'vitest'
import { neighborPath, shouldComplete } from './TabSwipe.jsx'

const PATHS = ['/', '/movimientos', '/plata', '/inversiones', '/compromisos']

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

  test('rápido hacia atrás (vuelve el dedo): no completa aunque haya pasado poco', () => {
    expect(shouldComplete(150, -3000, 400)).toBe(false)
  })
})

describe('neighborPath', () => {
  test('la siguiente y la anterior, en el orden de la barra', () => {
    expect(neighborPath(PATHS, '/movimientos', 1)).toBe('/plata')
    expect(neighborPath(PATHS, '/movimientos', -1)).toBe('/')
    expect(neighborPath(PATHS, '/inversiones', 1)).toBe('/compromisos')
  })

  test('en los extremos no hay vecina', () => {
    expect(neighborPath(PATHS, '/', -1)).toBeNull()
    expect(neighborPath(PATHS, '/compromisos', 1)).toBeNull()
  })

  test('fuera de las cinco raíces no hay vecina', () => {
    expect(neighborPath(PATHS, '/plata/abc', 1)).toBeNull()
    expect(neighborPath(PATHS, '/ajustes', -1)).toBeNull()
  })
})
