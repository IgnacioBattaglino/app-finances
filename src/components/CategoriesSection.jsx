import { useEffect, useState } from 'react'
import {
  getCategories,
  getArchivedCategories,
  createCategory,
  archiveCategory,
  restoreCategory,
  renameCategory,
} from '../lib/categories.js'

function CategoryRow({ category, onRename, onArchive }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [busy, setBusy] = useState(false)

  // Las categorías del sistema (is_system) las usa la reconciliación del
  // líquido: se muestran, pero no se renombran ni se archivan.
  if (category.is_system) {
    return (
      <div className="flex w-full items-center justify-between px-4 py-3">
        <span className="text-[15px]">{category.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-ink-soft">
          categoría del sistema
        </span>
      </div>
    )
  }

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      setName(category.name)
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await onRename(category.id, trimmed)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleArchive() {
    setBusy(true)
    try {
      await onArchive(category.id)
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-2.5 px-4 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') {
              setName(category.name)
              setEditing(false)
            }
          }}
          autoFocus
          disabled={busy}
          className="w-full rounded-lg bg-mist px-3 py-1.5 text-base outline-none"
        />
        <div className="flex items-center text-sm">
          <button
            type="button"
            onClick={handleArchive}
            disabled={busy}
            className="text-clay disabled:opacity-50"
          >
            Archivar
          </button>
          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setName(category.name)
                setEditing(false)
              }}
              disabled={busy}
              className="text-ink-soft"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="font-semibold text-pine disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-mist/50"
    >
      <span className="text-[15px]">{category.name}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 text-ink-soft/40"
        aria-hidden="true"
      >
        <path d="M17 3.5 20.5 7 8 19.5 3.5 20.5 4.5 16z" />
      </svg>
      <span className="sr-only">Editar {category.name}</span>
    </button>
  )
}

function CategoryGroup({ title, categories, onRename, onArchive }) {
  return (
    <div>
      <h3 className="mb-1.5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        {title}
      </h3>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {categories.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-soft">Sin categorías</p>
        ) : (
          categories.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              onRename={onRename}
              onArchive={onArchive}
            />
          ))
        )}
      </div>
    </div>
  )
}

function CategoriesSection() {
  const [categories, setCategories] = useState([])
  const [archived, setArchived] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('expense')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [active, inactive] = await Promise.all([
        getCategories(),
        getArchivedCategories(),
      ])
      setCategories(active)
      setArchived(inactive)
    } catch (e) {
      setError('No se pudieron cargar las categorías. ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(event) {
    event.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    setCreating(true)
    setError(null)
    try {
      const created = await createCategory(trimmed, newKind)
      setCategories((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      )
      // Si el alta reactivó una archivada, sacarla de esa lista
      setArchived((prev) => prev.filter((cat) => cat.id !== created.id))
      setNewName('')
    } catch (e) {
      setError('No se pudo crear la categoría. ' + e.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRename(id, name) {
    setError(null)
    try {
      const updated = await renameCategory(id, name)
      setCategories((prev) =>
        prev
          .map((cat) => (cat.id === id ? updated : cat))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    } catch (e) {
      setError('No se pudo renombrar la categoría. ' + e.message)
      throw e
    }
  }

  async function handleArchive(id) {
    setError(null)
    try {
      await archiveCategory(id)
      const cat = categories.find((c) => c.id === id)
      setCategories((prev) => prev.filter((c) => c.id !== id))
      if (cat) {
        setArchived((prev) =>
          [...prev, { ...cat, is_archived: true }].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        )
      }
    } catch (e) {
      setError('No se pudo archivar la categoría. ' + e.message)
    }
  }

  async function handleRestore(id) {
    setError(null)
    try {
      const restored = await restoreCategory(id)
      setArchived((prev) => prev.filter((cat) => cat.id !== id))
      setCategories((prev) =>
        [...prev, restored].sort((a, b) => a.name.localeCompare(b.name)),
      )
    } catch (e) {
      setError('No se pudo restaurar la categoría. ' + e.message)
    }
  }

  const expenses = categories.filter((cat) => cat.kind === 'expense')
  const incomes = categories.filter((cat) => cat.kind === 'income')

  return (
    <section className="space-y-4">
      {error && (
        <div className="space-y-2 rounded-2xl border border-clay/20 bg-clay/5 px-4 py-3">
          <p className="text-sm text-clay">{error}</p>
          <button
            type="button"
            onClick={load}
            className="text-sm font-semibold text-clay underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <p className="px-4 text-sm text-ink-soft">Cargando…</p>
      ) : (
        <>
          <CategoryGroup
            title="Gastos"
            categories={expenses}
            onRename={handleRename}
            onArchive={handleArchive}
          />
          <CategoryGroup
            title="Ingresos"
            categories={incomes}
            onRename={handleRename}
            onArchive={handleArchive}
          />

          <form
            onSubmit={handleCreate}
            className="space-y-3 rounded-2xl border border-line bg-card p-4"
          >
            <div className="flex rounded-xl bg-mist p-0.5 text-sm font-medium">
              <button
                type="button"
                onClick={() => setNewKind('expense')}
                className={`flex-1 rounded-[10px] py-1.5 transition ${
                  newKind === 'expense' ? 'bg-card shadow-sm' : 'text-ink-soft'
                }`}
              >
                Gasto
              </button>
              <button
                type="button"
                onClick={() => setNewKind('income')}
                className={`flex-1 rounded-[10px] py-1.5 transition ${
                  newKind === 'income' ? 'bg-card shadow-sm' : 'text-ink-soft'
                }`}
              >
                Ingreso
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nueva categoría"
                className="w-full min-w-0 flex-1 rounded-xl bg-mist px-3 py-2 text-base outline-none placeholder:text-ink-soft/60"
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="shrink-0 rounded-xl bg-pine px-4 py-2 text-sm font-semibold text-white transition active:bg-pine-deep disabled:opacity-40"
              >
                Agregar
              </button>
            </div>
          </form>

          {archived.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowArchived((prev) => !prev)}
                className="px-4 text-sm text-ink-soft"
              >
                {showArchived ? '▾' : '▸'} Archivadas ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-1.5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {archived.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-[15px] text-ink-soft">
                        {cat.name}
                        <span className="ml-2 text-[10px] uppercase tracking-wide">
                          {cat.kind === 'expense' ? 'gasto' : 'ingreso'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRestore(cat.id)}
                        className="text-sm text-pine"
                      >
                        Restaurar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default CategoriesSection
