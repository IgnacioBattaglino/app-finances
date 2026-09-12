import { useEffect, useState } from 'react'
import { computeCurrentLiquid, reconcile, decideAdjustment, planReconciliation } from '../lib/liquid.js'
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
//
// LO QUE LA FILA DICE, Y LO QUE NO. Muestra cuánto se corrió esta cuenta, y
// nada más: si eso es un gasto o solo plata que estaba en otro lado no se
// sabe mirando una cuenta sola, se sabe mirando el total de su moneda (ver
// planReconciliation y el resumen del pie). Antes esta línea prometía "se
// registra un gasto de ajuste" por cuenta, que es exactamente lo que la app
// hacía mal.
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
          <span className="font-money">{formatByCurrency(currency, Math.abs(difference))}</span>{' '}
          respecto de lo que calculó la app.
        </p>
      )}
      {filled && !decision && (
        <p className="mt-1.5 text-[13px] text-ink-soft">Coincide: no hay nada que corregir.</p>
      )}
      {!filled && account.last && (
        <p className="mt-1.5 text-[13px] text-ink-faint">
          Reconciliada el {formatDayYear(account.last.date)}.
        </p>
      )}
    </div>
  )
}

// Qué va a quedar registrado, en una frase por moneda. Es lo que la pantalla
// no sabía decir hasta ahora: un conteo produce DOS cosas distintas y solo una
// es un gasto.
//
// Sale del mismo planReconciliation que aplica la base al guardar, así que
// esto no es una explicación aproximada de lo que va a pasar — es el mismo
// cálculo.
function Summary({ plan }) {
  const anyDeclared = plan.rows.length > 0
  if (!anyDeclared) return null

  const moved = plan.rows.some((row) => row.remainder)
  const nothing = plan.currencies.every((c) => Math.abs(c.net) < 0.01) && !moved
  if (nothing) {
    return (
      <p className="notice px-4 py-3 text-[15px]">
        Todo coincide con lo que calculó la app: no se registra ningún movimiento.
      </p>
    )
  }

  return (
    <div className="notice space-y-1.5 px-4 py-3 text-[15px]">
      {plan.currencies.map(({ currency, net }) =>
        Math.abs(net) < 0.01 ? (
          <p key={currency}>
            El total {currency === 'USD' ? 'en dólares' : 'en pesos'} no cambia: la plata solo se
            reparte entre tus cuentas y no se registra ningún gasto.
          </p>
        ) : (
          <p key={currency}>
            {net < 0 ? 'Faltan' : 'Sobran'}{' '}
            <span className="font-money">{formatByCurrency(currency, Math.abs(net))}</span> en total:
            se registra {net < 0 ? 'un gasto' : 'un ingreso'} por esa diferencia.
          </p>
        ),
      )}
      {moved && (
        <p className="text-[13px] text-ink-soft">
          El resto es plata que estaba en otra cuenta: se anota como transferencia y no cuenta como
          gasto ni como ingreso.
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
        setError({ message: 'No se pudo calcular el disponible.', detail: e }),
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
      : [
          {
            key: '__none__',
            accountId: null,
            name: 'Dinero disponible',
            amount: localTotal,
            currency: LOCAL_CURRENCY,
            is_savings: false,
            // Antes que cualquier cuenta en los desempates de la ancla, aunque
            // nunca compite con ninguna: si esta fila existe, es la única.
            position: -1,
            last: state.last,
          },
        ]
    : []

  // Las cuentas de ahorro también se cuentan: guardaste esa plata aparte, pero
  // sigue siendo plata real y hay que poder decir "esto tiene tanto" como con
  // cualquier otra (ver Dashboard, "Dinero ahorrado"). A diferencia del
  // disponible, sin ninguna cuenta de ahorro no hay nada que declarar por
  // separado — no existe un "ahorro sin cuenta" equivalente al de antes de la
  // 0032.
  const savingsRows = (state?.savings ?? []).map((a) => ({ ...a, key: a.id, accountId: a.id }))

  const rows = [...liquidRows, ...savingsRows]

  // Las cuentas declaradas, con todo lo que el neteo necesita para decidir
  // dónde va el ajuste. Las de ahorro entran en la misma lista a propósito: el
  // neteo es por MONEDA, y plata que pasó del bolsillo al ahorro sin
  // registrarse es justamente lo que no hay que contar como gasto.
  const declarations = rows
    .map((row) => ({ row, raw: declared[row.key] ?? '' }))
    .filter(({ raw }) => raw !== '')
    .map(({ row, raw }) => ({
      key: row.key,
      accountId: row.accountId,
      name: row.name,
      currency: row.currency ?? LOCAL_CURRENCY,
      isSavings: Boolean(row.is_savings),
      position: row.position ?? 0,
      current: row.amount,
      declaredAmount: Number(raw.replace(',', '.')),
    }))
    .filter((d) => Number.isFinite(d.declaredAmount) && d.declaredAmount >= 0)

  const plan = planReconciliation(declarations)
  const valid = state !== null && declarations.length > 0

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      onSaved(await reconcile({ date: todayISO(), declarations }))
    } catch (e) {
      setError({ message: 'No se pudo guardar la reconciliación.', detail: e })
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

            <Summary plan={plan} />

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
