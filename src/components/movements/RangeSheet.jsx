import { useState } from 'react'
import FormSheet from '../FormSheet.jsx'
import {
  bounds,
  lastMonths,
  monthRange,
  yearRange,
  RANGE_ALL,
  RANGE_CUSTOM,
  RANGE_MONTH,
  RANGE_YEAR,
} from '../../lib/dateRange.js'

// Elegir qué período se está mirando. Se abre tocando el nombre del período en
// el navegador de Movimientos — no hay ningún control nuevo permanente en la
// pantalla: el que ya estaba pasó de ser una etiqueta a ser un botón.
//
// Tres formas de elegir, de la más frecuente a la menos:
//
//   1. La grilla de doce meses con su propio navegador de año. Es el caso
//      normal (ver un mes) y resuelve el que no tenía forma: saltar a un mes
//      de un año anterior, que con las flechas de la pantalla costaba doce
//      toques por año.
//   2. Los atajos: el año entero que se está mirando en la grilla, los últimos
//      doce meses, y todo el historial.
//   3. Dos fechas a mano, para lo que no cae en ninguna de las anteriores.
//
// Elegir cierra la hoja, salvo el rango a medida, que necesita las dos fechas
// antes de poder aplicarse.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function YearArrow({ direction }) {
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

function Shortcut({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-2 text-[15px] transition ${
        active ? 'bg-accent font-semibold text-white' : 'bg-mist text-ink-soft active:bg-line md:hover:bg-line'
      }`}
    >
      {children}
    </button>
  )
}

function RangeSheet({ range, onChange, onClose }) {
  // El año de la GRILLA, que no es el del rango: se navega para buscar un mes
  // sin que la pantalla de atrás cambie hasta que se elige uno. Arranca en el
  // año de lo que se está mirando, o en el actual si el rango no tiene año
  // (todo el historial, o un rango a medida).
  const [gridYear, setGridYear] = useState(range.year ?? new Date().getFullYear())
  const [from, setFrom] = useState(() => bounds(range).from ?? '')
  const [to, setTo] = useState(() => bounds(range).to ?? '')

  function choose(next) {
    onChange(next)
    onClose()
  }

  const customReady = from && to && from <= to

  return (
    <FormSheet title="Qué período mirar" onClose={onClose}>
      <div className="space-y-5 pt-1">
        <div className="flex flex-wrap gap-2">
          <Shortcut active={range.mode === RANGE_YEAR && range.year === gridYear} onClick={() => choose(yearRange(gridYear))}>
            Todo {gridYear}
          </Shortcut>
          <Shortcut onClick={() => choose(lastMonths(12))}>Últimos 12 meses</Shortcut>
          <Shortcut active={range.mode === RANGE_ALL} onClick={() => choose({ mode: RANGE_ALL })}>
            Todo
          </Shortcut>
        </div>

        <div className="surface p-2">
          <div className="flex items-center justify-between px-1 pb-1">
            <button
              type="button"
              onClick={() => setGridYear(gridYear - 1)}
              aria-label="Año anterior"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition active:bg-mist md:hover:bg-mist"
            >
              <YearArrow direction="left" />
            </button>
            <span className="font-money text-[17px] font-semibold">{gridYear}</span>
            <button
              type="button"
              onClick={() => setGridYear(gridYear + 1)}
              aria-label="Año siguiente"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition active:bg-mist md:hover:bg-mist"
            >
              <YearArrow direction="right" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MONTHS.map((name, index) => {
              const month = index + 1
              const active =
                range.mode === RANGE_MONTH && range.month === month && range.year === gridYear
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => choose(monthRange(month, gridYear))}
                  aria-pressed={active}
                  className={`rounded-[10px] py-2.5 text-[15px] transition ${
                    active
                      ? 'bg-accent font-semibold text-white'
                      : 'text-ink-soft active:bg-mist md:hover:bg-mist'
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Dos fechas a mano. Los inputs de fecha nativos no cuentan como
            "abrir el formulario con teclado": no abren teclado, abren el
            selector del sistema, y el usuario los toca cuando quiere. */}
        <div className="space-y-2">
          <p className="eyebrow px-1">O entre dos fechas</p>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Desde</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-[12px] bg-mist px-3.5 py-2.5 text-[15px] outline-none"
              />
            </label>
            <label className="flex-1">
              <span className="sr-only">Hasta</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-[12px] bg-mist px-3.5 py-2.5 text-[15px] outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!customReady}
            onClick={() => choose({ mode: RANGE_CUSTOM, from, to })}
            className="btn btn-secondary w-full disabled:opacity-40"
          >
            Ver ese período
          </button>
        </div>
      </div>
    </FormSheet>
  )
}

export default RangeSheet
