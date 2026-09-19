import { useState } from 'react'
import { Link } from 'react-router-dom'
import { reorderAccounts } from '../../lib/liquidAccounts.js'
import { formatByCurrency } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.jsx'
import { SettingsGroup, SettingsCreateRow } from '../../components/settings/SettingsList.jsx'
import { ErrorNotice } from '../../components/form/FormError.jsx'
import AccountCreateForm from '../../components/form/AccountCreateForm.jsx'
import { ReorderableRows } from '../../components/settings/ReorderableRows.jsx'
import LiquidModal from '../../components/LiquidModal.jsx'
import AccountTransferModal from '../../components/account/AccountTransferModal.jsx'
import MoneyStack from '../../components/MoneyStack.jsx'
import { useAccountBalances } from '../../hooks/useAccountBalances.js'
import { useLiquid } from '../../hooks/useLiquid.js'
import { summarizeSavingsCard } from '../../lib/liquid.js'
import { ChevronRight, Grip } from '../../components/Icons.jsx'

// El total del disponible, arriba de todo: mismo número que "Dinero
// disponible" en Inicio (usa el mismo useLiquid). Debajo, en chico, el total
// ahorrado si hay -- misma línea que la fila del disponible de Inicio, ver
// summarizeSavingsCard (lib/liquid.js).
function TotalHeader({ liquid, loading }) {
  const { show: hasSavings, lines: savingsLines } = summarizeSavingsCard(liquid?.savings ?? [])

  if (loading || !liquid) {
    return (
      <div aria-busy="true" aria-label="Calculando">
        <span className="placeholder block h-10 w-40" />
      </div>
    )
  }

  return (
    <div>
      <MoneyStack lines={liquid.totals} size="display" />
      <p className="mt-1.5 text-footnote text-ink-soft">
        La plata que tenés a mano para usar hoy. Sube con tus ingresos y baja con tus gastos y con lo que
        ponés en inversiones.
      </p>
      {hasSavings && (
        <p className="mt-3 text-footnote text-ink-soft">
          + {savingsLines.map((l) => formatByCurrency(l.currency, l.amount)).join(' + ')} ahorrados
        </p>
      )}
    </div>
  )
}

// El grupo "Disponible" con dos filas, con la MISMA forma que el contenido
// (`list`/`row`) y un `.placeholder` en vez del nombre y el saldo. Los dos
// botones de arriba (Contar mi plata / Transferir) no dependen de esta
// consulta -- se quedan afuera del esqueleto y siguen tocables desde el
// primer cuadro.
function AccountsSkeleton() {
  return (
    <div className="list" aria-busy="true" aria-label="Cargando">
      {[0, 1].map((r) => (
        <div key={r} className="row">
          <span className="placeholder h-3.5 w-2/5" />
          <span className="placeholder h-3.5 w-1/5" />
        </div>
      ))}
    </div>
  )
}

