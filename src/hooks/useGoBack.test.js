import { describe, it, expect } from 'vitest'
import { backTarget } from './useGoBack.js'

// La decisión de a dónde vuelve un "volver" es pura a propósito: se testea
// sin montar ningún router.
describe('backTarget', () => {
  it('con una entrada anterior en la app, vuelve de verdad (pop)', () => {
    expect(backTarget(2, '/ajustes')).toEqual({ pop: true })
  })

  it('en la primera entrada (idx 0), reemplaza a la madre', () => {
    expect(backTarget(0, '/ajustes')).toEqual({ pop: false, to: '/ajustes' })
  })

  it('sin idx (link directo, sin window.history.state), reemplaza a la madre', () => {
    expect(backTarget(undefined, '/ajustes')).toEqual({ pop: false, to: '/ajustes' })
  })

  it('si la entrada anterior es /login, se trata como si no hubiera anterior', () => {
    expect(backTarget(3, '/ajustes', true)).toEqual({ pop: false, to: '/ajustes' })
  })
})
