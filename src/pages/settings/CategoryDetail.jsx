import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getCategory,
  renameCategory,
  archiveCategory,
  restoreCategory,
} from '../../lib/categories.js'
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
  const [confirmArchive, setConfirmArchive] = useState(false)
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
        if (active) setError({ message: 'No se pudo cargar la categoría.', detail: e.message })
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
      setError({ message: 'No se pudo renombrar la categoría.', detail: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function handleArchive() {
    setBusy(true)
    setError(null)
    try {
      await archiveCategory(category.id)
      navigate('/ajustes/categorias')
    } catch (e) {
      setError({ message: 'No se pudo archivar la categoría.', detail: e.message })
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    setError(null)
    try {
      await restoreCategory(category.id)
      navigate('/ajustes/categorias')
    } catch (e) {
      setError({ message: 'No se pudo restaurar la categoría.', detail: e.message })
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <SettingsPage title="Categoría" backTo="/ajustes/categorias" backLabel="Categorías">
        <p className="px-4 text-sm text-ink-soft">Cargando…</p>
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
          footer="Es una categoría del sistema: la usa la reconciliación del dinero disponible para registrar los ajustes. No se puede renombrar ni archivar."
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
                  className="w-full rounded-lg bg-mist px-3 py-1.5 text-base outline-none"
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
                  className="w-full px-4 py-3 text-left text-[15px] font-semibold text-accent transition active:bg-mist/60 disabled:opacity-40"
                >
                  Guardar
                </button>
              )}
            </SettingsGroup>
          </form>

          {category.is_archived ? (
            <SettingsGroup footer="Vuelve a aparecer al cargar un movimiento.">
              <SettingsButtonRow onClick={handleRestore} label="Restaurar" disabled={busy} />
            </SettingsGroup>
          ) : (
            <SettingsGroup footer="Archivar la saca de la lista al cargar un movimiento. Los movimientos que ya la usan no se tocan, y podés restaurarla cuando quieras.">
              {confirmArchive ? (
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
                  <span>¿Archivar «{category.name}»?</span>
                  <div className="flex shrink-0 items-center gap-4 text-sm">
                    <button
                      type="button"
                      onClick={() => setConfirmArchive(false)}
                      disabled={busy}
                      className="text-ink-soft"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={handleArchive}
                      disabled={busy}
                      className="font-semibold text-accent disabled:opacity-50"
                    >
                      Sí, archivar
                    </button>
                  </div>
                </div>
              ) : (
                <SettingsButtonRow
                  onClick={() => setConfirmArchive(true)}
                  label="Archivar categoría"
                  tone="neutral"
                  disabled={busy}
                />
              )}
            </SettingsGroup>
          )}
        </>
      )}
    </SettingsPage>
  )
}

export default CategoryDetail
