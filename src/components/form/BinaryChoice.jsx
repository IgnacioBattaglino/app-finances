// Segmentado de 2 opciones. Regla de uso: segmentado para elegir entre modos
// (la operación cambia de naturaleza, ej. Gasto/Ingreso). Para un ajuste
// sí/no que no transforma la operación, usar un switch, no esto.
function BinaryChoice({ options, value, onChange }) {
  return (
    <div className="flex rounded-xl bg-mist p-0.5 text-sm font-medium">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-[10px] py-1.5 transition ${
            value === option.value ? 'bg-card shadow-sm' : 'text-ink-soft'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default BinaryChoice
