import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import AppLoading from './AppLoading.jsx'

function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <AppLoading />
    )
  }

  // Se guarda a dónde quería ir para que el login lo devuelva ahí (ver
  // Login.jsx). Sin esto, entrar por un link directo a /inversiones o /deudas
  // —o reabrir la PWA con la sesión vencida— terminaba siempre en Inicio.
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export default ProtectedRoute
