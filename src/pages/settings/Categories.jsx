import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createCategory, reorderCategories } from '../../lib/categories.js'
import { useCategories } from '../../hooks/useCategories.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup, SettingsCreateRow } from '../../components/settings/SettingsList.jsx'
import { ErrorNotice } from '../../components/form/FormError.jsx'
import InlineCreate from '../../components/form/InlineCreate.jsx'
import { ReorderableRows } from '../../components/settings/ReorderableRows.jsx'
import { ChevronRight, Grip } from '../../components/Icons.jsx'

// Esqueleto con la forma de los dos grupos (Gastos/Ingresos son texto fijo,
// no dato): tres filas y dos, nada más -- ver bloque 05.
function CategoriesSkeleton() {
  return (
    <>
      <SettingsGroup title="Gastos">
        {[0, 1, 2].map((r) => (
          <div key={r} className="row">
            <span className="placeholder h-3.5 w-2/5" />
          </div>
        ))}
      </SettingsGroup>
      <SettingsGroup title="Ingresos">
        {[0, 1].map((r) => (
          <div key={r} className="row">
            <span className="placeholder h-3.5 w-2/5" />
          </div>
        ))}
      </SettingsGroup>
    </>
  )
}

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

  if (!open) {
    return (
      <SettingsCreateRow label="Nueva categoría" onClick={() => setOpen(true)} />
    )
  }

  return (
    <div className="px-4 py-3">
      <InlineCreate
        placeholder={kind === 'expense' ? 'Nombre, ej: Comida, Transporte' : 'Nombre, ej: Sueldo, Freelance'}
        errorMessage="No se pudo crear la categoría."
        onCreate={async (name) => {
          onCreated(await createCategory(name, kind))
          setOpen(false)
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
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
          <span className="shrink-0 badge">
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
        <Grip />
      </button>
      <Link
        viewTransition
        to={`/ajustes/categorias/${category.id}`}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 py-3 pr-2 text-body transition-opacity active:opacity-60"
      >
        <span className="truncate">{category.name}</span>
        <ChevronRight />
      </Link>
    </div>
  )
}

function Categories() {
  const {
    categories,
    loading,
    error: loadError,
    reload: load,
    addCategory,
    setCategoriesOptimistic,
  } = useCategories()
  const [reorderError, setReorderError] = useState(null)
  const error = loadError
    ? { message: 'No se pudieron cargar las categorías.', detail: loadError }
    : reorderError

  async function commitOrder(ordered) {
    const others = categories.filter((cat) => !ordered.some((o) => o.id === cat.id))
    setCategoriesOptimistic(() => [...others, ...ordered.map((cat, i) => ({ ...cat, position: i }))])
    try {
      await reorderCategories(ordered)
    } catch (e) {
      setReorderError({ message: 'No se pudo guardar el orden.', detail: e })
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
        <NewCategoryRow kind={kind} onCreated={addCategory} />
      </SettingsGroup>
    )
  }

  return (
    <SettingsPage
      title="Categorías"
      description="Con qué etiquetás tus gastos e ingresos al cargarlos."
    >
      <ErrorNotice
        error={error}
        onRetry={() => {
          setReorderError(null)
          load()
        }}
      />

      {loading ? (
        <CategoriesSkeleton />
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
