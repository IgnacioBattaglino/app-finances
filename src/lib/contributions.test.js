import { describe, it, expect } from 'vitest'
import { splitPage } from './contributions.js'

describe('splitPage', () => {
  it('con exactamente pageSize filas, no hay más', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: i }))
    const { items, hasMore } = splitPage(rows, 20)
    expect(items).toHaveLength(20)
    expect(hasMore).toBe(false)
  })

  it('con pageSize + 1 filas, muestra pageSize y marca que hay más', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: i }))
    const { items, hasMore } = splitPage(rows, 20)
    expect(items).toHaveLength(20)
    expect(items.map((r) => r.id)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(hasMore).toBe(true)
  })

  it('con menos de pageSize filas, no hay más', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }))
    const { items, hasMore } = splitPage(rows, 20)
    expect(items).toHaveLength(5)
    expect(hasMore).toBe(false)
  })
})
