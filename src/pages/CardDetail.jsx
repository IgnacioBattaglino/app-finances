import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import SettingsPage from '../components/settings/SettingsPage.jsx'
import { SettingsGroup, SettingsButtonRow } from '../components/settings/SettingsList.jsx'
import MoneyStack from '../components/MoneyStack.jsx'
import FormError from '../components/form/FormError.jsx'
import CardFormModal from '../components/commitments/CardFormModal.jsx'
import CommitmentFormModal from '../components/commitments/CommitmentFormModal.jsx'
import PaymentCardVisual from '../components/commitments/PaymentCardVisual.jsx'
import { useAccounts } from '../hooks/useAccounts.js'
import { getCard, deleteCard } from '../lib/paymentCards.js'
import { getCommitmentsWithCharges } from '../lib/commitments.js'
import { getCategories } from '../lib/categories.js'
import { isFinished, planRemaining } from '../lib/commitmentSchedule.js'
import { formatByCurrency, formatPercent, todayISO } from '../lib/format.js'
import { ChevronRight } from '../components/Icons.jsx'

// Detalle de una tarjeta: lo que te va a llegar en el próximo resumen, las
// compras que lo componen, y al pie sus datos.
//
// La tarjeta existe para una sola cosa que ninguna otra pieza puede hacer:
// darle la MISMA fecha a todas sus compras. En la vida real se paga un solo
// resumen, no una fecha por compra.
function CardDetail() {
  const { cardId } = useParams()
  const navigate = useNavigate()
  const today = todayISO()
  const { accounts, addAccount } = useAccounts()

  const [card, setCard] = useState(null)
  const [plans, setPlans] = useState([])
  const [chargesByPlan, setCharges] = useState(new Map())
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [newPurchase, setNewPurchase] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [row, { plans: allPlans, chargesByPlan: charges }] = await Promise.all([
        getCard(cardId),
        getCommitmentsWithCharges(),
      ])
      setCard(row)
      setPlans(allPlans.filter((p) => p.card_id === cardId))
      setCharges(charges)
    } catch (e) {
      setError({ message: 'No se pudo cargar la tarjeta.', detail: e })
    } finally {
      setLoading(false)
    }
  }, [cardId])

  useEffect(() => {
    load()
    getCategories()
      .then(setCategories)
      .catch(() => {})
  }, [load])

  if (loading) {
    return (
      <SettingsPage title="Tarjeta" backTo="/compromisos" backLabel="Compromisos">
        <p className="px-1 text-subhead text-ink-soft">Cargando…</p>
      </SettingsPage>
    )
  }

  if (!card) {
    return (
      <SettingsPage title="Tarjeta" backTo="/compromisos" backLabel="Compromisos">
        <FormError {...(error ?? { message: 'No se encontró esta tarjeta.' })} />
      </SettingsPage>
    )
  }

  const active = plans.filter(
    (p) => !isFinished({ plan: p, charges: chargesByPlan.get(p.id) ?? [], today }),
  )
  const done = plans.filter((p) =>
    isFinished({ plan: p, charges: chargesByPlan.get(p.id) ?? [], today }),
  )
  // Lo que pesa por resumen: la suma de las cuotas que siguen vivas.
  const perMonth = active.reduce((sum, p) => sum + Number(p.amount), 0)
  // Y lo comprometido ENTERO: todo lo que falta pagar de esta tarjeta, que es
  // contra lo que tiene sentido leer un límite.
  const owed = active.reduce((sum, p) => {
    const remaining = planRemaining({ plan: p, charges: chargesByPlan.get(p.id) ?? [], today })
    return sum + (remaining?.amount ?? 0)
  }, 0)
  const limit = card.credit_limit == null ? null : Number(card.credit_limit)

  return (
    <SettingsPage title={card.name} backTo="/compromisos" backLabel="Compromisos">
      {error && <FormError {...error} />}

      <div className="flex justify-center">
        <PaymentCardVisual name={card.name} colorId={card.color} last4={card.last4} size="lg" />
      </div>

      <section className="surface p-4 md:p-5">
        <p className="eyebrow mb-1.5">Por resumen</p>
        <MoneyStack lines={[{ currency: card.currency, amount: perMonth }]} />
        <div className="mt-3 space-y-1 text-footnote text-ink-soft">
          <p>
            {card.due_day ? `Vence el ${card.due_day} de cada mes. ` : 'Sin día de vencimiento: cada compra usa su propia fecha. '}
            Te falta pagar {formatByCurrency(card.currency, owed)} en total.
          </p>
          {limit != null && (
            <p>
              Límite {formatByCurrency(card.currency, limit)} — llevás comprometido el{' '}
              {formatPercent(Math.min(100, (owed / limit) * 100), 0)}.
            </p>
          )}
        </div>
      </section>

      <SettingsGroup
        title="Compras en cuotas"
        footer="Todas vencen el mismo día que la tarjeta, porque se pagan en el mismo resumen."
      >
        {active.length === 0 && (
          <p className="px-4 py-3 text-subhead text-ink-soft">Todavía no cargaste ninguna compra.</p>
        )}
        {active.map((plan) => {
          const remaining = planRemaining({
            plan,
            charges: chargesByPlan.get(plan.id) ?? [],
            today,
          })
          return (
            <Link viewTransition
              key={plan.id}
              to={`/compromisos/planes/${plan.id}`}
              className="flex w-full items-center gap-3 px-4 py-3 text-left pressable"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">{plan.name}</span>
                <span className="block truncate text-footnote text-ink-soft">
                  {remaining && remaining.count > 0
                    ? `Quedan ${remaining.count} de ${plan.installments} · ${formatByCurrency(plan.currency, remaining.amount)}`
                    : 'Todas confirmadas'}
                </span>
              </span>
              <span className="font-money shrink-0 text-body text-ink-soft">
                {formatByCurrency(plan.currency, plan.amount)}
              </span>
              <ChevronRight />
            </Link>
          )
        })}
        <SettingsButtonRow label="Nueva compra en cuotas" onClick={() => setNewPurchase(true)} />
      </SettingsGroup>

      {done.length > 0 && (
        <SettingsGroup title={`Terminadas (${done.length})`}>
          {done.map((plan) => (
            <Link viewTransition
              key={plan.id}
              to={`/compromisos/planes/${plan.id}`}
              className="flex w-full items-center gap-3 px-4 py-3 text-left pressable"
            >
              <span className="min-w-0 flex-1 truncate text-body text-ink-soft">{plan.name}</span>
              <ChevronRight />
            </Link>
          ))}
        </SettingsGroup>
      )}

      <SettingsGroup>
        <SettingsButtonRow onClick={() => setEditing(true)} label="Editar la tarjeta" disabled={busy} />
      </SettingsGroup>

      <SettingsGroup
        footer={
          plans.length > 0
            ? 'Tiene compras cargadas: para eliminarla hay que borrarlas o pasarlas a otra tarjeta.'
            : undefined
        }
      >
        {confirmingDelete ? (
          <div className="space-y-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-subhead">
              <span className="min-w-0 truncate">¿Eliminar «{card.name}»?</span>
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
                      await deleteCard(card.id)
                      navigate('/compromisos', { viewTransition: true })
                    } catch (e) {
                      setError({ message: 'No se pudo eliminar la tarjeta.', detail: e })
                      setBusy(false)
                      setConfirmingDelete(false)
                    }
                  }}
                  disabled={busy}
                  className="font-semibold text-clay disabled:opacity-50"
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
            <p className="text-footnote text-ink-soft">Es permanente.</p>
          </div>
        ) : (
          <SettingsButtonRow
            onClick={() => setConfirmingDelete(true)}
            label="Eliminar la tarjeta"
            tone="danger"
            disabled={busy}
          />
        )}
      </SettingsGroup>

      <CardFormModal
        open={editing}
        initial={card}
        onClose={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false)
          await load()
        }}
      />

      <CommitmentFormModal
        open={newPurchase}
        defaultKind="installments"
        defaultCardId={card.id}
        cards={[card]}
        categories={categories}
        accounts={accounts}
        onClose={() => setNewPurchase(false)}
        onAccountCreated={addAccount}
        onSaved={async () => {
          setNewPurchase(false)
          await load()
        }}
      />
    </SettingsPage>
  )
}

export default CardDetail
