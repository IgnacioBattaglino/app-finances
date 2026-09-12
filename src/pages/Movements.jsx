import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader.jsx'
import TransactionFormModal from '../components/TransactionFormModal.jsx'
import { useAccounts } from '../hooks/useAccounts.js'
import { useLastReconciliations } from '../hooks/useLastReconciliations.js'
import FilterChips from '../components/form/FilterChips.jsx'
import EditIcon from '../components/EditIcon.jsx'
import FormError from '../components/form/FormError.jsx'
import { getTransactions, groupExpensesByCategory } from '../lib/transactions.js'
import { getLiquidContributions } from '../lib/contributions.js'
import {
  contributionAmount,
  contributionCurrency,
  contributionLabel,
  transactionCurrencyOf,
  mergeMovements,
  monthTotals,
} from '../lib/movements.js'
import { getCategories } from '../lib/categories.js'
import {
  collapseTransfers,
  movementBucket,
  bucketHasCategories,
  MOVEMENT_BUCKETS,
  ALL,
  EXPENSES,
} from '../lib/movementList.js'
import { getReconciliationBatches } from '../lib/liquid.js'
import { movementType, isMovedMoneyType } from '../lib/systemCategories.js'
import { formatByCurrency, formatDay } from '../lib/format.js'
import RangeSheet from '../components/movements/RangeSheet.jsx'
import {
  bounds,
  canShift,
  contains,
  label as rangeLabel,
  monthOf,
  monthRange,
  shift,
} from '../lib/dateRange.js'

const now = new Date()

// Cuántas filas se pintan de una. Con un mes no cambia nada (un mes cargado
// tiene decenas de movimientos, no cientos), pero "Todo" puede ser el
// historial completo y meter miles de nodos en el DOM de un teléfono. Los
// TOTALES siempre se calculan sobre el período entero: esto recorta lo que se
// dibuja, nunca lo que se cuenta.
const PAGE = 100

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

// Gasto o ingreso: se toca para editarlo (de ahí el lápiz). El color es por
// SIGNIFICADO, no por `kind`: un reparto de conteo o una pata de transferencia
// que caen en esta fila (porque su cuenta no es de ahorro) no son ni una
// pérdida ni una ganancia, son plata que cambió de lugar — van sin color,
// igual que ya hacen InvestmentRow y SavingsRow. Un gasto, un ingreso o un
// ajuste de saldo (que sí son reales) se quedan con el color de siempre.
function TransactionRow({ tx, onEdit }) {
  const isMoved = isMovedMoneyType(movementType(tx))
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
        <p className="mt-0.5 truncate text-[13px] text-ink-soft">
          {formatDay(tx.date)}
          {tx.account?.name && ` · ${tx.account.name}`}
        </p>
      </div>
      <span
        className={`font-money shrink-0 text-[17px] font-medium ${
          isMoved ? '' : tx.kind === 'expense' ? 'text-clay' : 'text-gain'
        }`}
      >
        {tx.kind === 'expense' ? '−' : '+'}
        {formatByCurrency(transactionCurrencyOf(tx), tx.amount)}
      </span>
    </button>
  )
}

// Inversión o retiro: acá es de solo lectura y lleva al detalle del activo,
// que es donde se edita (de ahí el chevron en vez del lápiz). El monto va en
// la moneda de la cuenta por la que pasó la plata —igual que el resto de la
// lista— y sin color: no es una pérdida ni una ganancia, es plata que cambió
// de lugar. El signo dice para qué lado.
function InvestmentRow({ contribution: c }) {
  const isOut = c.direction === 'out'
  return (
    <Link to={`/inversiones/${c.asset?.id}`} state={{ from: 'movements' }} className={ROW_CLASS}>
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
        {formatByCurrency(contributionCurrency(c), contributionAmount(c))}
      </span>
    </Link>
  )
}

