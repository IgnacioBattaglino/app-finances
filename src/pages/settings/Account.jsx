import { useAuth } from '../../hooks/useAuth.jsx'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import {
  SettingsGroup,
  SettingsValueRow,
  SettingsButtonRow,
} from '../../components/settings/SettingsList.jsx'

function Account() {
  const { user, signOut } = useAuth()

  return (
    <SettingsPage title="Cuenta">
      <SettingsGroup footer="Las cuentas las crea el administrador: no hay registro público ni cambio de email desde acá.">
        <SettingsValueRow label="Email" value={user?.email} />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsButtonRow onClick={signOut} label="Cerrar sesión" tone="danger" />
      </SettingsGroup>
    </SettingsPage>
  )
}

export default Account
