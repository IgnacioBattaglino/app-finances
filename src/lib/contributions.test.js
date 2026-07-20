import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de supabase: un query builder encadenable y "awaitable" que registra
// cada método llamado (from/select/eq/order/range/…) para poder afirmar cómo
// getContributions arma la consulta, y resuelve con un resultado controlable.
const h = vi.hoisted(() => {
  const state = { result: { data: [], error: null }, calls: [] }
  const query = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve) => resolve(state.result)
        return (...args) => {
          state.calls.push([prop, args])
          return query
        }
      },
    },
  )
  return { state, query }
})

vi.mock('./supabase.js', () => ({
  supabase: {
    from: (...args) => {
      h.state.calls.push(['from', args])
      return h.query
    },
  },
}))

import { splitPage, getContributions } from './contributions.js'

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

describe('getContributions (paginación)', () => {
  beforeEach(() => {
    h.state.calls = []
    h.state.result = { data: [], error: null }
  })

  it('sin limit NO llama a range (idéntico al comportamiento histórico)', async () => {
    h.state.result = { data: [{ id: 1 }], error: null }
    const data = await getContributions({ assetId: 'a1' })
    expect(data).toEqual([{ id: 1 }])
    expect(h.state.calls.some(([m]) => m === 'range')).toBe(false)
    expect(h.state.calls).toContainEqual(['eq', ['asset_id', 'a1']])
  })

  it('con limit pide range(0, limit-1)', async () => {
    await getContributions({ assetId: 'a1', limit: 21 })
    expect(h.state.calls).toContainEqual(['range', [0, 20]])
  })

  it('con offset pide range(offset, offset + limit - 1)', async () => {
    await getContributions({ assetId: 'a1', limit: 21, offset: 20 })
    expect(h.state.calls).toContainEqual(['range', [20, 40]])
  })

  it('ordena por fecha desc y luego created_at desc', async () => {
    await getContributions({ assetId: 'a1', limit: 21 })
    expect(h.state.calls).toContainEqual(['order', ['date', { ascending: false }]])
    expect(h.state.calls).toContainEqual(['order', ['created_at', { ascending: false }]])
  })

  it('propaga el error de la consulta', async () => {
    h.state.result = { data: null, error: new Error('boom') }
    await expect(getContributions({ assetId: 'a1' })).rejects.toThrow('boom')
  })
})
