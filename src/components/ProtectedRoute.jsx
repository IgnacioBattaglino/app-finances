import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import RingsMark from './RingsMark.jsx'

function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <RingsMark className="h-8 w-8 animate-pulse text-pine" />
        <span className="sr-only">Cargando</span>
      </div>
    )
  }

  // Se guarda a dónde quería ir para que el login lo devuelva ahí (ver
  // Login.jsx). Sin esto, entrar por un link directo a /portafolio o /deudas
  // —o reabrir la PWA con la sesión vencida— terminaba siempre en Inicio.
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export default ProtectedRoute
