import { useTheme } from '../../hooks/useTheme.jsx'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup } from '../../components/settings/SettingsList.jsx'

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

// El color de la app. No hay vista previa aparte: elegir aplica en el acto y
// la pantalla entera (el link de volver, el tilde, la barra de navegación) ya
// es la previa.
function Appearance() {
  const { accent, accents, chooseAccent } = useTheme()

  return (
    <SettingsPage
      title="Apariencia"
      description="El color con el que la app pinta botones, links y la navegación."
    >
      <SettingsGroup
        title="Color de la app"
        footer="Se guarda en este dispositivo. Los verdes y rojos de ganancias, ingresos y gastos no cambian: ahí el color es el significado."
      >
        <div className="grid grid-cols-3 gap-3 p-4">
          {accents.map((option) => {
            const selected = option.id === accent.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseAccent(option.id)}
                aria-pressed={selected}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                    selected ? 'ring-2 ring-ink/25 ring-offset-2 ring-offset-card' : ''
                  }`}
                  style={{ backgroundColor: option.color }}
                >
                  {selected && <Check />}
                </span>
                <span
                  className={`text-xs ${selected ? 'font-semibold text-ink' : 'text-ink-soft'}`}
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
