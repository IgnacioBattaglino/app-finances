import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getAccount, renameAccount, countMovementsForAccount } from '../../lib/liquidAccounts.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup, SettingsValueRow } from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'

// Detalle de una cuenta: renombrar. Mismo esqueleto que CategoryDetail — el
// botón Guardar aparece solo cuando hay algo distinto que guardar.
//
// Renombrar es libre y no afecta nada: ningún cálculo depende del nombre de la
// cuenta, solo de su id (mismo criterio que los grupos de activos).
function AccountDetail() {
  const { accountId } = useParams()
  const [account, setAccount] = useState(null)
  const [name, setName] = useState('')
  const [movements, setMovements] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    getAccount(accountId)
      .then((data) => {
        if (!active) return
        setAccount(data)
        setName(data.name)
      })
      .catch((e) => {
        if (active) setError({ message: 'No se pudo cargar la cuenta.', detail: e.message })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    // Cuántos movimientos la usan: dato informativo, y su fallo no rompe la
    // pantalla (el nombre se sigue pudiendo editar sin él).
    countMovementsForAccount(accountId)
      .then((count) => active && setMovements(count))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [accountId])

  async function handleRename(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === account.name || busy) return
    setBusy(true)
    setError(null)
    try {
      setAccount(await renameAccount(account.id, trimmed))
    } catch (e) {
      setError({ message: 'No se pudo renombrar la cuenta.', detail: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <SettingsPage title="Cuenta" backTo="/ajustes/cuentas" backLabel="Cuentas">
        <p className="px-4 text-[15px] text-ink-soft">Cargando…</p>
      </SettingsPage>
    )
  }

  if (!account) {
    return (
      <SettingsPage title="Cuenta" backTo="/ajustes/cuentas" backLabel="Cuentas">
        <FormError message={error?.message} detail={error?.detail} />
      </SettingsPage>
    )
  }

  const dirty = name.trim() !== account.name

  return (
    <SettingsPage title={account.name} backTo="/ajustes/cuentas" backLabel="Cuentas">
      <FormError message={error?.message} detail={error?.detail} />

      <form onSubmit={handleRename}>
        <SettingsGroup
          title="Nombre"
          footer="Renombrarla no cambia ningún saldo: los movimientos siguen apuntando a esta misma cuenta."
        >
          <div className="px-4 py-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="w-full rounded-[10px] bg-mist px-3 py-2 text-[17px] outline-none"
            />
          </div>
          {movements != null && (
            <SettingsValueRow label="Movimientos" value={String(movements)} />
          )}
          {dirty && (
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="w-full px-4 py-3 text-left text-[17px] font-semibold text-accent-ink transition active:bg-mist disabled:opacity-40"
            >
              Guardar
            </button>
          )}
        </SettingsGroup>
      </form>
    </SettingsPage>
  )
}

export default AccountDetail
