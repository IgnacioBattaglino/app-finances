import { describe, expect, it } from 'vitest'
import { dragTargetIndex } from './ReorderableRows.jsx'

describe('dragTargetIndex', () => {
  it('se queda en el origen sin desplazamiento', () => {
    expect(dragTargetIndex(0, 56, 2, 5)).toBe(2)
  })

  it('redondea una fracción de fila al más cercano', () => {
    expect(dragTargetIndex(20, 56, 2, 5)).toBe(2) // 0.36 fila: no llega a la próxima
    expect(dragTargetIndex(30, 56, 2, 5)).toBe(3) // 0.54 fila: ya redondea a la próxima
    expect(dragTargetIndex(-30, 56, 2, 5)).toBe(1)
  })

  it('no pasa del último índice', () => {
    expect(dragTargetIndex(1000, 56, 2, 5)).toBe(4)
  })

  it('no baja de cero', () => {
    expect(dragTargetIndex(-1000, 56, 2, 5)).toBe(0)
  })

  it('sin alto de fila (0) o con una sola fila, no se mueve', () => {
    expect(dragTargetIndex(100, 0, 2, 5)).toBe(2)
    expect(dragTargetIndex(100, 56, 0, 1)).toBe(0)
  })
})
