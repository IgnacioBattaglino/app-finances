import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import TransactionFormModal from '../components/TransactionFormModal.jsx'
import LiquidModal from '../components/LiquidModal.jsx'
import FormError from '../components/form/FormError.jsx'
import { usePortfolio } from '../hooks/usePortfolio.js'
import { computeCurrentLiquid } from '../lib/liquid.js'
import { getCategories } from '../lib/categories.js'
import { formatARS, formatUSD } from '../lib/format.js'

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0 text-ink-soft"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

// Las dos tarjetas comparten componente a propósito: "Disponible" e
// "Invertido" tienen que verse con exactamente el mismo peso — son plata de
// naturaleza distinta y ninguna manda sobre la otra. Por eso tampoco se suman
// en ningún lado: no existe un "patrimonio total" (ver FUNCTIONAL.md).
//
// En error la tarjeta deja de ser un botón y pasa a ser un div con su propio
// "Reintentar": un botón adentro de otro botón no es HTML válido, y tocar la
// tarjeta abriría algo que todavía no tiene datos.
function SummaryCard({ label, amount, hint, loading, error, onRetry, onClick }) {
  const heading = (
    <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
      {label}
    </span>
  )

  if (error) {
    return (
      <div className="space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-4">
        {heading}
        <FormError message={error.message} detail={error.detail} />
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-semibold text-clay underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-4 text-left transition active:bg-mist/60"
    >
      <span className="min-w-0">
        {heading}
        <span className="font-money mt-1 block text-2xl tracking-tight">
          {loading ? <span className="text-ink-soft">Calculando…</span> : amount}
        </span>
        {hint && <span className="mt-1.5 block text-xs text-pine underline">{hint}</span>}
      </span>
      <Chevron />
    </button>
  )
}

function Dashboard() {
  const navigate = useNavigate()

  // Mismo cálculo que usa Portafolio (precio en vivo + filtro
  // include_in_total): el número tiene que ser el mismo en las dos pantallas.
  const {
    totalValue,
    loading: portfolioLoading,
    error: portfolioError,
    reload: reloadPortfolio,
  } = usePortfolio()

  const [liquid, setLiquid] = useState(null)
  const [liquidLoading, setLiquidLoading] = useState(true)
  const [liquidError, setLiquidError] = useState(null)

  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [liquidModalOpen, setLiquidModalOpen] = useState(false)
  const [categories, setCategories] = useState(null) // null = todavía no se pidieron

  const loadLiquid = useCallback(async () => {
    setLiquidLoading(true)
    setLiquidError(null)
    try {
      setLiquid(await computeCurrentLiquid())
    } catch (e) {
      setLiquidError({ message: 'No se pudo calcular el disponible.', detail: e.message })
    } finally {
      setLiquidLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLiquid()
  }, [loadLiquid])

  function openExpenseModal() {
    if (categories === null) {
      getCategories()
        .then(setCategories)
        .catch(() => setCategories([]))
    }
    setExpenseModalOpen(true)
  }

  // Un gasto nuevo mueve el disponible; una reconciliación, también.
  function afterLiquidChanged() {
    setExpenseModalOpen(false)
    setLiquidModalOpen(false)
    loadLiquid()
  }

  return (
    <div>
      <PageHeader title="Inicio" />

      {/* Apiladas en pantallas angostas para que los montos largos respiren; de
          ahí para arriba, lado a lado. En los dos casos, mismo tamaño. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          label="Disponible"
          amount={liquid ? formatARS(liquid.current) : null}
          hint={liquid?.isFirst ? 'declarar mi saldo' : null}
          loading={liquidLoading}
          error={liquidError}
          onRetry={loadLiquid}
          onClick={() => setLiquidModalOpen(true)}
        />
        <SummaryCard
          label="Invertido"
          amount={formatUSD(totalValue)}
          loading={portfolioLoading}
          error={portfolioError}
          onRetry={reloadPortfolio}
          onClick={() => navigate('/portafolio')}
        />
      </div>

      {/* La acción más frecuente: cargar un gasto en segundos. Vive solo acá,
          nunca en el layout compartido. */}
      <button
        type="button"
        onClick={openExpenseModal}
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 rounded-full bg-pine px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg transition active:bg-pine-deep md:right-8 md:bottom-8"
      >
        + Gasto
      </button>

      <TransactionFormModal
        open={expenseModalOpen}
        defaultKind="expense"
        categories={categories ?? []}
        onClose={() => setExpenseModalOpen(false)}
        onSaved={afterLiquidChanged}
      />
      <LiquidModal
        open={liquidModalOpen}
        onClose={() => setLiquidModalOpen(false)}
        onSaved={afterLiquidChanged}
      />
    </div>
  )
}

export default Dashboard
