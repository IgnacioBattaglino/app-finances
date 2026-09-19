import { describe, it, expect } from 'vitest'
import { groupChargesByPlan } from './commitments.js'

// Extraída para useCommitments (bloque 05, caché compartida): el Map se
// arma acá y no en la consulta, porque un Map no sobrevive el paso por
// localStorage (ver lib/queryClient.js).
describe('groupChargesByPlan', () => {
  it('agrupa los cargos por commitment_id', () => {
    const rows = [
      { id: 'c1', commitment_id: 'p1', due_date: '2026-09-01' },
      { id: 'c2', commitment_id: 'p1', due_date: '2026-10-01' },
      { id: 'c3', commitment_id: 'p2', due_date: '2026-09-05' },
    ]
    const byPlan = groupChargesByPlan(rows)
    expect(byPlan.get('p1')).toHaveLength(2)
    expect(byPlan.get('p2')).toHaveLength(1)
    expect(byPlan.has('p3')).toBe(false)
  })

  it('sin cargos, un Map vacío', () => {
    expect(groupChargesByPlan([]).size).toBe(0)
  })
})
