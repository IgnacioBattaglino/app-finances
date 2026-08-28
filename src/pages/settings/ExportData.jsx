import { useEffect, useState } from 'react'
import {
  getTransactionsForExport,
  getPortfolioOperationsForExport,
  transactionsCsv,
  portfolioCsv,
  saveCsv,
  exportFilename,
} from '../../lib/export.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup } from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'

// Los datos se traen AL ENTRAR, no al tocar el botón: navigator.share (la
// hoja de compartir del celular) exige que el gesto del usuario siga fresco,
// y un await de red en el medio lo gasta. De paso, poder anunciar cuántas
// filas tiene cada archivo antes de bajarlo.
function ExportRow({ title, description, count, onDownload, disabled }) {
  const [state, setState] = useState('idle')

  function handleClick() {
    setState('working')
    Promise.resolve(onDownload())
      .then((result) => setState(result === 'cancelled' ? 'idle' : 'done'))
      .catch(() => setState('error'))
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px]">{title}</p>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {count === null ? 'Contando…' : `${count} ${description}`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || count === null || count === 0 || state === 'working'}
          className="shrink-0 rounded-xl bg-accent px-4 py-2 text-[15px] font-semibold text-white transition active:bg-accent-deep disabled:opacity-40"
        >
          {state === 'working' ? 'Generando…' : 'Descargar'}
        </button>
      </div>
      {state === 'error' && (
        <p className="mt-2 text-[13px] text-clay">No se pudo generar el archivo.</p>
      )}
    </div>
  )
}

function ExportData() {
  const [transactions, setTransactions] = useState(null)
  const [operations, setOperations] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    setError(null)
    try {
      const [tx, ops] = await Promise.all([
        getTransactionsForExport(),
        getPortfolioOperationsForExport(),
      ])
      setTransactions(tx)
      setOperations(ops)
    } catch (e) {
      setError({ message: 'No se pudieron cargar tus datos.', detail: e.message })
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <SettingsPage
      title="Exportar mis datos"
      description="Un archivo por cada cosa, para abrir en una planilla."
    >
      {error && (
        <div className="notice space-y-2">
          <FormError message={error.message} detail={error.detail} />
          <button
            type="button"
            onClick={load}
            className="text-[15px] font-semibold text-clay underline"
          >
            Reintentar
          </button>
        </div>
      )}

      <SettingsGroup
        title="Archivos"
        footer="Se descargan en formato CSV, con las fechas en dd/mm/aaaa y los montos sin separador de miles para que la planilla los pueda sumar. Desde el celular se abre la hoja de compartir, para guardarlos en Archivos o mandarlos por mail."
      >
        <ExportRow
          title="Movimientos"
          description="gastos e ingresos"
          count={transactions?.length ?? null}
          onDownload={() =>
            saveCsv(exportFilename('movimientos'), transactionsCsv(transactions))
          }
        />
        <ExportRow
          title="Portafolio"
          description="aportes y retiros"
          count={operations?.length ?? null}
          onDownload={() => saveCsv(exportFilename('portafolio'), portfolioCsv(operations))}
        />
      </SettingsGroup>
    </SettingsPage>
  )
}

export default ExportData
