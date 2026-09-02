import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import CollapsedDateField from './CollapsedDateField.jsx'
import { todayISO } from '../../lib/format.js'

const render = (props) => renderToStaticMarkup(createElement(CollapsedDateField, { onChange: () => {}, ...props }))

// El campo colapsado formatea el valor que le pasa el formulario, y ese valor
// puede quedar vacío: un <input type="date"> a medio completar emite '' como
// valor normal. Si eso rompe el render, se cae la pantalla entera del modal.
describe('CollapsedDateField', () => {
  it('no revienta con valor vacío: invita a elegir la fecha', () => {
    const html = render({ value: '' })
    expect(html).toContain('Elegir fecha')
    expect(html).not.toContain('cambiar')
  })

  it('no revienta sin valor (undefined ni null)', () => {
    expect(render({ value: undefined })).toContain('Elegir fecha')
    expect(render({ value: null })).toContain('Elegir fecha')
  })

  it('no revienta con un valor que no es una fecha', () => {
    expect(render({ value: 'cualquier cosa' })).toContain('Elegir fecha')
  })

  it('muestra "Hoy" cuando el valor es la fecha de hoy', () => {
    expect(render({ value: todayISO() })).toContain('Hoy · cambiar')
  })

  it('muestra la fecha con año cuando no es hoy', () => {
    const html = render({ value: '2024-03-15' })
    expect(html).toContain('2024')
    expect(html).toContain('cambiar')
  })

  it('usa el label que le pasan', () => {
    expect(render({ value: '', label: '¿Cuándo empezó?' })).toContain('¿Cuándo empezó?')
  })
})
