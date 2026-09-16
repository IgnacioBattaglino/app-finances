import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCategory, renameCategory, deleteCategory } from '../../lib/categories.js'
import SettingsPage from '../../components/settings/SettingsPage.jsx'
import {
  SettingsGroup,
  SettingsValueRow,
} from '../../components/settings/SettingsList.jsx'
import FormError from '../../components/form/FormError.jsx'
import ConfirmAction from '../../components/form/ConfirmAction.jsx'
import ListSkeleton from '../../components/ListSkeleton.jsx'

function CategoryDetail() {
  const { categoryId } = useParams()
  const navigate = useNavigate()
  const [category, setCategory] = useState(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

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
      navigate('/ajustes/categorias', { viewTransition: true })
    } catch (e) {
      setError({ message: 'No se pudo eliminar la categoría.', detail: e })
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <SettingsPage title="Categoría" backTo="/ajustes/categorias" backLabel="Categorías">
        <ListSkeleton />
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
                  className="field"
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
                  className="row w-full text-left text-body font-semibold text-accent-ink pressable disabled:opacity-40"
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
            <ConfirmAction
              variant="row"
              label="Eliminar categoría"
              question={`¿Eliminar «${category.name}»?`}
              detail="Si ningún movimiento la usa, se elimina para siempre. Si tiene movimientos, dejará de ofrecerse en vez de eliminarse."
              busy={busy}
              onConfirm={handleDelete}
            />
          </SettingsGroup>
        </>
      )}
    </SettingsPage>
  )
}

export default CategoryDetail
