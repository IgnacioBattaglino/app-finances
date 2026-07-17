import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import TransactionFormModal from '../components/TransactionFormModal.jsx'
import EditIcon from '../components/EditIcon.jsx'
import {
  getTransactions,
  getCurrentMonthTransactions,
  groupExpensesByCategory,
} from '../lib/transactions.js'
import { getCategories } from '../lib/categories.js'
import { formatARS, formatMonthYear, formatDay } from '../lib/format.js'

const now = new Date()

function Movements() {
  // Movimientos del mes navegado, sin filtrar por tipo/categoría: de acá
  // salen tanto los totales del período (que deben describir el mes
  // completo) como la lista filtrada de abajo (filtrada en cliente).
  const [monthItems, setMonthItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [kind, setKind] = useState('all')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  // Estadísticas del mes calendario en curso: null = cargando, undefined = error.
  // Independientes del mes que esté navegando la lista de abajo.
  const [monthTransactions, setMonthTransactions] = useState(null)

  async function loadMonthStats() {
    try {
      setMonthTransactions(await getCurrentMonthTransactions())
    } catch {
      setMonthTransactions(undefined)
    }
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setMonthItems(await getTransactions({ month, year }))
    } catch (e) {
      setError('No se pudieron cargar los movimientos. ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year])

  useEffect(() => {
    loadMonthStats()
  }, [])

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  function moveMonth(delta) {
    let m = month + delta
    let y = year
    if (m === 0) {
      m = 12
      y -= 1
    }
    if (m === 13) {
      m = 1
      y += 1
    }
    setMonth(m)
    setYear(y)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  function refreshAfterSave() {
    closeModal()
    load()
    loadMonthStats()
  }

  // La lista de abajo respeta los filtros de tipo/categoría; los totales del
  // período (más abajo) se calculan sobre monthItems, sin filtrar: describen
  // el mes navegado completo, no lo que quedó visible en la lista.
  const items = monthItems
    .filter((t) => kind === 'all' || t.kind === kind)
    .filter((t) => !categoryId || t.category_id === categoryId)

  const expenses = monthItems
    .filter((t) => t.kind === 'expense')
    .reduce((sum, t) => sum + Number(t.amount_ars), 0)
  const incomes = monthItems
    .filter((t) => t.kind === 'income')
    .reduce((sum, t) => sum + Number(t.amount_ars), 0)
  const hasExtraFilters = kind !== 'all' || categoryId !== ''

  const monthExpenses = monthTransactions
    ? monthTransactions
        .filter((t) => t.kind === 'expense')
        .reduce((sum, t) => sum + Number(t.amount_ars), 0)
    : 0
  const monthIncomes = monthTransactions
    ? monthTransactions
        .filter((t) => t.kind === 'income')
        .reduce((sum, t) => sum + Number(t.amount_ars), 0)
    : 0
  const categoryBreakdown = monthTransactions
    ? groupExpensesByCategory(monthTransactions)
    : []

  return (
    <div>
      <PageHeader title="Movimientos" />

      <div className="space-y-8">
        {/* Estadísticas del mes en curso: siempre el mes actual, sin selector */}
        <section className="space-y-3">
          <h2 className="px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            Este mes
          </h2>
          <div className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-2xl border border-line bg-card text-center">
            <div className="px-3 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Gastos
              </p>
              <p className="font-money mt-1 text-xl tracking-tight text-clay">
                {monthTransactions === null
                  ? '…'
                  : monthTransactions === undefined
                    ? '—'
                    : formatARS(monthExpenses)}
              </p>
            </div>
            <div className="px-3 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Ingresos
              </p>
              <p className="font-money mt-1 text-xl tracking-tight text-pine">
                {monthTransactions === null
                  ? '…'
                  : monthTransactions === undefined
                    ? '—'
                    : formatARS(monthIncomes)}
              </p>
            </div>
          </div>

          {categoryBreakdown.length > 0 && (
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {categoryBreakdown.map((cat) => (
                <div
                  key={cat.name}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="text-ink-soft">{cat.name}</span>
                  <span className="font-money">{formatARS(cat.total)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Historial: sección secundaria, con toda la funcionalidad de antes */}
        <section className="space-y-4">
          <h2 className="px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            Historial
          </h2>

          {/* Navegador de mes */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="Mes anterior"
              className="rounded-xl px-3 py-1.5 text-lg text-ink-soft transition hover:bg-mist"
            >
              ‹
            </button>
            <span className="text-[15px] font-semibold">{formatMonthYear(month, year)}</span>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="Mes siguiente"
              className="rounded-xl px-3 py-1.5 text-lg text-ink-soft transition hover:bg-mist"
            >
              ›
            </button>
          </div>

          {/* Filtros */}
          <div className="flex gap-2">
            <div className="flex flex-1 rounded-xl bg-mist p-0.5 text-sm font-medium">
              {[
                ['all', 'Todos'],
                ['expense', 'Gastos'],
                ['income', 'Ingresos'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={`flex-1 rounded-[10px] py-1.5 transition ${
                    kind === value ? 'bg-card shadow-sm' : 'text-ink-soft'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Filtrar por categoría"
              className="max-w-[40%] rounded-xl bg-mist px-3 py-1.5 text-sm outline-none"
            >
              <option value="">Todas</option>
              {categories
                .filter((cat) => kind === 'all' || cat.kind === kind)
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Totales del período */}
          <div className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-2xl border border-line bg-card text-center">
            <div className="px-2 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Gastos
              </p>
              <p className="font-money mt-0.5 text-sm text-clay">{formatARS(expenses)}</p>
            </div>
            <div className="px-2 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Ingresos
              </p>
              <p className="font-money mt-0.5 text-sm text-pine">{formatARS(incomes)}</p>
            </div>
            <div className="px-2 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                Balance
              </p>
              <p className="font-money mt-0.5 text-sm">{formatARS(incomes - expenses)}</p>
            </div>
          </div>

          {error && (
            <div className="space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3">
              <p className="text-sm text-clay">{error}</p>
              <button
                type="button"
                onClick={load}
                className="text-sm font-semibold text-clay underline"
              >
                Reintentar
              </button>
            </div>
          )}

          {loading ? (
            <p className="px-4 text-sm text-ink-soft">Cargando…</p>
          ) : items.length === 0 && !error ? (
            <p className="px-4 py-6 text-center text-sm text-ink-soft">
              {hasExtraFilters ? 'Sin movimientos con estos filtros.' : 'Sin movimientos este mes.'}
            </p>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {items.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => {
                    setEditing(tx)
                    setModalOpen(true)
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-mist/50"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 truncate text-[15px]">
                      <span className="truncate">
                        {tx.category?.name ?? 'Sin categoría'}
                        {tx.description && (
                          <span className="text-ink-soft"> · {tx.description}</span>
                        )}
                      </span>
                      <EditIcon />
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">{formatDay(tx.date)}</p>
                  </div>
                  <span
                    className={`font-money shrink-0 text-[15px] ${
                      tx.kind === 'expense' ? 'text-clay' : 'text-pine'
                    }`}
                  >
                    {tx.kind === 'expense' ? '−' : '+'}
                    {formatARS(tx.amount_ars)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Alta */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label="Nuevo movimiento"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-pine text-3xl font-light text-white shadow-lg transition active:bg-pine-deep md:right-8 md:bottom-8"
      >
        +
      </button>

      <TransactionFormModal
        open={modalOpen}
        initial={editing}
        categories={categories}
        onClose={closeModal}
        onSaved={refreshAfterSave}
        onDeleted={refreshAfterSave}
      />
    </div>
  )
}

export default Movements
