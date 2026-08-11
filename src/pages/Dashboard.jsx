import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import TransactionFormModal from '../components/TransactionFormModal.jsx'
import LiquidModal from '../components/LiquidModal.jsx'
import FormSheet from '../components/FormSheet.jsx'
import FormError from '../components/form/FormError.jsx'
import InfoButton from '../components/InfoButton.jsx'
import { usePortfolio } from '../hooks/usePortfolio.js'
import { computeCurrentLiquid } from '../lib/liquid.js'
import { getCategories } from '../lib/categories.js'
import { getDebts, summarizeDebts } from '../lib/debts.js'
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

// Las dos tarjetas comparten componente a propósito: "Dinero disponible" y
// "Dinero invertido" tienen que verse con exactamente el mismo peso — son
// plata de naturaleza distinta y ninguna manda sobre la otra. Por eso
// tampoco se suman en ningún lado: no existe un "patrimonio total" (ver
// FUNCTIONAL.md).
//
// En error la tarjeta deja de ser un botón y pasa a ser un div con su propio
// "Reintentar": un botón adentro de otro botón no es HTML válido, y tocar la
// tarjeta abriría algo que todavía no tiene datos.
//
// Con `info`, el nombre y el botón (i) viven en una fila propia, fuera del
// botón que abre la tarjeta (el modal / la navegación): dos botones
// anidados tampoco es HTML válido.
function SummaryCard({ label, amount, hint, note, info, loading, error, onRetry, onClick, className = '' }) {
  const [infoOpen, setInfoOpen] = useState(false)

  const heading = (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        {label}
      </span>
      {info && (
        <InfoButton label={label} active={infoOpen} onToggle={() => setInfoOpen((v) => !v)} />
      )}
    </span>
  )

  if (error) {
    return (
      <div className={`space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-4 ${className}`}>
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
    <div className={`rounded-2xl border border-line bg-card px-4 py-4 ${className}`}>
      {heading}
      <button
        type="button"
        onClick={onClick}
        className="mt-1 flex w-full items-center justify-between gap-3 text-left transition active:opacity-70"
      >
        <span className="min-w-0">
          <span className="font-money block text-2xl tracking-tight">
            {loading ? <span className="text-ink-soft">Calculando…</span> : amount}
          </span>
          {note && <span className="mt-1 block text-xs text-ink-soft">{note}</span>}
          {hint && <span className="mt-1.5 block text-xs text-pine underline">{hint}</span>}
        </span>
        <Chevron />
      </button>
      {infoOpen && info && (
        <p className="mt-2 rounded-xl bg-mist/50 px-3 py-2 text-left text-xs text-ink-soft">
          {info}
        </p>
      )}
    </div>
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

  const [debts, setDebts] = useState([])
  const [debtsLoading, setDebtsLoading] = useState(true)
  const [debtsError, setDebtsError] = useState(null)

  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [liquidModalOpen, setLiquidModalOpen] = useState(false)
  const [categories, setCategories] = useState(null) // null = todavía no se pidieron
  const [categoriesError, setCategoriesError] = useState(null)

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

  const loadDebts = useCallback(async () => {
    setDebtsLoading(true)
    setDebtsError(null)
    try {
      setDebts(await getDebts())
    } catch (e) {
      setDebtsError({ message: 'No se pudieron cargar las deudas.', detail: e.message })
    } finally {
      setDebtsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLiquid()
    loadDebts()
  }, [loadLiquid, loadDebts])

  function loadCategories() {
    setCategoriesError(null)
    getCategories()
      .then(setCategories)
      .catch((e) =>
        setCategoriesError({ message: 'No se pudieron cargar las categorías.', detail: e.message }),
      )
  }

  function openExpenseModal() {
    if (categories === null && !categoriesError) loadCategories()
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
          label="Dinero disponible"
          amount={liquid ? formatARS(liquid.current) : null}
          hint={liquid?.isFirst ? 'declarar mi saldo' : null}
          info="La plata que tenés a mano para usar hoy. Sube con tus ingresos y baja con tus gastos y con lo que ponés en inversiones."
          loading={liquidLoading}
          error={liquidError}
          onRetry={loadLiquid}
          onClick={() => setLiquidModalOpen(true)}
        />
        <SummaryCard
          label="Dinero invertido"
          amount={formatUSD(totalValue)}
          info="Lo que valen hoy tus inversiones, según el último precio o la última valuación que cargaste."
          loading={portfolioLoading}
          error={portfolioError}
          onRetry={reloadPortfolio}
          onClick={() => navigate('/portafolio')}
        />

        {/* El tercer mundo. Ocupa el ancho completo debajo de los otros dos:
            se lee como una magnitud aparte, no como un tercio de un total que
            no existe (ver FUNCTIONAL.md). Solo aparece si hay deudas cargadas
            — sin ninguna, un "US$ 0" permanente es ruido; la sección sigue
            estando en la barra de navegación. */}
        {(debtsError || debts.length > 0) && (
          <SummaryCard
            label="Deudas"
            amount={formatUSD(summarizeDebts(debts).totalBalance)}
            note="te queda por pagar"
            loading={debtsLoading}
            error={debtsError}
            onRetry={loadDebts}
            onClick={() => navigate('/deudas')}
            className="sm:col-span-2"
          />
        )}
      </div>

      {/* La acción más frecuente: cargar un gasto en segundos. Vive solo acá,
          nunca en el layout compartido. Mismo "+" sin texto que el FAB de
          Movimientos — mismo formulario, arranca en Gasto en los dos. */}
      <button
        type="button"
        onClick={openExpenseModal}
        aria-label="Nuevo gasto"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-pine text-3xl font-light text-white shadow-lg transition active:bg-pine-deep md:right-8 md:bottom-8"
      >
        +
      </button>

      {/* Sin categorías todavía (cargando o falló) no se abre el formulario
          con la lista vacía: se muestra el error con Reintentar, o "Cargando…"
          mientras se resuelve — el mismo modal se convierte en el real en
          cuanto categories deja de ser null. */}
      {expenseModalOpen && categories === null ? (
        <FormSheet title="Nuevo gasto" onClose={() => setExpenseModalOpen(false)}>
          {categoriesError ? (
            <div className="space-y-2">
              <FormError message={categoriesError.message} detail={categoriesError.detail} />
              <button
                type="button"
                onClick={loadCategories}
                className="text-sm font-semibold text-clay underline"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Cargando…</p>
          )}
        </FormSheet>
      ) : (
        <TransactionFormModal
          open={expenseModalOpen}
          defaultKind="expense"
          categories={categories ?? []}
          onClose={() => setExpenseModalOpen(false)}
          onSaved={afterLiquidChanged}
        />
      )}
      <LiquidModal
        open={liquidModalOpen}
        onClose={() => setLiquidModalOpen(false)}
        onSaved={afterLiquidChanged}
      />
    </div>
  )
}

export default Dashboard
