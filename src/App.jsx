import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Movements from './pages/Movements.jsx'
import Portfolio from './pages/Portfolio.jsx'
import AssetDetail from './pages/AssetDetail.jsx'
import Goal from './pages/Goal.jsx'
import Debts from './pages/Debts.jsx'
import SettingsHome from './pages/settings/SettingsHome.jsx'
import Appearance from './pages/settings/Appearance.jsx'
import Categories from './pages/settings/Categories.jsx'
import CategoryDetail from './pages/settings/CategoryDetail.jsx'
import AssetTypes from './pages/settings/AssetTypes.jsx'
import AssetTypeDetail from './pages/settings/AssetTypeDetail.jsx'
import ExportData from './pages/settings/ExportData.jsx'
import Account from './pages/settings/Account.jsx'

function App() {
  const { passwordRecovery } = useAuth()

  // El link de recuperación de Supabase no llega a una ruta nuestra: cae en el
  // Site URL (el inicio) con el token en el hash (ver lib/supabase.js). Sin
  // esto el usuario terminaba parado en Inicio, ya adentro con la sesión de
  // recuperación y sin ninguna pantalla donde poner la contraseña nueva.
  // Mientras dura ese flujo la app es una sola pantalla, así que las rutas
  // normales ni se montan.
  if (passwordRecovery) {
    return (
      <Routes>
        <Route path="/nueva-contrasena" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/nueva-contrasena" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/movimientos" element={<Movements />} />
          <Route path="/portafolio" element={<Portfolio />} />
          <Route path="/portafolio/:assetId" element={<AssetDetail />} />
          <Route path="/objetivo" element={<Goal />} />
          <Route path="/deudas" element={<Debts />} />
          {/* Ajustes es una lista de temas y cada uno entra a su pantalla
              (modelo iOS), así que son rutas propias y no secciones */}
          <Route path="/ajustes" element={<SettingsHome />} />
          <Route path="/ajustes/apariencia" element={<Appearance />} />
          <Route path="/ajustes/categorias" element={<Categories />} />
          <Route path="/ajustes/categorias/:categoryId" element={<CategoryDetail />} />
          <Route path="/ajustes/grupos" element={<AssetTypes />} />
          <Route path="/ajustes/grupos/:assetTypeId" element={<AssetTypeDetail />} />
          <Route path="/ajustes/exportar" element={<ExportData />} />
          <Route path="/ajustes/cuenta" element={<Account />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
