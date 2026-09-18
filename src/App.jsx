import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  ScrollRestoration,
  useLocation,
  useParams,
} from 'react-router-dom'
import { useEffect } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useAuth } from './hooks/useAuth.jsx'
import { queryClient, persistOptions, cacheBuster } from './lib/queryClient.js'
import { recordPathname } from './lib/navHistory.js'
import AppLoading from './components/AppLoading.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'

// Router de datos (createBrowserRouter) y no <BrowserRouter>: es el que sabe
// animar una navegación con la View Transitions API (`viewTransition` en los
// links, ver index.css) y cargar cada pantalla recién cuando se entra.
//
// Cada pantalla que no es la de entrada se carga aparte (`lazy`): antes el
// bundle inicial traía la app entera —todas las pantallas y todos sus
// formularios— para mostrar Inicio. El router espera el chunk ANTES de
// cambiar de pantalla, así que no hay un parpadeo de "cargando" en el medio.
const page = (load) => () => load().then((module) => ({ Component: module.default }))

// Redirects de rutas viejas con parámetro: la app es una PWA instalable y
// puede haber accesos directos guardados a la URL anterior.
function RedirectAssetDetail() {
  const { assetId } = useParams()
  return <Navigate to={`/inversiones/${assetId}`} replace />
}
function RedirectAccountDetail() {
  const { accountId } = useParams()
  return <Navigate to={`/plata/${accountId}`} replace />
}
function RedirectAssetTypeDetail() {
  const { assetTypeId } = useParams()
  return <Navigate to={`/inversiones/grupos/${assetTypeId}`} replace />
}

// El link de recuperación de Supabase no llega a una ruta nuestra: cae en el
// Site URL con el token en el hash (ver lib/supabase.js). Mientras dura ese
// flujo la app es una sola pantalla: todo redirige a la contraseña nueva, y
// esa pantalla no existe fuera del flujo.
//
// ScrollRestoration: entrar a una pantalla empieza arriba y volver atrás
// devuelve el scroll de donde se estaba. Las listas que cargan después del
// primer render (Inversiones) completan la vuelta con useScrollRestoration.
function Root() {
  const { passwordRecovery } = useAuth()
  const { pathname } = useLocation()
  const onRecoveryScreen = pathname === '/nueva-contrasena'

  // La excepción de useGoBack ("si la entrada anterior es /login, no hay
  // anterior") necesita saber qué pathname fue el de antes, y eso no está en
  // window.history.state — solo lo sabe quien vio pasar cada navegación. Acá
  // arriba de TODAS las rutas (incluidas /login y /registro).
  useEffect(() => {
    recordPathname(pathname)
  }, [pathname])

  if (passwordRecovery && !onRecoveryScreen) return <Navigate to="/nueva-contrasena" replace />
  if (!passwordRecovery && onRecoveryScreen) return <Navigate to="/" replace />

  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Root />} hydrateFallbackElement={<AppLoading />}>
      <Route path="/nueva-contrasena" lazy={page(() => import('./pages/ResetPassword.jsx'))} />
      <Route path="/login" element={<Login />} />
      <Route path="/registro" lazy={page(() => import('./pages/Register.jsx'))} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/movimientos" lazy={page(() => import('./pages/Movements.jsx'))} />
          {/* Mi plata: las cuentas del disponible (ver docs/ux/arquitectura-informacion.md). */}
          <Route path="/plata" lazy={page(() => import('./pages/settings/Accounts.jsx'))} />
          <Route path="/plata/:accountId" lazy={page(() => import('./pages/settings/AccountDetail.jsx'))} />
          {/* Inversiones: el detalle de un activo y la gestión de sus grupos
              viven bajo la misma pestaña. El detalle de un activo reemplaza la
              barra de pestañas por la suya (`handle`, ver Layout). */}
          <Route path="/inversiones" lazy={page(() => import('./pages/Portfolio.jsx'))} />
          <Route
            path="/inversiones/:assetId"
            handle={{ ownBottomBar: true }}
            lazy={page(() => import('./pages/AssetDetail.jsx'))}
          />
          <Route path="/inversiones/grupos" lazy={page(() => import('./pages/settings/AssetTypes.jsx'))} />
          <Route
            path="/inversiones/grupos/:assetTypeId"
            lazy={page(() => import('./pages/settings/AssetTypeDetail.jsx'))}
          />
          {/* A pagar: lo que ya está comprometido y todavía no se pagó. */}
          <Route path="/compromisos" lazy={page(() => import('./pages/Commitments.jsx'))} />
          <Route path="/compromisos/deudas" lazy={page(() => import('./pages/Debts.jsx'))} />
          <Route path="/compromisos/tarjetas/:cardId" lazy={page(() => import('./pages/CardDetail.jsx'))} />
          <Route
            path="/compromisos/planes/:commitmentId"
            lazy={page(() => import('./pages/CommitmentDetail.jsx'))}
          />
          {/* Ajustes es una lista de temas y cada uno entra a su pantalla. */}
          <Route path="/ajustes" lazy={page(() => import('./pages/settings/SettingsHome.jsx'))} />
          <Route path="/ajustes/apariencia" lazy={page(() => import('./pages/settings/Appearance.jsx'))} />
          <Route path="/ajustes/categorias" lazy={page(() => import('./pages/settings/Categories.jsx'))} />
          <Route
            path="/ajustes/categorias/:categoryId"
            lazy={page(() => import('./pages/settings/CategoryDetail.jsx'))}
          />
          <Route path="/ajustes/exportar" lazy={page(() => import('./pages/settings/ExportData.jsx'))} />
          <Route path="/ajustes/invitaciones" lazy={page(() => import('./pages/settings/Invitations.jsx'))} />

          {/* Rutas viejas: quedan redirigiendo — puede haber accesos directos
              guardados. */}
          <Route path="/portafolio" element={<Navigate to="/inversiones" replace />} />
          <Route path="/portafolio/:assetId" element={<RedirectAssetDetail />} />
          <Route path="/ajustes/cuentas" element={<Navigate to="/plata" replace />} />
          <Route path="/ajustes/cuentas/:accountId" element={<RedirectAccountDetail />} />
          <Route path="/ajustes/grupos" element={<Navigate to="/inversiones/grupos" replace />} />
          <Route path="/ajustes/grupos/:assetTypeId" element={<RedirectAssetTypeDetail />} />
          <Route path="/deudas" element={<Navigate to="/compromisos/deudas" replace />} />
          <Route path="/ajustes/cuenta" element={<Navigate to="/ajustes" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
)

// El provider persistido espera a que la sesión esté leída para montarse: el
// buster (versión + id de usuario, ver queryClient.js) tiene que conocer al
// usuario ANTES de hidratar, así una caché guardada por otra cuenta se
// descarta en vez de mostrarse un instante.
function App() {
  const { user, loading } = useAuth()
  if (loading) return <AppLoading />

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ ...persistOptions, buster: cacheBuster(user?.id) }}
    >
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  )
}

export default App
