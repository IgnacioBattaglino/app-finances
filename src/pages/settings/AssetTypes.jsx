import { useEffect, useState } from 'react'
import { getAssetTypes, getArchivedAssetTypes } from '../../lib/assetTypes.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup, SettingsLinkRow } from '../../components/settings/SettingsList.jsx'
import CreateAssetTypeForm from '../../components/CreateAssetTypeForm.jsx'
import FormError from '../../components/form/FormError.jsx'

// El alta arranca colapsada en una fila: con el form siempre desplegado (como
// estaba), la lista de grupos terminaba en un bloque de campos que competía
// con ella.
function NewAssetTypeRow({ onCreated }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-4 py-3 text-left text-[15px] font-medium text-accent transition active:bg-mist/60"
      >
        Nuevo grupo
      </button>
    )
  }

  return (
    <div className="px-4 py-3">
      <CreateAssetTypeForm
        onCreated={(created) => {
          onCreated(created)
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}

function AssetTypes() {
  const [assetTypes, setAssetTypes] = useState([])
  const [archived, setArchived] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [active, inactive] = await Promise.all([getAssetTypes(), getArchivedAssetTypes()])
      setAssetTypes(active)
      setArchived(inactive)
    } catch (e) {
      setError({ message: 'No se pudieron cargar los grupos.', detail: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function handleCreated(created) {
    setAssetTypes((prev) =>
      [...prev, created].sort((a, b) => a.display_order - b.display_order),
    )
  }

  return (
    <SettingsPage
      title="Grupos de activos"
      description="Cómo se agrupa tu portafolio: cada activo vive en un grupo."
    >
      {error && (
        <div className="space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3">
          <FormError message={error.message} detail={error.detail} />
          <button
            type="button"
            onClick={load}
            className="text-sm font-semibold text-clay underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <p className="px-4 text-sm text-ink-soft">Cargando…</p>
      ) : (
        <>
          <SettingsGroup footer="El orden es el mismo que ves en Portafolio.">
            {assetTypes.map((at) => (
              <SettingsLinkRow
                key={at.id}
                to={`/ajustes/grupos/${at.id}`}
                label={at.name}
                badge={at.include_in_total === false ? 'fuera del total' : undefined}
              />
            ))}
            <NewAssetTypeRow onCreated={handleCreated} />
          </SettingsGroup>

          {archived.length > 0 && (
            <SettingsGroup
              title={`Archivados (${archived.length})`}
              footer="Entrá a uno para restaurarlo."
            >
              {archived.map((at) => (
                <SettingsLinkRow
                  key={at.id}
                  to={`/ajustes/grupos/${at.id}`}
                  label={at.name}
                />
              ))}
            </SettingsGroup>
          )}
        </>
      )}
    </SettingsPage>
  )
}

export default AssetTypes
