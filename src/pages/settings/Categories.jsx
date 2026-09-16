import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCategories, createCategory, reorderCategories } from '../../lib/categories.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup } from '../../components/settings/SettingsList.jsx'
import FormError, { ErrorNotice } from '../../components/form/FormError.jsx'
import { ReorderableRows, GripIcon } from '../../components/settings/ReorderableRows.jsx'

// Alta al pie del grupo al que va a pertenecer: antes el form de alta vivía
// suelto entre las dos listas con un segmentado Gasto/Ingreso adentro, y no
// se veía a cuál de las dos iba a caer lo que escribías. Acá el lugar dice el
// tipo, así que el segmentado sobra.
//
// El input arranca escondido y se autoenfoca al revelarse: es la excepción
// prevista para un campo que aparece por una acción explícita, no un
// formulario que abre con teclado.
function NewCategoryRow({ kind, onCreated }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function close() {
    setOpen(false)
    setName('')
    setError(null)
  }

  async function handleCreate(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      onCreated(await createCategory(trimmed, kind))
      close()
    } catch (e) {
      setError({ message: 'No se pudo crear la categoría.', detail: e })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-4 py-3 text-left text-body font-medium text-accent-ink transition active:bg-mist"
      >
        Nueva categoría
      </button>
    )
  }

  return (
    <form onSubmit={handleCreate} className="space-y-2.5 px-4 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        placeholder={kind === 'expense' ? 'ej: Comida, Transporte' : 'ej: Sueldo, Freelance'}
        autoFocus
        disabled={busy}
        className="field"
      />
      <FormError message={error?.message} detail={error?.detail} />
      <div className="flex items-center justify-end gap-4 text-subhead">
        <button type="button" onClick={close} disabled={busy} className="text-ink-soft">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="font-semibold text-accent-ink disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </form>
  )
}

// La fila es solo para leer, reordenar y entrar al detalle — eliminar vive
// únicamente ahí (H9 del informe de arquitectura de información): tenerlo
// repetido acá solo agrega riesgo sin agregar nada. Las del sistema no se
// arrastran ni se eliminan — la reconciliación del líquido depende de ellas.
function CategoryRow({ category, dragHandlers }) {
  if (category.is_system) {
    return (
      <div className="flex w-full items-center gap-3 px-4 py-3">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-body">{category.name}</span>
          <span className="shrink-0 rounded-full bg-mist px-2 py-0.5 text-caption tracking-wide text-ink-soft uppercase">
            del sistema
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex w-full items-center gap-1 pr-2 pl-2">
      <button
        type="button"
        {...dragHandlers}
        aria-label={`Reordenar ${category.name}`}
        className="shrink-0 cursor-grab touch-none px-1.5 py-3 active:cursor-grabbing"
      >
        <GripIcon />
      </button>
      <Link
        to={`/ajustes/categorias/${category.id}`}
        className="min-w-0 flex-1 truncate py-3 text-body transition active:opacity-60"
      >
        {category.name}
      </Link>
    </div>
  )
}

function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setCategories(await getCategories())
    } catch (e) {
      setError({ message: 'No se pudieron cargar las categorías.', detail: e })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function handleCreated(created) {
    // Al final de su grupo, que es la position que le dio el alta.
    setCategories((prev) => [...prev, created])
  }

  async function commitOrder(ordered) {
    const others = categories.filter((cat) => !ordered.some((o) => o.id === cat.id))
    setCategories([...others, ...ordered.map((cat, i) => ({ ...cat, position: i }))])
    try {
      await reorderCategories(ordered)
    } catch (e) {
      setError({ message: 'No se pudo guardar el orden.', detail: e })
      load()
    }
  }

  // Las del sistema se listan al final de su grupo pero no entran al arrastre:
  // se muestran aparte, después de las reordenables.
  function group(kind) {
    const all = categories.filter((cat) => cat.kind === kind)
    return {
      sortable: all.filter((cat) => !cat.is_system),
      system: all.filter((cat) => cat.is_system),
    }
  }

  const expenses = group('expense')
  const incomes = group('income')

  function renderGroup(title, { sortable, system }, kind) {
    return (
      <SettingsGroup
        title={title}
        footer="Arrastrá con la manija para cambiar el orden en que aparecen al cargar un movimiento. Eliminar una categoría se hace desde su detalle."
      >
        <ReorderableRows items={sortable} onCommit={commitOrder}>
          {(category, dragHandlers) => (
            <CategoryRow category={category} dragHandlers={dragHandlers} />
          )}
        </ReorderableRows>
        {system.map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
        <NewCategoryRow kind={kind} onCreated={handleCreated} />
      </SettingsGroup>
    )
  }

  return (
    <SettingsPage
      title="Categorías"
      description="Con qué etiquetás tus gastos e ingresos al cargarlos."
    >
      {error && (
        <ErrorNotice error={error} onRetry={load} />
      )}

      {loading ? (
        <p className="px-4 text-subhead text-ink-soft">Cargando…</p>
      ) : (
        <>
          {renderGroup('Gastos', expenses, 'expense')}
          {renderGroup('Ingresos', incomes, 'income')}
        </>
      )}
    </SettingsPage>
  )
}

export default Categories
