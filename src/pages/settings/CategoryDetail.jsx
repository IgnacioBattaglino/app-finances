import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCategory, renameCategory, deleteCategory } from '../../lib/categories.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import {
  SettingsGroup,
  SettingsValueRow,
  SettingsButtonRow,
} from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'

function CategoryDetail() {
  const { categoryId } = useParams()
  const navigate = useNavigate()
  const [category, setCategory] = useState(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    getCategory(categoryId)
      .then((data) => {
        if (!active) return
        setCategory(data)
        setName(data.name)
      })
      .catch((e) => {
        if (active) setError({ message: 'No se pudo cargar la categoría.', detail: e })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [categoryId])

  async function handleRename(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name || busy) return
    setBusy(true)
    setError(null)
    try {
      setCategory(await renameCategory(category.id, trimmed))
    } catch (e) {
      setError({ message: 'No se pudo renombrar la categoría.', detail: e })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteCategory(category.id)
      navigate('/ajustes/categorias')
    } catch (e) {
      setError({ message: 'No se pudo eliminar la categoría.', detail: e })
      setBusy(false)
      setConfirmingDelete(false)
    }
  }

  if (loading) {
    return (
      <SettingsPage title="Categoría" backTo="/ajustes/categorias" backLabel="Categorías">
        <p className="px-4 text-[15px] text-ink-soft">Cargando…</p>
      </SettingsPage>
    )
  }

  if (!category) {
    return (
      <SettingsPage title="Categoría" backTo="/ajustes/categorias" backLabel="Categorías">
        <FormError message={error?.message} detail={error?.detail} />
      </SettingsPage>
    )
  }

  const kindLabel = category.kind === 'expense' ? 'Gasto' : 'Ingreso'
  const dirty = name.trim() !== category.name

  return (
    <SettingsPage title={category.name} backTo="/ajustes/categorias" backLabel="Categorías">
      <FormError message={error?.message} detail={error?.detail} />

      {category.is_system ? (
        <SettingsGroup
          footer="Es una categoría del sistema: la usa la reconciliación del dinero disponible para registrar los ajustes. No se puede renombrar ni eliminar."
        >
          <SettingsValueRow label="Nombre" value={category.name} />
          <SettingsValueRow label="Tipo" value={kindLabel} />
        </SettingsGroup>
      ) : (
        <>
          <form onSubmit={handleRename}>
            <SettingsGroup title="Nombre">
              <div className="px-4 py-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-[10px] bg-mist px-3 py-2 text-[17px] outline-none"
                />
              </div>
              {/* El tipo no se edita: cambiarlo mudaría de lado todos los
                  movimientos ya cargados con esta categoría. Se muestra
                  porque antes, editando, no había forma de saber si estabas
                  tocando un gasto o un ingreso. */}
              <SettingsValueRow label="Tipo" value={kindLabel} />
              {dirty && (
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="w-full px-4 py-3 text-left text-[17px] font-semibold text-accent-ink transition active:bg-mist disabled:opacity-40"
                >
                  Guardar
                </button>
              )}
            </SettingsGroup>
          </form>

          {/* Eliminar vive solo acá (H9 del informe de arquitectura de
              información): la lista es para leer y reordenar, no para
              borrar. deleteCategory ya decide sola si borra de verdad o
              oculta, según si algún movimiento la usa. */}
          <SettingsGroup>
            {confirmingDelete ? (
              <div className="space-y-1.5 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="min-w-0 truncate">¿Eliminar «{category.name}»?</span>
                  <div className="flex shrink-0 items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={busy}
                      className="text-ink-soft"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={busy}
                      className="font-semibold text-clay disabled:opacity-50"
                    >
                      Sí, eliminar
                    </button>
                  </div>
                </div>
                <p className="text-[13px] text-ink-soft">
                  Si ningún movimiento la usa, se elimina para siempre. Si tiene movimientos,
                  dejará de ofrecerse en vez de eliminarse.
                </p>
              </div>
            ) : (
              <SettingsButtonRow
                onClick={() => setConfirmingDelete(true)}
                label="Eliminar categoría"
                tone="danger"
                disabled={busy}
              />
            )}
          </SettingsGroup>
        </>
      )}
    </SettingsPage>
  )
}

export default CategoryDetail
