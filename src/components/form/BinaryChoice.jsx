// Segmentado de 2 o 3 opciones, con la forma del de iOS: una pista gris con
// una pastilla que se apoya sobre la opción elegida. Regla de uso: segmentado
// para elegir entre modos (la operación cambia de naturaleza, ej.
// Gasto/Ingreso). Para un ajuste sí/no que no transforma la operación, usar un
// switch, no esto.
//
// La pastilla es UNA sola y se desliza a la opción nueva, en vez de apagarse
// en una y prenderse en otra: el movimiento dice qué cambió. Las opciones
// miden lo mismo (grilla de columnas iguales), así que su posición es un
// porcentaje de su propio ancho.
function BinaryChoice({ options, value, onChange }) {
  const index = options.findIndex((option) => option.value === value)

  return (
    <div
      className="relative grid auto-cols-fr grid-flow-col rounded-[12px] bg-mist p-[3px] text-subhead font-medium"
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] bottom-[3px] left-[3px] rounded-[9px] bg-lift shadow-[0_1px_3px_rgb(16_18_24/0.12)] transition-[translate,opacity] duration-[var(--duration-base)] ease-[var(--ease-ios)] ${
          index < 0 ? 'opacity-0' : ''
        }`}
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          translate: `${Math.max(index, 0) * 100}% 0`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={`relative min-h-9 rounded-[9px] px-2 py-2 transition-colors duration-[var(--duration-base)] ${
              selected ? 'font-semibold text-ink' : 'text-ink-soft'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default BinaryChoice
