import { NavLink, Outlet } from 'react-router-dom'
import RingsMark from './RingsMark.jsx'

const tabs = [
  {
    to: '/',
    label: 'Inicio',
    icon: (
      <path d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" />
    ),
  },
  {
    to: '/movimientos',
    label: 'Movimientos',
    icon: (
      <path d="M7 4v13m0 0-3-3m3 3 3-3m7 6V7m0 0-3 3m3-3 3 3" />
    ),
  },
  {
    to: '/portafolio',
    label: 'Portafolio',
    icon: (
      <path d="M4 19V10m5.5 9V5m5.5 14v-7m5 7V8" />
    ),
  },
  {
    to: '/objetivo',
    label: 'Objetivo',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.5" />
      </>
    ),
  },
  {
    to: '/deudas',
    label: 'Deudas',
    icon: (
      <path d="M3 8h18v11H3zM3 11h18M7 15.5h4" />
    ),
  },
  {
    to: '/ajustes',
    label: 'Ajustes',
    icon: (
      <path d="M4 7h16M4 12h16M4 17h16M9 5v4m6 2v4m-9 4v-2" />
    ),
  },
]

function TabIcon({ children, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function Layout() {
  return (
    <div className="min-h-dvh bg-paper text-ink md:flex">
      {/* Rail lateral (desktop) */}
      <nav className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-4 py-8 md:flex">
        <div className="mb-9 flex items-center gap-2.5 px-3">
          <RingsMark className="h-7 w-7 text-pine" />
          <span className="font-money text-lg tracking-tight">finanzas</span>
        </div>
        <div className="flex flex-col gap-1">
          {tabs.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition ${
                  isActive
                    ? 'bg-mist font-semibold text-pine'
                    : 'text-ink-soft hover:bg-mist/60 hover:text-ink'
                }`
              }
            >
              <TabIcon className="h-5 w-5">{icon}</TabIcon>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="w-full flex-1">
        <div className="mx-auto max-w-lg px-4 pt-6 pb-28 md:max-w-xl md:px-8 md:pt-12 md:pb-16">
          <Outlet />
        </div>
      </main>

      {/* Tab bar inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg">
          {tabs.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
                  isActive ? 'text-pine' : 'text-ink-soft'
                }`
              }
            >
              <TabIcon className="h-6 w-6">{icon}</TabIcon>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default Layout
