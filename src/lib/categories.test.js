import { describe, it, expect } from 'vitest'
import { topCategories } from './categories.js'

// Categorías de prueba: ocho de gasto (para tener de sobra para completar y
// para probar empates) y una de ingreso, con `position` ya en el orden de
// Ajustes -- el mismo que decide el orden final de la grilla.
const cat = (id, kind, position, overrides = {}) => ({
  id,
  kind,
  position,
  name: id,
  is_system: false,
  is_archived: false,
  ...overrides,
})

const usageOf = (categoryId, kind, count) => ({ category_id: categoryId, kind, count })

const CATEGORIES = [
  cat('comida', 'expense', 0),
  cat('transporte', 'expense', 1),
  cat('salidas', 'expense', 2),
  cat('salud', 'expense', 3),
  cat('casa', 'expense', 4),
  cat('ropa', 'expense', 5),
  cat('regalos', 'expense', 6),
  cat('otros', 'expense', 7),
  cat('sueldo', 'income', 0),
]

describe('topCategories', () => {
  it('entran las 6 categorías con más movimientos', () => {
    const usage = [
      usageOf('regalos', 'expense', 50),
      usageOf('otros', 'expense', 40),
      usageOf('comida', 'expense', 30),
      usageOf('transporte', 'expense', 20),
      usageOf('salidas', 'expense', 10),
      usageOf('salud', 'expense', 5),
      usageOf('casa', 'expense', 1),
      usageOf('ropa', 'expense', 1),
    ]
    const ids = topCategories(CATEGORIES, usage, 'expense').map((c) => c.id)
    expect(ids).toContain('regalos')
    expect(ids).toContain('otros')
    expect(ids).toContain('comida')
    expect(ids).toContain('transporte')
    expect(ids).toContain('salidas')
    expect(ids).toContain('salud')
    expect(ids).not.toContain('casa')
    expect(ids).not.toContain('ropa')
  })

  it('se muestran en orden de position, no de uso', () => {
    // "otros" (position 7) es la más usada, pero tiene que aparecer última.
    const usage = [usageOf('otros', 'expense', 100), usageOf('comida', 'expense', 1)]
    const ids = topCategories(CATEGORIES, usage, 'expense').map((c) => c.id)
    expect(ids[ids.length - 1]).toBe('otros')
    expect(ids[0]).toBe('comida')
  })

  it('los empates en el uso los decide position', () => {
    // Todas en cero: entran las 6 primeras por position, en ese orden.
    const ids = topCategories(CATEGORIES, [], 'expense').map((c) => c.id)
    expect(ids).toEqual(['comida', 'transporte', 'salidas', 'salud', 'casa', 'ropa'])
  })

  it('con 2 usadas se completa con las primeras por position hasta 6', () => {
    const usage = [usageOf('regalos', 'expense', 5), usageOf('otros', 'expense', 3)]
    const ids = topCategories(CATEGORIES, usage, 'expense').map((c) => c.id)
    expect(ids).toHaveLength(6)
    expect(ids).toEqual(
      expect.arrayContaining(['regalos', 'otros', 'comida', 'transporte', 'salidas', 'salud']),
    )
  })

  it('sin uso, son las 6 primeras por position', () => {
    const ids = topCategories(CATEGORIES, [], 'expense').map((c) => c.id)
    expect(ids).toEqual(['comida', 'transporte', 'salidas', 'salud', 'casa', 'ropa'])
  })

  it('las del sistema y las ocultas no entran', () => {
    const withExtras = [
      ...CATEGORIES,
      cat('ajuste', 'expense', -1, { is_system: true }),
      cat('vieja', 'expense', -1, { is_archived: true }),
    ]
    const ids = topCategories(withExtras, [], 'expense', 20).map((c) => c.id)
    expect(ids).not.toContain('ajuste')
    expect(ids).not.toContain('vieja')
  })

  it('con kind ingreso cuenta solo los ingresos', () => {
    const usage = [usageOf('comida', 'expense', 100), usageOf('sueldo', 'income', 1)]
    const ids = topCategories(CATEGORIES, usage, 'income').map((c) => c.id)
    expect(ids).toEqual(['sueldo'])
  })

  it('con 3 categorías en total da 3, y con 0 da 0', () => {
    const three = CATEGORIES.filter((c) => ['comida', 'transporte', 'salidas'].includes(c.id))
    expect(topCategories(three, [], 'expense')).toHaveLength(3)
    expect(topCategories([], [], 'expense')).toHaveLength(0)
  })
})
