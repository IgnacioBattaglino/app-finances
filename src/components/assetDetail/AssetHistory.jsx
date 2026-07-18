import { formatUSD, formatDay } from '../../lib/format.js'

// Operación (aporte/retiro/transferencia/liquidación): etiqueta ya resuelta
// por classifyOperations, fecha, monto, y precio unitario implícito
// (monto ÷ cantidad) solo si hay cantidad.
function ContributionRow({ contribution: c, label, onClick }) {
  const isOut = c.direction === 'out'
  const quantity = Number(c.quantity ?? 0)
  const unitPrice = quantity > 0 ? Number(c.amount_usd) / quantity : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-mist/60"
    >
      <span className="min-w-0">
        <span className="block text-[15px]">{label}</span>
        <span className="block text-xs text-ink-soft">
          {formatDay(c.date)}
          {unitPrice !== null && ` · ${quantity} a ${formatUSD(unitPrice)}/un.`}
        </span>
      </span>
      <span className={`font-money shrink-0 text-[15px] ${isOut ? 'text-clay' : ''}`}>
        {isOut ? '−' : ''}
        {formatUSD(c.amount_usd)}
      </span>
    </button>
  )
}

// Valuación manual intercalada: evento menor, más liviano que una operación
// y no tocable.
function ValuationRow({ valuation }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-ink-soft">
      <span>Valuación: {formatUSD(valuation.value_usd)}</span>
      <span>{formatDay(valuation.date)}</span>
    </div>
  )
}

// Historial completo del activo: operaciones + valuaciones ya intercaladas
// por mergeAssetHistory, más el "Ver más" de la paginación de operaciones.
function AssetHistory({ events, labels, hasMore, loadingMore, onLoadMore, onEditContribution }) {
  if (events.length === 0) {
    return <p className="px-1 text-sm text-ink-soft">Todavía no hay operaciones.</p>
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {events.map((event) =>
          event.type === 'contribution' ? (
            <ContributionRow
              key={event.data.id}
              contribution={event.data}
              label={labels[event.data.id]}
              onClick={() => onEditContribution(event.data)}
            />
          ) : (
            <ValuationRow key={`valuation-${event.data.id}`} valuation={event.data} />
          ),
        )}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full rounded-xl border border-line bg-card py-2.5 text-sm font-medium transition active:bg-mist/60 disabled:opacity-50"
        >
          {loadingMore ? 'Cargando…' : 'Ver más'}
        </button>
      )}
    </div>
  )
}

export default AssetHistory
