import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de supabase: un query builder encadenable y "awaitable" que registra
// cada método llamado (from/select/eq/order/range/…) para poder afirmar cómo
// getContributions arma la consulta, y resuelve con un resultado controlable.
const h = vi.hoisted(() => {
  const state = { result: { data: [], error: null }, calls: [], pages: [] }
  const query = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve) => resolve(state.pages.length ? state.pages.shift() : state.result)
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

import {
  splitPage,
  getContributions,
  getAllContributions,
  getTransferPair,
  deleteTransfer,
  createWithdrawal,
  updateWithdrawal,
} from './contributions.js'

// La fila que se mandó a la base en el último insert/update.
function writtenRow(op) {
  return h.state.calls.find(([method]) => method === op)?.[1]?.[0]
}

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

describe('getAllContributions (más de 1000 aportes)', () => {
  const rows = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: from + i }))
  const page = (data) => ({ data, error: null })
  const ranges = () => h.state.calls.filter(([m]) => m === 'range').map(([, args]) => args)

  beforeEach(() => {
    h.state.calls = []
    h.state.pages = []
    h.state.result = { data: [], error: null }
  })

  it('con 1250 aportes trae las dos páginas, no las primeras 1000', async () => {
    h.state.pages = [page(rows(1000)), page(rows(250, 1000))]
    const data = await getAllContributions()
    expect(data).toHaveLength(1250)
    expect(data.at(-1)).toEqual({ id: 1249 })
    expect(ranges()).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('con exactamente 1000 pide una página más para confirmar que no queda nada', async () => {
    h.state.pages = [page(rows(1000)), page([])]
    expect(await getAllContributions()).toHaveLength(1000)
    expect(ranges()).toHaveLength(2)
  })

  it('con pocos aportes hace un solo pedido', async () => {
    h.state.pages = [page(rows(3))]
    expect(await getAllContributions()).toHaveLength(3)
    expect(ranges()).toEqual([[0, 999]])
  })

  it('ordena por fecha, created_at y un desempate por id', async () => {
    h.state.pages = [page([])]
    await getAllContributions()
    const orders = h.state.calls.filter(([m]) => m === 'order').map(([, a]) => a[0])
    expect(orders).toEqual(['date', 'created_at', 'id'])
  })

  it('propaga el error de una página', async () => {
    h.state.pages = [page(rows(1000)), { data: null, error: new Error('boom') }]
    await expect(getAllContributions()).rejects.toThrow('boom')
  })
})

describe('getTransferPair', () => {
  beforeEach(() => {
    h.state.calls = []
    h.state.result = { data: [], error: null }
  })

  it('filtra por transfer_id', async () => {
    await getTransferPair('t1')
    expect(h.state.calls).toContainEqual(['eq', ['transfer_id', 't1']])
  })

  it('propaga el error de la consulta', async () => {
    h.state.result = { data: null, error: new Error('boom') }
    await expect(getTransferPair('t1')).rejects.toThrow('boom')
  })
})

describe('deleteTransfer', () => {
  beforeEach(() => {
    h.state.calls = []
    h.state.result = { data: null, error: null }
  })

  it('borra por transfer_id, en una sola sentencia (las dos patas juntas)', async () => {
    await deleteTransfer('t1')
    expect(h.state.calls).toContainEqual(['delete', []])
    expect(h.state.calls).toContainEqual(['eq', ['transfer_id', 't1']])
  })

  it('propaga el error de la consulta', async () => {
    h.state.result = { data: null, error: new Error('boom') }
    await expect(deleteTransfer('t1')).rejects.toThrow('boom')
  })
})

// Un retiro que vacía el activo cristaliza toda la diferencia contra el
// aportado; uno parcial no cristaliza nada. Esa decisión es un insumo del
// cálculo, así que tiene que quedar guardada en la fila: sin ella, reeditar el
// retiro lo recalcula con la regla equivocada (ver ADR-011).
describe('empties_asset se persiste con el retiro', () => {
  const contributions = [
    { id: 'c1', asset_id: 'a1', direction: 'in', amount_usd: 500 },
  ]

  beforeEach(() => {
    h.state.calls = []
    h.state.result = { data: { id: 'w1' }, error: null }
  })

  it('una liquidación se guarda marcada, con su ganancia realizada', async () => {
    await createWithdrawal({
      assetId: 'a1',
      date: '2026-09-01',
      amountUsd: 439.32,
      quantity: null,
      mepRate: 1500,
      affectsLiquid: true,
      contributions,
      emptiesAsset: true,
    })
    const row = writtenRow('insert')
    expect(row.empties_asset).toBe(true)
    expect(row.realized_gain).toBe(-60.68)
  })

  it('un retiro parcial se guarda sin marcar y sin cristalizar nada', async () => {
    await createWithdrawal({
      assetId: 'a1',
      date: '2026-09-01',
      amountUsd: 200,
      quantity: null,
      mepRate: 1500,
      affectsLiquid: true,
      contributions,
      emptiesAsset: false,
    })
    const row = writtenRow('insert')
    expect(row.empties_asset).toBe(false)
    expect(row.realized_gain).toBe(0)
  })

  it('reeditar la liquidación con el dato guardado conserva su ganancia', async () => {
    await updateWithdrawal({
      id: 'w1',
      assetId: 'a1',
      date: '2026-09-01',
      amountUsd: 439.32,
      quantity: null,
      mepRate: 1500,
      affectsLiquid: true,
      // La fila que se está editando nunca entra en el aportado previo.
      contributions: [...contributions, { id: 'w1', asset_id: 'a1', direction: 'out', amount_usd: 439.32 }],
      emptiesAsset: true,
    })
    const row = writtenRow('update')
    expect(row.empties_asset).toBe(true)
    expect(row.realized_gain).toBe(-60.68)
  })

  it('reeditarla como si no vaciara (el bug) le borraría la ganancia', async () => {
    await updateWithdrawal({
      id: 'w1',
      assetId: 'a1',
      date: '2026-09-01',
      amountUsd: 439.32,
      quantity: null,
      mepRate: 1500,
      affectsLiquid: true,
      contributions: [...contributions, { id: 'w1', asset_id: 'a1', direction: 'out', amount_usd: 439.32 }],
      emptiesAsset: false,
    })
    expect(writtenRow('update').realized_gain).toBe(0)
  })

  it('un aporte no lleva la marca: null es "no aplica", no "no vació"', async () => {
    const { createContribution } = await import('./contributions.js')
    await createContribution({
      assetId: 'a1',
      date: '2026-09-01',
      amountUsd: 100,
      quantity: null,
      mepRate: 1500,
      affectsLiquid: true,
    })
    expect(writtenRow('insert').empties_asset).toBe(null)
  })
})
