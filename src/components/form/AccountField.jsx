import { useState } from 'react'
import AccountCreateForm from './AccountCreateForm.jsx'

// ¿De qué cuenta sale (o a cuál entra) esta plata? Una fila de lista, con el
// mismo alto y la misma forma que las demás del formulario.
//
// Se muestra SOLO cuando la operación toca el disponible: un aporte "de
// afuera" o un pago hecho con dólares que ya tenías nunca salieron de una
// cuenta, así que preguntarlo sería pedir un dato que no existe (mismo
// criterio con el que el tipo de cambio deja de ser obligatorio ahí).
//
// El alta al vuelo es el mismo patrón que "+ Nueva categoría" en el formulario
// de movimiento, y encaja por el mismo motivo: la cuenta nueva aparece cuando
// aparece la plata —abriste Cuenta DNI y estás cargando el primer gasto—, y
// mandar al usuario a Ajustes lo obliga a abandonar lo que estaba cargando.
function AccountField({ accounts = [], value, onChange, label = '¿De qué cuenta?', onAccountCreated }) {
  const [creating, setCreating] = useState(false)

  function cancel() {
    setCreating(false)
  }

  // La cuenta nace y queda elegida: el usuario escribió el nombre para usarla
  // ahora, no para buscarla de nuevo en el selector.
  function handleCreated(created) {
    onAccountCreated?.(created)
    onChange(created.id)
    cancel()
  }

  return (
    <div className="px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[17px]">{label}</span>
        <select
          value={creating ? '__new__' : (value ?? '')}
          onChange={(e) => {
            const next = e.target.value
            if (next === '__new__') {
              setCreating(true)
              return
            }
            setCreating(false)
            onChange(next || null)
          }}
          className="max-w-[55%] bg-transparent text-right text-[17px] outline-none"
        >
          {/* Sin cuentas no hay nada que elegir todavía; con cuentas, esta
              opción es la que deja una operación sin asignar a propósito. */}
          <option value="">{accounts.length === 0 ? 'Sin cuentas' : 'Sin cuenta'}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
          <option value="__new__">+ Nueva cuenta</option>
        </select>
      </label>

      {creating && (
        <div className="mt-2.5">
          <AccountCreateForm onCreated={handleCreated} onCancel={cancel} />
        </div>
      )}
    </div>
  )
}

export default AccountField
