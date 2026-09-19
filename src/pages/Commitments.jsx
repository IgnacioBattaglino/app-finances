import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import MoneyStack from '../components/MoneyStack.jsx'
import { ErrorNotice } from '../components/form/FormError.jsx'
import { SettingsGroup, SettingsLinkRow, SettingsCreateRow } from '../components/settings/SettingsList.jsx'
import CommitmentReminder from '../components/commitments/CommitmentReminder.jsx'
import CommitmentFormModal from '../components/commitments/CommitmentFormModal.jsx'
import CardFormModal from '../components/commitments/CardFormModal.jsx'
import PaymentCardVisual from '../components/commitments/PaymentCardVisual.jsx'
import { useCommitments } from '../hooks/useCommitments.js'
import { useAccounts } from '../hooks/useAccounts.js'
import { useCategories } from '../hooks/useCategories.js'
import { useCards } from '../hooks/useCards.js'
import { useDebts } from '../hooks/useDebts.js'
import { summarizeDebts } from '../lib/debts.js'
import {
  committedInMonth,
  duePayments,
  frequencyLabel,
  isFinished,
  monthKey,
  planRemaining,
} from '../lib/commitmentSchedule.js'
import { formatByCurrency, formatDayYear, formatUSD, todayISO } from '../lib/format.js'
import { ChevronRight } from '../components/Icons.jsx'

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

      <div className="mt-3 space-y-1 text-footnote text-ink-soft">
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
      viewTransition
      to={`/compromisos/planes/${plan.id}`}
      className="flex w-full items-center gap-3 px-4 py-3 text-left pressable"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body">{plan.name}</span>
        <span className="block truncate text-footnote text-ink-soft">{detail}</span>
      </span>
      <span className="font-money shrink-0 text-body text-ink-soft">
        {formatByCurrency(plan.currency, plan.amount)}
      </span>
      <ChevronRight />
    </Link>
  )
}

// Nunca "Sin tarjetas" ni "Deudas US$ 0,00" mientras se está cargando: los
// cinco bloques de la pantalla (recordatorio, Comprometido este mes,
// tarjetas, suscripciones, Deudas) esperan a las CUATRO fuentes juntas -- un
// vacío o un cero que todavía no se sabe si es cierto es peor que un
// esqueleto (ver plan de bloque 05). Los grupos llevan su título real:
// solo las filas de adentro son marcadores.
function CommitmentsSkeleton() {
  return (
    <div className="space-y-7" aria-busy="true" aria-label="Cargando">
      {['Tarjetas', 'Suscripciones'].map((title) => (
        <section key={title}>
          <h2 className="eyebrow px-1 pb-2">{title}</h2>
          <div className="list">
            {[0, 1].map((r) => (
              <div key={r} className="row">
                <span className="placeholder h-3.5 w-2/5" />
                <span className="placeholder h-3.5 w-1/5" />
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="list">
        <div className="row">
          <span className="placeholder h-3.5 w-16" />
          <span className="placeholder h-3.5 w-16" />
        </div>
      </div>
    </div>
  )
}

function Commitments() {
  const today = todayISO()
  const {
    plans,
    chargesByPlan,
    loading: commitmentsLoading,
    error: commitmentsError,
    reload: reloadCommitments,
  } = useCommitments()
  const { accounts, addAccount } = useAccounts()
  const { categories } = useCategories()
  const { cards, loading: cardsLoading, error: cardsError, reload: reloadCards } = useCards()
  const { debts, loading: debtsLoading, error: debtsError, reload: reloadDebts } = useDebts()
  const [planModal, setPlanModal] = useState(null) // { kind, cardId } | null
  const [cardModal, setCardModal] = useState(false)

  const loading = commitmentsLoading || cardsLoading || debtsLoading
  const error = commitmentsError ?? cardsError ?? debtsError

  function reload() {
    reloadCommitments()
    reloadCards()
    reloadDebts()
  }

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
        title="A pagar"
        description="Lo que ya está comprometido y todavía no salió de tu plata."
      />

      {error && <ErrorNotice error={error} onRetry={reload} className="mb-4" />}

      {!error && loading && <CommitmentsSkeleton />}

      {!error && !loading && (
      <div className="space-y-7">
        <CommitmentReminder
          due={due}
          accounts={accounts}
          onChanged={reloadCommitments}
          onAccountCreated={addAccount}
        />

        <CommittedCard lines={committed} />

        {/* Las notas al pie dicen qué ganás cargando algo, y solo mientras
            no hay nada: con la lista llena, explicar el concepto es ruido. */}
        <SettingsGroup
          title="Tarjetas"
          footer={
            cards.length === 0 &&
            'Cargá tus compras en cuotas en su tarjeta: vencen todas juntas, el día del resumen.'
          }
        >
          {cards.map((card) => {
            const ofCard = active.filter((p) => p.card_id === card.id)
            const monthly = ofCard.reduce((sum, p) => sum + Number(p.amount), 0)
            return (
              <Link
                viewTransition
                key={card.id}
                to={`/compromisos/tarjetas/${card.id}`}
                className="flex w-full items-center gap-3 px-4 py-3 text-left pressable"
              >
                {/* El nombre y el número van EN la tarjeta, no al lado: la
                    fila los mostraría truncados y repetidos. Lo que queda al
                    lado es lo único que el dibujo no puede decir. */}
                <PaymentCardVisual
                  name={card.name}
                  colorId={card.color}
                  last4={card.last4}
                  size="md"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">
                    {ofCard.length === 0
                      ? 'Sin compras'
                      : `${ofCard.length} ${ofCard.length === 1 ? 'compra' : 'compras'}`}
                  </span>
                  {card.due_day && (
                    <span className="block truncate text-footnote text-ink-soft">
                      Vence el {card.due_day}
                    </span>
                  )}
                </span>
                {monthly > 0 && (
                  <span className="font-money shrink-0 text-body text-ink-soft">
                    {formatByCurrency(card.currency, monthly)}
                  </span>
                )}
                <ChevronRight />
              </Link>
            )
          })}
          <SettingsCreateRow label="Nueva tarjeta" onClick={() => setCardModal(true)} />
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
          footer={
            subscriptions.length === 0 &&
            'Lo que pagás todos los meses sin fecha de fin, como el celular o el gimnasio.'
          }
        >
          {subscriptions.map((plan) => (
            <PlanRow key={plan.id} plan={plan} chargesByPlan={chargesByPlan} today={today} />
          ))}
          <SettingsCreateRow
            label="Nueva suscripción"
            onClick={() => setPlanModal({ kind: 'subscription', cardId: null })}
          />
        </SettingsGroup>

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
      )}

      <CommitmentFormModal
        open={Boolean(planModal)}
        defaultKind={planModal?.kind ?? 'installments'}
        defaultCardId={planModal?.cardId ?? null}
        cards={cards}
        categories={categories}
        accounts={accounts}
        onClose={() => setPlanModal(null)}
        onAccountCreated={addAccount}
        onSaved={() => setPlanModal(null)}
      />

      <CardFormModal open={cardModal} onClose={() => setCardModal(false)} onSaved={() => setCardModal(false)} />
    </div>
  )
}

export default Commitments
