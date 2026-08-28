// Segmentado de 2 o 3 opciones, con la forma del de iOS: una pista gris con
// una pastilla blanca que se apoya sobre la opción elegida. Regla de uso:
// segmentado para elegir entre modos (la operación cambia de naturaleza, ej.
// Gasto/Ingreso). Para un ajuste sí/no que no transforma la operación, usar un
// switch, no esto.
function BinaryChoice({ options, value, onChange }) {
  return (
    <div className="flex rounded-[12px] bg-mist p-[3px] text-[15px] font-medium">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`flex-1 rounded-[9px] py-2 transition ${
            value === option.value
              ? 'bg-lift font-semibold shadow-[0_1px_3px_rgb(16_18_24/0.12)]'
              : 'text-ink-soft'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default BinaryChoice
