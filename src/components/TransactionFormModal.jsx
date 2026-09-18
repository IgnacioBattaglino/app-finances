import { useEffect, useState } from 'react'
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  transactionCurrency,
} from '../lib/transactions.js'
import { getAccountTransferPair, deleteAccountTransfer } from '../lib/accountTransfers.js'
import { createCategory } from '../lib/categories.js'
import { retroactiveReconciliation, getReconciliationOf, deleteReconciliation } from '../lib/liquid.js'
import { todayISO, toDecimalInput, formatByCurrency, formatDayYear } from '../lib/format.js'
import { isMovedMoney, isBalanceAdjustment } from '../lib/systemCategories.js'
import { useCategories } from '../hooks/useCategories.js'
import FormSheet from './FormSheet.jsx'
import LiquidModal from './LiquidModal.jsx'
import BinaryChoice from './form/BinaryChoice.jsx'
import CollapsedDateField from './form/CollapsedDateField.jsx'
import FormError, { ErrorNotice } from './form/FormError.jsx'
import MissingHint from './form/MissingHint.jsx'
import AccountField from './form/AccountField.jsx'
import ConfirmAction from './form/ConfirmAction.jsx'
import { showToast } from './Toast.jsx'
import InlineCreate from './form/InlineCreate.jsx'

