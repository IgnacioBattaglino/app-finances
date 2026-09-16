import { useEffect, useState } from 'react'
import FormSheet from '../FormSheet.jsx'
import BinaryChoice from '../form/BinaryChoice.jsx'
import CollapsedDateField from '../form/CollapsedDateField.jsx'
import AccountField from '../form/AccountField.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import { createCommitment, updateCommitment } from '../../lib/commitments.js'
import {
  FREQUENCIES,
  addMonths,
  daysInMonth,
  frequencyLabel,
  parseISO,
  splitTotal,
} from '../../lib/commitmentSchedule.js'
import { formatByCurrency, formatDayYear, todayISO } from '../../lib/format.js'
import { round } from '../../lib/money.js'

// Alta y edición de un plan: una compra en cuotas o una suscripción.
//
// ES UN SOLO FORMULARIO porque es una sola cosa con distinto final: algo que
// se paga a partir de una fecha, cada cierto tiempo. La única diferencia real
// es que una compra en cuotas TERMINA y una suscripción no — y eso es
// exactamente lo que cambia entre las dos mitades del form.
//
// EXCEPCIÓN deliberada a la convención general de CLAUDE.md ("cada campo se
// nombra con la pregunta que responde"): en Compromisos las etiquetas son
// sustantivos ("Nombre", "Cantidad de cuotas"), no preguntas. Es un cambio
// acotado a esta sección; el resto de la app sigue con preguntas hasta que se
// unifique el criterio.

const INSTALLMENTS = 'installments'
const SUBSCRIPTION = 'subscription'

const KINDS = [
  { value: INSTALLMENTS, label: 'En cuotas' },
  { value: SUBSCRIPTION, label: 'Suscripción' },
]

// Las dos formas de cargar el monto de una compra en cuotas, porque en la vida
// real a veces se sabe una y a veces la otra: el ticket dice el total, el
// resumen dice la cuota.
const BY_TOTAL = 'total'
const BY_INSTALLMENT = 'installment'

const AMOUNT_MODES = [
  { value: BY_TOTAL, label: 'El total' },
  { value: BY_INSTALLMENT, label: 'La cuota' },
]

const parse = (text) => {
  const value = Number(String(text).replace(',', '.'))
  return value > 0 ? round(value, 2) : null
}

const toInput = (value) => (value == null ? '' : String(value).replace('.', ','))

// El próximo día `day` a partir de hoy: con qué fecha viene precargado el
// primer vencimiento de una compra hecha con una tarjeta que tiene día de
// vencimiento. Es lo que hace que las tres compras de la misma tarjeta venzan
// el mismo día — en la vida real se paga un solo resumen.
function nextDayOfMonth(day, from = todayISO()) {
  const { year, month, day: today } = parseISO(from)
  const clamped = (y, m) => `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`
  if (day >= today) return clamped(year, month)
  return addMonths(clamped(year, month), 1)
}

