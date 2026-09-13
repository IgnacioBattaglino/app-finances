import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SettingsPage from '../components/settings/SettingsPage.jsx'
import { SettingsGroup, SettingsButtonRow } from '../components/settings/SettingsList.jsx'
import MoneyStack from '../components/MoneyStack.jsx'
import FormError from '../components/form/FormError.jsx'
import CommitmentFormModal from '../components/commitments/CommitmentFormModal.jsx'
import ConfirmChargeModal from '../components/commitments/ConfirmChargeModal.jsx'
import { useAccounts } from '../hooks/useAccounts.js'
import { getCards } from '../lib/paymentCards.js'
import { getCategories } from '../lib/categories.js'
import {
  confirmCharge,
  deleteCommitment,
  dismissCharge,
  finishCommitment,
  getCommitment,
  getCommitmentCharges,
  reopenCommitment,
  unconfirmCharge,
  undismissCharge,
} from '../lib/commitments.js'
import {
  CONFIRMED,
  DISMISSED,
  OVERDUE,
  PENDING,
  frequencyLabel,
  isFinished,
  occurrenceTitle,
  planOccurrences,
  planRemaining,
  planTotal,
} from '../lib/commitmentSchedule.js'
import { formatByCurrency, formatDayYear, todayISO } from '../lib/format.js'

// Detalle de un plan: primero cuánto falta, después la lista de vencimientos
// uno por uno, y al pie las dos acciones que lo apagan.
//
// ── TERMINAR NO ES ELIMINAR ────────────────────────────────────────────────
// Son dos cosas distintas y la app ya tiene la distinción en todos lados:
// terminar es NEUTRO y reversible, eliminar es ROJO y permanente. Y hay una
// sola operación de "terminar" para los dos tipos de plan, porque cancelar una
// suscripción y terminar un plan de cuotas son literalmente lo mismo: este
// plan deja de generar vencimientos a partir de tal fecha. Dos caminos que
// hacen lo mismo con distinta palabra es peor que uno solo.
//
// Y las dos dicen en castellano qué va a pasar ANTES de que se toque nada.

const STATUS_LABEL = {
  [CONFIRMED]: 'Confirmado',
  [DISMISSED]: 'No lo pagué',
  [OVERDUE]: 'Vencido',
  [PENDING]: 'Pendiente',
}

