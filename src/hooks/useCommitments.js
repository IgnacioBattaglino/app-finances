import { useCallback, useEffect, useState } from 'react'
import { getCommitmentsWithCharges } from '../lib/commitments.js'
import { duePayments } from '../lib/commitmentSchedule.js'

// Los planes con sus cargos ya resueltos, que es TODO lo que hace falta para
// calcular cualquier cosa de esta sección: los vencimientos pendientes no se
// consultan porque no existen como filas (ver lib/commitmentSchedule.js).
//
// Lo usan dos pantallas —Inicio, para el recordatorio, y A pagar— así que
// la consulta vive acá en vez de repetirse, igual que useAccounts.
export function useCommitments() {
  const [plans, setPlans] = useState([])
  const [chargesByPlan, setCharges] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { plans: rows, chargesByPlan: charges } = await getCommitmentsWithCharges()
      setPlans(rows)
      setCharges(charges)
    } catch (e) {
      setError({ message: 'No se pudieron cargar tus compromisos.', detail: e })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { plans, chargesByPlan, loading, error, reload: load }
}

// Lo que hay que confirmar, ya ordenado (lo vencido primero, lo más viejo
// arriba). Atajo sobre duePayments para que las dos pantallas que lo muestran
// no tengan que armar el mismo llamado.
export function useDuePayments() {
  const { plans, chargesByPlan, loading, error, reload } = useCommitments()
  const due = loading || error ? [] : duePayments({ plans, chargesByPlan })
  return { due, plans, chargesByPlan, loading, error, reload }
}
