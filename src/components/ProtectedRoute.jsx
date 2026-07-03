import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Cargando…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