function CommitmentFormModal({
  open,
  initial = null,
  defaultKind = INSTALLMENTS,
  cards = [],
  defaultCardId = null,
  categories = [],
  accounts = [],
  onClose,
  onSaved,
  onAccountCreated,
}) {
  const [kind, setKind] = useState(defaultKind)
  const [name, setName] = useState('')
  const [cardId, setCardId] = useState(null)
  const [amountMode, setAmountMode] = useState(BY_INSTALLMENT)
  const [amountText, setAmountText] = useState('')
  const [installments, setInstallments] = useState('')
  const [firstInstallment, setFirstInstallment] = useState('1')
  const [frequency, setFrequency] = useState('monthly')
  const [startDate, setStartDate] = useState(todayISO())
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const editing = Boolean(initial)

  useEffect(() => {
    if (!open) return
    if (initial) {
      // Editando, todo sale de la FILA, no de los defaults de hoy: guardar sin
      // tocar nada tiene que dejar el plan idéntico. Por eso el modo de carga
      // arranca en "la cuota", que es lo que la fila guarda — reconstruir un
      // total y volver a dividirlo podría correr un centavo sin que nadie lo
      // pida.
      setKind(initial.kind)
      setName(initial.name)
      setCardId(initial.card_id ?? null)
      setAmountMode(BY_INSTALLMENT)
      setAmountText(toInput(initial.amount))
      setInstallments(initial.installments == null ? '' : String(initial.installments))
      setFirstInstallment(String(initial.first_installment ?? 1))
      setFrequency(initial.frequency ?? 'monthly')
      setStartDate(initial.start_date)
      setCategoryId(initial.category_id)
      setAccountId(initial.account_id ?? null)
    } else {
      const card = cards.find((c) => c.id === defaultCardId) ?? null
      setKind(defaultKind)
      setName('')
      setCardId(defaultCardId)
      setAmountMode(BY_INSTALLMENT)
      setAmountText('')
      setInstallments('')
      setFirstInstallment('1')
      setFrequency('monthly')
      setStartDate(card?.due_day ? nextDayOfMonth(card.due_day) : todayISO())
      setCategoryId('')
      setAccountId(accounts[0]?.id ?? null)
    }
    setError(null)
    setBusy(false)
    // `cards` y `accounts` cambian de identidad en cada render del padre; las
    // dependencias que importan son las que definen QUÉ se está editando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, defaultKind, defaultCardId])

  const card = cards.find((c) => c.id === cardId) ?? null

  // La tarjeta le da la fecha a sus compras: elegir una mueve el primer
  // vencimiento a su día. Solo al ELEGIRLA — cambiar después el día de la
  // tarjeta no toca los planes que ya existen, porque eso les movería los
  // vencimientos ya confirmados debajo de los pies.
  function changeCard(nextId) {
    setCardId(nextId || null)
    const next = cards.find((c) => c.id === nextId)
    if (next?.due_day) setStartDate(nextDayOfMonth(next.due_day))
  }

  if (!open) return null

  const account = accounts.find((a) => a.id === accountId) ?? null
  const currency = account?.currency ?? 'ARS'
  const symbol = currency === 'USD' ? 'US$' : '$'

  const isInstallments = kind === INSTALLMENTS
  const count = Number(installments)
  const from = Number(firstInstallment)
  const typed = parse(amountText)

  // El reparto: con el total se divide y la PRIMERA absorbe la diferencia (es
  // lo que suelen hacer los bancos, así que coincide más seguido con el
  // resumen real); con la cuota no se inventa ningún centavo y el total sale
  // de multiplicar.
  let perInstallment = typed
  let firstAmount = null
  let total = typed
  if (isInstallments && count > 0 && typed != null) {
    if (amountMode === BY_TOTAL) {
      const split = splitTotal(typed, count)
      perInstallment = split.rest
      firstAmount = split.first === split.rest ? null : split.first
      total = typed
    } else {
      total = round(typed * count, 2)
    }
  }
  if (editing && isInstallments && amountMode === BY_INSTALLMENT) {
    // Editando sin tocar el monto se conserva la primera cuota que ya tenía:
    // recalcularla como "todas iguales" le movería un centavo a un plan que
    // nadie pidió cambiar.
    if (typed != null && typed === Number(initial.amount)) firstAmount = initial.first_amount ?? null
  }

  const missing = []
  if (!name.trim()) missing.push(isInstallments ? 'qué compraste' : 'qué es')
  if (!(typed > 0)) missing.push('monto')
  if (!categoryId) missing.push('categoría')
  if (!startDate) missing.push('fecha')
  if (isInstallments) {
    if (!(count > 0)) missing.push('cuántas cuotas')
    else if (!(from >= 1 && from <= count)) missing.push('desde qué cuota va')
  }
  const valid = missing.length === 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = {
      kind,
      name,
      categoryId,
      accountId,
      cardId,
      currency,
      amount: perInstallment,
      firstAmount,
      installments: isInstallments ? count : null,
      firstInstallment: isInstallments ? from : 1,
      frequency: isInstallments ? 'monthly' : frequency,
      startDate,
    }
    try {
      const saved = editing ? await updateCommitment(initial.id, fields) : await createCommitment(fields)
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo guardar el plan.', detail: e })
      setBusy(false)
    }
  }

  const expenseCategories = categories.filter((c) => c.kind === 'expense' && !c.is_system)
  const remaining = isInstallments && count > 0 ? count - from + 1 : null

  return (
    <FormSheet
      title={editing ? 'Editar' : isInstallments ? 'Nueva compra en cuotas' : 'Nueva suscripción'}
      subtitle={editing ? initial.name : card ? card.name : undefined}
      onClose={onClose}
      onSubmit={handleSubmit}
      canSubmit={valid}
      busy={busy}
    >
        {/* Al editar, el tipo no se cambia: una suscripción convertida en
            cuotas sería otro plan, con otros vencimientos, y los que ya se
            confirmaron quedarían colgados. */}
        {!editing && (
          <div className="list">
            <div className="px-4 py-3">
              <p className="mb-2 text-subhead">Tipo</p>
              <BinaryChoice options={KINDS} value={kind} onChange={setKind} />
              <p className="mt-1.5 text-footnote text-ink-soft">
                {isInstallments
                  ? 'Una compra que se paga en varias cuotas y se termina.'
                  : 'Algo que se debita solo, cada tanto, y no se termina.'}
              </p>
            </div>
          </div>
        )}

        <div className="list">
          <label className="row">
            <span className="shrink-0 text-body">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isInstallments ? 'Heladera' : 'Netflix'}
              required
              className="min-w-0 flex-1 input-inline"
            />
          </label>

          {isInstallments && (
            <label className="row">
              <span className="text-body">Tarjeta</span>
              <select
                value={cardId ?? ''}
                onChange={(e) => changeCard(e.target.value)}
                className="max-w-[55%] input-inline"
              >
                <option value="">Sin tarjeta</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="list">
          {isInstallments && (
            <div className="px-4 py-3">
              <p className="mb-2 text-subhead">Monto que conocés</p>
              <BinaryChoice options={AMOUNT_MODES} value={amountMode} onChange={setAmountMode} />
            </div>
          )}

          <label className="row">
            <span className="shrink-0 text-body">
              {!isInstallments ? 'Monto' : amountMode === BY_TOTAL ? 'Total' : 'Monto de la cuota'}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-subhead text-ink-soft">{symbol}</span>
              <input
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                required
                className="font-money w-28 input-inline"
              />
            </div>
          </label>

          {isInstallments ? (
            <>
              <label className="row">
                <span className="text-body">Cantidad de cuotas</span>
                <input
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder="6"
                  required
                  className="font-money w-16 input-inline"
                />
              </label>
              <div className="px-4 py-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-body">Primera cuota</span>
                  <input
                    value={firstInstallment}
                    onChange={(e) => setFirstInstallment(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className="font-money w-16 input-inline"
                  />
                </label>
                <p className="mt-1.5 text-footnote text-ink-soft">
                  Si ya pagaste algunas antes de cargar esto, poné la próxima que te toca. Las
                  anteriores no se cargan: se pagaron afuera de la app.
                </p>
              </div>
            </>
          ) : (
            <label className="row">
              <span className="text-body">Frecuencia</span>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="max-w-[55%] input-inline"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <CollapsedDateField
            value={startDate}
            onChange={setStartDate}
            // Cortas a propósito: con una etiqueta larga el label y la fecha
            // se partían los DOS en dos líneas en un teléfono. Cuál es "la
            // próxima" ya lo dice el contexto, y el resumen de abajo repite la
            // fecha de la última.
            label={isInstallments ? 'Vencimiento' : 'Débito'}
          />
        </div>

        {/* EL REPARTO, ANTES DE GUARDAR. Un centavo que aparece solo, sin
            avisar, es peor que el centavo. */}
        {isInstallments && total != null && count > 0 && (
          <div className="surface space-y-0.5 px-4 py-3 text-footnote text-ink-soft">
            <p className="text-subhead text-ink">
              {firstAmount != null
                ? `La primera, ${formatByCurrency(currency, firstAmount)}; las otras ${count - 1}, ${formatByCurrency(currency, perInstallment)}`
                : `${count} ${count === 1 ? 'cuota' : 'cuotas'} de ${formatByCurrency(currency, perInstallment)}`}
            </p>
            <p>
              Total {formatByCurrency(currency, total)}
              {remaining != null && remaining !== count
                ? ` · te quedan ${remaining} por pagar (${formatByCurrency(currency, round(perInstallment * remaining, 2))})`
                : ''}
            </p>
            {startDate && remaining > 0 && (
              <p>La última vence el {formatDayYear(addMonths(startDate, remaining - 1))}.</p>
            )}
          </div>
        )}

        {!isInstallments && startDate && (
          <p className="px-1 text-footnote text-ink-soft">
            {frequencyLabel(frequency)}, a partir del {formatDayYear(startDate)}. No termina nunca:
            cuando la des de baja, terminala desde su pantalla.
          </p>
        )}

        <div className="list">
          <label className="row">
            <span className="text-body">Categoría</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="max-w-[55%] input-inline"
            >
              <option value="" disabled>
                Elegir…
              </option>
              {expenseCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>

          <AccountField
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            label="Cuenta"
            onAccountCreated={onAccountCreated}
          />
        </div>

        <p className="px-1 text-footnote text-ink-soft">
          Con esa categoría se va a cargar cada pago cuando lo confirmes, como un gasto más. Hasta
          entonces no cuenta en ningún total.
        </p>

        <MissingHint missing={missing} />
        <FormError {...(error ?? {})} />
    </FormSheet>
  )
}

export default CommitmentFormModal
