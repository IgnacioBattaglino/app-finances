import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import EditIcon from '../components/EditIcon.jsx'
import DebtFormModal from '../components/DebtFormModal.jsx'
import DebtPaymentModal from '../components/DebtPaymentModal.jsx'
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
// la parte pine es lo ya pagado. Verde y no clay a propósito — pagar una deuda
// es progreso, no un error; clay queda para lo destructivo (borrar) como en el
// resto de la app.
function PayoffBar({ progress, className = '' }) {
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-mist ${className}`}>
      <div
        className="h-full rounded-full bg-pine transition-[width] duration-500"
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
      className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left transition active:bg-mist/60"
    >
      <span className="min-w-0">
        <span className="text-[13px]">{formatDayYear(payment.date)}</span>
        {/* El espacio es para el lector de pantalla: sin él el nombre accesible
            queda "10 de ago de 2026de afuera" (el ml-2 separa en pantalla, no
            en el árbol de accesibilidad). */}{' '}
        {payment.affects_liquid === false ? (
          <span className="ml-2 text-[11px] text-ink-soft">de afuera</span>
        ) : (
          // Un pago que debía salir del líquido pero no tiene tipo de cambio
          // congelado queda fuera de ese cálculo: se avisa acá, donde se puede
          // tocar para completarlo, en vez de dejar el líquido corto en silencio.
          !payment.mep_rate && (
            <span className="ml-2 text-[11px] text-clay">sin tipo de cambio</span>
          )
        )}
      </span>
      <span className="font-money shrink-0 text-[13px]">{formatUSD(Number(payment.amount_usd))}</span>
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
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onEdit(debt)}
            className="flex min-w-0 items-center gap-1.5 text-left"
          >
            <span className="truncate text-[15px] font-medium">{debt.creditor}</span>
            <EditIcon />
          </button>
          <span className="font-money shrink-0 text-xl tracking-tight">{formatUSD(balance)}</span>
        </div>

        <p className="mt-0.5 text-right text-[11px] text-ink-soft">
          {balance > 0 ? 'te queda por pagar' : 'saldada'}
        </p>

        <PayoffBar progress={progress} className="mt-3" />

        <p className="mt-2 text-xs text-ink-soft">
          Pagaste <span className="font-money">{formatUSD(paid)}</span> de{' '}
          <span className="font-money">{formatUSD(Number(debt.original_amount_usd))}</span> ·{' '}
          {formatPercent(progress * 100, 0)}
        </p>
      </div>

      <div className="flex divide-x divide-line border-t border-line">
        <button
          type="button"
          onClick={() => onPay(debt)}
          className="flex-1 py-2.5 text-sm font-medium text-pine transition active:bg-mist/60"
        >
          Registrar pago
        </button>
        <button
          type="button"
          onClick={() => onToggle(debt.id)}
          disabled={payments.length === 0}
          className="flex-1 py-2.5 text-sm font-medium text-ink-soft transition active:bg-mist/60 disabled:opacity-40"
        >
          {payments.length === 0
            ? 'Sin pagos'
            : expanded
              ? 'Ocultar pagos'
              : `Ver ${payments.length} ${payments.length === 1 ? 'pago' : 'pagos'}`}
        </button>
      </div>

      {expanded && payments.length > 0 && (
        <div className="divide-y divide-line border-t border-line bg-paper/40">
          {payments.map((p) => (
            <PaymentRow key={p.id} payment={p} onEdit={(payment) => onEditPayment(debt, payment)} />
          ))}
        </div>
      )}
    </div>
  )
}


function Debts() {
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
      setError({ message: 'No se pudieron cargar las deudas.', detail: e.message })
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
    <div>
      <PageHeader title="Deudas" />

      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : error ? (
        <div className="space-y-3">
          <FormError message={error.message} detail={error.detail} />
          <button
            type="button"
            onClick={load}
            className="text-sm font-semibold text-clay underline"
          >
            Reintentar
          </button>
        </div>
      ) : debts.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card px-4 py-8 text-center">
          <p className="text-[15px] font-medium">Todavía no registraste ninguna deuda</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
            Anotá lo que debés en dólares y registrá cada pago. El saldo baja solo, y los pagos no
            cuentan como gasto.
          </p>
          <button
            type="button"
            onClick={() => setDebtModal({ open: true, editing: null })}
            className="mt-4 rounded-xl bg-pine px-4 py-2.5 text-sm font-semibold text-white transition active:bg-pine-deep"
          >
            Nueva deuda
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Resumen: el saldo restante es el número que importa. El original y
              lo pagado son referencia, en chico. */}
          <div className="rounded-2xl border border-line bg-card px-4 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              Deudas
            </p>
            <p className="font-money mt-1 text-3xl tracking-tight">{formatUSD(totalBalance)}</p>
            <PayoffBar progress={overallProgress} className="mt-4" />
            <p className="mt-2 text-xs text-ink-soft">
              pagaste <span className="font-money">{formatUSD(paidAll)}</span> de{' '}
              <span className="font-money">{formatUSD(totalOriginal)}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDebtModal({ open: true, editing: null })}
            className="w-full rounded-xl border border-line bg-card py-2.5 text-sm font-medium transition active:bg-mist/60"
          >
            Nueva deuda
          </button>

          {active.length > 0 && (
            <div className="space-y-3">
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
            <p className="rounded-2xl border border-line bg-card px-4 py-6 text-center text-sm text-ink-soft">
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
                className="px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
              >
                Saldadas ({settled.length}) {showSettled ? '−' : '+'}
              </button>
              {/* Misma tarjeta que una deuda activa, no una fila resumida: los
                  pagos de una saldada tienen que seguir siendo alcanzables
                  para corregirlos o borrarlos. Con una fila muerta, una deuda
                  saldada por error quedaba sin arreglo posible y encima no se
                  podía eliminar (el borrado exige borrar sus pagos antes). */}
              {showSettled && (
                <div className="space-y-3">
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
          onClose={closeModals}
          onSaved={refresh}
          onDeleted={refresh}
        />
      )}
    </div>
  )
}

export default Debts
