import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAccounts, deleteAccount, reorderAccounts } from '../../lib/liquidAccounts.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup } from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'
import AccountCreateForm from '../../components/form/AccountCreateForm.jsx'
import { ReorderableRows, GripIcon } from '../../components/settings/ReorderableRows.jsx'

// Alta al pie de la lista, escondida hasta que se la pide: mismo patrón que
// "Nueva categoría" (y el mismo formulario de alta que usa AccountField en
// los selectores de carga — ver AccountCreateForm).
function NewAccountRow({ onCreated }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-4 py-3 text-left text-[17px] font-medium text-accent-ink transition active:bg-mist"
      >
        Nueva cuenta
      </button>
    )
  }

  return (
    <div className="px-4 py-3">
      <AccountCreateForm
        onCreated={(created) => {
          onCreated(created)
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}

// Eliminar una cuenta tiene dos finales posibles, y cuál toca lo decide la
// base, no un conteo previo (mismo criterio que deleteCategory): sin nada que
// la referencie se borra y listo; si algo la referencia la FK rechaza el
// delete y la cuenta se oculta en vez de eliminarse. Nada se reasigna.
function AccountRow({ account, dragHandlers, onDeleted, onError }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    setBusy(true)
    try {
      const { deleted } = await deleteAccount(account.id)
      onDeleted(account.id, deleted)
    } catch (e) {
      onError({ message: 'No se pudo eliminar la cuenta.', detail: e.message })
      setBusy(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="space-y-1.5 px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-[15px]">
          <span className="min-w-0 truncate">¿Eliminar «{account.name}»?</span>
          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="text-ink-soft"
            >
              No
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="font-semibold text-clay disabled:opacity-50"
            >
              Sí, eliminar
            </button>
          </div>
        </div>
        <p className="text-[13px] text-ink-soft">
          Si tiene movimientos, dejará de ofrecerse en vez de eliminarse.
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full items-center gap-1 pr-2 pl-2">
      <button
        type="button"
        {...dragHandlers}
        aria-label={`Reordenar ${account.name}`}
        className="shrink-0 cursor-grab touch-none px-1.5 py-3 active:cursor-grabbing"
      >
        <GripIcon />
      </button>
      <Link
        to={`/ajustes/cuentas/${account.id}`}
        className="min-w-0 flex-1 truncate py-3 text-[17px] transition active:opacity-60"
      >
        {account.name}
      </Link>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Eliminar ${account.name}`}
        className="shrink-0 px-2.5 py-3 text-[15px] font-medium text-clay transition active:opacity-60"
      >
        Eliminar
      </button>
    </div>
  )
}

function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setAccounts(await getAccounts())
    } catch (e) {
      setError({ message: 'No se pudieron cargar las cuentas.', detail: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function handleDeleted(id, deleted) {
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    setNote(
      deleted
        ? null
        : 'La cuenta tenía movimientos: dejó de ofrecerse, y esos movimientos la siguen mostrando.',
    )
  }

  async function commitOrder(ordered) {
    setAccounts(ordered.map((account, i) => ({ ...account, position: i })))
    try {
      await reorderAccounts(ordered)
    } catch (e) {
      setError({ message: 'No se pudo guardar el orden.', detail: e.message })
      load()
    }
  }

  return (
    <SettingsPage
      title="Cuentas"
      description="Dónde está la plata que contás como disponible: efectivo, billeteras, cuentas del banco."
    >
      {error && (
        <div className="notice space-y-2">
          <FormError message={error.message} detail={error.detail} />
          <button
            type="button"
            onClick={load}
            className="text-[15px] font-semibold text-clay underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {note && <p className="notice text-[15px]">{note}</p>}

      {loading ? (
        <p className="px-4 text-[15px] text-ink-soft">Cargando…</p>
      ) : (
        <SettingsGroup footer="La primera de la lista es la que viene elegida al cargar un movimiento — arrastrá con la manija para cambiar el orden. Tu dinero disponible total no depende de cómo las repartas.">
          <ReorderableRows items={accounts} onCommit={commitOrder}>
            {(account, dragHandlers) => (
              <AccountRow
                account={account}
                dragHandlers={dragHandlers}
                onDeleted={handleDeleted}
                onError={setError}
              />
            )}
          </ReorderableRows>
          <NewAccountRow onCreated={(created) => setAccounts((prev) => [...prev, created])} />
        </SettingsGroup>
      )}
    </SettingsPage>
  )
}

export default Accounts