// Alta al pie de la lista, escondida hasta que se la pide: mismo patrón que
// "Nueva categoría". `extended` le agrega moneda y tipo — acá, y solo acá, se
// eligen libremente (ver AccountCreateForm).
function NewAccountRow({ onCreated }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <SettingsCreateRow label="Nueva cuenta" onClick={() => setOpen(true)} />
    )
  }

  return (
    <div className="px-4 py-3">
      <AccountCreateForm
        extended
        onCreated={(created) => {
          onCreated(created)
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}

// La fila es solo para leer el saldo y entrar al detalle — eliminar vive
// únicamente ahí (H9 del informe de arquitectura de información): es donde
// ya está protegido (una cuenta con saldo se vacía con un ajuste antes de
// borrarse, ver AccountDetail), y tenerlo repetido acá solo agrega riesgo sin
// esa guarda.
function AccountRow({ account, dragHandlers }) {
  return (
    <div className="flex w-full items-center gap-1 pr-2 pl-2">
      <button
        type="button"
        {...dragHandlers}
        aria-label={`Reordenar ${account.name}`}
        className="shrink-0 cursor-grab touch-none px-1.5 py-3 active:cursor-grabbing"
      >
        <Grip />
      </button>
      <Link
        viewTransition
        to={`/plata/${account.id}`}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 py-3 pr-2 transition-opacity active:opacity-60"
      >
        <span className="min-w-0 truncate text-body">{account.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="font-money text-subhead text-ink-soft">
            {formatByCurrency(account.currency, account.amount)}
          </span>
          <ChevronRight />
        </span>
      </Link>
    </div>
  )
}

function Accounts() {
  const { accounts, loading, error: loadError, reload: load, setAccountsOptimistic } = useAccountBalances()
  const { liquid, loading: liquidLoading } = useLiquid()
  const [reorderError, setReorderError] = useState(null)
  const error = loadError ?? reorderError
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  // Reordena SOLO el subconjunto que se arrastró (uso diario o ahorro): cada
  // grupo se ordena por separado y el resultado se mezcla de vuelta en la
  // lista completa, sin pisar al otro grupo. El escrito optimista es sobre la
  // caché compartida (ver useAccountBalances): no hace falta esperar la
  // invalidación para ver el nuevo orden.
  async function commitOrder(orderedSubset) {
    const positioned = new Map(orderedSubset.map((a, i) => [a.id, i]))
    setAccountsOptimistic((prev) =>
      prev.map((a) => (positioned.has(a.id) ? { ...a, position: positioned.get(a.id) } : a)),
    )
    try {
      await reorderAccounts(orderedSubset)
    } catch (e) {
      setReorderError({ message: 'No se pudo guardar el orden.', detail: e })
      load()
    }
  }

  // Guardar no vacía nada: cerrar el modal alcanza, la invalidación global
  // refresca los saldos por detrás (ver lib/queryClient.js).
  function afterReconciled() {
    setReconcileOpen(false)
  }

  function afterTransferred() {
    setTransferOpen(false)
  }

  const dailyAccounts = accounts.filter((a) => !a.is_savings)
  const savingsAccounts = accounts.filter((a) => a.is_savings)

  return (
    <div className="page-narrow">
      <PageHeader
        title="Mi plata"
        description="Dónde está tu plata: efectivo, billeteras, cuentas del banco."
      />

      <div className="space-y-7">
        <TotalHeader liquid={liquid} loading={liquidLoading} />

        <ErrorNotice
          error={error}
          onRetry={() => {
            setReorderError(null)
            load()
          }}
        />

        {/* Las dos operaciones sobre las cuentas, juntas y arriba: la fila de
            acciones rápidas de cualquier app de banco. Antes eran dos tarjetas
            con un párrafo cada una, y las cuentas —lo que se viene a mirar—
            quedaban recién en el tercer bloque. Qué hace cada una lo explica
            su propio formulario al abrirse. */}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setReconcileOpen(true)} className="btn btn-secondary">
            Contar mi plata
          </button>
          <button type="button" onClick={() => setTransferOpen(true)} className="btn btn-secondary">
            Transferir
          </button>
        </div>

        {loading ? (
          <AccountsSkeleton />
        ) : (
          <>
            <SettingsGroup
              title="Disponible"
              footer="La primera es la que viene elegida al cargar un movimiento. Arrastrá la manija para cambiar el orden."
            >
              <ReorderableRows items={dailyAccounts} onCommit={commitOrder}>
                {(account, dragHandlers) => (
                  <AccountRow account={account} dragHandlers={dragHandlers} />
                )}
              </ReorderableRows>
            </SettingsGroup>

            {savingsAccounts.length > 0 && (
              <SettingsGroup
                title="Ahorro"
                footer="Lo que guardaste aparte del día a día: no es plata disponible para gastar ni una inversión que busca rendimiento."
              >
                <ReorderableRows items={savingsAccounts} onCommit={commitOrder}>
                  {(account, dragHandlers) => (
                    <AccountRow account={account} dragHandlers={dragHandlers} />
                  )}
                </ReorderableRows>
              </SettingsGroup>
            )}

            {/* Crear una cuenta es raro: va al final, donde va a aparecer la
                cuenta nueva, y no en el botón "+" de las acciones frecuentes. */}
            <SettingsGroup>
              <NewAccountRow
                onCreated={(created) => setAccountsOptimistic((prev) => [...prev, created])}
              />
            </SettingsGroup>
          </>
        )}
      </div>

      <LiquidModal open={reconcileOpen} onClose={() => setReconcileOpen(false)} onSaved={afterReconciled} />
      <AccountTransferModal
        open={transferOpen}
        accounts={accounts}
        onClose={() => setTransferOpen(false)}
        onSaved={afterTransferred}
      />
    </div>
  )
}

export default Accounts
