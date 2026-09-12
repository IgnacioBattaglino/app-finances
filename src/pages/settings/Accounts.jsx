import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAccounts, reorderAccounts } from '../../lib/liquidAccounts.js'
import { getAccountBalances } from '../../lib/liquid.js'
import { getDebts, summarizeDebts } from '../../lib/debts.js'
import { formatByCurrency, formatUSD } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.jsx'
import { SettingsGroup, SettingsButtonRow, SettingsLinkRow } from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'
import AccountCreateForm from '../../components/form/AccountCreateForm.jsx'
import { ReorderableRows, GripIcon } from '../../components/settings/ReorderableRows.jsx'
import LiquidModal from '../../components/LiquidModal.jsx'
import AccountTransferModal from '../../components/account/AccountTransferModal.jsx'

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
        <GripIcon />
      </button>
      <Link
        to={`/plata/${account.id}`}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 transition active:opacity-60"
      >
        <span className="min-w-0 truncate text-[17px]">{account.name}</span>
        <span className="font-money shrink-0 text-[15px] text-ink-soft">
          {formatByCurrency(account.currency, account.amount)}
        </span>
      </Link>
    </div>
  )
}

function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [debtsBalance, setDebtsBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [accountRows, balances, debts] = await Promise.all([
        getAccounts(),
        getAccountBalances(),
        getDebts(),
      ])
      const byId = new Map(balances.map((b) => [b.account_id, Number(b.amount)]))
      setAccounts(accountRows.map((a) => ({ ...a, amount: byId.get(a.id) ?? 0 })))
      setDebtsBalance(summarizeDebts(debts).totalBalance)
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
        description="Dónde está la plata que contás como disponible: efectivo, billeteras, cuentas del banco."
      />

      <div className="space-y-7">
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
          <>
            <SettingsGroup footer="Compará lo que la app calculó con lo que tenés de verdad, cuenta por cuenta.">
              <SettingsButtonRow label="Contar mi plata" onClick={() => setReconcileOpen(true)} />
            </SettingsGroup>

            <SettingsGroup footer="Mové plata de una cuenta a otra, sin cargar un gasto y un ingreso por separado.">
              <SettingsButtonRow label="Transferir entre cuentas" onClick={() => setTransferOpen(true)} />
            </SettingsGroup>

            <SettingsGroup footer="La primera de la lista es la que viene elegida al cargar un movimiento — arrastrá con la manija para cambiar el orden. Tu dinero disponible total no depende de cómo las repartas.">
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

            <SettingsGroup>
              <NewAccountRow onCreated={(created) => setAccounts((prev) => [...prev, { ...created, amount: 0 }])} />
            </SettingsGroup>

            {/* Deudas dejó de tener pestaña propia: acá es lo que junto con el
                disponible y el ahorro responde "cuánto tengo y cuánto debo".
                Siempre visible, aunque el saldo sea 0: es el único punto de
                entrada a Deudas ahora que no está en la barra. */}
            <SettingsGroup footer="Cuánto te queda por pagar en total.">
              <SettingsLinkRow to="/deudas" label="Deudas" value={formatUSD(debtsBalance ?? 0)} />
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
