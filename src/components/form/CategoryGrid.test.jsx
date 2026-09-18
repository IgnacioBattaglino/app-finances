import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import CategoryGrid from './CategoryGrid.jsx'

const categories = [
  { id: 'a', name: 'Comida' },
  { id: 'b', name: 'Transporte' },
]

const render = (props) =>
  renderToStaticMarkup(createElement(CategoryGrid, { value: '', onChange: () => {}, ...props }))

describe('CategoryGrid', () => {
  it('dibuja un radio por categoría', () => {
    const html = render({ categories })
    expect((html.match(/role="radio"/g) ?? []).length).toBe(2)
    expect(html).toContain('Comida')
    expect(html).toContain('Transporte')
  })

  it('sin categorías no hay grilla', () => {
    expect(render({ categories: [] })).toBe('')
  })

  it('mientras carga, muestra pastillas vacías sin marcar ninguna', () => {
    const html = render({ categories: [], loading: true })
    expect(html).not.toContain('role="radio"')
  })

  it('marca la elegida', () => {
    const html = render({ categories, value: 'b' })
    expect(html).toContain('aria-checked="true"')
  })
})
