import { useState } from 'react'
import { createAccount } from '../../lib/liquidAccounts.js'
import BinaryChoice from './BinaryChoice.jsx'
import InlineCreate from './InlineCreate.jsx'
import Switch from './Switch.jsx'

// El alta al vuelo de una cuenta. Es el mismo bloque en los tres lugares que
// ofrecen crear una cuenta sin ir a Mi plata (el selector de los formularios
// de carga, la lista de Mi plata, y la reconciliación del disponible).
//
// `extended`: solo Mi plata lo pasa. Ahí, y únicamente ahí, la cuenta nace
// eligiendo moneda y tipo — es el único momento en que la moneda se elige
// libremente (ver AccountDetail: una vez que la cuenta tiene movimientos,
// queda fija). El alta al vuelo de un formulario de carga no lo necesita: esas
// cuentas nacen en pesos y de uso diario, que es lo que esos flujos cargan.
function AccountCreateForm({
  onCreated,
  onCancel,
  placeholder = 'Nombre, ej: Mercado Pago, Cuenta DNI',
  extended = false,
}) {
  const [currency, setCurrency] = useState('ARS')
  const [isSavings, setIsSavings] = useState(false)

  return (
    <InlineCreate
      placeholder={placeholder}
      errorMessage="No se pudo crear la cuenta."
      // La cuenta nace y queda elegida/lista: el usuario escribió el nombre
      // para usarla ahora, no para buscarla de nuevo después.
      onCreate={async (name) => onCreated(await createAccount(name, extended ? { currency, isSavings } : undefined))}
      onCancel={onCancel}
    >
      {extended && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="text-subhead text-ink-soft">Moneda</span>
            <div className="w-44">
              <BinaryChoice
                options={[
                  { value: 'ARS', label: 'Pesos' },
                  { value: 'USD', label: 'Dólares' },
                ]}
                value={currency}
                onChange={setCurrency}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-subhead text-ink-soft">Cuenta de ahorro</span>
            <Switch checked={isSavings} onChange={setIsSavings} label="Cuenta de ahorro" />
          </div>
        </>
      )}
    </InlineCreate>
  )
}

export default AccountCreateForm