// Movimiento de una cuenta de AHORRO: un aporte, un retiro, la pata de una
// transferencia o el ajuste de un conteo que cayó ahí. Mismo patrón que
// InvestmentRow y por el mismo motivo: acá es de solo lectura y lleva al lugar
// donde sí se edita —el detalle de la cuenta—, de ahí el chevron en vez del
// lápiz.
//
// No es sólo una decisión de lectura: el formulario de esta pantalla ofrece
// las cuentas del día a día (useAccounts no lista las de ahorro), así que
// abrirlo acá con una fila de ahorro podría mudarla de cuenta al guardar. En
// el detalle de la cuenta el modal sí recibe la suya.
//
// Sin color, igual que una inversión: lo que domina acá es plata que cambió de
// lugar, no una pérdida ni una ganancia. El signo dice para qué lado, y el
// nombre de la cuenta —debajo, como en cualquier fila— dice dónde.
function SavingsRow({ tx }) {
  return (
    <Link to={`/plata/${tx.account_id}`} state={{ from: 'movements' }} className={ROW_CLASS}>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-[17px]">
          <span className="truncate">
            {tx.category?.name ?? 'Sin categoría'}
            {tx.description && <span className="text-ink-soft"> · {tx.description}</span>}
          </span>
          <span className="shrink-0 text-ink-faint">
            <Arrow direction="right" />
          </span>
        </p>
        <p className="mt-0.5 truncate text-[13px] text-ink-soft">
          {formatDay(tx.date)}
          {tx.account?.name && ` · ${tx.account.name}`}
        </p>
      </div>
      <span className="font-money shrink-0 text-[17px] font-medium">
        {tx.kind === 'expense' ? '−' : '+'}
        {formatByCurrency(transactionCurrencyOf(tx), tx.amount)}
      </span>
    </Link>
  )
}

// Una transferencia entre cuentas, o el reparto de un conteo: DOS filas de la
// base en UNA línea. En la base son dos porque cada cuenta tiene que ver su
// propio movimiento; acá es una porque fue una sola operación, y mostrarla
// dos veces la hacía leer como el doble de actividad (5.5 del informe).
//
// SIN SIGNO Y SIN COLOR: la flecha ya dice todo lo que hay que decir. Un +
// junto a un − sobre la misma operación no significan nada (el patrimonio no
// se movió), y la app ya tiene la regla de que la plata que cambia de lugar va
// sin color — acá además no habría de qué lado ponerlo.
//
// UN SOLO MONTO, salvo que las cuentas estén en monedas distintas: ahí son dos
// hechos pares (la misma regla que MoneyStack) y los dos se muestran, cada uno
// pegado a su cuenta, porque el par de montos ES el registro de la conversión.
//
// NI LÁPIZ NI CHEVRÓN. No lleva lápiz porque no se puede editar (ni una pata
// de transferencia ni una fila de un conteo, desde ef840b4) y no lleva chevrón
// porque no hay una cuenta a la que navegar: la fila habla de dos. Se toca
// igual, y abre el mismo detalle de solo lectura que ya existía, que es desde
// donde se borra. La flecha del medio es el glifo de esta fila y no se repite
// en ninguna otra.
function TransferRow({ transfer, onOpen }) {
  const { from, to } = transfer
  const twoAmounts = from.currency !== to.currency
  return (
    <button type="button" onClick={onOpen} className={ROW_CLASS}>
      <div className="min-w-0">
        <p className="truncate text-[17px]">
          <span>{from.name}</span>{' '}
          <span className="font-money font-medium">
            {formatByCurrency(from.currency, from.amount)}
          </span>
          <span className="px-1.5 text-ink-faint">→</span>
          {twoAmounts && (
            <>
              <span className="font-money font-medium">
                {formatByCurrency(to.currency, to.amount)}
              </span>{' '}
            </>
          )}
          <span>{to.name}</span>
        </p>
        <p className="mt-0.5 truncate text-[13px] text-ink-soft">
          {formatDay(transfer.date)}
          {transfer.origin === 'split' ? ' · Reparto de un conteo' : ' · Transferencia'}
        </p>
      </div>
    </button>
  )
}

