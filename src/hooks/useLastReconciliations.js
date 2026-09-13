import { useCallback, useEffect, useState } from 'react'
import { getLastReconciliationByAccount } from '../lib/liquid.js'

// La última reconciliación de cada cuenta (account_id → fila), para el aviso
// de "esta operación es anterior a la última vez que contaste X" en los
// formularios de edición de gasto/ingreso, aporte/retiro y pago de deuda.
//
// Un fallo cargándola no bloquea nada: es un dato accesorio (mismo criterio
// que useAccounts), y sin él el aviso simplemente no aparece.
//
// `reload` se expone para que esos mismos formularios, después de contar la
// plata desde el propio aviso (ver el botón "Contarla de nuevo ahora"), la
// vuelvan a pedir: si no, el aviso seguiría mostrando la fecha vieja aunque
// el conteo ya se haya guardado.
export function useLastReconciliations() {
  const [byAccount, setByAccount] = useState(new Map())

  const load = useCallback(async () => {
    try {
      setByAccount(await getLastReconciliationByAccount())
    } catch {
      setByAccount(new Map())
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { byAccount, reload: load }
}
