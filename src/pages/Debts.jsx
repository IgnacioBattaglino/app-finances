import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import Money from '../components/Money.jsx'
import EditIcon from '../components/EditIcon.jsx'
import DebtFormModal from '../components/DebtFormModal.jsx'
import DebtPaymentModal from '../components/DebtPaymentModal.jsx'
import { useAccounts } from '../hooks/useAccounts.js'
import { useLastReconciliations } from '../hooks/useLastReconciliations.js'
import FormError from '../components/form/FormError.jsx'
import {
  getDebts,
  debtBalance,
  totalPaid,
  payoffProgress,
  summarizeDebts,
} from '../lib/debts.js'
import { formatUSD, formatDayYear, formatPercent } from '../lib/format.js'

// Barra de avance del pago. Es la única señal visual propia de esta pantalla:
// la parte accent es lo ya pagado. Verde y no clay a propósito — pagar una deuda
// es progreso, no un error; clay queda para lo destructivo (borrar) como en el
// resto de la app.
function PayoffBar({ progress, className = '' }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-mist ${className}`}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  )
}

function PaymentRow({ payment, onEdit }) {
  return (
    <button
      type="button"
      onClick={() => onEdit(payment)}
      className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left transition active:bg-mist md:hover:bg-mist"
    >
      <span className="min-w-0">
        <span className="text-[15px]">{formatDayYear(payment.date)}</span>
        {/* El espacio es para el lector de pantalla: sin él el nombre accesible
            queda "10 de ago de 2026de afuera" (el ml-2 separa en pantalla, no
            en el árbol de accesibilidad). */}{' '}
        {payment.affects_liquid === false ? (
          <span className="ml-2 text-[13px] text-ink-soft">de afuera</span>
        ) : (
          // Un pago que debía salir del líquido pero no tiene tipo de cambio
          // congelado queda fuera de ese cálculo: se avisa acá, donde se puede
          // tocar para completarlo, en vez de dejar el líquido corto en silencio.
          !payment.mep_rate && (
            <span className="ml-2 text-[13px] text-clay">sin tipo de cambio</span>
          )
        )}
      </span>
      <span className="font-money shrink-0 text-[15px] font-medium">
        {formatUSD(Number(payment.amount_usd))}
      </span>
    </button>
  )
}

// Exportada solo para testearla: una deuda saldada tiene que seguir mostrando
// la vía a sus pagos (ver DebtCard.test.jsx). No se usa fuera de esta pantalla.
export function DebtCard({ debt, expanded, onToggle, onEdit, onPay, onEditPayment }) {
  const balance = debtBalance(debt)
  const paid = totalPaid(debt)
  const progress = payoffProgress(debt)
  const payments = [...(debt.payments ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <div className="surface overflow-hidden">
      <div className="px-5 pt-4 pb-4">
        <button
          type="button"
          onClick={() => onEdit(debt)}
          className="flex max-w-full min-w-0 items-center gap-1.5 text-left"
        >
          <span className="truncate text-[15px] font-medium">{debt.creditor}</span>
          <EditIcon />
        </button>

        <p className="mt-1.5 text-[28px] leading-none font-semibold">
          <Money value={balance} />
        </p>
        <p className="mt-1.5 text-[13px] text-ink-soft">
          {balance > 0 ? 'Te queda por pagar' : 'Saldada'}
        </p>

        <PayoffBar progress={progress} className="mt-3.5" />

        <p className="mt-2 text-[13px] text-ink-soft">
          Pagaste <span className="font-money">{formatUSD(paid)}</span> de{' '}
          <span className="font-money">{formatUSD(Number(debt.original_amount_usd))}</span> ·{' '}
          {formatPercent(progress * 100, 0)}
        </p>
      </div>

      <div className="flex border-t border-line">
        <button
          type="button"
          onClick={() => onPay(debt)}
          className="flex-1 py-3.5 text-[15px] font-semibold text-accent-ink transition active:bg-mist md:hover:bg-mist"
        >
          Registrar pago
        </button>
        <button
          type="button"
          onClick={() => onToggle(debt.id)}
          disabled={payments.length === 0}
          className="flex-1 border-l border-line py-3.5 text-[15px] font-medium text-ink-soft transition active:bg-mist disabled:opacity-40 md:hover:bg-mist"
        >
          {payments.length === 0
            ? 'Sin pagos'
            : expanded
              ? 'Ocultar pagos'
              : `Ver ${payments.length} ${payments.length === 1 ? 'pago' : 'pagos'}`}
        </button>
      </div>

      {expanded && payments.length > 0 && (
        <div className="rows border-t border-line bg-paper/60">
          {payments.map((p) => (
            <PaymentRow key={p.id} payment={p} onEdit={(payment) => onEditPayment(debt, payment)} />
          ))}
        </div>
      )}
    </div>
  )
}


function Debts() {
  // Cuentas del disponible (migración 0032): las ofrece el formulario de
  // carga, con la primera preseleccionada.
  const { accounts, defaultAccountId, addAccount } = useAccounts()
  const lastReconciliations = useLastReconciliations()
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [showSettled, setShowSettled] = useState(false)
  const [debtModal, setDebtModal] = useState({ open: false, editing: null })
  const [paymentModal, setPaymentModal] = useState({ open: false, debt: null, editing: null })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDebts(await getDebts())
    } catch (e) {
      setError({ message: 'No se pudieron cargar las deudas.', detail: e })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function closeModals() {
    setDebtModal({ open: false, editing: null })
    setPaymentModal({ open: false, debt: null, editing: null })
  }

  function refresh() {
    closeModals()
    load()
  }

  const { active, settled, totalBalance, totalOriginal, totalPaid: paidAll } = summarizeDebts(debts)
  const overallProgress = totalOriginal > 0 ? Math.min(1, paidAll / totalOriginal) : 0

  return (
    <div className="page">
      <PageHeader
        title="Deudas"
        action={
          debts.length > 0 && (
            <button
              type="button"
              onClick={() => setDebtModal({ open: true, editing: null })}
              className="btn btn-primary hidden md:inline-flex"
            >
              Nueva deuda
            </button>
          )
        }
      />

      {loading ? (
        <p className="text-[15px] text-ink-soft">Cargando…</p>
      ) : error ? (
        <div className="space-y-3">
          <FormError message={error.message} detail={error.detail} />
          <button
            type="button"
            onClick={load}
            className="text-[15px] font-semibold text-clay underline"
          >
            Reintentar
          </button>
        </div>
      ) : debts.length === 0 ? (
        <div className="surface px-6 py-10 text-center">
          <p className="text-[17px] font-semibold">Todavía no registraste ninguna deuda</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-ink-soft">
            Anotá lo que debés en dólares y registrá cada pago. El saldo baja solo, y los pagos no
            cuentan como gasto.
          </p>
          <button
            type="button"
            onClick={() => setDebtModal({ open: true, editing: null })}
            className="btn btn-primary mt-5"
          >
            Nueva deuda
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Resumen: el saldo restante es el número que importa. El original y
              lo pagado son referencia, en chico. */}
          <div className="surface overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <span className="eyebrow">Te queda por pagar</span>
              <p className="mt-2 text-[40px] leading-none font-semibold md:text-[44px]">
                <Money value={totalBalance} />
              </p>
              <PayoffBar progress={overallProgress} className="mt-4" />
              <p className="mt-2 text-[13px] text-ink-soft">
                Pagaste <span className="font-money">{formatUSD(paidAll)}</span> de{' '}
                <span className="font-money">{formatUSD(totalOriginal)}</span>
              </p>
            </div>
            {/* En desktop esta acción vive en el encabezado de la pantalla */}
            <button
              type="button"
              onClick={() => setDebtModal({ open: true, editing: null })}
              className="w-full border-t border-line py-3.5 text-[15px] font-semibold text-accent-ink transition active:bg-mist md:hidden"
            >
              Nueva deuda
            </button>
          </div>

          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:items-start">
              {active.map((debt) => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  expanded={expandedId === debt.id}
                  onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                  onEdit={(d) => setDebtModal({ open: true, editing: d })}
                  onPay={(d) => setPaymentModal({ open: true, debt: d, editing: null })}
                  onEditPayment={(d, p) => setPaymentModal({ open: true, debt: d, editing: p })}
                />
              ))}
            </div>
          )}

          {active.length === 0 && settled.length > 0 && (
            <p className="surface px-4 py-8 text-center text-[15px] text-ink-soft">
              No te queda nada por pagar.
            </p>
          )}

          {/* Saldadas: siguen existiendo con su historial, pero fuera del
              camino — ya no son plata que debas. */}
          {settled.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setShowSettled(!showSettled)}
                className="eyebrow px-1 transition hover:text-ink"
              >
                Saldadas ({settled.length}) {showSettled ? '−' : '+'}
              </button>
              {/* Misma tarjeta que una deuda activa, no una fila resumida: los
                  pagos de una saldada tienen que seguir siendo alcanzables
                  para corregirlos o borrarlos. Con una fila muerta, una deuda
                  saldada por error quedaba sin arreglo posible y encima no se
                  podía eliminar (el borrado exige borrar sus pagos antes). */}
              {showSettled && (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:items-start">
                  {settled.map((debt) => (
                    <DebtCard
                      key={debt.id}
                      debt={debt}
                      expanded={expandedId === debt.id}
                      onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                      onEdit={(d) => setDebtModal({ open: true, editing: d })}
                      onPay={(d) => setPaymentModal({ open: true, debt: d, editing: null })}
                      onEditPayment={(d, p) => setPaymentModal({ open: true, debt: d, editing: p })}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <DebtFormModal
        open={debtModal.open}
        initial={debtModal.editing}
        onClose={closeModals}
        onSaved={refresh}
        onDeleted={refresh}
      />
      {paymentModal.debt && (
        <DebtPaymentModal
          open={paymentModal.open}
          debt={paymentModal.debt}
          initial={paymentModal.editing}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          lastReconciliations={lastReconciliations}
          onAccountCreated={addAccount}
          onClose={closeModals}
          onSaved={refresh}
          onDeleted={refresh}
        />
      )}
    </div>
  )
}

export default Debts
