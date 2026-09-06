import { describe, it, expect } from 'vitest'
import { OUTSIDE_ENTRY_HELP, OUTSIDE_EXIT_HELP } from './copy.js'
import { readFileSync } from 'node:fs'

describe('copy compartida entre Aportar/Retirar/Liquidar', () => {
  it('entrada y salida son textos distintos: describen direcciones opuestas de la plata', () => {
    expect(OUTSIDE_ENTRY_HELP).not.toBe(OUTSIDE_EXIT_HELP)
  })

  it('el texto de entrada habla de plata que llega, no de plata que sale', () => {
    expect(OUTSIDE_ENTRY_HELP).toMatch(/no estaba en la app/)
  })

  it('el texto de salida habla de plata que se va, no de un sueldo o un regalo entrando', () => {
    expect(OUTSIDE_EXIT_HELP).toMatch(/sale de la app/)
    expect(OUTSIDE_EXIT_HELP).not.toMatch(/sueldo|regalo/)
  })

  // C-3 de la auditoría era justamente esto: el mismo texto pegado a mano en
  // dos archivos, así que arreglarlo en uno no tocaba el otro. Leer el código
  // fuente en vez de importar los componentes evita el setup de testing-library
  // (no lo usa ningún otro test del proyecto) y verifica lo que importa: que
  // ningún formulario tenga su propia copia del texto de salida.
  it('Retirar (ContributionFormModal) usa la constante compartida, no un texto propio', () => {
    const src = readFileSync(
      new URL('../ContributionFormModal.jsx', import.meta.url),
      'utf8',
    )
    expect(src).toMatch(/OUTSIDE_EXIT_HELP/)
    expect(src).not.toMatch(/se la diste a alguien/)
  })

  it('Liquidar (LiquidatePositionModal) usa la constante compartida, no un texto propio', () => {
    const src = readFileSync(new URL('./LiquidatePositionModal.jsx', import.meta.url), 'utf8')
    expect(src).toMatch(/OUTSIDE_EXIT_HELP/)
    expect(src).not.toMatch(/se la diste a alguien/)
  })
})