function TransactionFormModal({
  open,
  initial,
  defaultKind = 'expense',
  accounts = [],
  defaultAccountId = null,
  lastReconciliations = new Map(),
  onClose,
  onSaved,
  onDeleted,
  onAccountCreated,
  onReconciled,
}) {
  // Las categorías se piden ACÁ, no por prop: el monto (lo primero que se
  // escribe) no las necesita para nada, así que abrir el formulario no puede
  // esperarlas. Mientras no llegan, el selector de más abajo se deshabilita
  // en vez de bloquear el resto.
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesQueryError,
    reload: reloadCategories,
    addCategory,
  } = useCategories()
  const categoriesError = categoriesQueryError
    ? { message: 'No se pudieron cargar las categorías.', detail: categoriesQueryError }
    : null

  const [date, setDate] = useState(todayISO())
  const [kind, setKind] = useState(defaultKind)
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Alta de categoría sin salir del formulario (mismo patrón que "+ Nuevo
  // grupo" en AssetFormModal): antes había que abandonar el gasto a medio
  // cargar, ir a Ajustes y volver a empezar.
  const [creatingCategory, setCreatingCategory] = useState(false)
  // Nombre de la otra cuenta de la transferencia (para el mensaje de
  // borrado); null mientras carga o si no se pudo resolver.
  const [transferSibling, setTransferSibling] = useState(null)
  // El conteo que escribió este movimiento, si lo escribió uno (ver
  // getReconciliationOf). Tres estados, no dos: `undefined` mientras no se
  // sabe todavía (couldBeReconciliation es una sospecha por categoría, más
  // barata que consultar; ver abajo), el objeto una vez confirmado, y `null`
  // si se confirmó que NO es parte de ninguno — un movimiento de ahorro "de
  // afuera" comparte categoría con el reparto de un conteo pero no lo es. La
  // fila se muestra de solo lectura mientras el valor no sea `null` (ver el
  // render): así nunca hay una ventana donde se pueda editar un movimiento
  // que después resulta ser parte de un conteo.
  const [reconciliation, setReconciliation] = useState(undefined)
  // Abre "Contar mi plata" ENCIMA de este formulario, sin cerrarlo: quien
  // llega acá viene de editar algo y puede no haberlo guardado todavía, así
  // que navegar a /plata perdería ese cambio. Apilar el sheet (ver el render,
  // mismo z-50 de FormSheet, apilado por orden en el DOM) deja este formulario
  // intacto atrás y a la vista apenas se cierra el de contar.
  const [reconcileOpen, setReconcileOpen] = useState(false)

  const editing = Boolean(initial?.id)
  const isTransferPart = Boolean(initial?.transfer_id)
  // Un movimiento PUEDE venir de un conteo solo si lleva una de sus dos
  // categorías y no es una pata de transferencia (que comparte la categoría
  // del reparto). Se filtra acá para no consultar en cada gasto común.
  const couldBeReconciliation =
    editing &&
    !isTransferPart &&
    (isBalanceAdjustment(initial?.category) || isMovedMoney(initial?.category))

  useEffect(() => {
    if (!open) return
    setDate(initial?.date ?? todayISO())
    setKind(initial?.kind ?? defaultKind)
    setCategoryId(initial?.category_id ?? '')
    setDescription(initial?.description ?? '')
    setAmount(initial ? toDecimalInput(Number(initial.amount)) : '')
    // Editando manda lo que tiene la fila, incluso si es null: guardar sin
    // tocar nada tiene que dejar el movimiento idéntico, no mudarlo a la
    // cuenta por defecto. Creando, la cuenta por defecto ya viene elegida.
    setAccountId(initial ? (initial.account_id ?? null) : defaultAccountId)
    setError(null)
    setBusy(false)
    setCreatingCategory(false)
    setTransferSibling(null)
    setReconciliation(undefined)
    setReconcileOpen(false)
  }, [open, initial, defaultKind, defaultAccountId])

  // Mientras esto no resuelve, la fila se muestra de solo lectura si
  // `couldBeReconciliation` sospecha que hace falta (ver el render) — así que
  // acá SÍ hace falta avisar si falla, a diferencia de otros datos
  // complementarios del formulario: sin resolver, la fila quedaría de solo
  // lectura para siempre en vez de caer a "no es parte de ninguno".
  useEffect(() => {
    if (!open || !couldBeReconciliation) return
    let cancelled = false
    getReconciliationOf(initial.id)
      .then((found) => {
        if (!cancelled) setReconciliation(found)
      })
      .catch((e) => {
        if (!cancelled) setError({ message: 'No se pudo confirmar si esto es parte de un conteo.', detail: e })
      })
    return () => {
      cancelled = true
    }
  }, [open, initial, couldBeReconciliation])

  // Una pata de transferencia (migración 0040) no se edita sola: solo hace
  // falta el nombre de la otra cuenta, para el mensaje de la confirmación de
  // borrado. Mismo patrón que ContributionFormModal con getTransferPair.
  useEffect(() => {
    if (!open || !initial?.transfer_id) return
    let cancelled = false
    getAccountTransferPair(initial.transfer_id).then((rows) => {
      if (cancelled) return
      const sibling = rows.find((r) => r.id !== initial.id)
      if (sibling?.account?.name) setTransferSibling(sibling.account.name)
    })
    return () => {
      cancelled = true
    }
  }, [open, initial])

  if (!open) return null

  // Aviso no bloqueante: esta fila cae en o antes de la última vez que se
  // contó SU cuenta. Se calcula acá (antes del branch de transferencia) para
  // que valga en los dos renders — editar o borrar un movimiento corre el
  // saldo igual, sea una pata de transferencia o no.
  const retro = editing
    ? retroactiveReconciliation(lastReconciliations, accountId, date)
    : null
  const retroAccountName = accounts.find((a) => a.id === accountId)?.name ?? 'esta cuenta'
  const retroNotice = retro && (
    <div className="notice space-y-1.5 text-footnote">
      <p>
        Esta operación es anterior a la última vez que contaste {retroAccountName} (el{' '}
        {formatDayYear(retro.date)}). Modificarla puede correr el saldo actual de esa cuenta.
      </p>
      <button
        type="button"
        onClick={() => setReconcileOpen(true)}
        className="font-semibold text-accent-ink underline"
      >
        Contarla de nuevo ahora
      </button>
    </div>
  )
  // Se define una sola vez y se reutiliza en los tres finales posibles del
  // componente (transferencia, conteo de solo lectura, formulario normal):
  // LiquidModal ya devuelve null si no está abierto, así que apilarlo siempre
  // no cuesta nada.
  const reconcileModal = (
    <LiquidModal
      open={reconcileOpen}
      onClose={() => setReconcileOpen(false)}
      onSaved={() => {
        setReconcileOpen(false)
        onReconciled?.()
      }}
    />
  )

  // Lo que este movimiento es en realidad: una de las cosas que escribió un
  // conteo, y que no se sostienen por separado (ver ADR-016). Se dice antes de
  // tocar nada. Movida acá arriba (antes vivía después del branch de
  // transferencia) porque ahora también la usa el branch de solo lectura de
  // un conteo, más abajo.
  const reconciliationNotice = reconciliation && (
    <p className="callout">
      Esto lo escribió «Contar mi plata» el {formatDayYear(reconciliation.date)}
      {reconciliation.movements > 1
        ? `, junto con ${reconciliation.movements - 1} ${
            reconciliation.movements === 2 ? 'movimiento más' : 'movimientos más'
          }. Se sostienen entre sí, así que se borran juntos.`
        : '.'}
    </p>
  )

  async function handleDeleteTransfer() {
    setBusy(true)
    setError(null)
    try {
      await deleteAccountTransfer(initial.transfer_id)
      onDeleted?.(initial.id)
    } catch (e) {
      setError({ message: 'No se pudo eliminar la transferencia.', detail: e })
      setBusy(false)
    }
  }

  // Una pata de transferencia entre cuentas se muestra de solo lectura:
  // editarla por separado descuadraría la otra mitad (el monto de cada lado
  // es el que efectivamente entró o salió, y las dos van juntas). Para
  // corregirla hay que borrar la transferencia entera (las dos patas,
  // atómico) y volver a cargarla. Mismo criterio que ContributionFormModal
  // con isTransferPart.
  if (isTransferPart) {
    return (
      <>
      <FormSheet
        title={initial.kind === 'expense' ? 'Transferencia enviada' : 'Transferencia recibida'}
        onClose={onClose}
      >
        <div className="space-y-3">
          <div className="list">
            <div className="row">
              <span className="text-subhead text-ink-soft">Monto</span>
              <span className="font-money text-subhead">
                {formatByCurrency(initial.currency, Number(initial.amount))}
              </span>
            </div>
            <div className="row">
              <span className="text-subhead text-ink-soft">Fecha</span>
              <span className="text-body">{formatDayYear(initial.date)}</span>
            </div>
          </div>

          <p className="callout">
            {transferSibling
              ? `Parte de una transferencia con «${transferSibling}». `
              : 'Parte de una transferencia. '}
            No se puede editar: para corregirla, borrala y volvé a cargarla.
          </p>

          <FormError message={error?.message} detail={error?.detail} />

          {retroNotice}
          <ConfirmAction
            label="Eliminar transferencia"
            question="¿Eliminar esta transferencia?"
            detail={`Se borran las dos partes${transferSibling ? `: esta operación y la de «${transferSibling}»` : ''}. Es permanente.`}
            busy={busy}
            onConfirm={handleDeleteTransfer}
          />
        </div>
      </FormSheet>
      {reconcileModal}
      </>
    )
  }

  // Un "Ajuste de saldo" o un "Reparto entre cuentas": lo escribió un conteo
  // y sus piezas no se sostienen por separado, igual que las dos patas de una
  // transferencia (ver deleteReconciliation). Se muestra de solo lectura,
  // mismo patrón que el branch de arriba: se explica qué es y el único camino
  // es borrar el conteo entero.
  //
  // La condición es `!== null` y no la sospecha `couldBeReconciliation` sola:
  // mientras `reconciliation` no resolvió (`undefined`) ya se entra acá para
  // no dejar ni un instante en que se vea el formulario editable de siempre
  // con la categoría vacía y Guardar habilitado (el bug de la sección 5.2).
  // Si al resolver resulta que NO es parte de ningún conteo (un movimiento de
  // ahorro "de afuera", que comparte categoría con el reparto pero es una
  // fila real y editable) se sigue de largo al formulario normal.
  if (couldBeReconciliation && reconciliation !== null) {
    const loaded = Boolean(reconciliation)
    return (
      <>
      <FormSheet
        title={initial.category?.name ?? (initial.kind === 'expense' ? 'Gasto' : 'Ingreso')}
        onClose={onClose}
      >
        <div className="space-y-3">
          <div className="list">
            <div className="row">
              <span className="text-subhead text-ink-soft">Monto</span>
              <span className="font-money text-subhead">
                {formatByCurrency(initial.currency, Number(initial.amount))}
              </span>
            </div>
            <div className="row">
              <span className="text-subhead text-ink-soft">Fecha</span>
              <span className="text-body">{formatDayYear(initial.date)}</span>
            </div>
          </div>

          {loaded ? (
            reconciliationNotice
          ) : (
            <p className="callout">
              Confirmando si es parte de un conteo…
            </p>
          )}

          {retroNotice}
          <FormError message={error?.message} detail={error?.detail} />

          <ConfirmAction
            label="Eliminar el conteo"
            question="¿Eliminar este conteo?"
            detail={
              loaded &&
              `Se ${
                reconciliation.movements === 1
                  ? 'borra el movimiento que escribió'
                  : `borran los ${reconciliation.movements} movimientos que escribió`
              } y el registro de lo que declaraste. Es permanente. Tus saldos vuelven a lo que la app calculaba antes de contar: volvé a contar tu plata para acomodarlos.`
            }
            busy={busy}
            disabled={!loaded}
            onConfirm={handleDelete}
          />
        </div>
      </FormSheet>
      {reconcileModal}
      </>
    )
  }

  const kindCategories = categories.filter((cat) => cat.kind === kind && !cat.is_system)
  const amountValue = Number(amount.replace(',', '.'))
  // La moneda sale de la cuenta elegida y se guarda en la fila (ver
  // transactionCurrency). Acá además se muestra: el símbolo del campo de monto
  // es lo que le dice al usuario en qué está cargando, sin agregar un selector
  // de moneda que sería una segunda forma de decir lo mismo — y que dejaría
  // elegir una moneda distinta de la de la cuenta, que no es una operación que
  // la app sepa registrar.
  const currency = transactionCurrency({ initial, accountId, accounts })
  const missing = []
  if (!(amountValue > 0)) missing.push('monto')
  if (!categoryId) missing.push('categoría')
  if (!date) missing.push('fecha')
  const valid = missing.length === 0

  function changeKind(next) {
    setKind(next)
    // La categoría elegida deja de valer si es del otro tipo
    const stillValid = categories.some((c) => c.id === categoryId && c.kind === next)
    if (!stillValid) setCategoryId('')
    // El alta a medio escribir era para el otro tipo: se cancela en vez de
    // crear un "Nafta" de ingreso porque quedó el input abierto.
    setCreatingCategory(false)
  }

  // La categoría nace con el tipo del movimiento que se está cargando y queda
  // elegida: el usuario escribió el nombre para usarla ahora, no para tener
  // que buscarla en el selector después de crearla.
  async function handleCreateCategory(name) {
    const created = await createCategory(name, kind)
    addCategory(created)
    setCategoryId(created.id)
    setCreatingCategory(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const fields = { date, kind, categoryId, description, amount: amountValue, currency, accountId }
    try {
      const saved = editing
        ? await updateTransaction(initial.id, fields)
        : await createTransaction(fields)
      if (!editing) {
        showToast(`${kind === 'expense' ? 'Gasto' : 'Ingreso'} guardado · ${formatByCurrency(currency, amountValue)}`)
      }
      onSaved(saved)
    } catch (e) {
      setError({ message: 'No se pudo guardar el movimiento.', detail: e })
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      // Un movimiento de un conteo no se borra solo: se lleva su conteo
      // entero, de una (ver deleteReconciliation). Borrarlo suelto lo
      // rechazaría la base --la fila de liquid_reconciliations lo
      // referencia-- y, peor, dejaría a los demás movimientos del conteo
      // moviendo plata por algo que ya no existe.
      if (reconciliation) await deleteReconciliation(initial.id)
      else await deleteTransaction(initial.id)
      onDeleted?.(initial.id)
    } catch (e) {
      setError({
        message: reconciliation ? 'No se pudo eliminar el conteo.' : 'No se pudo eliminar el movimiento.',
        detail: e,
      })
      setBusy(false)
    }
  }

  return (
    <>
    <FormSheet
      title={
        kind === 'expense'
          ? editing
            ? 'Editar gasto'
            : 'Nuevo gasto'
          : editing
            ? 'Editar ingreso'
            : 'Nuevo ingreso'
      }
      onClose={onClose}
      startExpanded
      onSubmit={handleSubmit}
      canSubmit={valid}
      busy={busy}
    >
          <BinaryChoice
            options={[
              { value: 'expense', label: 'Gasto' },
              { value: 'income', label: 'Ingreso' },
            ]}
            value={kind}
            onChange={changeKind}
          />

          {/* EL MONTO, protagonista: es lo primero que se escribe y el único
              dato que no tiene un valor por defecto. Grande y centrado, como
              en Wallet, en vez de ser una fila más a la par de la fecha.
              El input no tiene ancho propio: comparte celda con una copia
              invisible de lo escrito, así mide exactamente el número y el
              símbolo queda pegado a él. Sin aro de foco: se abre ya enfocado
              y el cursor en el medio de la tarjeta dice dónde se escribe. */}
          <label className="surface flex flex-col items-center gap-0.5 px-4 pt-3.5 pb-4">
            <span className="text-footnote text-ink-soft">Monto</span>
            <span className="font-money flex max-w-full items-baseline justify-center gap-1.5 font-semibold">
              <span className="text-[26px] text-ink-soft">{currency === 'USD' ? 'US$' : '$'}</span>
              <span className="inline-grid min-w-0 text-[44px] leading-tight tracking-tight">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-pre">
                  {amount || '0'}
                </span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  enterKeyHint="next"
                  placeholder="0"
                  required
                  autoFocus
                  // `size` 1: sin esto el ancho intrínseco del input (unos 20
                  // caracteres) estira la celda y el número se corre a la izquierda.
                  size={1}
                  className="input-inline col-start-1 row-start-1 w-full text-left text-[44px] leading-tight"
                />
              </span>
            </span>
          </label>

          <div className="list">
            <div className="px-4 py-3">
              {categoriesError ? (
                <ErrorNotice error={categoriesError} onRetry={reloadCategories}>
                  <span className="text-body">Categoría</span>
                </ErrorNotice>
              ) : (
                <>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-body">Categoría</span>
                    {/* El orden de las opciones es el que el usuario arrastró
                        en Ajustes (categories viene ordenado por position),
                        no el alfabético: acá es donde se elige una decenas de
                        veces. Sin categorías todavía (arranque en frío) el
                        selector se deshabilita con una sola opción, en vez de
                        bloquear el resto del formulario -- el monto no las
                        necesita. */}
                    <select
                      value={categoriesLoading ? '' : creatingCategory ? '__new__' : categoryId}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === '__new__') {
                          setCreatingCategory(true)
                          return
                        }
                        setCreatingCategory(false)
                        setCategoryId(value)
                      }}
                      disabled={categoriesLoading}
                      required={!creatingCategory}
                      className="max-w-[55%] input-inline"
                    >
                      {categoriesLoading ? (
                        <option value="" disabled>
                          Cargando…
                        </option>
                      ) : (
                        <>
                          <option value="" disabled>
                            Elegir…
                          </option>
                          {kindCategories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                          <option value="__new__">+ Nueva categoría</option>
                        </>
                      )}
                    </select>
                  </label>

                  {creatingCategory && (
                    <div className="mt-2.5">
                      <InlineCreate
                        placeholder={kind === 'expense' ? 'Nombre, ej: Comida, Transporte' : 'Nombre, ej: Sueldo, Freelance'}
                        errorMessage="No se pudo crear la categoría."
                        onCreate={handleCreateCategory}
                        onCancel={() => setCreatingCategory(false)}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Todo gasto o ingreso mueve el disponible, así que la cuenta se
                pregunta siempre — a diferencia de un aporte o un pago de
                deuda, que pueden no tocarlo. */}
            <AccountField
              accounts={accounts}
              value={accountId}
              onChange={setAccountId}
              label={kind === 'income' ? '¿A qué cuenta?' : '¿De qué cuenta?'}
              onAccountCreated={onAccountCreated}
            />
            <CollapsedDateField value={date} onChange={setDate} />
            <div className="px-4 py-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-body">Descripción</span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Opcional"
                  className="min-w-0 flex-1 input-inline"
                />
              </label>
            </div>
          </div>

          {/* Acá `reconciliation` nunca llega a valer algo: un movimiento que
              podía venir de un conteo (couldBeReconciliation) se muestra de
              solo lectura más arriba mientras eso no se descarta. Si el
              formulario editable de siempre se está mostrando es porque ya se
              descartó, o porque nunca hizo falta preguntarlo. */}
          {retroNotice}
          <FormError message={error?.message} detail={error?.detail} />
          <MissingHint missing={missing} />

          {editing && (
            <ConfirmAction
              label="Eliminar movimiento"
              question="¿Eliminar este movimiento?"
              detail="Es permanente."
              busy={busy}
              onConfirm={handleDelete}
            />
          )}
    </FormSheet>
    {reconcileModal}
    </>
  )
}

export default TransactionFormModal
