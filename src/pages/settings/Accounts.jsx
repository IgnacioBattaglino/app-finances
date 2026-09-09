import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getAccounts, deleteAccount, reorderAccounts } from '../../lib/liquidAccounts.js'
import { getAccountBalances } from '../../lib/liquid.js'
import { formatByCurrency } from '../../lib/format.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup, SettingsButtonRow } from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'
import AccountCreateForm from '../../components/form/AccountCreateForm.jsx'
import { ReorderableRows, GripIcon } from '../../components/settings/ReorderableRows.jsx'
import LiquidModal from '../../components/LiquidModal.jsx'

// Alta al pie de la lista, escondida hasta que se la pide: mismo patrón que
// "Nueva categoría". `extended` le agrega moneda y tipo — acá, y solo acá, se
// eligen libremente (ver AccountCreateForm).
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
        extended
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
        className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 transition active:opacity-60"
      >
        <span className="min-w-0 truncate text-[17px]">{account.name}</span>
        <span className="font-money shrink-0 text-[15px] text-ink-soft">
          {formatByCurrency(account.currency, account.amount)}
        </span>
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
  const location = useLocation()
  const navigate = useNavigate()
  // Se entra desde Ajustes (backTo fijo, de siempre) o tocando "Dinero
  // disponible"/"Dinero ahorrado" en Inicio (Dashboard manda state.from):
  // ahí "atrás" tiene que volver a Inicio de verdad, no a Ajustes, que ni
  // siquiera es de donde vino. Mismo patrón que AssetTypeDetail con
  // fromPortfolio.
  const fromDashboard = location.state?.from === 'dashboard'
  const backProps = fromDashboard
    ? { onBack: () => navigate(-1), backLabel: 'Inicio' }
    : { backTo: '/ajustes', backLabel: 'Ajustes' }

  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [reconcileOpen, setReconcileOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [accountRows, balances] = await Promise.all([getAccounts(), getAccountBalances()])
      const byId = new Map(balances.map((b) => [b.account_id, Number(b.amount)]))
      setAccounts(accountRows.map((a) => ({ ...a, amount: byId.get(a.id) ?? 0 })))
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

  // Reordena SOLO el subconjunto que se arrastró (uso diario o ahorro): cada
  // grupo se ordena por separado y el resultado se mezcla de vuelta en la
  // lista completa, sin pisar al otro grupo.
  async function commitOrder(orderedSubset) {
    const positioned = new Map(orderedSubset.map((a, i) => [a.id, i]))
    setAccounts((prev) =>
      prev.map((a) => (positioned.has(a.id) ? { ...a, position: positioned.get(a.id) } : a)),
    )
    try {
      await reorderAccounts(orderedSubset)
    } catch (e) {
      setError({ message: 'No se pudo guardar el orden.', detail: e.message })
      load()
    }
  }

  function afterReconciled() {
    setReconcileOpen(false)
    load()
  }

  const dailyAccounts = accounts.filter((a) => !a.is_savings)
  const savingsAccounts = accounts.filter((a) => a.is_savings)

  return (
    <SettingsPage
      title="Cuentas"
      description="Dónde está la plata que contás como disponible: efectivo, billeteras, cuentas del banco."
      {...backProps}
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
        <>
          <SettingsGroup footer="Compará lo que la app calculó con lo que tenés de verdad, cuenta por cuenta.">
            <SettingsButtonRow label="Contar mi plata" onClick={() => setReconcileOpen(true)} />
          </SettingsGroup>

          <SettingsGroup footer="La primera de la lista es la que viene elegida al cargar un movimiento — arrastrá con la manija para cambiar el orden. Tu dinero disponible total no depende de cómo las repartas.">
            <ReorderableRows items={dailyAccounts} onCommit={commitOrder}>
              {(account, dragHandlers) => (
                <AccountRow
                  account={account}
                  dragHandlers={dragHandlers}
                  onDeleted={handleDeleted}
                  onError={setError}
                />
              )}
            </ReorderableRows>
          </SettingsGroup>

          {savingsAccounts.length > 0 && (
            <SettingsGroup title="Ahorro">
              <ReorderableRows items={savingsAccounts} onCommit={commitOrder}>
                {(account, dragHandlers) => (
                  <AccountRow
                    account={account}
                    dragHandlers={dragHandlers}
                    onDeleted={handleDeleted}
                    onError={setError}
                  />
                )}
              </ReorderableRows>
            </SettingsGroup>
          )}

          <SettingsGroup>
            <NewAccountRow onCreated={(created) => setAccounts((prev) => [...prev, { ...created, amount: 0 }])} />
          </SettingsGroup>
        </>
      )}

      <LiquidModal open={reconcileOpen} onClose={() => setReconcileOpen(false)} onSaved={afterReconciled} />
    </SettingsPage>
  )
}

export default Accounts
