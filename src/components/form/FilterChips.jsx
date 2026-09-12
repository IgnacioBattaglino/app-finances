// Tira de filtros en pastillas, scrolleable de costado. Es el otro control de
// selección de la app, y la regla de cuándo usar cada uno es la cantidad:
//
//   · BinaryChoice (segmentado) — 2 o 3 opciones, que es lo que entra en el
//     ancho de un teléfono repartido en partes iguales. Elegir entre MODOS de
//     una operación (Gasto/Ingreso).
//   · FilterChips — de 4 para arriba, o etiquetas de largo desigual. Acotar
//     una lista a un subconjunto.
//
// Por qué no un segmentado con seis: repartido en partes iguales, cada opción
// tendría unos 58px en un teléfono y "Transferencias" necesita más del doble.
// Y por qué no envolverlo a dos filas: un segmentado de iOS es siempre una
// línea — a dos se lee como un teclado de botones y deja de verse como un
// selector con una opción activa.
//
// La tira se corta en el borde de la pantalla y el último chip queda a medias:
// eso ES la afordancia de que hay más, y es el patrón de iOS (los filtros de
// Mail, las categorías de Fotos). En desktop entran todos y no se scrollea
// nada.
//
// `-mx-4 px-4` (anulado en desktop) hace que el scroll llegue hasta el borde
// del teléfono en vez de terminar en el margen de la página: un chip cortado
// contra el borde se lee como "sigue", uno cortado a 16px del borde se lee
// como un error de layout.
function FilterChips({ options, value, onChange, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`shrink-0 rounded-full px-3.5 py-2 text-[15px] transition ${
            value === option.value
              ? 'bg-accent font-semibold text-white'
              : 'bg-mist text-ink-soft active:bg-line md:hover:bg-line'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default FilterChips
