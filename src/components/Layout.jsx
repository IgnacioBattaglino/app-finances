import { NavLink, Outlet } from 'react-router-dom'

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

function Layout() {
  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <main className="mx-auto max-w-lg px-4 pt-6 pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg">
          {tabs.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                  isActive ? 'text-blue-600' : 'text-gray-400'
                }`
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                {icon}
              </svg>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default Layout
