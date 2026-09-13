import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import MoneyStack from '../components/MoneyStack.jsx'
import FormError from '../components/form/FormError.jsx'
import { SettingsGroup, SettingsLinkRow } from '../components/settings/SettingsList.jsx'
import CommitmentReminder from '../components/commitments/CommitmentReminder.jsx'
import CommitmentFormModal from '../components/commitments/CommitmentFormModal.jsx'
import CardFormModal from '../components/commitments/CardFormModal.jsx'
import PaymentCardVisual from '../components/commitments/PaymentCardVisual.jsx'
import { useCommitments } from '../hooks/useCommitments.js'
import { useAccounts } from '../hooks/useAccounts.js'
import { getCards } from '../lib/paymentCards.js'
import { getCategories } from '../lib/categories.js'
import { getDebts, summarizeDebts } from '../lib/debts.js'
import {
  committedInMonth,
  duePayments,
  frequencyLabel,
  isFinished,
  monthKey,
  planRemaining,
} from '../lib/commitmentSchedule.js'
import { formatByCurrency, formatDayYear, formatUSD, todayISO } from '../lib/format.js'

// COMPROMISOS: la plata que ya está comprometida antes de que empiece el mes.
//
// Junta tres cosas que responden la misma pregunta —"¿qué tengo que pagar?"—:
// las compras en cuotas (agrupadas por la tarjeta que las paga), las
// suscripciones, y las deudas, que se mudaron acá desde Mi plata.
//
// ── LA DIFERENCIA QUE LA PANTALLA TIENE QUE MOSTRAR ────────────────────────
// Una cuota SE TERMINA y una suscripción NO. Por eso "Comprometido este mes"
// nunca es un número solo: dice qué parte se apaga y cuándo. Un total que sube
// y baja por su cuenta, sin explicación, no informa — confunde.

