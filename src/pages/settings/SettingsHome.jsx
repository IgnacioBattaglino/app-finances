import { useAuth } from '../../hooks/useAuth.jsx'
import { useTheme } from '../../hooks/useTheme.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import {
  SettingsGroup,
  SettingsLinkRow,
  SettingsValueRow,
  SettingsButtonRow,
} from '../../components/settings/SettingsList.jsx'
import { APP_VERSION } from '../../version.js'

// Raíz de Ajustes: solo lo que NO es plata (Cuentas y Grupos de activos se
// mudaron a Mi plata e Inversiones, que es donde se usan). Lo único que vive
// en la raíz misma es el pie: la sesión no justifica una pantalla propia.
function SettingsHome() {
  const { user, signOut } = useAuth()
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
          <SettingsLinkRow to="/ajustes/exportar" label="Exportar mis datos" />
        </SettingsGroup>

        <SettingsGroup footer="Las cuentas las crea el administrador: no hay registro público ni cambio de email desde acá.">
          <SettingsValueRow label="Email" value={user?.email} />
          <SettingsButtonRow onClick={signOut} label="Cerrar sesión" tone="danger" />
        </SettingsGroup>

        {/* Marca de versión para confirmar a ojo si un deploy se aplicó */}
        <p className="px-1 text-[13px] text-ink-faint">versión {APP_VERSION}</p>
      </div>
    </div>
  )
}

export default SettingsHome
