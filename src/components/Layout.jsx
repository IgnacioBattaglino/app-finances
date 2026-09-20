import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useMatches } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import RingsMark from './RingsMark.jsx'
import { Toaster } from './Toast.jsx'
import EdgeSwipeBack from './EdgeSwipeBack.jsx'
import { SETTINGS_PATH } from './Icons.jsx'
import { categoriesQueryKey } from '../hooks/useCategories.js'
import { accountsQueryKey } from '../hooks/useAccounts.js'
import { getCategories } from '../lib/categories.js'
import { getAccounts } from '../lib/liquidAccounts.js'

// Las dos navegaciones de la app son la misma lista con dos formas:
//
// - En el celular, una barra abajo, al alcance del pulgar, con CINCO destinos:
//   todos son plata. Ajustes no está: se usa poco (el tema se elige una vez)
//   y con seis pestañas los nombres no entraban en un teléfono. Se entra desde
//   el engranaje de Inicio, que es donde las apps de finanzas ponen el perfil.
// - En desktop, una columna lateral fija tipo lista de origen (Mail, Finder),
//   con Ajustes separado al pie: ahí sobra el lugar y no hay por qué
//   esconderlo.
const tabs = [
  {
    to: '/',
    label: 'Inicio',
    icon: <path d="M3.5 10.6 12 3.8l8.5 6.8M5.8 9.4V20h4.4v-5.6h3.6V20h4.4V9.4" />,
  },
  {
    to: '/movimientos',
    label: 'Movimientos',
    icon: <path d="M7 4.5v14m0 0-3.2-3.2M7 18.5l3.2-3.2m6.8 4.2v-14m0 0-3.2 3.2M17 5.5l3.2 3.2" />,
  },
  {
    to: '/plata',
    label: 'Mi plata',
    icon: <path d="M3.2 7.5h17.6v11.5H3.2zM3.2 11h17.6M7 15.2h4" />,
  },
  {
    to: '/inversiones',
    label: 'Inversiones',
    icon: <path d="M4 19.5V11m5.3 8.5v-15m5.4 15v-8m5.3 8v-12" />,
  },
  {
    to: '/compromisos',
    label: 'A pagar',
    // Un almanaque con un tilde: lo que hay que pagar en una fecha, y el
    // gesto de darlo por hecho.
    icon: <path d="M3.8 6.8h16.4v13.4H3.8zM3.8 10.8h16.4M8 4.2v3m8-3v3m-6.6 9.4 1.9 1.9 3.5-3.7" />,
  },
]

const settingsTab = {
  to: '/ajustes',
  label: 'Ajustes',
  icon: <path d={SETTINGS_PATH} />,
}

