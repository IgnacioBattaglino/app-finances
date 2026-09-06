import { useState } from 'react'
import { createAccount } from '../../lib/liquidAccounts.js'
import FormError from './FormError.jsx'

// El formulario de alta al vuelo de una cuenta: nombre, Crear/Cancelar. Es el
// mismo bloque en los tres lugares que ofrecen crear una cuenta sin ir a
// Ajustes (el selector de los formularios de carga, la lista de Ajustes →
// Cuentas, y la reconciliación del disponible) — vive acá una sola vez en vez
// de estar copiado tres veces.
//
// Nunca es un <form> propio: en el selector de un formulario de carga queda
// anidado dentro de OTRO <form> (el del movimiento/aporte/pago), y un <form>
// dentro de otro <form> es HTML inválido. Por eso Enter y Escape se manejan a
// mano con onKeyDown en vez de onSubmit — funciona igual en los dos lugares
// donde no hay anidamiento.
function AccountCreateForm({ onCreated, onCancel, placeholder = 'ej: Mercado Pago, Cuenta DNI' }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // La cuenta nace y queda elegida/lista: el usuario escribió el nombre para
  // usarla ahora, no para buscarla de nuevo después.
  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      onCreated(await createAccount(trimmed))
    } catch (e) {
      setError({ message: 'No se pudo crear la cuenta.', detail: e.message })
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Enter acá no debe enviar ningún <form> que lo rodee, todavía sin
            // cuenta creada.
            e.preventDefault()
            handleCreate()
          }
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={placeholder}
        autoFocus
        disabled={busy}
        className="w-full rounded-[10px] bg-mist px-3 py-2 text-[17px] outline-none placeholder:text-ink-faint"
      />
      <FormError message={error?.message} detail={error?.detail} />
      <div className="flex items-center justify-end gap-4 text-[15px]">
        <button type="button" onClick={onCancel} disabled={busy} className="text-ink-soft">
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy || !name.trim()}
          className="font-semibold text-accent-ink disabled:opacity-50"
        >
          Crear
        </button>
      </div>
    </div>
  )
}

export default AccountCreateForm
