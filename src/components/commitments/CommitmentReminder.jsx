import { useState } from 'react'
import DueReminder from './DueReminder.jsx'
import ConfirmChargeModal from './ConfirmChargeModal.jsx'
import { confirmCharge } from '../../lib/commitments.js'
import { occurrenceTitle } from '../../lib/commitmentSchedule.js'
import FormError from '../form/FormError.jsx'

// El recordatorio con sus dos acciones, entero. Lo montan Inicio y
// A pagar: la fila se ve igual en los dos y confirma igual en los dos, así
// que el comportamiento vive en un solo lado en vez de duplicarse (que es lo
// que el informe de arquitectura marca como el problema que se agranda, H12).
//
// "Confirmar" es UN TOQUE: usa el monto, la cuenta y la fecha que dice el
// plan, sin abrir nada. El modal es el toque de más, el de "el monto cambió".
function CommitmentReminder({ due, accounts, onChanged, onAccountCreated, className = '' }) {
  const [confirming, setConfirming] = useState(null)
  const [adjusting, setAdjusting] = useState(null)
  const [error, setError] = useState(null)

  async function confirmNow(occurrence) {
    setConfirming(`${occurrence.planId}|${occurrence.dueDate}`)
    setError(null)
    try {
      await confirmCharge({
        commitmentId: occurrence.planId,
        dueDate: occurrence.dueDate,
        date: occurrence.dueDate,
        amount: occurrence.amount,
        accountId: occurrence.plan.account_id ?? null,
        description: occurrenceTitle(occurrence),
      })
      await onChanged()
    } catch (e) {
      setError({ message: 'No se pudo confirmar el pago.', detail: e })
    } finally {
      setConfirming(null)
    }
  }

  if (due.length === 0) return null

  return (
    <div className={className}>
      <DueReminder
        due={due}
        confirming={confirming}
        onConfirm={confirmNow}
        onAdjust={setAdjusting}
      />
      {error && (
        <div className="mt-2">
          <FormError {...error} />
        </div>
      )}

      <ConfirmChargeModal
        open={Boolean(adjusting)}
        occurrence={adjusting}
        accounts={accounts}
        onClose={() => setAdjusting(null)}
        onAccountCreated={onAccountCreated}
        onSaved={async () => {
          setAdjusting(null)
          await onChanged()
        }}
      />
    </div>
  )
}

export default CommitmentReminder
