import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Movements from './pages/Movements.jsx'
import Portfolio from './pages/Portfolio.jsx'
import AssetDetail from './pages/AssetDetail.jsx'
import Goal from './pages/Goal.jsx'
import Debts from './pages/Debts.jsx'
import Settings from './pages/Settings.jsx'

function App() {
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
          <Route path="/ajustes" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