function OccurrenceRow({ occurrence, onConfirm, onAdjust, onUndo, onDismiss, busy }) {
  const { status, dueDate, amount, currency, number, of } = occurrence
  const resolved = status === CONFIRMED || status === DISMISSED

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[17px]">
            {number && of ? `Cuota ${number} de ${of}` : formatDayYear(dueDate)}
          </span>
          <span
            className={`block truncate text-[13px] ${status === OVERDUE ? 'text-clay' : 'text-ink-soft'}`}
          >
            {number && of ? `${formatDayYear(dueDate)} · ` : ''}
            {STATUS_LABEL[status]}
          </span>
        </span>
        <span className="font-money shrink-0 text-[17px]">
          {formatByCurrency(currency, amount)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        {resolved ? (
          <button
            type="button"
            onClick={() => onUndo(occurrence)}
            disabled={busy}
            className="text-ink-soft underline decoration-dotted underline-offset-4 disabled:opacity-40"
          >
            {status === CONFIRMED ? 'Deshacer (borra el gasto)' : 'Volver a dejarlo pendiente'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onConfirm(occurrence)}
              disabled={busy}
              className="font-semibold text-accent-ink disabled:opacity-40"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => onAdjust(occurrence)}
              disabled={busy}
              className="text-ink-soft underline decoration-dotted underline-offset-4 disabled:opacity-40"
            >
              Cambió el monto
            </button>
            <button
              type="button"
              onClick={() => onDismiss(occurrence)}
              disabled={busy}
              className="text-ink-soft underline decoration-dotted underline-offset-4 disabled:opacity-40"
            >
              No lo pagué
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function CommitmentDetail() {
  const { commitmentId } = useParams()
  const navigate = useNavigate()
  const today = todayISO()
  const { accounts, addAccount } = useAccounts()

  const [plan, setPlan] = useState(null)
  const [charges, setCharges] = useState([])
  const [cards, setCards] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [adjusting, setAdjusting] = useState(null)
  const [confirmingFinish, setConfirmingFinish] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [row, byPlan] = await Promise.all([getCommitment(commitmentId), getCommitmentCharges()])
      setPlan(row)
      setCharges(byPlan.get(commitmentId) ?? [])
    } catch (e) {
      setError({ message: 'No se pudo cargar este plan.', detail: e })
    } finally {
      setLoading(false)
    }
  }, [commitmentId])

  useEffect(() => {
    load()
    getCards()
      .then(setCards)
      .catch(() => {})
    getCategories()
      .then(setCategories)
      .catch(() => {})
  }, [load])

  async function run(action, message) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (e) {
      setError({ message, detail: e })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <SettingsPage title="Plan" backTo="/compromisos" backLabel="Compromisos">
        <p className="px-1 text-[15px] text-ink-soft">Cargando…</p>
      </SettingsPage>
    )
  }

  if (!plan) {
    return (
      <SettingsPage title="Plan" backTo="/compromisos" backLabel="Compromisos">
        <FormError {...(error ?? { message: 'No se encontró este plan.' })} />
      </SettingsPage>
    )
  }

  const occurrences = planOccurrences({ plan, charges, today })
  const remaining = planRemaining({ plan, charges, today })
  const total = planTotal(plan)
  const confirmedCount = charges.filter((c) => c.transaction_id).length
  const openCount = occurrences.filter((o) => o.status === PENDING || o.status === OVERDUE).length
  const finished = isFinished({ plan, charges, today })

  const headline = remaining
    ? [{ currency: plan.currency, amount: remaining.count > 0 ? remaining.amount : 0 }]
    : [{ currency: plan.currency, amount: Number(plan.amount) }]

  return (
    <SettingsPage title={plan.name} backTo="/compromisos" backLabel="Compromisos">
      {error && <FormError {...error} />}

      <section className="surface p-4 md:p-5">
        <p className="eyebrow mb-1.5">{remaining ? 'Te falta pagar' : 'Cada vez'}</p>
        <MoneyStack lines={headline} />
        <div className="mt-3 space-y-1 text-[13px] text-ink-soft">
          {remaining ? (
            <>
              <p>
                {remaining.count === 0
                  ? 'Ya confirmaste todas las cuotas'
                  : remaining.count === plan.installments
                    ? `Las ${remaining.count} cuotas, sin confirmar todavía`
                    : `${remaining.count} de ${plan.installments} ${remaining.count === 1 ? 'cuota' : 'cuotas'}`}
                {total != null ? ` · la compra salió ${formatByCurrency(plan.currency, total)}` : ''}
              </p>
              {remaining.lastDueDate && (
                <p>La última cuota vence el {formatDayYear(remaining.lastDueDate)}.</p>
              )}
            </>
          ) : (
            <p>
              {frequencyLabel(plan.frequency)}. No termina: cuando la des de baja, terminala desde
              acá abajo.
            </p>
          )}
          <p>
            {plan.category?.name ?? 'Sin categoría'}
            {plan.account?.name ? ` · sale de ${plan.account.name}` : ' · sin cuenta'}
            {plan.card?.name ? ` · ${plan.card.name}` : ''}
          </p>
          {finished && plan.ends_on && (
            <p className="text-clay">Terminado el {formatDayYear(plan.ends_on)}.</p>
          )}
        </div>
      </section>

      <SettingsGroup>
        <SettingsButtonRow
          onClick={() => setEditing(true)}
          label="Editar este plan"
          disabled={busy}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Vencimientos"
        footer="Confirmar carga el gasto en tu categoría, como cualquier otro. Hasta que lo confirmes no cuenta en ningún total ni toca tu disponible."
      >
        {occurrences.length === 0 ? (
          <p className="px-4 py-3 text-[15px] text-ink-soft">Este plan no genera vencimientos.</p>
        ) : (
          occurrences.map((occurrence) => (
            <OccurrenceRow
              key={occurrence.dueDate}
              occurrence={occurrence}
              busy={busy}
              onConfirm={(o) =>
                run(
                  () =>
                    confirmCharge({
                      commitmentId: plan.id,
                      dueDate: o.dueDate,
                      date: o.dueDate,
                      amount: o.amount,
                      accountId: plan.account_id ?? null,
                      description: occurrenceTitle(o),
                    }),
                  'No se pudo confirmar el pago.',
                )
              }
              onAdjust={setAdjusting}
              onDismiss={(o) =>
                run(
                  () => dismissCharge({ commitmentId: plan.id, dueDate: o.dueDate }),
                  'No se pudo descartar el vencimiento.',
                )
              }
              onUndo={(o) =>
                run(
                  () =>
                    o.status === CONFIRMED
                      ? unconfirmCharge({ commitmentId: plan.id, dueDate: o.dueDate })
                      : undismissCharge({ commitmentId: plan.id, dueDate: o.dueDate }),
                  'No se pudo deshacer.',
                )
              }
            />
          ))
        )}
      </SettingsGroup>

      {/* TERMINAR: neutro y reversible, nunca rojo, y la palabra "eliminar" no
          aparece en este camino. El texto dice qué pasa con lo confirmado y
          con lo pendiente antes de que se toque nada. */}
      <SettingsGroup>
        {finished ? (
          <SettingsButtonRow
            onClick={() => run(() => reopenCommitment(plan.id), 'No se pudo reactivar el plan.')}
            label="Volver a activarlo"
            tone="neutral"
            disabled={busy}
          />
        ) : confirmingFinish ? (
          <div className="space-y-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-[15px]">
              <span className="min-w-0 truncate">¿Terminar «{plan.name}»?</span>
              <div className="flex shrink-0 items-center gap-4">
                <button
                  type="button"
                  onClick={() => setConfirmingFinish(false)}
                  disabled={busy}
                  className="text-ink-soft"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await finishCommitment(plan.id, today)
                      setConfirmingFinish(false)
                    }, 'No se pudo terminar el plan.')
                  }
                  disabled={busy}
                  className="font-semibold text-accent-ink disabled:opacity-50"
                >
                  Sí, terminarlo
                </button>
              </div>
            </div>
            <p className="text-[13px] text-ink-soft">
              Deja de generar vencimientos a partir de hoy. Los{' '}
              {confirmedCount === 1 ? 'que ya confirmaste queda' : `${confirmedCount} que ya confirmaste quedan`}{' '}
              como gastos tuyos y no se tocan.
              {openCount > 0
                ? ` Los ${openCount} que vencieron y no confirmaste siguen pendientes: si no los vas a pagar, marcá "No lo pagué" en cada uno.`
                : ''}{' '}
              El plan baja a «Terminados», con su historial entero, y se puede volver a activar.
            </p>
          </div>
        ) : (
          <SettingsButtonRow
            onClick={() => setConfirmingFinish(true)}
            label={plan.kind === 'subscription' ? 'Dar de baja' : 'Terminar este plan'}
            tone="neutral"
            disabled={busy}
          />
        )}
      </SettingsGroup>

      {/* ELIMINAR: solo para un plan que nunca cobró nada. Con alguna cuota
          confirmada este botón ni aparece — lo que corresponde ahí es
          terminarlo, que es lo de arriba. Misma regla que una categoría, que
          se borra de verdad solo si ningún movimiento la usa. */}
      <SettingsGroup
        footer={
          confirmedCount > 0
            ? `No se puede eliminar: ya confirmaste ${confirmedCount} ${confirmedCount === 1 ? 'pago' : 'pagos'} con este plan, y esos gastos son tuyos. Terminalo en vez de borrarlo.`
            : 'Se borra del todo, sin dejar rastro. No hay ningún gasto cargado con este plan.'
        }
      >
        {confirmedCount > 0 ? (
          <SettingsButtonRow label="Eliminar este plan" tone="danger" disabled onClick={() => {}} />
        ) : confirmingDelete ? (
          <div className="space-y-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-[15px]">
              <span className="min-w-0 truncate">¿Eliminar «{plan.name}»?</span>
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
                  onClick={async () => {
                    setBusy(true)
                    setError(null)
                    try {
                      await deleteCommitment(plan.id)
                      navigate('/compromisos')
                    } catch (e) {
                      setError({ message: 'No se pudo eliminar el plan.', detail: e })
                      setBusy(false)
                    }
                  }}
                  disabled={busy}
                  className="font-semibold text-clay disabled:opacity-50"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
            <p className="text-[13px] text-ink-soft">Es permanente: el plan y sus fechas se borran.</p>
          </div>
        ) : (
          <SettingsButtonRow
            onClick={() => setConfirmingDelete(true)}
            label="Eliminar este plan"
            tone="danger"
            disabled={busy}
          />
        )}
      </SettingsGroup>

      <CommitmentFormModal
        open={editing}
        initial={plan}
        cards={cards}
        categories={categories}
        accounts={accounts}
        onClose={() => setEditing(false)}
        onAccountCreated={addAccount}
        onSaved={async () => {
          setEditing(false)
          await load()
        }}
      />

      <ConfirmChargeModal
        open={Boolean(adjusting)}
        occurrence={adjusting}
        accounts={accounts}
        onClose={() => setAdjusting(null)}
        onAccountCreated={addAccount}
        onSaved={async () => {
          setAdjusting(null)
          await load()
        }}
      />
    </SettingsPage>
  )
}

export default CommitmentDetail
