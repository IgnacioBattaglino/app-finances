import { useEffect, useState } from 'react'
import FormSheet from '../FormSheet.jsx'
import FormError from '../form/FormError.jsx'
import MissingHint from '../form/MissingHint.jsx'
import { createCard, updateCard } from '../../lib/paymentCards.js'
import { round } from '../../lib/money.js'

// Alta y edición de una tarjeta. Tres campos y dos de ellos opcionales: lo
// único que la tarjeta necesita para existir es un nombre.
//
// El DÍA es lo que hace que la tarjeta valga la pena: se lo presta a sus
// compras, así que las tres que tengas en la misma vencen el mismo día — que
// es como funciona en la vida real, un solo resumen. Quien no se lo acuerda
// puede dejarlo vacío y cada compra usa su propia fecha, igual que hasta ahora.
function CardFormModal({ open, initial = null, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [limit, setLimit] = useState('')
  const [currency, setCurrency] = useState('ARS')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const editing = Boolean(initial)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setDueDay(initial?.due_day == null ? '' : String(initial.due_day))
    setLimit(initial?.credit_limit == null ? '' : String(initial.credit_limit).replace('.', ','))
    setCurrency(initial?.currency ?? 'ARS')
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
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="card-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="list">
          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="shrink-0 text-[17px]">¿Cómo le decís?</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Visa del banco"
              required
              className="min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
            />
          </label>

          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[17px]">¿En qué moneda?</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-transparent text-right text-[17px] outline-none"
            >
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </label>
        </div>

        <div className="list">
          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[17px]">¿Qué día se paga?</span>
            <input
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              placeholder="—"
              className="font-money w-16 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
            />
          </label>

          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[17px]">¿Cuál es el límite?</span>
            <div className="flex items-center gap-1">
              <span className="text-[15px] text-ink-soft">{symbol}</span>
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                inputMode="decimal"
                placeholder="—"
                className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
              />
            </div>
          </label>
        </div>

        <p className="px-1 text-[13px] text-ink-soft">
          Los dos son opcionales. El día se lo presta a las compras que cargues acá, así que todas
          vencen el mismo día — como el resumen. El límite solo sirve para mostrarte cuánto llevás
          comprometido.
        </p>

        <MissingHint missing={missing} />
        <FormError {...(error ?? {})} />
      </form>
    </FormSheet>
  )
}

export default CardFormModal
