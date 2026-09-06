import { useEffect, useState } from 'react'
import { computeCurrentLiquid, reconcile, decideAdjustment } from '../lib/liquid.js'
import { formatARS, todayISO, formatDayYear } from '../lib/format.js'
import FormSheet from './FormSheet.jsx'
import FormError from './form/FormError.jsx'
import AccountCreateForm from './form/AccountCreateForm.jsx'

// Una fila por cuenta: lo que la app calculó, y al lado el campo para declarar
// lo que hay de verdad.
//
// El campo vacío NO es cero: es "esta cuenta no la conté hoy". Por eso una
// cuenta que se deja en blanco no se reconcilia ni genera ajuste — se puede
// contar la plata del bolsillo un martes y la de Mercado Pago otro día, que es
// como se cuenta la plata en la vida real. Cero se escribe escribiendo 0.
function AccountRow({ account, value, onChange }) {
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
            Según la app: <span className="font-money">{formatARS(account.amount)}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-[15px] text-ink-soft">$</span>
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
          <span className="font-money">{formatARS(Math.abs(difference))}</span> → se registra un{' '}
          {decision.kind === 'income' ? 'ingreso' : 'gasto'} de ajuste
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
  const [creatingAccount, setCreatingAccount] = useState(false)

  useEffect(() => {
    if (!open) return
    setState(null)
    setDeclared({})
    setError(null)
    setBusy(false)
    setCreatingAccount(false)
    computeCurrentLiquid()
      .then(setState)
      .catch((e) =>
        setError({ message: 'No se pudo calcular el disponible.', detail: e.message }),
      )
  }, [open])

  if (!open) return null

  // La cuenta nace sin ningún movimiento (recién se crea acá): amount 0 y sin
  // reconciliación previa. No dispara un reload de computeCurrentLiquid —
  // insertarla a mano en el estado ya cargado alcanza, y evita perder lo que
  // el usuario ya tecleó en las demás filas.
  function handleAccountCreated(created) {
    setState((prev) =>
      prev ? { ...prev, accounts: [...prev.accounts, { ...created, amount: 0, last: null }] } : prev,
    )
    setCreatingAccount(false)
  }

  const accounts = state?.accounts ?? []
  // Sin ninguna cuenta cargada, se declara el disponible entero: es el camino
  // de antes de la migración 0032, y el que queda si el usuario borra todas
  // sus cuentas. La clave '__none__' representa esa declaración sin cuenta.
  const rows = state
    ? accounts.length > 0
      ? accounts.map((a) => ({ ...a, key: a.id, accountId: a.id }))
      : [{ key: '__none__', accountId: null, name: 'Dinero disponible', amount: state.current, last: state.last }]
    : []

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
      title="Dinero disponible"
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
                quedar cuadrado cuenta por cuenta. */}
            <p className="surface px-4 py-3 text-[15px] text-ink-soft">
              Según la app tenés{' '}
              <span className="font-money text-ink">{formatARS(state.current)}</span> en total.
              Contá cada cuenta y escribí cuánto hay de verdad.
            </p>

            <div className="list">
              {rows.map((row) => (
                <AccountRow
                  key={row.key}
                  account={row}
                  value={declared[row.key] ?? ''}
                  onChange={(next) => setDeclared((prev) => ({ ...prev, [row.key]: next }))}
                />
              ))}

              {/* Alta al pie de la lista, mismo patrón que "Nueva categoría"
                  y el mismo formulario que ofrece AccountField en los
                  selectores de carga: la cuenta nueva aparece en la lista con
                  su campo de declarar vacío, lista para completar. */}
              {creatingAccount ? (
                <div className="px-4 py-3">
                  <AccountCreateForm
                    onCreated={handleAccountCreated}
                    onCancel={() => setCreatingAccount(false)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingAccount(true)}
                  className="w-full px-4 py-3 text-left text-[17px] font-medium text-accent-ink transition active:bg-mist"
                >
                  Nueva cuenta
                </button>
              )}
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
