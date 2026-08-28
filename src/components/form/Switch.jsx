// Ajuste sí/no que no transforma la operación (para elegir entre modos va
// BinaryChoice). Medidas del switch de iOS: 51x31 con un pulgar de 27 que se
// corre de punta a punta.
//
// `label` va al lado, no adentro: el switch es el control y el texto es la
// pregunta que responde, así que el <button> se queda con el rol y el label
// se asocia por aria-label.
function Switch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-ink/15'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_4px_rgb(16_18_24/0.25)] transition-all duration-200 ${
          checked ? 'left-[22px]' : 'left-[2px]'
        }`}
      />
    </button>
  )
}

export default Switch
