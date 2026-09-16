import { useState } from 'react'
import FormError from './FormError.jsx'

// Dar de alta algo en el lugar, sin salir de lo que se estaba haciendo: una
// categoría mientras se carga un gasto, una cuenta desde el selector, un grupo
// desde el alta de un activo. Eran cuatro copias del mismo bloque (nombre,
// error, Cancelar/Crear), cada una con su propio manejo de Enter y Escape y con
// botones que decían "Crear" en unas y "Guardar" en otras.
//
// Nunca es un <form>: casi siempre vive DENTRO de otro formulario, y un <form>
// adentro de otro es HTML inválido. Por eso Enter y Escape se manejan a mano:
// Enter acá no tiene que enviar el formulario de afuera.
//
// `onCreate(name)` hace el alta y tira si falla; lo que viene después (dejarla
// elegida, cerrar) lo decide quien lo usa. `children` son campos extra que van
// entre el nombre y los botones (la moneda de una cuenta, el rendimiento de un
// grupo).
function InlineCreate({
  placeholder,
  createLabel = 'Crear',
  errorMessage,
  onCreate,
  onCancel,
  children,
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(trimmed)
      setName('')
    } catch (e) {
      setError({ message: errorMessage, detail: e })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade space-y-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleCreate()
          }
          if (e.key === 'Escape' && onCancel) {
            e.stopPropagation()
            onCancel()
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        // Autofocus permitido: aparece porque el usuario eligió crear algo.
        autoFocus
        disabled={busy}
        enterKeyHint="done"
        className="field"
      />
      {children}
      <FormError message={error?.message} detail={error?.detail} />
      <div className="flex items-center justify-end gap-5 text-subhead">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className="btn-text font-normal text-ink-soft">
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy || !name.trim()}
          className="btn-text text-accent-ink"
        >
          {busy ? 'Creando…' : createLabel}
        </button>
      </div>
    </div>
  )
}

export default InlineCreate