function TabIcon({ children, className, active }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      // El trazo engorda en la pestaña activa: la misma señal que usa SF
      // Symbols al pasar de la variante de línea a la rellena.
      strokeWidth={active ? 2.1 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// Sin `viewTransition`: cambiar de pestaña es instantáneo, como en iOS y
// Android (ver "MOVIMIENTO" en index.css) — no participa de la animación de
// entrar/volver de un detalle.
function SidebarLink({ to, label, icon, replace }) {
  return (
    <NavLink
      to={to}
      replace={replace}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-field px-3 py-2 text-subhead transition-colors ${
          isActive ? 'bg-accent/10 font-semibold text-accent-ink' : 'text-ink-soft hover:bg-mist hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <TabIcon className="h-[18px] w-[18px] shrink-0" active={isActive}>
            {icon}
          </TabIcon>
          {label}
        </>
      )}
    </NavLink>
  )
}

// Qué pestaña corresponde a una ruta: la de su primer segmento. `null` fuera
// de las cinco (Ajustes en el celular), y ahí la cápsula se apaga.
function activeTabIndex(pathname) {
  if (pathname === '/') return 0
  return tabs.findIndex((tab) => tab.to !== '/' && pathname.startsWith(tab.to))
}

function Layout() {
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  // Una pantalla con su propia barra de acciones abajo (el detalle de un
  // activo: Aportar/Retirar) la declara en su ruta (`handle`, ver App.jsx).
  const ownBottomBar = useMatches().some((match) => match.handle?.ownBottomBar)
  const active = activeTabIndex(pathname)
  // Cambiar de pestaña reemplaza la entrada actual — así el atrás del sistema,
  // desde la raíz de cualquier pestaña, va directo a Inicio en vez de pasear
  // por las pestañas visitadas. La única que agrega historia es salir DE
  // Inicio: ahí sí hace falta una entrada propia para poder volver a Inicio.
  const replaceTab = active !== 0

  // Categorías y cuentas las pide todo formulario: adelantarlas al entrar a
  // la app (una sola vez, Layout envuelve todas las rutas protegidas) evita
  // que el primer formulario que se abre tenga que esperarlas.
  useEffect(() => {
    queryClient.prefetchQuery({ queryKey: categoriesQueryKey, queryFn: getCategories })
    queryClient.prefetchQuery({ queryKey: accountsQueryKey, queryFn: getAccounts })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-dvh bg-paper text-ink md:flex">
      {/* Columna lateral (desktop). La línea divisoria vive en el <aside>,
          que se estira con la página, y no en el <nav> fijo: si no, se cortaba
          a la altura de la ventana en cualquier pantalla más larga. */}
      <aside className="hidden w-62 shrink-0 border-r border-line md:block">
        <nav className="sticky top-0 flex h-dvh flex-col px-3 py-7 [view-transition-name:sidebar]">
          <div className="mb-8 flex items-center gap-2.5 px-3">
            <RingsMark className="h-7 w-7 text-accent-ink" />
            <span className="text-body font-semibold tracking-tight">finanzas</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {tabs.map((tab) => (
              <SidebarLink key={tab.to} {...tab} replace={replaceTab} />
            ))}
          </div>
          <div className="mt-auto flex flex-col">
            <SidebarLink {...settingsTab} replace={replaceTab} />
          </div>
        </nav>
      </aside>

      <Toaster />

      <main className="w-full min-w-0 flex-1">
        {/* El padding inferior del celular deja pasar la barra flotante. El de
            arriba lo da la barra fija de PageHeader (44px + su zona segura),
            no un valor fijo: la propia barra reserva su lugar. Los laterales
            son el mayor entre 16px y la zona segura, para el empaquetado a
            pantalla completa (ver "Sistema visual" en CLAUDE.md). */}
        {/* Volver deslizando desde el borde (bloque 13): un componente
            propio, autocontenido, que solo se arma cuando sabe qué pantalla
            va a mostrar debajo. Ver EdgeSwipeBack.jsx. */}
        <EdgeSwipeBack className="pt-[calc(2.75rem+env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-32 pl-[max(1rem,env(safe-area-inset-left))] md:px-10 md:pt-10 md:pb-16">
          <Outlet />
        </EdgeSwipeBack>
      </main>

      {!ownBottomBar && (
        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl [view-transition-name:tabbar] md:hidden"
        >
          <div className="relative mx-auto flex max-w-lg">
            {/* La cápsula de la pestaña activa es UNA sola y se desliza de una
                pestaña a otra: el movimiento dice a dónde fuiste. Las pestañas
                miden lo mismo, así que su posición es un porcentaje. */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-1.5 left-0 flex h-7 justify-center transition-[translate,opacity] duration-[var(--duration-slow)] ease-[var(--ease-ios)] ${
                active < 0 ? 'opacity-0' : ''
              }`}
              style={{ width: `${100 / tabs.length}%`, translate: `${Math.max(active, 0) * 100}% 0` }}
            >
              <span className="h-7 w-11 rounded-full bg-accent/12" />
            </span>
            {tabs.map(({ to, label, icon }, index) => (
              <NavLink
                key={to}
                to={to}
                replace={replaceTab}
                end={to === '/'}
                // `whitespace-nowrap`: una etiqueta que se parte en dos
                // líneas levanta su pestaña sola y desalinea la barra.
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 pt-1.5 pb-2 text-[10px] font-medium tracking-[-0.01em] whitespace-nowrap transition-colors ${
                  index === active ? 'text-accent-ink' : 'text-ink-soft'
                }`}
              >
                <span className="flex h-7 w-11 items-center justify-center">
                  <TabIcon className="h-[22px] w-[22px]" active={index === active}>
                    {icon}
                  </TabIcon>
                </span>
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}

export default Layout
