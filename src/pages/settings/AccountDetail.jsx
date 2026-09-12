import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getAccount,
  renameAccount,
  setAccountCurrency,
  setAccountSavings,
  deleteAccount,
} from '../../lib/liquidAccounts.js'
import { getAccountBalances } from '../../lib/liquid.js'
import { getAccountTransactions } from '../../lib/transactions.js'
import { splitPage } from '../../lib/contributions.js'
import { getCategories } from '../../lib/categories.js'
import { formatByCurrency } from '../../lib/format.js'
import { useAccounts } from '../../hooks/useAccounts.js'
import { useLastReconciliations } from '../../hooks/useLastReconciliations.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import {
  SettingsGroup,
  SettingsValueRow,
  SettingsSwitchRow,
  SettingsButtonRow,
} from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'
import BinaryChoice from '../../components/form/BinaryChoice.jsx'
import SavingsMovementModal from '../../components/account/SavingsMovementModal.jsx'
import AccountHistory from '../../components/account/AccountHistory.jsx'
import TransactionFormModal from '../../components/TransactionFormModal.jsx'

const PAGE_SIZE = 20

const CURRENCY_LABELS = { ARS: 'Pesos (ARS)', USD: 'Dólares (USD)' }
const CURRENCY_OPTIONS = [
  { value: 'ARS', label: 'Pesos' },
  { value: 'USD', label: 'Dólares' },
]

