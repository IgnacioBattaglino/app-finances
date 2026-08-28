import { useAuth } from '../../hooks/useAuth.jsx'
import { useTheme } from '../../hooks/useTheme.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import { SettingsGroup, SettingsLinkRow } from '../../components/settings/SettingsList.jsx'
import { APP_VERSION } from '../../version.js'

// Raíz de Ajustes: solo la lista de categorías de ajuste. Ningún control vive
// acá — cada uno está en la pantalla de su tema, para que esta lista se lea
// entera de un vistazo.
function SettingsHome() {
  const { user } = useAuth()
  const { accent, theme } = useTheme()

  return (
    <div className="page-narrow">
      <PageHeader title="Ajustes" />

      <div className="space-y-7">
        <SettingsGroup title="La app">
          <SettingsLinkRow
            to="/ajustes/apariencia"
            label="Apariencia"
            value={`${theme.name} · ${accent.name}`}
          />
        </SettingsGroup>

        <SettingsGroup title="Tus datos">
          <SettingsLinkRow to="/ajustes/categorias" label="Categorías" />
          <SettingsLinkRow to="/ajustes/grupos" label="Grupos de activos" />
          <SettingsLinkRow to="/ajustes/exportar" label="Exportar mis datos" />
        </SettingsGroup>

        <SettingsGroup title="Cuenta">
          <SettingsLinkRow to="/ajustes/cuenta" label="Cuenta" value={user?.email} />
        </SettingsGroup>

        {/* Marca de versión para confirmar a ojo si un deploy se aplicó */}
        <p className="px-1 text-[13px] text-ink-faint">versión {APP_VERSION}</p>
      </div>
    </div>
  )
}

export default SettingsHome
