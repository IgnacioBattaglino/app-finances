import { useCallback, useEffect, useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import Money from '../components/Money.jsx'
import TransactionFormModal from '../components/TransactionFormModal.jsx'
import LiquidModal from '../components/LiquidModal.jsx'
import FormSheet from '../components/FormSheet.jsx'
import FormError from '../components/form/FormError.jsx'
import InfoButton from '../components/InfoButton.jsx'
import { usePortfolio } from '../hooks/usePortfolio.js'
import { computeCurrentLiquid } from '../lib/liquid.js'
import { getCategories } from '../lib/categories.js'
import { getDebts, summarizeDebts } from '../lib/debts.js'

// Recharts pesa bastante: se carga solo cuando hace falta (hay al menos un
// aporte o un gasto para graficar), no en el bundle principal. Las dos
// llamadas a lazy() apuntan al mismo barrel (dashboardCharts.js) para que
// las dos terminen en un único chunk diferido, no uno cada una. Mientras
// llega, el placeholder reserva la misma altura para que la pantalla no
// salte.
const loadCharts = () => import('../components/dashboardCharts.js')
const PortfolioEvolutionChart = lazy(() => loadCharts().then((m) => ({ default: m.PortfolioEvolutionChart })))
const ExpensesBlock = lazy(() => loadCharts().then((m) => ({ default: m.ExpensesBlock })))

function ChartPlaceholder({ className = 'h-[380px]' }) {
  return (
    <div className={`surface flex items-center justify-center text-[15px] text-ink-soft ${className}`}>
      Calculando…
    </div>
  )
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-ink-faint"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

// Las tres tarjetas comparten componente a propósito: "Dinero disponible",
// "Dinero invertido" y "Deudas" tienen que verse con exactamente el mismo
// peso — son plata de naturaleza distinta y ninguna manda sobre las otras.
// Por eso tampoco se suman en ningún lado: no existe un "patrimonio total"
// (ver FUNCTIONAL.md). La marquita de moneda al lado del nombre dice de qué
// unidad es cada una, que es la razón concreta por la que sumarlas no
// significaría nada.
//
// En error la tarjeta deja de ser un botón y pasa a ser un div con su propio
// "Reintentar": un botón adentro de otro botón no es HTML válido, y tocar la
// tarjeta abriría algo que todavía no tiene datos.
//
// Con `info`, el nombre y el botón (i) viven en una fila propia, fuera del
// botón que abre la tarjeta (el modal / la navegación): dos botones
// anidados tampoco es HTML válido.
function SummaryCard({
  label,
  currency,
  amount,
  hint,
  note,
  info,
  loading,
  error,
  onRetry,
  onClick,
  className = '',
}) {
  const [infoOpen, setInfoOpen] = useState(false)

  const heading = (
    <span className="flex items-center gap-1.5">
      <span className="eyebrow">{label}</span>
      <span className="rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-ink-faint">
        {currency}
      </span>
      {info && <InfoButton label={label} active={infoOpen} onToggle={() => setInfoOpen((v) => !v)} />}
    </span>
  )

  if (error) {
    return (
      <div className={`notice space-y-2 ${className}`}>
        {heading}
        <FormError message={error.message} detail={error.detail} />
        <button type="button" onClick={onRetry} className="text-[15px] font-semibold text-clay underline">
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className={`surface px-5 py-4 ${className}`}>
      {heading}
      <button
        type="button"
        onClick={onClick}
        className="mt-2 flex w-full items-center justify-between gap-3 text-left transition active:opacity-60"
      >
        <span className="min-w-0">
          <span className="block text-[32px] leading-none font-semibold">
            {loading ? (
              <span className="text-[17px] font-normal text-ink-soft">Calculando…</span>
            ) : (
              amount
            )}
          </span>
          {note && <span className="mt-2 block text-[13px] text-ink-soft">{note}</span>}
          {hint && <span className="mt-2 block text-[13px] font-medium text-accent-ink">{hint}</span>}
        </span>
        <Chevron />
      </button>
      {infoOpen && info && (
        <p className="mt-3 rounded-[14px] bg-mist px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-ink-soft">
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
    assets,
    valuations,
    contributions,
    loading: portfolioLoading,
    error: portfolioError,
    reload: reloadPortfolio,
  } = usePortfolio()

  // Misma regla que Portfolio.jsx/AssetGroup.jsx (valuation.outdated, ver
  // hasOperationsAfter en portfolio.js): con al menos una valuación vieja
  // dando vueltas, el % del gráfico no es confiable.
  const outdatedAssetNames = assets
    .filter((a) => valuations[a.id]?.outdated)
    .map((a) => a.name)

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
  // Se incrementa al guardar un movimiento, para que el bloque de gastos se
  // entere. Antes solo se recargaba el disponible y el bloque de abajo —en la
  // misma pantalla— seguía mostrando los números viejos.
  const [expensesVersion, setExpensesVersion] = useState(0)

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

  // Un gasto nuevo mueve el disponible; una reconciliación, también. Y las dos
  // cosas son movimientos, así que el bloque de gastos también se recalcula:
  // una reconciliación inserta una transaction de ajuste, que cuenta como
  // cualquier otra.
  function afterLiquidChanged() {
    setExpenseModalOpen(false)
    setLiquidModalOpen(false)
    loadLiquid()
    setExpensesVersion((v) => v + 1)
  }

  const hasDebts = debtsError || debts.length > 0

  return (
    <div className="page">
      <PageHeader
        title="Inicio"
        action={
          <button type="button" onClick={openExpenseModal} className="btn btn-primary hidden md:inline-flex">
            Nuevo gasto
          </button>
        }
      />

      {/* Los tres mundos, uno al lado del otro y del mismo tamaño. Nunca se
          suman ni se apilan en jerarquía: son magnitudes separadas. */}
      {/* `grid-cols-1` es la columna del celular y tiene que estar declarada:
          sin ella la grilla cae en una columna implícita de `auto`, que no
          puede achicarse por debajo de su min-content. Acá ese min-content es
          el monto de la tarjeta, que en `Money` es un inline-flex y por lo
          tanto no corta nunca — con un número grande la grilla se pasa del
          ancho del teléfono. Mismo motivo que en Movimientos. */}
      <div className={`grid grid-cols-1 gap-3 ${hasDebts ? 'lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <SummaryCard
          label="Dinero disponible"
          currency="ARS"
          amount={liquid ? <Money value={liquid.current} currency="ars" /> : null}
          hint={liquid?.isFirst ? 'Declarar mi saldo' : null}
          info="La plata que tenés a mano para usar hoy. Sube con tus ingresos y baja con tus gastos y con lo que ponés en inversiones."
          loading={liquidLoading}
          error={liquidError}
          onRetry={loadLiquid}
          onClick={() => setLiquidModalOpen(true)}
        />
        <SummaryCard
          label="Dinero invertido"
          currency="USD"
          amount={<Money value={totalValue} />}
          info="Lo que valen hoy tus inversiones, según el último precio o la última valuación que cargaste."
          loading={portfolioLoading}
          error={portfolioError}
          onRetry={reloadPortfolio}
          onClick={() => navigate('/portafolio')}
        />

        {/* El tercer mundo. Solo aparece si hay deudas cargadas — sin ninguna,
            un "US$ 0" permanente es ruido; la sección sigue estando en la
            barra de navegación. */}
        {hasDebts && (
          <SummaryCard
            label="Deudas"
            currency="USD"
            amount={<Money value={summarizeDebts(debts).totalBalance} />}
            note="Te queda por pagar"
            loading={debtsLoading}
            error={debtsError}
            onRetry={loadDebts}
            onClick={() => navigate('/deudas')}
          />
        )}
      </div>

      {/* En desktop la curva y los gastos conviven a lo ancho; en el celular
          van uno abajo del otro, que es el único orden posible. */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3 xl:items-start">
        {/* Curva de evolución del portafolio. Sin ninguna operación todavía no
            hay nada que graficar — ni carga el chunk de recharts, ni muestra
            el %. El error de usePortfolio ya se ve arriba en "Dinero
            invertido" con su propio Reintentar; reintentar ahí también
            arregla esto, así que acá no se repite. */}
        <div className="xl:col-span-2">
          {!portfolioError &&
            (portfolioLoading ? (
              <ChartPlaceholder />
            ) : contributions.length === 0 ? (
              <div className="surface px-5 py-8 text-center">
                <p className="text-[15px] text-ink-soft">
                  Todavía no cargaste ningún aporte. Cuando registres el primero, acá vas a ver cómo
                  evoluciona tu portafolio.
                </p>
              </div>
            ) : (
              <Suspense fallback={<ChartPlaceholder />}>
                <PortfolioEvolutionChart contributions={contributions} outdatedAssetNames={outdatedAssetNames} />
              </Suspense>
            ))}
        </div>

        {/* Gastos: se maneja solo (transactions no depende de usePortfolio),
            con su propio loading/error/Reintentar. */}
        <Suspense fallback={<ChartPlaceholder className="h-[140px]" />}>
          <ExpensesBlock reloadToken={expensesVersion} />
        </Suspense>
      </div>

      {/* La acción más frecuente: cargar un gasto en segundos. Vive solo acá,
          nunca en el layout compartido. Mismo "+" sin texto que el FAB de
          Movimientos — mismo formulario, arranca en Gasto en los dos. En
          desktop no hay FAB: la acción está en el encabezado. */}
      <button
        type="button"
        onClick={openExpenseModal}
        aria-label="Nuevo gasto"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-40 flex h-15 w-15 items-center justify-center rounded-full bg-accent text-white shadow-[0_8px_24px_rgb(16_18_24/0.22)] transition active:scale-95 active:bg-accent-deep md:hidden"
      >
        <PlusIcon />
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
                className="text-[15px] font-semibold text-clay underline"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <p className="text-[15px] text-ink-soft">Cargando…</p>
          )}
        </FormSheet>
      ) : (
        <TransactionFormModal
          open={expenseModalOpen}
          defaultKind="expense"
          categories={categories ?? []}
          onCategoryCreated={(created) => setCategories((prev) => [...(prev ?? []), created])}
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
