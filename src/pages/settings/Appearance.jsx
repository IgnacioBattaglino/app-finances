import { useTheme } from '../../hooks/useTheme.jsx'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup } from '../../components/settings/SettingsList.jsx'
import BinaryChoice from '../../components/form/BinaryChoice.jsx'

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 text-white"
      aria-hidden="true"
    >
      <path d="m5 12.5 5 5 9-11" />
    </svg>
  )
}

// Cómo se ve la app. No hay vista previa aparte: elegir aplica en el acto y la
// pantalla entera (el fondo, el link de volver, el tilde, la barra de
// navegación) ya es la previa.
function Appearance() {
  const { accent, accents, chooseAccent, theme, themes, chooseTheme } = useTheme()

  return (
    <SettingsPage title="Apariencia" description="Cómo se ve la app en este dispositivo.">
      <SettingsGroup
        title="Tema"
        footer="Con «Automático» la app sigue al teléfono: se pone oscura cuando el sistema se pone oscuro."
      >
        <div className="p-4">
          <BinaryChoice
            options={themes.map((option) => ({ value: option.id, label: option.name }))}
            value={theme.id}
            onChange={chooseTheme}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Color de la app"
        footer="Se guarda en este dispositivo. Los verdes y rojos de ganancias, ingresos y gastos no cambian: ahí el color es el significado."
      >
        <div className="grid grid-cols-3 gap-4 p-4">
          {accents.map((option) => {
            const selected = option.id === accent.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseAccent(option.id)}
                aria-pressed={selected}
                className="flex flex-col items-center gap-2"
              >
                <span
                  className={`flex h-13 w-13 items-center justify-center rounded-full transition ${
                    selected ? 'ring-2 ring-ink/25 ring-offset-3 ring-offset-card' : ''
                  }`}
                  style={{ backgroundColor: option.fill }}
                >
                  {selected && <Check />}
                </span>
                <span
                  className={`text-[13px] ${selected ? 'font-semibold text-ink' : 'text-ink-soft'}`}
                >
                  {option.name}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsGroup>
    </SettingsPage>
  )
}

export default Appearance
