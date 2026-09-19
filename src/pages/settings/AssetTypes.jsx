import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAssetTypes } from '../../lib/assetTypes.js'
import { assetTypesKey, useArchivedAssetTypes } from '../../hooks/usePortfolio.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup, SettingsLinkRow, SettingsCreateRow } from '../../components/settings/SettingsList.jsx'
import CreateAssetTypeForm from '../../components/CreateAssetTypeForm.jsx'
import { ErrorNotice } from '../../components/form/FormError.jsx'

function AssetTypesSkeleton() {
  return (
    <SettingsGroup>
      {[0, 1, 2].map((r) => (
        <div key={r} className="row">
          <span className="placeholder h-3.5 w-2/5" />
        </div>
      ))}
    </SettingsGroup>
  )
}

// El alta arranca colapsada en una fila: con el form siempre desplegado (como
// estaba), la lista de grupos terminaba en un bloque de campos que competía
// con ella.
function NewAssetTypeRow({ onCreated }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <SettingsCreateRow label="Nuevo grupo" onClick={() => setOpen(true)} />
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
  // Misma llave que usePortfolio (hooks/usePortfolio.js): comparte su caché
  // sin arrastrar assets, contribuciones ni valuaciones, que esta pantalla no
  // necesita.
  const {
    data: assetTypesData,
    isLoading: assetTypesLoading,
    error: assetTypesError,
    refetch: reloadAssetTypes,
  } = useQuery({ queryKey: assetTypesKey, queryFn: getAssetTypes })
  const {
    archivedAssetTypes: archived,
    loading: archivedLoading,
    error: archivedError,
    reload: reloadArchived,
  } = useArchivedAssetTypes()

  const assetTypes = assetTypesData ?? []
  const loading = assetTypesLoading || archivedLoading
  const firstError = assetTypesError
    ? { message: 'No se pudieron cargar los grupos.', detail: assetTypesError }
    : archivedError

  // El grupo nuevo se pide de nuevo en vez de escribirse optimista: mantener
  // sincronizado un `setQueryData` acá y en usePortfolio (que también expone
  // assetTypesKey) sería el mapa fino que el bloque 01 evita a propósito.
  function handleCreated() {
    reloadAssetTypes()
  }

  return (
    <SettingsPage
      title="Grupos de activos"
      description="Cómo se agrupan tus inversiones: un activo puede estar en un grupo, o quedar suelto."
      backTo="/inversiones"
      backLabel="Inversiones"
    >
      <ErrorNotice
        error={firstError}
        onRetry={() => {
          reloadAssetTypes()
          reloadArchived()
        }}
      />

      {loading ? (
        <AssetTypesSkeleton />
      ) : (
        <>
          <SettingsGroup footer="El orden es el mismo que ves en Inversiones.">
            {assetTypes.map((at) => (
              <SettingsLinkRow
                key={at.id}
                to={`/inversiones/grupos/${at.id}`}
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
                  to={`/inversiones/grupos/${at.id}`}
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
