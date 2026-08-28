import { Link } from 'react-router-dom'
import Switch from '../form/Switch.jsx'

// Piezas de la lista agrupada de Ajustes (modelo iOS): la pantalla raíz lista
// categorías de ajustes y cada una entra a sus opciones específicas, en vez
// de apilar todos los controles en una sola página larga.
//
// Un grupo = título chico arriba + tarjeta con filas separadas + una nota al
// pie opcional. La nota es donde va la explicación de un control: al pie del
// grupo se lee una vez, mientras que repetida en cada fila (como estaba en
// grupos de activos) es ruido que nadie lee la segunda vez.

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-ink-faint"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

export function SettingsGroup({ title, footer, children }) {
  return (
    <section>
      {title && (
        <h2 className="eyebrow mb-2 px-1">{title}</h2>
      )}
      <div className="list">
        {children}
      </div>
      {footer && <p className="mt-2 px-1 text-[13px] leading-relaxed text-ink-soft">{footer}</p>}
    </section>
  )
}

// Fila que entra a otra pantalla. `value` es el estado actual mostrado a la
// derecha (el "Pino" de Apariencia), `badge` una marca corta al lado del
// nombre (el "fuera del total" de un grupo de activos).
export function SettingsLinkRow({ to, label, value, badge }) {
  return (
    <Link
      to={to}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-mist md:hover:bg-mist"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-[17px]">{label}</span>
        {badge && (
          <span className="shrink-0 rounded-full bg-mist px-2 py-0.5 text-[11px] tracking-wide text-ink-soft uppercase">
            {badge}
          </span>
        )}
      </span>
      {value && <span className="shrink-0 truncate text-[17px] text-ink-soft">{value}</span>}
      <Chevron />
    </Link>
  )
}

// Dato que se muestra y no se toca (el email de la cuenta).
export function SettingsValueRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-[17px]">{label}</span>
      <span className="truncate text-[17px] text-ink-soft">{value}</span>
    </div>
  )
}

// Acción dentro de la pantalla. `tone`: 'accent' para la acción normal,
// 'neutral' para lo reversible (archivar) y 'danger' (clay) para lo
// permanente — la misma distinción que el resto de la app.
const BUTTON_TONES = {
  accent: 'text-accent-ink',
  neutral: 'text-ink',
  danger: 'text-clay',
}

export function SettingsButtonRow({ onClick, label, tone = 'accent', disabled = false }) {
  const color = BUTTON_TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-4 py-3 text-left text-[17px] font-medium transition active:bg-mist disabled:opacity-40 md:hover:bg-mist ${color}`}
    >
      {label}
    </button>
  )
}

export function SettingsSwitchRow({ label, checked, onChange, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-[17px]">{label}</span>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  )
}
