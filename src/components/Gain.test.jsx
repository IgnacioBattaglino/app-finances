import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import Gain from './Gain.jsx'

const render = (props) => renderToStaticMarkup(createElement(Gain, props))

describe('Gain', () => {
  it('con aportado > 0 muestra monto y porcentaje', () => {
    const html = render({ value: 50, base: 100 })
    expect(html).toContain('US$')
    expect(html).toContain('%')
  })

  it('con aportado 0 y valor muestra el monto sin porcentaje ("plata de la casa")', () => {
    const html = render({ value: 200, base: 0 })
    expect(html).toContain('US$')
    expect(html).not.toContain('%')
  })

  it('con aportado 0 y valor 0 no renderiza nada', () => {
    expect(render({ value: 0, base: 0 })).toBe('')
  })

  it('con value null no renderiza nada', () => {
    expect(render({ value: null, base: 100 })).toBe('')
  })

  it('pérdida con aportado > 0 usa el signo menos y muestra %', () => {
    const html = render({ value: -30, base: 100 })
    expect(html).toContain('−')
    expect(html).toContain('%')
  })
})
