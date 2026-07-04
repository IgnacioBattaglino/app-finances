import { useAuth } from '../hooks/useAuth.jsx'
import CategoriesSection from '../components/CategoriesSection.jsx'

function Settings() {
  const { user, signOut } = useAuth()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <CategoriesSection />

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="px-4 py-3.5 text-sm text-gray-500">{user?.email}</div>
        <button
          type="button"
          onClick={signOut}
          className="w-full border-t border-gray-100 px-4 py-3.5 text-left text-base font-medium text-red-600 transition active:bg-gray-50"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

export default Settings
