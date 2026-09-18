// Las categorías que más se usan, a un toque: debajo del monto, antes de la
// fila "Otra categoría" que abre el resto (ver TransactionFormModal). El
// orden es siempre `position` (lo decide topCategories, lib/categories.js),
// nunca el de uso -- así la pastilla de cada categoría está siempre en el
// mismo lugar.
//
// Es un solo control con la fila de más abajo, así que un lector de pantalla
// no anuncia dos selectores de categoría sin contexto: radiogroup + radio,
// roving tabindex (entra a la elegida, o a la primera si no hay ninguna).
//
// El toque no le roba el foco al monto: si el teclado está abierto porque se
// está escribiendo el monto, tocar una pastilla no puede cerrarlo.
// preventDefault va en `mousedown` y NO en `pointerdown`: el spec de Pointer
// Events dice que cancelar el pointerdown suprime también los eventos de
// mouse de compatibilidad -- click incluido --, así que con pointerdown la
// pastilla dejaba de responder al toque (se probó y se vio en el navegador:
// ninguna pastilla llegaba a marcarse). mousedown sí previene el cambio de
// foco sin tocar el click, que sigue disparando después del mouseup.
function CategoryGrid({ categories, value, onChange, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-11 rounded-full bg-mist" />
        ))}
      </div>
    )
  }

  if (categories.length === 0) return null

  const hasSelection = categories.some((cat) => cat.id === value)

  return (
    <div role="radiogroup" aria-label="Categoría" className="grid grid-cols-3 gap-2">
      {categories.map((cat, i) => {
        const selected = cat.id === value
        return (
          <button
            key={cat.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!hasSelection && i === 0) ? 0 : -1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(cat.id)}
            className={`h-11 truncate rounded-full px-3 text-subhead transition-[background-color,color,transform] duration-[var(--duration-fast)] active:scale-[0.97] ${
              selected
                ? 'bg-accent font-semibold text-white'
                : 'bg-card text-ink shadow-[var(--shadow-surface)]'
            }`}
          >
            {cat.name}
          </button>
        )
      })}
    </div>
  )
}

export default CategoryGrid
