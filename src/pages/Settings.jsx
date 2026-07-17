import { useAuth } from '../hooks/useAuth.jsx'
import PageHeader from '../components/PageHeader.jsx'
import CategoriesSection from '../components/CategoriesSection.jsx'
import AssetTypesSection from '../components/AssetTypesSection.jsx'

function Settings() {
  const { user, signOut } = useAuth()

  return (
    <div>
      <PageHeader title="Ajustes" />

      <div className="space-y-8">
        <CategoriesSection />

        <AssetTypesSection />

        <section>
          <h3 className="mb-1.5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            Cuenta
          </h3>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <div className="px-4 py-3 text-sm text-ink-soft">{user?.email}</div>
            <button
              type="button"
              onClick={signOut}
              className="w-full px-4 py-3 text-left text-[15px] font-medium text-clay transition active:bg-mist/60"
            >
              Cerrar sesión
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Settings
