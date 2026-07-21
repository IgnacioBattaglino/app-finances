import { useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import TransactionFormModal from '../components/TransactionFormModal.jsx'
import { getCategories } from '../lib/categories.js'
import { APP_VERSION } from '../version.js'

function Dashboard() {
  const [modalOpen, setModalOpen] = useState(false)
  const [categories, setCategories] = useState(null) // null = todavía no se pidieron

  function openModal() {
    if (categories === null) {
      getCategories()
        .then(setCategories)
        .catch(() => setCategories([]))
    }
    setModalOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Inicio"
        description="Patrimonio, resumen del mes y avance hacia tu objetivo."
      />

      {/* La acción más frecuente: cargar un gasto en segundos */}
      <button
        type="button"
        onClick={openModal}
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 rounded-full bg-pine px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg transition active:bg-pine-deep md:right-8 md:bottom-8"
      >
        + Gasto
      </button>

      <TransactionFormModal
        open={modalOpen}
        defaultKind="expense"
        categories={categories ?? []}
        onClose={() => setModalOpen(false)}
        onSaved={() => setModalOpen(false)}
      />

      {/* Marca de versión para confirmar a ojo si un deploy se aplicó */}
      <p className="mt-8 text-xs text-ink-soft">versión {APP_VERSION}</p>
    </div>
  )
}

export default Dashboard
