import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import TransactionFormModal from '../components/TransactionFormModal.jsx'
import BinaryChoice from '../components/form/BinaryChoice.jsx'
import EditIcon from '../components/EditIcon.jsx'
import FormError from '../components/form/FormError.jsx'
import { getTransactions, groupExpensesByCategory } from '../lib/transactions.js'
import { getLiquidContributions } from '../lib/contributions.js'
import { contributionArs, contributionLabel, mergeMovements, monthTotals } from '../lib/movements.js'
import { getCategories } from '../lib/categories.js'
import { formatARS, formatMonthYear, formatDay } from '../lib/format.js'

const now = new Date()

function Arrow({ direction }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d={direction === 'left' ? 'm14 5-7 7 7 7' : 'm10 5 7 7-7 7'} />
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

// Las dos filas de la lista comparten caja: son el mismo tipo de renglón, lo
// que cambia es qué pasa al tocarlas.
const ROW_CLASS =
  'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition active:bg-mist md:hover:bg-mist'

// Gasto o ingreso: se toca para editarlo (de ahí el lápiz).
function TransactionRow({ tx, onEdit }) {
  return (
    <button type="button" onClick={onEdit} className={ROW_CLASS}>
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
        {formatARS(tx.amount_ars)}
      </span>
    </button>
  )
}

// Inversión o retiro: acá es de solo lectura y lleva al detalle del activo,
// que es donde se edita (de ahí el chevron en vez del lápiz). El monto va en
// pesos, como el resto de la lista, y sin color: no es una pérdida ni una
// ganancia, es plata que cambió de lugar. El signo dice para qué lado.
function InvestmentRow({ contribution: c }) {
  const isOut = c.direction === 'out'
  return (
    <Link to={`/portafolio/${c.asset?.id}`} className={ROW_CLASS}>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-[17px]">
          <span className="truncate">
            {contributionLabel(c)}
            <span className="text-ink-soft"> · {c.asset?.name ?? 'Activo'}</span>
          </span>
          <span className="shrink-0 text-ink-faint">
            <Arrow direction="right" />
          </span>
        </p>
        <p className="mt-0.5 text-[13px] text-ink-soft">{formatDay(c.date)}</p>
      </div>
      <span className="font-money shrink-0 text-[17px] font-medium">
        {isOut ? '+' : '−'}
        {formatARS(contributionArs(c))}
      </span>
    </Link>
  )
}

function Movements() {
  // Movimientos del mes navegado, sin filtrar por tipo/categoría: de acá
  // salen tanto los totales y el desglose (que describen el mes completo)
  // como la lista filtrada de abajo (filtrada en cliente).
  const [monthItems, setMonthItems] = useState([])
  // Las inversiones del mismo mes (contributions que mueven el disponible).
  // Van en su propio estado y no mezcladas en monthItems: el desglose "En qué
  // se fue" recorre monthItems buscando gastos, y una inversión no es un
  // gasto — meterlas ahí las metería en el desglose.
  const [monthInvestments, setMonthInvestments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [kind, setKind] = useState('all')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Las dos fuentes en paralelo. Van en el mismo try a propósito: acá no
      // hay un número principal que valga la pena salvar si la otra mitad
      // falla — un mes al que le faltan las inversiones muestra un balance
      // equivocado, y es peor que decir que no se pudo cargar.
      const [transactions, investments] = await Promise.all([
        getTransactions({ month, year }),
        getLiquidContributions({ month, year }),
      ])
      setMonthItems(transactions)
      setMonthInvestments(investments)
    } catch (e) {
      setError({ message: 'No se pudieron cargar los movimientos.', detail: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year])

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

  // Cambiar de tipo puede dejar elegida una categoría que ya no aplica (una
  // de gasto con el filtro en "Ingresos"): se limpia, mismo criterio que usa
  // el formulario de carga al cambiar Gasto/Ingreso. Con "Todos" cualquier
  // categoría sigue siendo válida.
  function changeKind(value) {
    setKind(value)
    if (categoryId && value !== 'all') {
      const cat = categories.find((c) => c.id === categoryId)
      if (cat && cat.kind !== value) setCategoryId('')
    }
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  // `saved` es la fila guardada; en un borrado llega el id, que no tiene fecha
  // y por lo tanto cae al refresco normal, que es lo correcto: borrar no debe
  // mover al usuario de mes.
  function refreshAfterSave(saved) {
    closeModal()

    // Si el movimiento quedó en otro mes que el navegado (típico: cargarlo con
    // fecha de hoy mientras mirás un mes pasado), saltamos a su mes. La fila en
    // la lista es la única confirmación de que se guardó: quedarse donde estaba
    // hace pensar que la operación no tuvo efecto.
    const [y, m] = saved?.date?.split('-').map(Number) ?? []
    if (y && m && (y !== year || m !== month)) {
      setMonth(m)
      setYear(y) // el efecto de [month, year] dispara load()
      return
    }
    load()
  }

  // La lista de abajo respeta los filtros de tipo/categoría; los totales y el
  // desglose (más arriba) se calculan sobre el mes entero, sin filtrar:
  // describen el mes navegado completo, no lo que quedó visible en la lista.
  const filteredTransactions = monthItems
    .filter((t) => kind === 'all' || t.kind === kind)
    .filter((t) => !categoryId || t.category_id === categoryId)

  // Una inversión no es un gasto ni un ingreso, así que los filtros de tipo la
  // dejan afuera en vez de meterla arbitrariamente en uno de los dos; el de
  // categoría también, porque no tiene categoría que pueda coincidir. En
  // "Todos" y sin categoría elegida, aparece. Los tres renglones de arriba no
  // se mueven: siguen describiendo el mes completo.
  const showInvestments = kind === 'all' && !categoryId
  const items = mergeMovements(filteredTransactions, showInvestments ? monthInvestments : [])

  const { expenses, incomes, invested, balance } = monthTotals({
    transactions: monthItems,
    contributions: monthInvestments,
  })
  const hasExtraFilters = kind !== 'all' || categoryId !== ''
  const categoryBreakdown = groupExpensesByCategory(monthItems)

  return (
    <div className="page">
      <PageHeader
        title="Movimientos"
        action={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn btn-primary hidden md:inline-flex"
          >
            Nuevo movimiento
          </button>
        }
      />

      {/* En desktop, el mes (navegador, totales y desglose) se queda quieto a
          la izquierda mientras se recorre el historial a la derecha: son dos
          lecturas distintas del mismo mes y conviene tenerlas a la vista al
          mismo tiempo. En el celular no hay ancho para eso y van una debajo
          de la otra, en ese orden. */}
      {/* `grid-cols-1` no es decorativo ni redundante: sin él, en el celular
          esta grilla no declara ninguna columna y cae en una columna IMPLÍCITA
          de `auto`, cuyo ancho mínimo es el min-content de su contenido. El
          min-content de una fila de la lista es su etiqueta ENTERA (el
          `truncate` de ROW_CLASS es white-space: nowrap, así que el texto no
          corta) más el monto, que es shrink-0: con un nombre largo eso da más
          que el ancho del teléfono, la columna crece, y la pantalla entera
          —navegador de mes, totales y desglose incluidos— queda más ancha que
          el viewport y se scrollea de costado. `grid-cols-1` es
          repeat(1, minmax(0, 1fr)): el 0 deja que la columna baje del
          min-content y ahí el truncate hace su trabajo. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8">
        <section className="space-y-3 lg:sticky lg:top-10 lg:self-start">
          {/* Navegador de mes */}
          <div className="surface flex items-center justify-between px-2 py-1.5">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="Mes anterior"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition active:bg-mist md:hover:bg-mist"
            >
              <Arrow direction="left" />
            </button>
            <span className="text-[17px] font-semibold">{formatMonthYear(month, year)}</span>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="Mes siguiente"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition active:bg-mist md:hover:bg-mist"
            >
              <Arrow direction="right" />
            </button>
          </div>

          {error && (
            <div className="notice space-y-2">
              <FormError message={error?.message} detail={error?.detail} />
              <button
                type="button"
                onClick={load}
                className="text-[15px] font-semibold text-clay underline"
              >
                Reintentar
              </button>
            </div>
          )}

          {!error && !loading && (
            <>
              {/* Los números del mes. Gastos e ingresos llevan su color; lo
                  invertido no, porque no es ni una pérdida ni una ganancia
                  —es plata que cambió de lugar—, y el balance tampoco, porque
                  es una resta y su signo ya lo dice. */}
              <div className="surface divide-y divide-line">
                <div className="flex items-baseline justify-between px-4 py-3">
                  <span className="text-[15px] text-ink-soft">Gastos</span>
                  <span className="font-money text-[17px] font-semibold text-clay">
                    {formatARS(expenses)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between px-4 py-3">
                  <span className="text-[15px] text-ink-soft">Ingresos</span>
                  <span className="font-money text-[17px] font-semibold text-gain">
                    {formatARS(incomes)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between px-4 py-3">
                  <span className="text-[15px] text-ink-soft">Invertido</span>
                  <span className="font-money text-[17px] font-semibold">
                    {formatARS(invested)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between px-4 py-3">
                  <span className="text-[15px] font-medium">Balance</span>
                  <span className="font-money text-[17px] font-semibold">
                    {formatARS(balance)}
                  </span>
                </div>
              </div>

              {categoryBreakdown.length > 0 && (
                <div>
                  <h2 className="eyebrow mb-2 px-1">En qué se fue</h2>
                  <div className="list">
                    {categoryBreakdown.map((cat) => (
                      <div
                        key={cat.name}
                        className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[15px]"
                      >
                        <span className="truncate text-ink-soft">{cat.name}</span>
                        <span className="font-money shrink-0">{formatARS(cat.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Historial, con sus filtros */}
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            {/* Tres opciones cortas no necesitan media pantalla de ancho */}
            <div className="flex-1 md:max-w-sm">
              <BinaryChoice
                options={[
                  { value: 'all', label: 'Todos' },
                  { value: 'expense', label: 'Gastos' },
                  { value: 'income', label: 'Ingresos' },
                ]}
                value={kind}
                onChange={changeKind}
              />
            </div>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Filtrar por categoría"
              className="rounded-[12px] bg-mist px-3.5 py-2.5 text-[15px] outline-none sm:max-w-[45%]"
            >
              <option value="">Todas las categorías</option>
              {categories
                .filter((cat) => kind === 'all' || cat.kind === kind)
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>

          {loading ? (
            <p className="px-1 text-[15px] text-ink-soft">Cargando…</p>
          ) : items.length === 0 && !error ? (
            <p className="surface px-4 py-10 text-center text-[15px] text-ink-soft">
              {hasExtraFilters ? 'Sin movimientos con estos filtros.' : 'Sin movimientos este mes.'}
            </p>
          ) : (
            !error && (
              <div className="list">
                {/* La key lleva el prefijo de la fuente: son dos tablas con
                    uuid propios y nada garantiza que no se crucen. */}
                {items.map(({ source, row }) =>
                  source === 'contribution' ? (
                    <InvestmentRow key={`c-${row.id}`} contribution={row} />
                  ) : (
                    <TransactionRow
                      key={`t-${row.id}`}
                      tx={row}
                      onEdit={() => {
                        setEditing(row)
                        setModalOpen(true)
                      }}
                    />
                  ),
                )}
              </div>
            )
          )}
        </section>
      </div>

      {/* Alta. En desktop la acción vive en el encabezado. */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label="Nuevo movimiento"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-40 flex h-15 w-15 items-center justify-center rounded-full bg-accent text-white shadow-[0_8px_24px_rgb(16_18_24/0.22)] transition active:scale-95 active:bg-accent-deep md:hidden"
      >
        <PlusIcon />
      </button>

      <TransactionFormModal
        open={modalOpen}
        initial={editing}
        categories={categories}
        onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
        onClose={closeModal}
        onSaved={refreshAfterSave}
        onDeleted={refreshAfterSave}
      />
    </div>
  )
}

export default Movements
