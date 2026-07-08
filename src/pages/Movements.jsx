import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import TransactionFormModal from '../components/TransactionFormModal.jsx'
import LiquidModal from '../components/LiquidModal.jsx'
import { getTransactions } from '../lib/transactions.js'
import { getCategories } from '../lib/categories.js'
import { computeCurrentLiquid } from '../lib/liquid.js'
import { formatARS, formatMonthYear, formatDay } from '../lib/format.js'

const now = new Date()

function Movements() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [kind, setKind] = useState('all')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [liquid, setLiquid] = useState(null) // null = cargando, undefined = error
  const [liquidOpen, setLiquidOpen] = useState(false)

  async function loadLiquid() {
    try {
      setLiquid(await computeCurrentLiquid())
    } catch {
      setLiquid(undefined)
    }
  }

  async function load() {
    loadLiquid()
    setLoading(true)
    setError(null)
    try {
      setItems(
        await getTransactions({
          month,
          year,
          kind: kind === 'all' ? undefined : kind,
          categoryId: categoryId || undefined,
        }),
      )
    } catch (e) {
      setError('No se pudieron cargar los movimientos. ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, kind, categoryId])

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

  const expenses = items
    .filter((t) => t.kind === 'expense')
    .reduce((sum, t) => sum + Number(t.amount_ars), 0)
  const incomes = items
    .filter((t) => t.kind === 'income')
    .reduce((sum, t) => sum + Number(t.amount_ars), 0)
  const hasExtraFilters = kind !== 'all' || categoryId !== ''

  return (
    <div>
      <PageHeader title="Movimientos" />

      <div className="space-y-4">
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

        {/* Líquido total: acumulado de TODOS los movimientos (no del período filtrado) */}
        <div className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
              Líquido total
            </p>
            <p className="font-money mt-0.5 text-xl tracking-tight">
              {liquid === null ? '…' : liquid === undefined ? '—' : formatARS(liquid.current)}
            </p>
            <p className="text-xs text-ink-soft">
              {liquid?.last
                ? `Reconciliado el ${formatDay(liquid.last.date)}`
                : liquid?.isFirst
                  ? 'Todavía sin reconciliar'
                  : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLiquidOpen(true)}
            className="rounded-xl border border-line bg-card px-3 py-2 text-sm font-medium transition active:bg-mist/60"
          >
            Actualizar líquido
          </button>
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
                  <p className="truncate text-[15px]">
                    {tx.category?.name ?? 'Sin categoría'}
                    {tx.description && (
                      <span className="text-ink-soft"> · {tx.description}</span>
                    )}
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
        onClose={closeModal}
        onSaved={() => {
          closeModal()
          load()
        }}
        onDeleted={() => {
          closeModal()
          load()
        }}
      />

      <LiquidModal
        open={liquidOpen}
        onClose={() => setLiquidOpen(false)}
        onSaved={() => {
          setLiquidOpen(false)
          load()
        }}
      />
    </div>
  )
}

export default Movements
