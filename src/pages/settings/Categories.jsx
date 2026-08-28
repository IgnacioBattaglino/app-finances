import { useEffect, useState } from 'react'
import { getCategories, getArchivedCategories, createCategory } from '../../lib/categories.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import { SettingsGroup, SettingsLinkRow } from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'

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
      setError({ message: 'No se pudo crear la categoría.', detail: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-4 py-3 text-left text-[17px] font-medium text-accent-ink transition active:bg-mist"
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
        className="w-full rounded-[10px] bg-mist px-3 py-2 text-[17px] outline-none placeholder:text-ink-faint"
      />
      <FormError message={error?.message} detail={error?.detail} />
      <div className="flex items-center justify-end gap-4 text-[15px]">
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

function Categories() {
  const [categories, setCategories] = useState([])
  const [archived, setArchived] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [active, inactive] = await Promise.all([getCategories(), getArchivedCategories()])
      setCategories(active)
      setArchived(inactive)
    } catch (e) {
      setError({ message: 'No se pudieron cargar las categorías.', detail: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function handleCreated(created) {
    setCategories((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
    )
    // Si el alta reactivó una archivada, sacarla de esa lista
    setArchived((prev) => prev.filter((cat) => cat.id !== created.id))
  }

  const expenses = categories.filter((cat) => cat.kind === 'expense')
  const incomes = categories.filter((cat) => cat.kind === 'income')

  return (
    <SettingsPage
      title="Categorías"
      description="Con qué etiquetás tus gastos e ingresos al cargarlos."
    >
      {error && (
        <div className="notice space-y-2">
          <FormError message={error.message} detail={error.detail} />
          <button
            type="button"
            onClick={load}
            className="text-[15px] font-semibold text-clay underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <p className="px-4 text-[15px] text-ink-soft">Cargando…</p>
      ) : (
        <>
          <SettingsGroup title="Gastos">
            {expenses.map((cat) => (
              <SettingsLinkRow
                key={cat.id}
                to={`/ajustes/categorias/${cat.id}`}
                label={cat.name}
                badge={cat.is_system ? 'del sistema' : undefined}
              />
            ))}
            <NewCategoryRow kind="expense" onCreated={handleCreated} />
          </SettingsGroup>

          <SettingsGroup title="Ingresos">
            {incomes.map((cat) => (
              <SettingsLinkRow
                key={cat.id}
                to={`/ajustes/categorias/${cat.id}`}
                label={cat.name}
                badge={cat.is_system ? 'del sistema' : undefined}
              />
            ))}
            <NewCategoryRow kind="income" onCreated={handleCreated} />
          </SettingsGroup>

          {archived.length > 0 && (
            <SettingsGroup
              title={`Archivadas (${archived.length})`}
              footer="No aparecen al cargar un movimiento, pero los movimientos que ya las usan las siguen mostrando. Entrá a una para restaurarla."
            >
              {archived.map((cat) => (
                <SettingsLinkRow
                  key={cat.id}
                  to={`/ajustes/categorias/${cat.id}`}
                  label={cat.name}
                  badge={cat.kind === 'expense' ? 'gasto' : 'ingreso'}
                />
              ))}
            </SettingsGroup>
          )}
        </>
      )}
    </SettingsPage>
  )
}

export default Categories
