import { formatByCurrency, formatDay } from '../../lib/format.js'
import EditIcon from '../EditIcon.jsx'

// Un movimiento (transactions) de esta cuenta: categoría + descripción a la
// izquierda (mismo peso que en Movimientos), monto con signo y color en la
// moneda de la cuenta a la derecha. Editable/borrable al tocarlo — el propio
// TransactionFormModal decide si es una pata de transferencia y la muestra de
// solo lectura con la opción de borrar la transferencia entera.
function TransactionRow({ tx, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition active:bg-mist md:hover:bg-mist"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-[17px]">
          <span className="truncate">
            {tx.category?.name ?? 'Sin categoría'}
            {tx.description && <span className="text-ink-soft"> · {tx.description}</span>}
          </span>
          <EditIcon />
        </p>
        <p className="mt-0.5 text-[13px] text-ink-soft">{formatDay(tx.date)}</p>
      </div>
      <span
        className={`font-money shrink-0 text-[17px] font-medium ${
          tx.kind === 'expense' ? 'text-clay' : 'text-gain'
        }`}
      >
        {tx.kind === 'expense' ? '−' : '+'}
        {formatByCurrency(tx.currency, tx.amount)}
      </span>
    </button>
  )
}

// Historial completo de la cuenta, paginado con "Ver más" — mismo patrón que
// AssetHistory en el detalle de un activo.
function AccountHistory({ transactions, hasMore, loadingMore, loadMoreError, onLoadMore, onEdit }) {
  if (transactions.length === 0) {
    return (
      <p className="surface px-4 py-8 text-center text-[15px] text-ink-soft">
        Todavía no hay movimientos.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="list">
        {transactions.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} onClick={() => onEdit(tx)} />
        ))}
      </div>
      {hasMore && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="btn btn-secondary w-full"
          >
            {loadingMore ? 'Cargando…' : 'Ver más'}
          </button>
          {loadMoreError && (
            <p className="text-center text-[13px] text-clay">
              No se pudo cargar más. Reintentá.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default AccountHistory
