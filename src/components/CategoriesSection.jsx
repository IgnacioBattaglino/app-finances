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
      <div className="flex items-center gap-2 px-4 py-2.5">
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
          className="w-full min-w-0 flex-1 rounded-lg bg-gray-100 px-3 py-1.5 text-base outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="shrink-0 text-sm font-semibold text-blue-600 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => {
            setName(category.name)
            setEditing(false)
          }}
          disabled={busy}
          className="shrink-0 text-sm text-gray-400"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-base">{category.name}</span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          className="text-sm text-blue-600 disabled:opacity-50"
        >
          Renombrar
        </button>
        <button
          type="button"
          onClick={handleArchive}
          disabled={busy}
          className="text-sm text-gray-400 disabled:opacity-50"
        >
          Archivar
        </button>
      </div>
    </div>
  )
}

function CategoryGroup({ title, categories, onRename, onArchive }) {
  return (
    <div>
      <h3 className="mb-1.5 px-4 text-xs font-medium uppercase tracking-wide text-gray-400">
        {title}
      </h3>
      <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {categories.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">Sin categorías</p>
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
      <h2 className="px-4 text-lg font-semibold">Categorías</h2>

      {error && (
        <div className="space-y-2 rounded-2xl bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={load}
            className="text-sm font-semibold text-red-600 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <p className="px-4 text-sm text-gray-400">Cargando…</p>
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
            className="space-y-3 rounded-2xl bg-white p-4 shadow-sm"
          >
            <div className="flex overflow-hidden rounded-xl bg-gray-100 p-0.5 text-sm font-medium">
              <button
                type="button"
                onClick={() => setNewKind('expense')}
                className={`flex-1 rounded-[10px] py-1.5 transition ${
                  newKind === 'expense' ? 'bg-white shadow-sm' : 'text-gray-400'
                }`}
              >
                Gasto
              </button>
              <button
                type="button"
                onClick={() => setNewKind('income')}
                className={`flex-1 rounded-[10px] py-1.5 transition ${
                  newKind === 'income' ? 'bg-white shadow-sm' : 'text-gray-400'
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
                className="w-full min-w-0 flex-1 rounded-xl bg-gray-100 px-3 py-2 text-base outline-none placeholder:text-gray-400"
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
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
                className="px-4 text-sm text-gray-400"
              >
                {showArchived ? '▾' : '▸'} Archivadas ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-1.5 divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm">
                  {archived.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-base text-gray-400">
                        {cat.name}
                        <span className="ml-2 text-xs uppercase">
                          {cat.kind === 'expense' ? 'gasto' : 'ingreso'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRestore(cat.id)}
                        className="text-sm text-blue-600"
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
