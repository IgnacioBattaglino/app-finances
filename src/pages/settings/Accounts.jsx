import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getAccounts,
  createAccount,
  deleteAccount,
  reassignAndDeleteAccount,
  countMovementsForAccount,
  reorderAccounts,
} from '../../lib/liquidAccounts.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup } from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'
import { ReorderableRows, GripIcon } from '../../components/settings/ReorderableRows.jsx'

// Alta al pie de la lista, escondida hasta que se la pide: mismo patrón que
// "Nueva categoría".
function NewAccountRow({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function close() {
    setOpen(false)
    setName('')
    setError(null)
  }

  async function handleCreate(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      onCreated(await createAccount(trimmed))
      close()
    } catch (e) {
      setError({ message: 'No se pudo crear la cuenta.', detail: e.message })
    } finally {
      setBusy(false)
    }
  }

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
    <form onSubmit={handleCreate} className="space-y-2.5 px-4 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        placeholder="ej: Mercado Pago, Cuenta DNI"
        autoFocus
        disabled={busy}
        className="w-full rounded-[10px] bg-mist px-3 py-2 text-[17px] outline-none placeholder:text-ink-faint"
      />
      <FormError message={error?.message} detail={error?.detail} />
      <div className="flex items-center justify-end gap-4 text-[15px]">
        <button type="button" onClick={close} disabled={busy} className="text-ink-soft">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="font-semibold text-accent-ink disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </form>
  )
}

// Eliminar una cuenta tiene dos finales posibles, y cuál toca lo decide la
// base, no un conteo previo (mismo criterio que deleteCategory):
//
//   sin movimientos → se borra y listo.
//   con movimientos → la FK la rechaza, y acá se abre el segundo paso: a qué
//                     otra cuenta se mudan. Una cuenta no se puede "ocultar"
//                     como una categoría — su plata tiene que seguir estando
//                     en algún lado, así que la única salida es reasignarla.
//
// Si es la ÚNICA cuenta y tiene movimientos no hay a dónde mudarlos: se dice
// eso, en vez de ofrecer un selector vacío.
function AccountRow({ account, others, dragHandlers, onDeleted, onError }) {
  const [step, setStep] = useState(null) // null | 'confirm' | 'reassign'
  const [targetId, setTargetId] = useState('')
  const [movements, setMovements] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    setBusy(true)
    try {
      const { deleted } = await deleteAccount(account.id)
      if (deleted) {
        onDeleted(account.id)
        return
      }
      // Tiene movimientos: se pasa a elegir a dónde van.
      setMovements(await countMovementsForAccount(account.id).catch(() => null))
      setTargetId(others[0]?.id ?? '')
      setStep('reassign')
    } catch (e) {
      onError({ message: 'No se pudo eliminar la cuenta.', detail: e.message })
      setStep(null)
    } finally {
      setBusy(false)
    }
  }

  async function handleReassign() {
    if (!targetId || busy) return
    setBusy(true)
    try {
      await reassignAndDeleteAccount(account.id, targetId)
      onDeleted(account.id)
    } catch (e) {
      onError({ message: 'No se pudieron mover los movimientos.', detail: e.message })
      setBusy(false)
    }
  }

  if (step === 'reassign') {
    const target = others.find((a) => a.id === targetId)
    return (
      <div className="space-y-2.5 px-4 py-3">
        <p className="text-[15px]">
          «{account.name}» tiene {movements != null ? `${movements} movimientos` : 'movimientos'}
          {others.length > 0 ? '. ¿A qué cuenta los pasamos?' : '.'}
        </p>
        {others.length === 0 ? (
          <>
            <p className="text-[13px] text-ink-soft">
              Es tu única cuenta, así que no hay a dónde moverlos. Creá otra cuenta primero.
            </p>
            <div className="flex justify-end text-[15px]">
              <button type="button" onClick={() => setStep(null)} className="text-ink-soft">
                Entendido
              </button>
            </div>
          </>
        ) : (
          <>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-[10px] bg-mist px-3 py-2 text-[17px] outline-none"
            >
              {others.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="text-[13px] text-ink-soft">
              Tu dinero disponible total no cambia: los movimientos pasan a contar en «
              {target?.name}» y «{account.name}» se elimina.
            </p>
            <div className="flex items-center justify-end gap-4 text-[15px]">
              <button
                type="button"
                onClick={() => setStep(null)}
                disabled={busy}
                className="text-ink-soft"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReassign}
                disabled={busy || !targetId}
                className="font-semibold text-clay disabled:opacity-50"
              >
                {busy ? 'Moviendo…' : 'Mover y eliminar'}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="space-y-1.5 px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-[15px]">
          <span className="min-w-0 truncate">¿Eliminar «{account.name}»?</span>
          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={() => setStep(null)}
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
          Si tiene movimientos, te preguntamos a qué cuenta pasarlos.
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
        onClick={() => setStep('confirm')}
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

      {loading ? (
        <p className="px-4 text-[15px] text-ink-soft">Cargando…</p>
      ) : (
        <SettingsGroup footer="La primera de la lista es la que viene elegida al cargar un movimiento — arrastrá con la manija para cambiar el orden. Tu dinero disponible total no depende de cómo las repartas.">
          <ReorderableRows items={accounts} onCommit={commitOrder}>
            {(account, dragHandlers) => (
              <AccountRow
                account={account}
                others={accounts.filter((a) => a.id !== account.id)}
                dragHandlers={dragHandlers}
                onDeleted={(id) => setAccounts((prev) => prev.filter((a) => a.id !== id))}
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
