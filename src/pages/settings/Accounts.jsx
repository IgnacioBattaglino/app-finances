import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAccounts, reorderAccounts } from '../../lib/liquidAccounts.js'
import { getAccountBalances } from '../../lib/liquid.js'
import { formatByCurrency } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.jsx'
import { SettingsGroup, SettingsCreateRow } from '../../components/settings/SettingsList.jsx'
import ListSkeleton from '../../components/ListSkeleton.jsx'
import { ErrorNotice } from '../../components/form/FormError.jsx'
import AccountCreateForm from '../../components/form/AccountCreateForm.jsx'
import { ReorderableRows } from '../../components/settings/ReorderableRows.jsx'
import LiquidModal from '../../components/LiquidModal.jsx'
import AccountTransferModal from '../../components/account/AccountTransferModal.jsx'
import { ChevronRight, Grip } from '../../components/Icons.jsx'

// Alta al pie de la lista, escondida hasta que se la pide: mismo patrón que
// "Nueva categoría". `extended` le agrega moneda y tipo — acá, y solo acá, se
// eligen libremente (ver AccountCreateForm).
function NewAccountRow({ onCreated }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <SettingsCreateRow label="Nueva cuenta" onClick={() => setOpen(true)} />
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

// La fila es solo para leer el saldo y entrar al detalle — eliminar vive
// únicamente ahí (H9 del informe de arquitectura de información): es donde
// ya está protegido (una cuenta con saldo se vacía con un ajuste antes de
// borrarse, ver AccountDetail), y tenerlo repetido acá solo agrega riesgo sin
// esa guarda.
function AccountRow({ account, dragHandlers }) {
  return (
    <div className="flex w-full items-center gap-1 pr-2 pl-2">
      <button
        type="button"
        {...dragHandlers}
        aria-label={`Reordenar ${account.name}`}
        className="shrink-0 cursor-grab touch-none px-1.5 py-3 active:cursor-grabbing"
      >
        <Grip />
      </button>
      <Link
        viewTransition
        to={`/plata/${account.id}`}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 py-3 pr-2 transition-opacity active:opacity-60"
      >
        <span className="min-w-0 truncate text-body">{account.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="font-money text-subhead text-ink-soft">
            {formatByCurrency(account.currency, account.amount)}
          </span>
          <ChevronRight />
        </span>
      </Link>
    </div>
  )
}

function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [accountRows, balances] = await Promise.all([getAccounts(), getAccountBalances()])
      const byId = new Map(balances.map((b) => [b.account_id, Number(b.amount)]))
      setAccounts(accountRows.map((a) => ({ ...a, amount: byId.get(a.id) ?? 0 })))
    } catch (e) {
      setError({ message: 'No se pudieron cargar las cuentas.', detail: e })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

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
      setError({ message: 'No se pudo guardar el orden.', detail: e })
      load()
    }
  }

  function afterReconciled() {
    setReconcileOpen(false)
    load()
  }

  function afterTransferred() {
    setTransferOpen(false)
    load()
  }

  const dailyAccounts = accounts.filter((a) => !a.is_savings)
  const savingsAccounts = accounts.filter((a) => a.is_savings)

  return (
    <div className="page-narrow">
      <PageHeader
        title="Mi plata"
        description="Dónde está tu plata: efectivo, billeteras, cuentas del banco."
      />

      <div className="space-y-7">
        <ErrorNotice error={error} onRetry={load} />

        {/* Las dos operaciones sobre las cuentas, juntas y arriba: la fila de
            acciones rápidas de cualquier app de banco. Antes eran dos tarjetas
            con un párrafo cada una, y las cuentas —lo que se viene a mirar—
            quedaban recién en el tercer bloque. Qué hace cada una lo explica
            su propio formulario al abrirse. */}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setReconcileOpen(true)} className="btn btn-secondary">
            Contar mi plata
          </button>
          <button type="button" onClick={() => setTransferOpen(true)} className="btn btn-secondary">
            Transferir
          </button>
        </div>

        {loading ? (
          <ListSkeleton rows={3} />
        ) : (
          <>
            <SettingsGroup
              title="Disponible"
              footer="La primera es la que viene elegida al cargar un movimiento. Arrastrá la manija para cambiar el orden."
            >
              <ReorderableRows items={dailyAccounts} onCommit={commitOrder}>
                {(account, dragHandlers) => (
                  <AccountRow account={account} dragHandlers={dragHandlers} />
                )}
              </ReorderableRows>
            </SettingsGroup>

            {savingsAccounts.length > 0 && (
              <SettingsGroup title="Ahorro">
                <ReorderableRows items={savingsAccounts} onCommit={commitOrder}>
                  {(account, dragHandlers) => (
                    <AccountRow account={account} dragHandlers={dragHandlers} />
                  )}
                </ReorderableRows>
              </SettingsGroup>
            )}

            {/* Crear una cuenta es raro: va al final, donde va a aparecer la
                cuenta nueva, y no en el botón "+" de las acciones frecuentes. */}
            <SettingsGroup>
              <NewAccountRow onCreated={(created) => setAccounts((prev) => [...prev, { ...created, amount: 0 }])} />
            </SettingsGroup>
          </>
        )}
      </div>

      <LiquidModal open={reconcileOpen} onClose={() => setReconcileOpen(false)} onSaved={afterReconciled} />
      <AccountTransferModal
        open={transferOpen}
        accounts={accounts}
        onClose={() => setTransferOpen(false)}
        onSaved={afterTransferred}
      />
    </div>
  )
}

export default Accounts
