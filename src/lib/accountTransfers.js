import { supabase } from './supabase.js'
import { SELECT as TRANSACTION_SELECT } from './transactions.js'

// Transferencia entre cuentas del disponible/ahorro (migración 0040): dos
// filas de transactions, atómicas, con el mismo transfer_id. Mismo mecanismo
// que createTransfer (lib/contributions.js) para transferencias entre
// activos, pero para transactions en vez de contributions — ver la migración
// para por qué los dos montos van separados y no un monto + una tasa.
export async function createAccountTransfer({ fromAccountId, toAccountId, date, fromAmount, toAmount }) {
  const { data, error } = await supabase.rpc('create_account_transfer', {
    p_from_account_id: fromAccountId,
    p_to_account_id: toAccountId,
    p_date: date,
    p_from_amount: fromAmount,
    p_to_amount: toAmount,
  })
  if (error) throw error
  return data
}

// Las dos patas de una transferencia (para el mensaje de "parte de una
// transferencia con..." y su borrado) — cada fila trae el nombre de SU
// cuenta; quien llama se queda con la que no es la propia. Mismo patrón que
// getTransferPair (lib/contributions.js).
export async function getAccountTransferPair(transferId) {
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .eq('transfer_id', transferId)
  if (error) throw error
  return data
}

// Borra las dos patas juntas: un solo DELETE por transfer_id ya es atómico
// (una sola sentencia SQL), sin necesitar una función de Postgres — mismo
// criterio que deleteTransfer (lib/contributions.js).
export async function deleteAccountTransfer(transferId) {
  const { error } = await supabase.from('transactions').delete().eq('transfer_id', transferId)
  if (error) throw error
}
