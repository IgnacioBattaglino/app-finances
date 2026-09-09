import { useEffect, useState } from 'react'
import { computeCurrentLiquid, reconcile, decideAdjustment } from '../lib/liquid.js'
import { formatARS, formatByCurrency, todayISO, formatDayYear } from '../lib/format.js'
import { LOCAL_CURRENCY } from '../lib/currencyTotals.js'
import FormSheet from './FormSheet.jsx'
import FormError from './form/FormError.jsx'

// Una fila por cuenta: lo que la app calculó, y al lado el campo para declarar
// lo que hay de verdad.
//
// El campo vacío NO es cero: es "esta cuenta no la conté hoy". Por eso una
// cuenta que se deja en blanco no se reconcilia ni genera ajuste — se puede
// contar la plata del bolsillo un martes y la de Mercado Pago otro día, que es
// como se cuenta la plata en la vida real. Cero se escribe escribiendo 0.
function AccountRow({ account, value, onChange }) {
  const currency = account.currency ?? 'ARS'
  const declaredValue = Number(String(value).replace(',', '.'))
  const filled = value !== '' && Number.isFinite(declaredValue) && declaredValue >= 0
  const decision = filled ? decideAdjustment(account.amount, declaredValue) : null
  const difference = filled ? declaredValue - account.amount : 0

  return (
    <div className="px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px]">{account.name}</span>
          <span className="block text-[13px] text-ink-soft">
            Según la app: <span className="font-money">{formatByCurrency(currency, account.amount)}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-[15px] text-ink-soft">{currency === 'USD' ? 'US$' : '$'}</span>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputMode="decimal"
            placeholder="—"
            className="font-money w-28 bg-transparent text-right text-[17px] outline-none placeholder:text-ink-faint"
          />
        </span>
      </label>

      {decision && (
        <p className={`mt-1.5 text-[13px] ${difference > 0 ? 'text-accent-ink' : 'text-clay'}`}>
          {difference > 0 ? '+' : '−'}
          <span className="font-money">{formatByCurrency(currency, Math.abs(difference))}</span> → se
          registra un {decision.kind === 'income' ? 'ingreso' : 'gasto'} de ajuste
          {account.last ? '' : ' como saldo inicial'}.
        </p>
      )}
      {filled && !decision && (
        <p className="mt-1.5 text-[13px] text-ink-soft">Coincide: no se genera ajuste.</p>
      )}
      {!filled && account.last && (
        <p className="mt-1.5 text-[13px] text-ink-faint">
          Reconciliada el {formatDayYear(account.last.date)}.
        </p>
      )}
    </div>
  )
}

