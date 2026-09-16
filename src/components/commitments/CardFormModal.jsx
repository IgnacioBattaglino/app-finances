import { useEffect, useState } from 'react'
import FormSheet from '../FormSheet.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import PaymentCardVisual from './PaymentCardVisual.jsx'
import { CARD_COLORS, createCard, updateCard } from '../../lib/paymentCards.js'
import { round } from '../../lib/money.js'

// Alta y edición de una tarjeta. Tres campos y dos de ellos opcionales: lo
// único que la tarjeta necesita para existir es un nombre.
//
// El DÍA es lo que hace que la tarjeta valga la pena: se lo presta a sus
// compras, así que las tres que tengas en la misma vencen el mismo día — que
// es como funciona en la vida real, un solo resumen. Quien no se lo acuerda
// puede dejarlo vacío y cada compra usa su propia fecha, igual que hasta ahora.
//
// Las etiquetas son sustantivos ("Nombre", "Límite"), no preguntas: ver la
// nota de CommitmentFormModal sobre la excepción de Compromisos.
//
// COLOR: puramente de presentación (payment_cards.color, migración 0046), sin
// paleta compartida con los grupos de activos ni con el acento de la app —
// son los cinco colores de una tarjeta física. "Sin color" es una elección
// válida, igual que en el color de un grupo de activos.
//
// ÚLTIMOS 4 DÍGITOS (migración 0047): SOLO eso, nunca el número completo —no
// se pide ni se guarda—, y nunca inventado: si no están los cuatro, la
// previsualización no muestra nada (ver PaymentCardVisual). El input sólo
// deja escribir dígitos y corta en cuatro.
const NO_COLOR = { id: null, name: 'Sin color' }

function ColorChoice({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-3 gap-4 p-4 pt-0">
      {[NO_COLOR, ...CARD_COLORS].map((option) => {
        const selected = (value ?? null) === option.id
        return (
          <button
            key={option.id ?? 'none'}
            type="button"
            onClick={() => onChange(option.id)}
            disabled={disabled}
            aria-pressed={selected}
            className="flex flex-col items-center gap-1.5 disabled:opacity-40"
          >
            <span
              className={`h-9 w-14 rounded-md transition ${
                option.id ? '' : 'bg-mist shadow-[inset_0_0_0_1px_var(--color-line)]'
              } ${selected ? 'ring-2 ring-ink/30 ring-offset-2 ring-offset-card' : ''}`}
              style={
                option.id
                  ? {
                      backgroundColor: option.bg,
                      boxShadow: option.border ? `inset 0 0 0 1px ${option.border}` : undefined,
                    }
                  : undefined
              }
            />
            <span className={`text-footnote ${selected ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
              {option.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function CardFormModal({ open, initial = null, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [limit, setLimit] = useState('')
  const [currency, setCurrency] = useState('ARS')
  const [color, setColor] = useState(null)
  const [last4, setLast4] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const editing = Boolean(initial)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setDueDay(initial?.due_day == null ? '' : String(initial.due_day))
    setLimit(initial?.credit_limit == null ? '' : String(initial.credit_limit).replace('.', ','))
    setCurrency(initial?.currency ?? 'ARS')
    setColor(initial?.color ?? null)
    setLast4(initial?.last4 ?? '')
    setError(null)
    setBusy(false)
  }, [open, initial])

  if (!open) return null

  const day = dueDay === '' ? null : Number(dueDay)
  const parsedLimit = limit === '' ? null : Number(String(limit).replace(',', '.'))

  const missing = []
  if (!name.trim()) missing.push('nombre')
  if (day != null && !(day >= 1 && day <= 31)) missing.push('un día entre 1 y 31')
  if (parsedLimit != null && !(parsedLimit > 0)) missing.push('un límite mayor a cero')
  if (last4 && last4.length !== 4) missing.push('los 4 dígitos completos')
  const valid = missing.length === 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = {
      name,
      dueDay: day,
      creditLimit: parsedLimit == null ? null : round(parsedLimit, 2),
      currency,
      color,
      last4: last4 || null,
    }
    try {
      const saved = editing ? await updateCard(initial.id, fields) : await createCard(fields)
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo guardar la tarjeta.', detail: e })
      setBusy(false)
    }
  }

  const symbol = currency === 'USD' ? 'US$' : '$'

  return (
    <FormSheet
      title={editing ? 'Editar la tarjeta' : 'Nueva tarjeta'}
      onClose={onClose}
      action={
        <button
          type="submit"
          form="card-form"
          disabled={!valid || busy}
          className="btn-text text-subhead text-accent-ink"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="card-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="list">
          <label className="row">
            <span className="shrink-0 text-body">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Visa del banco"
              required
              className="min-w-0 flex-1 input-inline"
            />
          </label>

          <label className="row">
            <span className="text-body">Moneda</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="input-inline"
            >
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </label>

          <label className="row">
            <span className="text-body">Últimos 4 dígitos</span>
            <input
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="Opcional"
              className="font-money w-24 input-inline"
            />
          </label>
        </div>

        <div className="list">
          <div className="flex justify-center px-4 pt-4">
            <PaymentCardVisual name={name || 'Tarjeta'} colorId={color} last4={last4} size="lg" />
          </div>
          <ColorChoice value={color} onChange={setColor} disabled={busy} />
        </div>

        <div className="list">
          <label className="row">
            <span className="text-body">Día de pago</span>
            <input
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              placeholder="Opcional"
              className="font-money w-24 input-inline"
            />
          </label>

          <label className="row">
            <span className="text-body">Límite</span>
            <div className="flex items-center gap-1">
              <span className="text-subhead text-ink-soft">{symbol}</span>
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                inputMode="decimal"
                placeholder="Opcional"
                className="font-money w-28 input-inline"
              />
            </div>
          </label>
        </div>

        <MissingHint missing={missing} />
        <FormError {...(error ?? {})} />
      </form>
    </FormSheet>
  )
}

export default CardFormModal
