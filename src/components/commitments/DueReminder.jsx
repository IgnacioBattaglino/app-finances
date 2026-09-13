import { Link } from 'react-router-dom'
import { formatByCurrency, formatDayYear } from '../../lib/format.js'
import { OVERDUE, occurrenceTitle } from '../../lib/commitmentSchedule.js'

// EL RECORDATORIO. Una sola fila, siempre, pase lo que pase.
//
// ── POR QUÉ UNA SOLA FILA ──────────────────────────────────────────────────
// Inicio ya tiene cuatro o cinco tarjetas, la curva y el bloque de gastos. Una
// lista de seis cuotas arriba de todo lo rompe. Así que el bloque muestra el
// vencimiento MÁS URGENTE y cuenta el resto en una línea chica: confirmar
// cuatro son cuatro toques sin salir de Inicio y sin que el bloque crezca un
// pixel, porque al confirmar uno la misma fila pasa a mostrar el siguiente.
//
// ── POR QUÉ NO SE VUELVE PAISAJE ───────────────────────────────────────────
// Un aviso fijo, siempre igual, deja de avisar a las tres semanas. Acá lo que
// distingue un vencido de uno que recién vence es lo único que no se puede
// ignorar: un número que SUBE SOLO. "Venció hace 12 días" no es la misma fila
// que era ayer.
//
// El bloque no se mueve de lugar nunca —Inicio no puede cambiar de forma
// según el estado— y lo que cambia es el teñido, el texto y el peso:
//
//   · vencido    → teñido en clay, texto en clay y semibold
//   · por vencer → sin teñir, texto en ink-soft, peso normal
//
// Cuando no hay nada que confirmar no está, que es el mismo criterio que ya
// usa la tarjeta de Deudas ("un US$ 0 permanente es ruido").

function lateLabel(occurrence) {
  const { daysLate, dueDate } = occurrence
  if (daysLate > 1) return `venció hace ${daysLate} días`
  if (daysLate === 1) return 'venció ayer'
  if (daysLate === 0) return 'vence hoy'
  if (daysLate === -1) return 'vence mañana'
  if (daysLate > -7) return `vence en ${-daysLate} días`
  return `vence el ${formatDayYear(dueDate)}`
}

function DueReminder({ due, onConfirm, onAdjust, confirming = null, className = '' }) {
  if (due.length === 0) return null

  const [next, ...rest] = due
  const overdue = next.status === OVERDUE
  const busy = confirming === `${next.planId}|${next.dueDate}`

  return (
    <section
      className={`${overdue ? 'notice' : 'surface p-4'} ${className}`}
      aria-label="Vencimientos para confirmar"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[15px] ${overdue ? 'font-semibold' : 'font-medium text-ink'}`}>
            {occurrenceTitle(next)}
          </p>
          <p className={`text-[13px] ${overdue ? '' : 'text-ink-soft'}`}>
            {lateLabel(next)}
            {next.plan.account?.name ? ` · ${next.plan.account.name}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={() => onConfirm(next)}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? 'Guardando…' : 'Confirmar'}
          </button>
          {/* El monto ES el botón para corregirlo: "un toque para decir si el
              monto cambió". El camino normal no cuesta ese toque —Confirmar ya
              usa el monto del plan— y el que cambió está a uno solo. */}
          <button
            type="button"
            onClick={() => onAdjust(next)}
            className="font-money text-[13px] text-ink-soft underline decoration-dotted underline-offset-4"
          >
            {formatByCurrency(next.currency, next.amount)} · corregir
          </button>
        </div>
      </div>

      {rest.length > 0 && (
        <Link
          to="/compromisos"
          className={`mt-3 flex items-center justify-between gap-2 text-[13px] ${
            overdue ? '' : 'text-ink-soft'
          }`}
        >
          <span>
            y {rest.length} {rest.length === 1 ? 'más para confirmar' : 'más para confirmar'}
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </section>
  )
}

export default DueReminder