function CommittedCard({ lines }) {
  if (lines.length === 0) return null

  return (
    <section className="surface p-4 md:p-5">
      <p className="eyebrow mb-1.5">Comprometido este mes</p>
      <MoneyStack lines={lines.map((l) => ({ currency: l.currency, amount: l.total }))} />

      <div className="mt-3 space-y-1 text-[13px] text-ink-soft">
        {lines.map((line) => (
          <div key={line.currency} className="space-y-1">
            {lines.length > 1 && <p className="eyebrow">{line.currency}</p>}
            {line.ending > 0 && (
              <p>
                {formatByCurrency(line.currency, line.ending)} en cuotas, que se terminan
                {line.drops.length > 0 &&
                  ` — la última, el ${formatDayYear(line.drops[line.drops.length - 1].date)}`}
                .
              </p>
            )}
            {line.ongoing > 0 && (
              <p>
                {formatByCurrency(line.currency, line.ongoing)} en suscripciones, que siguen todos
                los meses.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// Una fila de plan: el nombre, en qué está y cuánto pesa por período. El
// "quedan N" es la respuesta a "¿cuánto me falta?", que hasta acá la app no
// sabía dar.
function PlanRow({ plan, chargesByPlan, today }) {
  const remaining = planRemaining({ plan, charges: chargesByPlan.get(plan.id) ?? [], today })
  const detail = remaining
    ? remaining.count > 0
      ? `Quedan ${remaining.count} de ${plan.installments} · ${formatByCurrency(plan.currency, remaining.amount)}`
      : `${plan.installments} cuotas, todas confirmadas`
    : frequencyLabel(plan.frequency)

  return (
    <Link
      to={`/compromisos/planes/${plan.id}`}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-mist md:hover:bg-mist"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px]">{plan.name}</span>
        <span className="block truncate text-[13px] text-ink-soft">{detail}</span>
      </span>
      <span className="font-money shrink-0 text-[17px] text-ink-soft">
        {formatByCurrency(plan.currency, plan.amount)}
      </span>
      <span aria-hidden="true" className="shrink-0 text-ink-faint">
        ›
      </span>
    </Link>
  )
}

function NewRow({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-4 py-3 text-left text-[17px] font-medium text-accent-ink transition active:bg-mist md:hover:bg-mist"
    >
      {label}
    </button>
  )
}

function Commitments() {
  const today = todayISO()
  const { plans, chargesByPlan, loading, error, reload } = useCommitments()
  const { accounts, addAccount } = useAccounts()
  const [cards, setCards] = useState([])
  const [categories, setCategories] = useState([])
  const [debts, setDebts] = useState([])
  const [debtsError, setDebtsError] = useState(null)
  const [planModal, setPlanModal] = useState(null) // { kind, cardId } | null
  const [cardModal, setCardModal] = useState(false)

  async function loadCards() {
    setCards(await getCards())
  }

  useEffect(() => {
    loadCards().catch(() => {})
    getCategories()
      .then(setCategories)
      .catch(() => {})
    getDebts()
      .then(setDebts)
      .catch((e) => setDebtsError({ message: 'No se pudieron cargar las deudas.', detail: e }))
  }, [])

  const finishedFlag = (plan) =>
    isFinished({ plan, charges: chargesByPlan.get(plan.id) ?? [], today })
  const active = plans.filter((p) => !finishedFlag(p))
  const finished = plans.filter(finishedFlag)
  const subscriptions = active.filter((p) => p.kind === 'subscription')
  const loose = active.filter((p) => p.kind === 'installments' && !p.card_id)

  const due = loading ? [] : duePayments({ plans, chargesByPlan, today })
  const committed = committedInMonth({ plans, chargesByPlan, month: monthKey(today), today })

  return (
    <div className="page-narrow">
      <PageHeader
        title="Compromisos"
        description="Lo que ya está comprometido y todavía no salió de tu plata."
      />

      <div className="space-y-7">
        {error && <FormError {...error} />}

        <CommitmentReminder
          due={due}
          accounts={accounts}
          onChanged={reload}
          onAccountCreated={addAccount}
        />

        <CommittedCard lines={committed} />

        <SettingsGroup
          title="Tarjetas"
          footer="Las compras de una misma tarjeta vencen todas el mismo día, como el resumen."
        >
          {cards.map((card) => {
            const ofCard = active.filter((p) => p.card_id === card.id)
            const monthly = ofCard.reduce((sum, p) => sum + Number(p.amount), 0)
            return (
              <Link
                key={card.id}
                to={`/compromisos/tarjetas/${card.id}`}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-mist md:hover:bg-mist"
              >
                <PaymentCardVisual name={card.name} colorId={card.color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px]">{card.name}</span>
                  <span className="block truncate text-[13px] text-ink-soft">
                    {ofCard.length === 0
                      ? 'Sin compras cargadas'
                      : `${ofCard.length} ${ofCard.length === 1 ? 'compra' : 'compras'}${
                          card.due_day ? ` · vence el ${card.due_day}` : ''
                        }`}
                  </span>
                </span>
                {monthly > 0 && (
                  <span className="font-money shrink-0 text-[17px] text-ink-soft">
                    {formatByCurrency(card.currency, monthly)}
                  </span>
                )}
                <span aria-hidden="true" className="shrink-0 text-ink-faint">
                  ›
                </span>
              </Link>
            )
          })}
          <NewRow label="Nueva tarjeta" onClick={() => setCardModal(true)} />
        </SettingsGroup>

        {/* Una compra en cuotas sin tarjeta es legítima (un plan del comercio,
            un préstamo entre conocidos): usa su propia fecha en vez de la del
            resumen, y por eso vive suelta y no dentro de ninguna tarjeta. */}
        {loose.length > 0 && (
          <SettingsGroup title="Cuotas sin tarjeta">
            {loose.map((plan) => (
              <PlanRow key={plan.id} plan={plan} chargesByPlan={chargesByPlan} today={today} />
            ))}
          </SettingsGroup>
        )}

        <SettingsGroup
          title="Suscripciones"
          footer="No tienen final ni total: no le debés nada a Netflix el año que viene."
        >
          {subscriptions.map((plan) => (
            <PlanRow key={plan.id} plan={plan} chargesByPlan={chargesByPlan} today={today} />
          ))}
          <NewRow
            label="Nueva suscripción"
            onClick={() => setPlanModal({ kind: 'subscription', cardId: null })}
          />
        </SettingsGroup>

        {debtsError && <FormError {...debtsError} />}
        {/* Deudas se mudó acá desde Mi plata: "lo que tengo" y "lo que debo"
            son dos preguntas distintas, y esta pestaña es la de la segunda.
            Siempre visible, aunque el saldo sea 0 — es el único punto de
            entrada a Deudas. */}
        <SettingsGroup footer="Un pago de deuda baja el saldo pero no cuenta como gasto del mes; se reporta aparte.">
          <SettingsLinkRow
            to="/compromisos/deudas"
            label="Deudas"
            value={formatUSD(summarizeDebts(debts).totalBalance)}
          />
        </SettingsGroup>

        {/* Nada desaparece: un plan terminado baja acá con su historial
            entero. Mismo patrón que "Saldadas" en Deudas y "Archivados" en
            Inversiones. */}
        {finished.length > 0 && (
          <SettingsGroup title={`Terminados (${finished.length})`}>
            {finished.map((plan) => (
              <PlanRow key={plan.id} plan={plan} chargesByPlan={chargesByPlan} today={today} />
            ))}
          </SettingsGroup>
        )}
      </div>

      <CommitmentFormModal
        open={Boolean(planModal)}
        defaultKind={planModal?.kind ?? 'installments'}
        defaultCardId={planModal?.cardId ?? null}
        cards={cards}
        categories={categories}
        accounts={accounts}
        onClose={() => setPlanModal(null)}
        onAccountCreated={addAccount}
        onSaved={async () => {
          setPlanModal(null)
          await reload()
        }}
      />

      <CardFormModal
        open={cardModal}
        onClose={() => setCardModal(false)}
        onSaved={async () => {
          setCardModal(false)
          await loadCards()
        }}
      />
    </div>
  )
}

export default Commitments
