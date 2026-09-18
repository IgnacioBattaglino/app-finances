import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import PageHeader from './PageHeader.jsx'

const render = (props) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PageHeader, props)))

describe('PageHeader', () => {
  it('con ruta madre dibuja el volver con su rótulo', () => {
    const html = render({ title: 'Categoría', backTo: '/ajustes/categorias', backLabel: 'Categorías' })
    expect(html).toContain('Categorías')
    expect(html).toContain('Categoría')
  })

  it('sin ruta madre no dibuja ningún volver', () => {
    const html = render({ title: 'Inicio' })
    expect(html).not.toContain('btn-text')
  })

  it('title-page lleva el título grande', () => {
    const html = render({ title: 'Mi plata' })
    expect(html).toContain('title-page')
    expect(html).toContain('Mi plata')
  })
})