function LiquidModal({ open, onClose, onSaved }) {
  const [state, setState] = useState(null) // null = cargando
  const [declared, setDeclared] = useState({}) // accountId (o '__none__') → texto
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setState(null)
    setDeclared({})
    setError(null)
    setBusy(false)
    computeCurrentLiquid()
      .then(setState)
      .catch((e) =>
        setError({ message: 'No se pudo calcular el disponible.', detail: e.message }),
      )
  }, [open])

  if (!open) return null

  const accounts = state?.accounts ?? []
  // Cuánto calculó la app, moneda por moneda. Con una sola —el caso normal—
  // es una frase igual a la de antes; con dos, las dos, unidas por "y".
  const totals = state?.totals ?? []
  const totalsText = totals
    .map((line) => formatByCurrency(line.currency, line.amount))
    .join(' y ')
  // Sin ninguna cuenta cargada, se declara el disponible entero: es el camino
  // de antes de la migración 0032, y el que queda si el usuario borra todas
  // sus cuentas. La clave '__none__' representa esa declaración sin cuenta.
  // Sin cuentas no hay ninguna moneda que no sea la local (los baldes null y
  // huérfano se leen así), por eso alcanza con esa línea.
  const localTotal = totals.find((line) => line.currency === LOCAL_CURRENCY)?.amount ?? 0
  const liquidRows = state
    ? accounts.length > 0
      ? accounts.map((a) => ({ ...a, key: a.id, accountId: a.id }))
      : [{ key: '__none__', accountId: null, name: 'Dinero disponible', amount: localTotal, last: state.last }]
    : []

  // Las cuentas de ahorro también se cuentan: guardaste esa plata aparte, pero
  // sigue siendo plata real y hay que poder decir "esto tiene tanto" como con
  // cualquier otra (ver Dashboard, "Dinero ahorrado"). A diferencia del
  // disponible, sin ninguna cuenta de ahorro no hay nada que declarar por
  // separado — no existe un "ahorro sin cuenta" equivalente al de antes de la
  // 0032.
  const savingsRows = (state?.savings ?? []).map((a) => ({ ...a, key: a.id, accountId: a.id }))

  const rows = [...liquidRows, ...savingsRows]

  const declarations = rows
    .map((row) => ({ row, raw: declared[row.key] ?? '' }))
    .filter(({ raw }) => raw !== '')
    .map(({ row, raw }) => ({
      accountId: row.accountId,
      declaredAmount: Number(raw.replace(',', '.')),
    }))
    .filter((d) => Number.isFinite(d.declaredAmount) && d.declaredAmount >= 0)

  const valid = state !== null && declarations.length > 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      onSaved(await reconcile({ date: todayISO(), declarations }))
    } catch (e) {
      setError({ message: 'No se pudo guardar la reconciliación.', detail: e.message })
      setBusy(false)
    }
  }

  return (
    <FormSheet
      title="Contar mi plata"
      onClose={onClose}
      action={
        <button
          type="submit"
          form="liquid-form"
          disabled={!valid || busy}
          className="text-[15px] font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <form id="liquid-form" onSubmit={handleSubmit} className="space-y-3">
        {state === null ? (
          <p className="surface px-4 py-3 text-[15px] text-ink-soft">
            Calculando cuánto tenés según la app…
          </p>
        ) : (
          <>
            {/* El total, informativo: no es un campo, es el número que va a
                quedar cuadrado cuenta por cuenta. Explica, en una línea, qué
                hace esta pantalla: la app calcula sola a partir de lo que se
                fue cargando, y acá se corrige contra la plata real. */}
            <p className="surface px-4 py-3 text-[15px] text-ink-soft">
              Según lo que fuiste cargando, la app calcula que tenés{' '}
              <span className="font-money text-ink">{totalsText}</span> en total. Contá cada cuenta
              y escribí cuánto hay de verdad: la diferencia se corrige sola.
            </p>

            <div className="list">
              {liquidRows.map((row) => (
                <AccountRow
                  key={row.key}
                  account={row}
                  value={declared[row.key] ?? ''}
                  onChange={(next) => setDeclared((prev) => ({ ...prev, [row.key]: next }))}
                />
              ))}
            </div>

            {/* El balde de lo que quedó sin cuenta: se muestra porque suma al
                total y si no, el desglose no cerraría, pero no se declara —
                no es una cuenta, es lo que ninguna migración alcanzó a
                asignar. */}
            {accounts.length > 0 && Math.abs(state.unassigned) >= 0.01 && (
              <p className="rounded-[16px] bg-mist px-4 py-3 text-[13px] text-ink-soft">
                Además hay <span className="font-money">{formatARS(state.unassigned)}</span> en
                movimientos sin cuenta asignada. Suman a tu total, pero no se reconcilian acá:
                asignales una cuenta desde el movimiento.
              </p>
            )}

            {/* Cuentas de ahorro: plata real, aparte del disponible de arriba
                (ver ADR-014). Sección propia porque no comparten el "total"
                de la frase de arriba, que es solo del día a día — mezclar
                filas de las dos en una sola lista haría parecer que sí lo
                comparten. Sin cuentas de ahorro, la sección no existe. */}
            {savingsRows.length > 0 && (
              <>
                <h2 className="eyebrow mb-2 px-1">Ahorro</h2>
                <div className="list">
                  {savingsRows.map((row) => (
                    <AccountRow
                      key={row.key}
                      account={row}
                      value={declared[row.key] ?? ''}
                      onChange={(next) => setDeclared((prev) => ({ ...prev, [row.key]: next }))}
                    />
                  ))}
                </div>
              </>
            )}

            <p className="px-1 text-[13px] text-ink-soft">
              Las cuentas que dejes vacías quedan como están: no se reconcilian ni generan ajuste.
            </p>
          </>
        )}

        <FormError message={error?.message} detail={error?.detail} />
      </form>
    </FormSheet>
  )
}

export default LiquidModal