// Uno de los cinco números del mes. El monto de la derecha es una COLUMNA:
// una línea por moneda con saldo (ver monthTotals / currencyLines), del mismo
// tamaño y con el mismo color, porque son dos hechos del mismo rango — el
// gasto en pesos no es más importante que el gasto en dólares, es otro.
//
// Con gastos en una sola moneda —el caso normal— la columna tiene una línea
// sola y la fila es idéntica a la de siempre.
function TotalRow({ label, lines, labelClass = 'text-[15px] text-ink-soft', amountClass = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <span className={labelClass}>{label}</span>
      <span className="shrink-0 text-right">
        {lines.map((line) => (
          <span key={line.currency} className={`font-money block text-[17px] font-semibold ${amountClass}`}>
            {formatByCurrency(line.currency, line.amount)}
          </span>
        ))}
      </span>
    </div>
  )
}

function Movements() {
  // Cuentas del disponible (migración 0032): las ofrece el formulario de
  // carga, con la primera preseleccionada.
  const { accounts, defaultAccountId, addAccount } = useAccounts()
  const lastReconciliations = useLastReconciliations()
  // Movimientos del mes navegado, sin filtrar por tipo/categoría: de acá
  // salen tanto los totales y el desglose (que describen el mes completo)
  // como la lista filtrada de abajo (filtrada en cliente).
  const [monthItems, setMonthItems] = useState([])
  // Las inversiones del mismo mes (contributions que mueven el disponible).
  // Van en su propio estado y no mezcladas en monthItems: el desglose "En qué
  // se fue" recorre monthItems buscando gastos, y una inversión no es un
  // gasto — meterlas ahí las metería en el desglose.
  const [monthInvestments, setMonthInvestments] = useState([])
  // Qué conteo escribió cada movimiento (id → batch_id). Es lo que permite
  // aparear los repartos de un mismo conteo entre sí sin mezclar dos conteos
  // del mismo día; `transactions` no lleva esa columna (ver
  // getReconciliationBatches).
  const [batches, setBatches] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // El período que se está mirando. Arranca en el mes en curso, que es la
  // lectura más frecuente y la que la pantalla tenía siempre; desde acá se
  // puede pasar a un año, al historial completo o a dos fechas cualesquiera
  // (ver lib/dateRange.js).
  const [range, setRange] = useState(() => monthRange(now.getMonth() + 1, now.getFullYear()))
  const [rangeOpen, setRangeOpen] = useState(false)
  // Qué cajón de movimientos se está mirando (ver movementBucket): el filtro
  // es por SIGNIFICADO, no por `transactions.kind`, así que lo que se ve es
  // exactamente lo que suma el renglón homónimo de los totales.
  const [bucket, setBucket] = useState(ALL)
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState([])
  const [visible, setVisible] = useState(PAGE)
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
      const { from, to } = bounds(range)
      const [transactions, investments, reconciliationBatches] = await Promise.all([
        getTransactions({ from, to }),
        getLiquidContributions({ from, to }),
        getReconciliationBatches(),
      ])
      setMonthItems(transactions)
      setMonthInvestments(investments)
      setBatches(reconciliationBatches)
    } catch (e) {
      setError({ message: 'No se pudieron cargar los movimientos.', detail: e })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  // Cambiar de período o de filtro es empezar a leer otra lista: vuelve a las
  // primeras PAGE filas en vez de arrastrar el "ver más" de la anterior.
  useEffect(() => {
    setVisible(PAGE)
  }, [range, bucket, categoryId])

  // Las flechas mueven de a un paso DEL PERÍODO elegido: mes a mes cuando se
  // mira un mes, año a año cuando se mira un año. Con "Todo" o un rango a
  // medida no hay paso natural y las flechas no se muestran (ver canShift).
  function moveRange(delta) {
    setRange((current) => shift(current, delta))
  }

  // Cambiar de cajón puede dejar elegida una categoría que ya no aplica: una
  // de gasto con el filtro en "Ingresos", o cualquiera en un cajón que no
  // tiene categorías (Todos, Inversiones, Ahorros, Transferencias), donde
  // además el control desaparece y la categoría quedaría filtrando en
  // silencio. Se
  // limpia, mismo criterio que usa el formulario de carga al cambiar
  // Gasto/Ingreso.
  function changeBucket(value) {
    setBucket(value)
    if (!categoryId) return
    if (!bucketHasCategories(value)) return setCategoryId('')
    const cat = categories.find((c) => c.id === categoryId)
    if (cat && cat.kind !== (value === EXPENSES ? 'expense' : 'income')) setCategoryId('')
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

    // Si el movimiento quedó fuera del período navegado (típico: cargarlo con
    // fecha de hoy mientras mirás un mes pasado), saltamos a SU mes. La fila en
    // la lista es la única confirmación de que se guardó: quedarse donde estaba
    // hace pensar que la operación no tuvo efecto. Se salta al mes y no al
    // período equivalente porque un movimiento es de un día: el mes es el
    // recorte más chico que lo contiene y lo deja a la vista.
    if (saved?.date && !contains(range, saved.date)) {
      setRange(monthOf(saved.date)) // el efecto de [range] dispara load()
      return
    }
    load()
  }

  // La lista se arma en tres pasos, y el orden importa: primero se COLAPSA
  // (sobre el mes entero, para que las dos patas de una transferencia siempre
  // se encuentren), después se mezcla, y recién al final se FILTRA. Filtrar
  // antes rompería el apareo: un filtro que dejara una sola pata armaría
  // líneas a medias, y el cajón de una transferencia se decide mirando sus dos
  // puntas.
  //
  // Los totales y el desglose (más arriba) se calculan aparte, sobre el mes
  // entero y sin filtrar: describen el mes navegado completo, no lo que quedó
  // visible en la lista.
  const { transfers, transactions: looseTransactions } = collapseTransfers(
    monthItems,
    (id) => batches.get(id) ?? null,
  )

  const items = mergeMovements(looseTransactions, monthInvestments, transfers)
    .filter((item) => bucket === ALL || movementBucket(item) === bucket)
    // El filtro de categoría solo puede alcanzar a gastos e ingresos: una
    // inversión no tiene categoría, y una transferencia lleva siempre la del
    // sistema. Con una categoría elegida, lo que no es una transaction se va
    // — no porque no interese, sino porque no hay categoría que pueda
    // coincidir.
    .filter(
      (item) => !categoryId || (item.source === 'transaction' && item.row.category_id === categoryId),
    )

  const { expenses, incomes, invested, saved, balance } = monthTotals({
    transactions: monthItems,
    contributions: monthInvestments,
  })
  const hasExtraFilters = bucket !== ALL || categoryId !== ''
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
          {/* Navegador del período. Las flechas son las de siempre y hacen lo
              de siempre; lo nuevo es que el nombre del medio se toca y abre
              la hoja para elegir otro período. Con "Todo" o un rango a medida
              las flechas desaparecen (no hay un "siguiente" de eso) y el
              nombre ocupa la fila entera; los huecos las reemplazan para que
              el título no se corra de lugar al cambiar de modo. */}
          <div className="surface flex items-center justify-between px-2 py-1.5">
            {canShift(range) ? (
              <button
                type="button"
                onClick={() => moveRange(-1)}
                aria-label="Período anterior"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition active:bg-mist md:hover:bg-mist"
              >
                <Arrow direction="left" />
              </button>
            ) : (
              <span aria-hidden className="h-9 w-9 shrink-0" />
            )}
            <button
              type="button"
              onClick={() => setRangeOpen(true)}
              className="min-w-0 truncate rounded-full px-3 py-1 text-[17px] font-semibold transition active:bg-mist md:hover:bg-mist"
            >
              {rangeLabel(range)}
            </button>
            {canShift(range) ? (
              <button
                type="button"
                onClick={() => moveRange(1)}
                aria-label="Período siguiente"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition active:bg-mist md:hover:bg-mist"
              >
                <Arrow direction="right" />
              </button>
            ) : (
              <span aria-hidden className="h-9 w-9 shrink-0" />
            )}
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
                  invertido y lo ahorrado no, porque no son ni una pérdida ni
                  una ganancia —es plata que cambió de lugar—, y el balance
                  tampoco, porque es una resta y su signo ya lo dice.
                  "Ahorrado" va pegado a "Invertido" porque se miden igual:
                  plata que salió del disponible y no se gastó. */}
              <div className="surface divide-y divide-line">
                <TotalRow label="Gastos" lines={expenses} amountClass="text-clay" />
                <TotalRow label="Ingresos" lines={incomes} amountClass="text-gain" />
                <TotalRow label="Invertido" lines={invested} />
                <TotalRow label="Ahorrado" lines={saved} />
                <TotalRow label="Balance" lines={balance} labelClass="text-[15px] font-medium" />
              </div>

              {/* Una lista por moneda (ver groupExpensesByCategory): con gastos
                  en una sola —el caso normal— es exactamente la lista de
                  siempre, sin nada que la anuncie. Recién cuando hay una
                  segunda moneda aparece el encabezado que dice cuál es cada
                  una, porque ahí sí hace falta. */}
              {categoryBreakdown.length > 0 && (
                <div className="space-y-3">
                  <h2 className="eyebrow px-1">En qué se fue</h2>
                  {categoryBreakdown.map((group) => (
                    <div key={group.currency}>
                      {categoryBreakdown.length > 1 && (
                        <p className="mb-1.5 px-1 text-[13px] text-ink-faint">
                          {group.currency === 'ARS' ? 'En pesos' : 'En dólares'}
                        </p>
                      )}
                      <div className="list">
                        {group.categories.map((cat) => (
                          <div
                            key={cat.name}
                            className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[15px]"
                          >
                            <span className="truncate text-ink-soft">{cat.name}</span>
                            <span className="font-money shrink-0">
                              {formatByCurrency(group.currency, cat.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Historial, con sus filtros */}
        <section className="space-y-3">
          {/* Los dos controles van uno debajo del otro y no lado a lado: los
              chips necesitan todo el ancho para que el corte del último se lea
              como "hay más" y no como un chip aplastado. El de categoría
              aparece solo en Gastos e Ingresos, que es donde una categoría
              significa algo y donde además la lista sale sin duplicados (ver
              bucketHasCategories). */}
          <div className="space-y-2">
            <FilterChips
              options={MOVEMENT_BUCKETS}
              value={bucket}
              onChange={changeBucket}
              label="Filtrar por tipo de movimiento"
            />
            {bucketHasCategories(bucket) && (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Filtrar por categoría"
                className="w-full rounded-[12px] bg-mist px-3.5 py-2.5 text-[15px] outline-none sm:max-w-xs"
              >
                <option value="">Todas las categorías</option>
                {categories
                  .filter((cat) => cat.kind === (bucket === EXPENSES ? 'expense' : 'income'))
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
            )}
          </div>

          {loading ? (
            <p className="px-1 text-[15px] text-ink-soft">Cargando…</p>
          ) : items.length === 0 && !error ? (
            <p className="surface px-4 py-10 text-center text-[15px] text-ink-soft">
              {hasExtraFilters
                ? 'Sin movimientos con estos filtros.'
                : 'Sin movimientos en este período.'}
            </p>
          ) : (
            !error && (
              <div className="list">
                {/* La key lleva el prefijo de la fuente: son dos tablas con
                    uuid propios y nada garantiza que no se crucen. */}
                {items.slice(0, visible).map(({ source, row }) =>
                  source === 'contribution' ? (
                    <InvestmentRow key={`c-${row.id}`} contribution={row} />
                  ) : source === 'transfer' ? (
                    <TransferRow
                      key={`x-${row.id}`}
                      transfer={row}
                      onOpen={() => {
                        setEditing(row.row)
                        setModalOpen(true)
                      }}
                    />
                  ) : row.account?.is_savings ? (
                    <SavingsRow key={`t-${row.id}`} tx={row} />
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

          {items.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((n) => n + PAGE)}
              className="btn btn-secondary w-full"
            >
              Ver más ({items.length - visible})
            </button>
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

      {rangeOpen && (
        <RangeSheet range={range} onChange={setRange} onClose={() => setRangeOpen(false)} />
      )}

      <TransactionFormModal
        open={modalOpen}
        initial={editing}
        categories={categories}
        accounts={accounts}
        defaultAccountId={defaultAccountId}
        lastReconciliations={lastReconciliations}
        onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
        onAccountCreated={addAccount}
        onClose={closeModal}
        onSaved={refreshAfterSave}
        onDeleted={refreshAfterSave}
      />
    </div>
  )
}

export default Movements
