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
//   · vencido    → teñido en clay (.notice), y el texto lo dice
//   · por vencer → tarjeta normal, sin teñir
//
// "Vence hoy" NO va teñido: todavía no se te pasó nada. El teñido está
// reservado para lo que ya venció (ver planOccurrences).
//
// Cuando no hay nada que confirmar no está, que es el mismo criterio que ya
// usa la tarjeta de Deudas ("un US$ 0 permanente es ruido").
//
// ── POR QUÉ EL BOTÓN NO ES `.btn` ──────────────────────────────────────────
// `.btn` mide 52px de alto: es el botón de un formulario, y acá se comía el
// ancho de la fila y empujaba el nombre de la cuenta a una tercera línea. Este
// es un botón de fila, no de formulario. Queda en ~42px, que se toca con el
// pulgar sin apuntar y deja el texto de arriba a todo el ancho.

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
      {/* El monto arriba a la derecha, a la misma altura que el nombre: son
          las dos cosas que se leen de un vistazo. */}
      <div className="flex items-baseline justify-between gap-3">
        <p className={`min-w-0 truncate text-subhead font-semibold ${overdue ? '' : 'text-ink'}`}>
          {occurrenceTitle(next)}
        </p>
        <p className="font-money shrink-0 text-subhead font-semibold">
          {formatByCurrency(next.currency, next.amount)}
        </p>
      </div>

      <p className={`mt-0.5 text-footnote ${overdue ? '' : 'text-ink-soft'}`}>
        {lateLabel(next)}
        {next.plan.account?.name ? ` · ${next.plan.account.name}` : ''}
      </p>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => onConfirm(next)}
          disabled={busy}
          // Baja en desktop igual que `.btn`, y por el mismo motivo: 42px es
          // la medida del pulgar, no la del mouse. La diferencia
          // celular/desktop sigue viviendo en un solo breakpoint.
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-subhead font-semibold text-white transition active:scale-[0.975] disabled:opacity-40 md:px-4 md:py-1.5 md:text-[14px]"
        >
          {busy ? 'Guardando…' : 'Confirmar'}
        </button>
        {/* El toque de más, el de "el monto cambió" (regla 5). El camino
            normal no lo cuesta: Confirmar ya usa el monto del plan. */}
        <button
          type="button"
          onClick={() => onAdjust(next)}
          disabled={busy}
          className={`text-footnote underline decoration-dotted underline-offset-4 disabled:opacity-40 ${
            overdue ? '' : 'text-ink-soft'
          }`}
        >
          Cambió el monto
        </button>
      </div>

      {rest.length > 0 && (
        <Link viewTransition
          to="/compromisos"
          className={`mt-3 flex items-center justify-between gap-2 text-footnote ${
            overdue ? '' : 'text-ink-soft'
          }`}
        >
          <span>y {rest.length} más para confirmar</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </section>
  )
}

export default DueReminder
