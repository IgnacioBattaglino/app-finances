import { Link } from 'react-router-dom'
import { ErrorNotice } from './form/FormError.jsx'
import MoneyStack from './MoneyStack.jsx'
import { useExpenses } from '../hooks/useExpenses.js'
import {
  fullMonthName,
  sumByCurrency,
  localAmount,
  expensesInMonth,
  previousMonthToDate,
  monthOverMonthPct,
  groupByCategory,
} from '../lib/expensesSummary.js'
import { formatByCurrency, formatPercent, todayISO } from '../lib/format.js'
import { currencyLines } from '../lib/currencyTotals.js'
import { ChevronRight } from './Icons.jsx'

// El encabezado va FUERA de la tarjeta y a la misma altura que el de la curva
// del portafolio (`min-h-11`, el alto de su segmentado): en desktop los dos
// bloques van lado a lado y las tarjetas tienen que arrancar alineadas.
function Section({ children }) {
  return (
    <section>
      <h2 className="eyebrow flex min-h-11 items-center">Gastos del mes</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

// Bloque de gastos de Inicio: el total del mes, la comparación con el mes
// anterior y las tres categorías más grandes -- toda la tarjeta es un link a
// Movimientos, que es donde vive el detalle entero (el desglose completo por
// categoría y la serie de 12 meses, ver bloque 07). Todo sale de
// transactions, kind 'expense', sin categorías de sistema (getExpenses ya las
// excluye).
//
// Sobre la caché compartida: ya no hace falta ningún token que alguien suba
// al guardar -- toda escritura invalida esta consulta sola (ver
// lib/queryClient.js), así que cargar un gasto con el "+" de Inicio actualiza
// este bloque solo, sin que nadie se lo pida.
function ExpensesBlock() {
  const { expenses, months, loading, error, reload: load } = useExpenses()
  const today = todayISO()

  if (loading) {
    return (
      <Section>
        <div className="surface h-[140px]" aria-busy="true" aria-label="Calculando" />
      </Section>
    )
  }

  if (error) {
    return (
      <Section>
        <ErrorNotice error={error} onRetry={load} />
      </Section>
    )
  }

  if (expenses.length === 0) {
    return (
      <Section>
        <div className="surface px-5 py-8 text-center">
          <p className="text-subhead text-ink-soft">
            Todavía no cargaste ningún gasto. Cuando registres el primero, acá vas a ver en qué se te va
            la plata.
          </p>
        </div>
      </Section>
    )
  }

  return (
    <Section>
      <ExpensesCard expenses={expenses} months={months} today={today} />
    </Section>
  )
}

// El contenido de la tarjeta, presentacional (recibe los gastos ya cargados):
// así se prueba solo, sin depender de useExpenses ni de Supabase (ver
// ExpensesBlock.test.jsx).
export function ExpensesCard({ expenses, months, today }) {
  const currentMonth = months.at(-1)
  const previousMonth = months.at(-2)
  const currentMonthExpenses = expensesInMonth(expenses, currentMonth)
  const currentTotals = sumByCurrency(currentMonthExpenses)
  const totalLines = currencyLines(currentTotals)
  // La comparación con el mes anterior se hace en la moneda del día a día: un
  // solo porcentaje no puede describir dos monedas, y dos porcentajes en una
  // línea de 13px no se leen. Cuando además hubo gastos en otra moneda, la
  // frase lo aclara — una palabra de más, y solo en el caso raro.
  const previousTotals = sumByCurrency(previousMonthToDate(expenses, today))
  const pct = monthOverMonthPct(localAmount(currentTotals), localAmount(previousTotals))
  const mixed = totalLines.length > 1
  // Las tres categorías más grandes del primer grupo de groupByCategory (ver
  // expensesSummary.js), que ordena la moneda local primero -- así que en el
  // caso normal (algún gasto en pesos) son las de esa moneda. El detalle
  // completo, con las demás monedas, vive en Movimientos.
  const topGroup = groupByCategory(currentMonthExpenses)[0] ?? null
  const topCategories = topGroup?.categories.slice(0, 3) ?? []

  return (
    <Link
      viewTransition
      to="/movimientos"
      className="surface block px-5 py-4 transition active:opacity-60"
    >
      <span className="flex items-start justify-between gap-3">
        {/* El total en tinta, nunca en rojo: acá es un dato, no una alarma. */}
        <MoneyStack lines={totalLines} />
        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-ink-faint" />
      </span>
      {pct !== null && (
        <p className="mt-2 text-footnote text-ink-soft">
          {formatPercent(Math.abs(pct), 0)} {pct >= 0 ? 'más' : 'menos'} que en{' '}
          {fullMonthName(previousMonth)} a esta altura{mixed ? ', en pesos' : ''}
        </p>
      )}

      {topCategories.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-line pt-3.5">
          {topCategories.map((cat) => (
            <div key={cat.name} className="flex items-baseline justify-between gap-2 text-footnote">
              <span className="truncate text-ink-soft">{cat.name}</span>
              <span className="font-money shrink-0 font-medium">
                {formatByCurrency(topGroup.currency, cat.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}

export default ExpensesBlock