// Detalle de una cuenta: primero la plata (saldo, extracto, aportar/retirar
// si es de ahorro), después su configuración (nombre, moneda, tipo) y
// eliminar al pie — quien entra viene de tocar un saldo, no a configurar.
//
// Renombrar es libre y no afecta nada: ningún cálculo depende del nombre de la
// cuenta, solo de su id (mismo criterio que los grupos de activos).
//
// La moneda solo se puede tocar mientras la cuenta no tiene ningún movimiento
// (ver ARCHITECTURE.md, migración 0036): una vez que algo la referencia,
// cambiarla mezclaría dos monedas bajo el mismo saldo. `hasMovements` sale de
// si la cuenta aparece en get_liquid_by_account — esa función agrupa por
// cuenta las tres tablas que pueden llevar account_id (transactions,
// contributions, debt_payments), así que su ausencia es "nunca tuvo un
// movimiento", con saldo en 0 o no.
function AccountDetail() {
  const { accountId } = useParams()
  const navigate = useNavigate()
  const [account, setAccount] = useState(null)
  const [balance, setBalance] = useState(null) // { amount, hasMovements } | null mientras carga
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [movement, setMovement] = useState(null) // 'contribution' | 'withdrawal' | null
  const [history, setHistory] = useState([]) // página visible del historial
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false)
  const [loadMoreHistoryError, setLoadMoreHistoryError] = useState(false)
  const [categories, setCategories] = useState([])
  const [txModal, setTxModal] = useState({ open: false, editing: null })
  const { accounts: dailyAccounts, defaultAccountId, addAccount } = useAccounts()
  const lastReconciliations = useLastReconciliations()

  async function reload() {
    const [accountData, balances, firstPage] = await Promise.all([
      getAccount(accountId),
      getAccountBalances(),
      getAccountTransactions({ accountId, limit: PAGE_SIZE + 1 }),
    ])
    const bucket = balances.find((b) => b.account_id === accountId)
    setAccount(accountData)
    setName(accountData.name)
    setBalance({ amount: Number(bucket?.amount ?? 0), hasMovements: Boolean(bucket) })
    const { items, hasMore } = splitPage(firstPage, PAGE_SIZE)
    setHistory(items)
    setHasMoreHistory(hasMore)
  }

  async function loadMoreHistory() {
    setLoadingMoreHistory(true)
    setLoadMoreHistoryError(false)
    try {
      const page = await getAccountTransactions({
        accountId,
        limit: PAGE_SIZE + 1,
        offset: history.length,
      })
      const { items, hasMore } = splitPage(page, PAGE_SIZE)
      setHistory((prev) => [...prev, ...items])
      setHasMoreHistory(hasMore)
    } catch {
      // hasMoreHistory no cambia, así que "Ver más" sigue disponible para
      // reintentar — mismo criterio que AssetDetail.
      setLoadMoreHistoryError(true)
    } finally {
      setLoadingMoreHistory(false)
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    reload()
      .catch((e) => {
        if (active) setError({ message: 'No se pudo cargar la cuenta.', detail: e.message })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  function afterMovement() {
    setMovement(null)
    reload()
  }

  function afterTxSaved() {
    setTxModal({ open: false, editing: null })
    reload()
  }

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

  async function handleCurrency(next) {
    if (next === account.currency || busy) return
    setBusy(true)
    setError(null)
    try {
      setAccount(await setAccountCurrency(account.id, next))
    } catch (e) {
      setError({ message: 'No se pudo cambiar la moneda.', detail: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function handleSavings(next) {
    setBusy(true)
    setError(null)
    try {
      setAccount(await setAccountSavings(account.id, next))
    } catch (e) {
      setError({ message: 'No se pudo cambiar el tipo de cuenta.', detail: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(account.id)
      navigate('/plata')
    } catch (e) {
      setError({ message: 'No se pudo eliminar la cuenta.', detail: e.message })
      setBusy(false)
      setConfirmingDelete(false)
    }
  }

  if (loading) {
    return (
      <SettingsPage title="Cuenta" backTo="/plata" backLabel="Mi plata">
        <p className="px-4 text-[15px] text-ink-soft">Cargando…</p>
      </SettingsPage>
    )
  }

  if (!account) {
    return (
      <SettingsPage title="Cuenta" backTo="/plata" backLabel="Mi plata">
        <FormError message={error?.message} detail={error?.detail} />
      </SettingsPage>
    )
  }

  const dirty = name.trim() !== account.name

  return (
    <SettingsPage title={account.name} backTo="/plata" backLabel="Mi plata">
      <FormError message={error?.message} detail={error?.detail} />

      {/* Primero la plata: quien entra acá viene de tocar un saldo, no a
          configurar la cuenta. La configuración (nombre, moneda, ahorro) va
          al final, como los ajustes de esa plata y no lo primero que se ve. */}
      <SettingsGroup title="Saldo">
        <SettingsValueRow
          label="Actual"
          value={formatByCurrency(account.currency, balance?.amount ?? 0)}
        />
      </SettingsGroup>

      <div>
        <h2 className="eyebrow mb-2 px-1">Historial</h2>
        <AccountHistory
          transactions={history}
          hasMore={hasMoreHistory}
          loadingMore={loadingMoreHistory}
          loadMoreError={loadMoreHistoryError}
          onLoadMore={loadMoreHistory}
          onEdit={(tx) => setTxModal({ open: true, editing: tx })}
        />
      </div>

      {/* Solo para cuentas de ahorro: el mismo patrón de aportar/retirar que
          ya tienen los activos de inversión, pero moviendo plata entre esta
          cuenta y una de uso diario (o de/hacia afuera de la app). Una cuenta
          de uso diario no lo necesita: para el día a día ya está la carga
          rápida de gasto/ingreso. */}
      {account.is_savings && (
        <SettingsGroup footer="Aportar y retirar mueven la plata entre esta cuenta y una de tu disponible, o de/hacia afuera de la app.">
          <SettingsButtonRow label="Aportar" onClick={() => setMovement('contribution')} />
          <SettingsButtonRow label="Retirar" onClick={() => setMovement('withdrawal')} />
        </SettingsGroup>
      )}

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

      {balance?.hasMovements ? (
        <SettingsGroup
          title="Moneda"
          footer="Ya tiene movimientos, así que la moneda queda fija: cambiarla dejaría la cuenta con dos monedas mezcladas y un saldo sin significado."
        >
          <SettingsValueRow label="Moneda" value={CURRENCY_LABELS[account.currency] ?? account.currency} />
        </SettingsGroup>
      ) : (
        <SettingsGroup
          title="Moneda"
          footer="Se elige libre hasta el primer movimiento; después queda fija."
        >
          <div className="p-4">
            <BinaryChoice options={CURRENCY_OPTIONS} value={account.currency} onChange={handleCurrency} />
          </div>
        </SettingsGroup>
      )}

      <SettingsGroup footer="El ahorro no cuenta como plata disponible para el día a día, pero sí suma al total.">
        <SettingsSwitchRow
          label="Cuenta de ahorro"
          checked={account.is_savings === true}
          onChange={handleSavings}
          disabled={busy}
        />
      </SettingsGroup>

      <SettingsGroup>
        {confirmingDelete ? (
          <div className="space-y-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-[15px]">
              <span className="min-w-0 truncate">¿Eliminar «{account.name}»?</span>
              <div className="flex shrink-0 items-center gap-4">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
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
        ) : (
          <SettingsButtonRow
            onClick={() => setConfirmingDelete(true)}
            label="Eliminar cuenta"
            tone="danger"
            disabled={busy}
          />
        )}
      </SettingsGroup>

      <SavingsMovementModal
        open={movement != null}
        account={account}
        operation={movement}
        dailyAccounts={dailyAccounts}
        defaultAccountId={defaultAccountId}
        onAccountCreated={addAccount}
        onClose={() => setMovement(null)}
        onSaved={afterMovement}
      />

      {/* Editar un movimiento de esta cuenta: useAccounts() no ofrece las
          cuentas de ahorro (no se pueden elegir para un gasto/ingreso
          nuevo), pero esta fila YA está en una — tiene que poder seguir
          apareciendo elegida en el campo de cuenta, por eso va primero. */}
      <TransactionFormModal
        open={txModal.open}
        initial={txModal.editing}
        categories={categories}
        accounts={[account, ...dailyAccounts]}
        defaultAccountId={account.id}
        lastReconciliations={lastReconciliations}
        onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
        onAccountCreated={addAccount}
        onClose={() => setTxModal({ open: false, editing: null })}
        onSaved={afterTxSaved}
        onDeleted={afterTxSaved}
      />
    </SettingsPage>
  )
}

export default AccountDetail
