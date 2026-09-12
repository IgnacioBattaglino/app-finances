import { describe, it, expect } from 'vitest'
import { describeError, UserError } from './errors.js'

describe('describeError', () => {
  // ── Lo que motiva el archivo ──────────────────────────────────────────────
  // Borrar un ajuste de saldo contestaba con el texto crudo de la restricción.
  it('nunca deja pasar el texto de una restricción de la base', () => {
    const pgError = {
      code: '23503',
      message:
        'update or delete on table "transactions" violates foreign key constraint "liquid_reconciliations_adjustment_transaction_id_fkey" on table "liquid_reconciliations"',
    }

    const detail = describeError(pgError)
    expect(detail).not.toContain('foreign key')
    expect(detail).not.toContain('transactions')
    expect(detail).toMatch(/depende de esto/)
  })

  it('traduce los errores de base que sabemos leer', () => {
    expect(describeError({ code: '23505', message: 'duplicate key value...' })).toMatch(/Ya existe/)
    expect(describeError({ code: '23514', message: 'violates check constraint' })).toMatch(
      /fuera de lo que la app permite/,
    )
    expect(describeError({ code: 'PGRST116', message: 'The result contains 0 rows' })).toMatch(
      /No se encontró/,
    )
  })

  it('muestra tal cual lo que avisan nuestras funciones de Postgres', () => {
    // Están escritas en castellano a propósito; P0001 es el código de un
    // `raise exception` nuestro.
    expect(describeError({ code: 'P0001', message: 'Cuenta inexistente o de otro usuario' })).toBe(
      'Cuenta inexistente o de otro usuario',
    )
  })

  it('muestra tal cual lo que escribimos nosotros para el usuario', () => {
    expect(describeError(new UserError('Ya existe la categoría "Comida".'))).toBe(
      'Ya existe la categoría "Comida".',
    )
  })

  it('reconoce quedarse sin conexión, que no tiene código', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toMatch(/conexión/)
  })

  it('de un error desconocido dice el código y nada más', () => {
    // Sirve para contarlo, y no afirma nada que el usuario no pueda verificar.
    expect(describeError({ code: '42883', message: 'function foo() does not exist' })).toBe(
      'Error inesperado (código 42883).',
    )
  })

  it('sin código ni mensaje reconocible no inventa un detalle', () => {
    // El mensaje de la pantalla ("No se pudo eliminar el movimiento") ya dice
    // qué falló: agregar ruido en inglés debajo no ayuda a nadie.
    expect(describeError(new Error('Unexpected token < in JSON at position 0'))).toBe(null)
    expect(describeError(null)).toBe(null)
  })

  it('un texto suelto no se muestra: puede ser el mensaje crudo de cualquier cosa', () => {
    expect(describeError('violates foreign key constraint')).toBe(null)
    // Salvo que lo reconozcamos, como la falta de conexión.
    expect(describeError('TypeError: Failed to fetch')).toMatch(/conexión/)
  })
})
