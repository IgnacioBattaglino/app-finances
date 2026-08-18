// Ajuste sí/no que no transforma la operación (para elegir entre modos va
// BinaryChoice). El markup estaba copiado en tres lugares con medidas
// distintas; acá queda uno solo.
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
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-mist'
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export default Switch
