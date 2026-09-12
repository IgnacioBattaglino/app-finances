import { useCallback, useEffect, useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import Money from '../components/Money.jsx'
import MoneyStack from '../components/MoneyStack.jsx'
import TransactionFormModal from '../components/TransactionFormModal.jsx'
import FormSheet from '../components/FormSheet.jsx'
import FormError from '../components/form/FormError.jsx'
import InfoButton from '../components/InfoButton.jsx'
import { usePortfolio } from '../hooks/usePortfolio.js'
import {
  computeCurrentLiquid,
  totalsByCurrency,
  visibleBreakdown,
  summarizeSavingsCard,
  sumToUsd,
} from '../lib/liquid.js'
import { toUsd } from '../lib/localCurrency.js'
import { getCategories } from '../lib/categories.js'
import { getDebts, summarizeDebts } from '../lib/debts.js'
import { formatARS, formatUSD, todayISO } from '../lib/format.js'
import { useAccounts } from '../hooks/useAccounts.js'

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

// Mismo trazo que Chevron, apuntando abajo: abre/cierra el detalle del
// resumen de Total. Gira 180° cuando está abierto, en vez de tener un ícono
// para cada estado.
function ChevronDown({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
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
// LA MARQUITA SOLO APARECE CON UNA MONEDA. Cuando la tarjeta muestra dos
// montos, cada uno ya trae su símbolo ($ y US$) y el chip pasaría a nombrar
// una sola de las dos: sería la etiqueta equivocada, no una de más. Es el
// accesorio que se saca al salir.
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
  lines,
  hint,
  note,
  breakdown,
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
      {lines?.length === 1 && (
        <span className="rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-ink-faint">
          {lines[0].currency}
        </span>
      )}
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
          {loading || !lines ? (
            <span className="block text-[17px] text-ink-soft">Calculando…</span>
          ) : (
            <MoneyStack lines={lines} />
          )}
          {note && <span className="mt-2 block text-[13px] text-ink-soft">{note}</span>}
          {hint && <span className="mt-2 block text-[13px] font-medium text-accent-ink">{hint}</span>}
        </span>
        <Chevron />
      </button>
      {/* Desglose por cuenta: nombre y monto por línea, nada más. No compite
          con el monto grande de arriba — lo explica. Cada fila en su propia
          moneda, igual que los montos de arriba: acá no se convierte nada. La
          suma de las filas de una moneda da exactamente la línea de esa moneda. */}
      {breakdown && breakdown.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {breakdown.map((row) => (
            <li key={row.key} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink-soft">{row.name}</span>
              <span className="font-money shrink-0 text-ink">
                {(row.currency ?? 'ARS') === 'ARS' ? formatARS(row.amount) : formatUSD(row.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {infoOpen && info && (
        <p className="mt-3 rounded-[14px] bg-mist px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-ink-soft">
          {info}
        </p>
      )}
    </div>
  )
}

// Resumen de los tres mundos convertidos a una sola unidad — a propósito NO
// es una cuarta tarjeta del mismo peso: es más chico y va debajo, como la
// fila de un total al pie de una planilla. Disponible, ahorrado e invertido
// nunca se suman en ningún otro lado de la app (son magnitudes de naturaleza
// distinta, ver FUNCTIONAL.md); esto es la única excepción, y por eso se
// distingue tanto — para que no se lea como que ahora sí existe un
// "patrimonio total" que compite con los tres de arriba.
//
// El detalle por moneda queda oculto por default (el mismo criterio que
// InfoButton): un número ya convertido sin decirlo de dónde sale es una caja
// negra, pero mostrarlo siempre competiría con el monto grande.
function TotalSummary({ loading, error, onRetry, totalUsd, breakdown, open, onToggle }) {
  if (error) {
    return (
      <div className="notice mt-3 space-y-2">
        <span className="eyebrow">Total</span>
        <FormError message={error.message} detail={error.detail} />
        <button type="button" onClick={onRetry} className="text-[15px] font-semibold text-clay underline">
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="surface mt-3 px-5 py-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={loading}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="eyebrow">Total</span>
        <span className="flex items-center gap-2">
          {loading ? (
            <span className="text-[15px] text-ink-soft">Calculando…</span>
          ) : (
            <Money value={totalUsd} className="text-[22px] font-semibold" />
          )}
          {!loading && <ChevronDown open={open} />}
        </span>
      </button>
      {open && breakdown && breakdown.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {breakdown.map((row) => (
            <li key={row.currency} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-ink-soft">{row.currency === 'ARS' ? 'En pesos' : 'En dólares'}</span>
              <span className="font-money text-ink">
                {row.currency === 'ARS' ? formatARS(row.amount) : formatUSD(row.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Dashboard() {
  const navigate = useNavigate()

  // Cuentas del disponible (migración 0032): las ofrece el formulario de
  // carga, con la primera preseleccionada.
  const { accounts, defaultAccountId, addAccount } = useAccounts()

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
  const [categories, setCategories] = useState(null) // null = todavía no se pidieron
  const [categoriesError, setCategoriesError] = useState(null)
  // Se incrementa al guardar un movimiento, para que el bloque de gastos se
  // entere. Antes solo se recargaba el disponible y el bloque de abajo —en la
  // misma pantalla— seguía mostrando los números viejos.
  const [expensesVersion, setExpensesVersion] = useState(0)

  // El total convertido (ver más abajo) y si su detalle por moneda está
  // desplegado. Arranca cerrado: el número ya convertido es lo que se lee de
  // entrada, el desglose es para quien quiere entender de dónde sale.
  const [usdTotals, setUsdTotals] = useState(null)
  const [usdTotalsError, setUsdTotalsError] = useState(null)
  const [totalOpen, setTotalOpen] = useState(false)

  const loadLiquid = useCallback(async () => {
    setLiquidLoading(true)
    setLiquidError(null)
    try {
      setLiquid(await computeCurrentLiquid())
    } catch (e) {
      setLiquidError({ message: 'No se pudo calcular el disponible.', detail: e })
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
      setDebtsError({ message: 'No se pudieron cargar las deudas.', detail: e })
    } finally {
      setDebtsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLiquid()
    loadDebts()
  }, [loadLiquid, loadDebts])

  // El Total (disponible + ahorrado + invertido, todo a dólares de hoy) es la
  // única cuenta de la pantalla que mezcla monedas — todo lo demás se
  // convierte para MOSTRAR, nunca para sumar (ver ADR-013). La conversión usa
  // el mismo mecanismo que expensesSummary.js (lib/localCurrency.js): el MEP
  // del día leído de instrument_prices, no una cotización en vivo aparte.
  //
  // Se recalcula cuando cambian el disponible o el valor invertido — no hace
  // falta esperar a que las deudas carguen, que no entran en esta cuenta.
  useEffect(() => {
    if (liquidError || portfolioError) {
      setUsdTotals(null)
      // No es un fallo propio: el Total no puede calcularse porque le falta
      // uno de sus insumos, que ya tiene su propio "Reintentar" en su
      // tarjeta. Reintentar acá reintenta los dos.
      setUsdTotalsError({ message: 'Depende de un número que no se pudo calcular arriba.' })
      return
    }
    if (!liquid || portfolioLoading) return
    let cancelled = false
    const today = todayISO()
    const convert = (amount, currency) => toUsd(amount, currency, today)

    const disponibleAccounts = [
      ...liquid.accounts.map((a) => ({ amount: a.amount, currency: a.currency })),
      ...(Math.abs(liquid.unassigned) >= 0.01 ? [{ amount: liquid.unassigned, currency: 'ARS' }] : []),
    ]
    const savingsAccounts = liquid.savings.map((a) => ({ amount: a.amount, currency: a.currency }))

    Promise.all([
      sumToUsd(totalsByCurrency(disponibleAccounts), convert),
      sumToUsd(totalsByCurrency(savingsAccounts), convert),
    ])
      .then(([disponibleUsd, ahorradoUsd]) => {
        if (cancelled) return
        setUsdTotalsError(null)
        setUsdTotals({
          disponible: disponibleUsd,
          ahorrado: ahorradoUsd,
          invertido: totalValue,
          total: disponibleUsd + ahorradoUsd + totalValue,
        })
      })
      .catch((e) => {
        if (!cancelled) setUsdTotalsError({ message: 'No se pudo calcular el total.', detail: e })
      })
    return () => {
      cancelled = true
    }
  }, [liquid, liquidError, totalValue, portfolioLoading, portfolioError])

  function loadCategories() {
    setCategoriesError(null)
    getCategories()
      .then(setCategories)
      .catch((e) =>
        setCategoriesError({ message: 'No se pudieron cargar las categorías.', detail: e }),
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
    loadLiquid()
    setExpensesVersion((v) => v + 1)
  }

  // Desglose del disponible por cuenta, para la tarjeta. El balde "sin
  // cuenta" entra como una línea más solo si tiene algo — cuenta para el
  // total, así que sin él la suma de las líneas no daría.
  const liquidRows = liquid
    ? [
        ...liquid.accounts.map((a) => ({ key: a.id, name: a.name, amount: a.amount, currency: a.currency })),
        ...(Math.abs(liquid.unassigned) >= 0.01
          ? [{ key: '__none__', name: 'Sin cuenta', amount: liquid.unassigned, currency: 'ARS' }]
          : []),
      ]
    : []
  const liquidBreakdown = visibleBreakdown(liquidRows)

  // Ver summarizeSavingsCard (lib/liquid.js): una línea por moneda, sin
  // convertir, y si la tarjeta se muestra. Ya no depende del Total convertido
  // de abajo: mostrar el ahorro tal cual es no necesita ninguna cotización.
  const savingsRows = (liquid?.savings ?? []).map((a) => ({
    key: a.id,
    name: a.name,
    amount: a.amount,
    currency: a.currency,
  }))
  const savingsBreakdown = visibleBreakdown(savingsRows)
  const { show: hasSavings, lines: savingsLines } = summarizeSavingsCard(savingsRows)

  const hasDebts = debtsError || debts.length > 0

  // Cuántas tarjetas principales entran esta vez decide cuántas columnas usa
  // la grilla en desktop — mismo criterio que ya aplicaba con "Deudas": cada
  // tarjeta ausente (sin ahorro, sin deudas) le devuelve su lugar a las que
  // quedan en vez de dejar un hueco.
  const cardCount = 2 + (hasSavings ? 1 : 0) + (hasDebts ? 1 : 0)
  // Con cuatro tarjetas, "Dinero disponible" (la etiqueta más larga) no entra
  // en una sola línea dentro de una columna de 1024–1536px — el ancho típico
  // de una laptop. Por eso las cuatro se quedan de a dos filas hasta 2xl, en
  // vez de forzar una sola fila de cuatro que se ve apretada.
  const gridColsClass =
    cardCount >= 4
      ? 'sm:grid-cols-2 2xl:grid-cols-4'
      : cardCount === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2'

  // El detalle del Total, agrupado por moneda NATIVA (no por tarjeta): a
  // "Disponible" y "Ahorrado" les puede tocar la misma moneda que a
  // "Invertido", y lo que responde el detalle es "cuánto tenés en pesos" y
  // "cuánto en dólares", no "cuánto tiene cada tarjeta".
  const totalBreakdown = usdTotals
    ? [...totalsByCurrency([
        ...liquidRows.map((r) => ({ amount: r.amount, currency: r.currency })),
        ...savingsRows.map((r) => ({ amount: r.amount, currency: r.currency })),
        { amount: totalValue, currency: 'USD' },
      ])].map(([currency, amount]) => ({ currency, amount }))
    : null

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

      {/* Los mundos, uno al lado del otro y del mismo tamaño. Nunca se suman
          ni se apilan en jerarquía entre sí: son magnitudes separadas. El
          Total de abajo es la única excepción, y por eso vive fuera de esta
          grilla, más chico. */}
      {/* `grid-cols-1` es la columna del celular y tiene que estar declarada:
          sin ella la grilla cae en una columna implícita de `auto`, que no
          puede achicarse por debajo de su min-content. Acá ese min-content es
          el monto de la tarjeta, que en `Money` es un inline-flex y por lo
          tanto no corta nunca — con un número grande la grilla se pasa del
          ancho del teléfono. Mismo motivo que en Movimientos. */}
      <div className={`grid grid-cols-1 gap-3 ${gridColsClass}`}>
        <SummaryCard
          label="Dinero disponible"
          lines={liquid?.totals}
          hint={liquid?.isFirst ? 'Configurar mis cuentas' : null}
          breakdown={liquidBreakdown}
          info="La plata que tenés a mano para usar hoy. Sube con tus ingresos y baja con tus gastos y con lo que ponés en inversiones."
          loading={liquidLoading}
          error={liquidError}
          onRetry={loadLiquid}
          onClick={() => navigate('/plata')}
        />

        {/* Plata guardada aparte, fuera del día a día — ver ADR-014. Solo
            aparece con saldo: sin cuentas de ahorro (o con saldo 0) no hay
            nada que este número le sume a la pantalla. El chevron lleva al
            mismo lugar que "Dinero disponible": Mi plata, donde viven las
            dos y desde donde se reconcilia. */}
        {hasSavings && (
          <SummaryCard
            label="Dinero ahorrado"
            lines={savingsLines}
            breakdown={savingsBreakdown}
            info="Lo que guardaste aparte del día a día: no es plata disponible para gastar ni una inversión que busca rendimiento."
            onClick={() => navigate('/plata')}
          />
        )}

        <SummaryCard
          label="Dinero invertido"
          lines={[{ currency: 'USD', amount: totalValue }]}
          info="Lo que valen hoy tus inversiones, según el último precio o la última valuación que cargaste."
          loading={portfolioLoading}
          error={portfolioError}
          onRetry={reloadPortfolio}
          onClick={() => navigate('/inversiones')}
        />

        {/* Solo aparece si hay deudas cargadas — sin ninguna, un "US$ 0"
            permanente es ruido. Ya no tiene pestaña propia: se entra desde
            Mi plata, que siempre muestra la fila aunque el saldo sea 0. */}
        {hasDebts && (
          <SummaryCard
            label="Deudas"
            lines={[{ currency: 'USD', amount: summarizeDebts(debts).totalBalance }]}
            note="Te queda por pagar"
            loading={debtsLoading}
            error={debtsError}
            onRetry={loadDebts}
            onClick={() => navigate('/deudas')}
          />
        )}
      </div>

      <TotalSummary
        loading={usdTotals === null && !usdTotalsError}
        error={usdTotalsError}
        onRetry={() => {
          loadLiquid()
          reloadPortfolio()
        }}
        totalUsd={usdTotals?.total}
        breakdown={totalBreakdown}
        open={totalOpen}
        onToggle={() => setTotalOpen((v) => !v)}
      />

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
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          onCategoryCreated={(created) => setCategories((prev) => [...(prev ?? []), created])}
          onAccountCreated={addAccount}
          onClose={() => setExpenseModalOpen(false)}
          onSaved={afterLiquidChanged}
        />
      )}
    </div>
  )
}

export default Dashboard
