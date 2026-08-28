import { NavLink, Outlet, useMatch } from 'react-router-dom'
import RingsMark from './RingsMark.jsx'

// Las dos navegaciones de la app son la misma lista con dos formas:
//
// - En el celular, una barra abajo, al alcance del pulgar, con el ícono
//   grande y el nombre chico. La pestaña activa lleva una cápsula teñida
//   además del color: a un vistazo, sin leer, se sabe dónde estás.
// - En desktop, una columna lateral fija tipo lista de origen (Mail, Finder),
//   donde el nombre pesa más que el ícono porque hay lugar para leerlo.
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
    to: '/portafolio',
    label: 'Portafolio',
    icon: <path d="M4 19.5V11m5.3 8.5v-15m5.4 15v-8m5.3 8v-12" />,
  },
  {
    to: '/objetivo',
    label: 'Objetivo',
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="0.6" />
      </>
    ),
  },
  {
    to: '/deudas',
    label: 'Deudas',
    icon: <path d="M3.2 7.5h17.6v11.5H3.2zM3.2 11h17.6M7 15.2h4" />,
  },
  {
    to: '/ajustes',
    label: 'Ajustes',
    icon: <path d="M4 7.5h16M4 12h16M4 16.5h16M9.5 5.5v4m5 0v5m-6 2v4" />,
  },
]

function TabIcon({ children, className, active }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      // El trazo engorda en la pestaña activa: la misma señal que usa SF
      // Symbols al pasar de la variante de línea a la rellena, sin tener que
      // dibujar dos juegos de íconos.
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

function Layout() {
  // En el detalle de un activo, la tab bar mobile la reemplaza la barra de
  // acciones propia de esa pantalla (Aportar/Retirar) — ver AssetDetail.
  const isAssetDetail = useMatch('/portafolio/:assetId')

  return (
    <div className="min-h-dvh bg-paper text-ink md:flex">
      {/* Columna lateral (desktop) */}
      <nav className="sticky top-0 hidden h-dvh w-62 shrink-0 flex-col border-r border-line px-3 py-7 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-3">
          <RingsMark className="h-7 w-7 text-accent-ink" />
          <span className="text-[17px] font-semibold tracking-tight">finanzas</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {tabs.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[10px] px-3 py-2 text-[15px] transition ${
                  isActive
                    ? 'bg-accent/10 font-semibold text-accent-ink'
                    : 'text-ink-soft hover:bg-mist hover:text-ink'
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
          ))}
        </div>
      </nav>

      <main className="w-full flex-1">
        {/* El padding inferior del celular deja pasar la tab bar flotante; en
            desktop no hay barra abajo, así que no hace falta reservarlo. */}
        <div className="px-4 pt-7 pb-32 md:px-10 md:pt-10 md:pb-16">
          <Outlet />
        </div>
      </main>

      {/* Barra inferior (celular) — oculta en el detalle de un activo */}
      {!isAssetDetail && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
          <div className="mx-auto flex max-w-lg">
            {tabs.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-1 pt-1.5 pb-2 text-[10px] font-medium transition ${
                    isActive ? 'text-accent-ink' : 'text-ink-soft'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* La cápsula se renderiza siempre y solo cambia de color:
                        si apareciera solo en la activa, la fila entera se
                        movería un pixel al cambiar de pestaña. */}
                    <span
                      className={`flex h-7 w-11 items-center justify-center rounded-full transition ${
                        isActive ? 'bg-accent/12' : 'bg-transparent'
                      }`}
                    >
                      <TabIcon className="h-[22px] w-[22px]" active={isActive}>
                        {icon}
                      </TabIcon>
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}

export default Layout
