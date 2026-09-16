import RingsMark from './RingsMark.jsx'

// La pantalla mientras la app todavía no sabe qué mostrar: la sesión que se
// está leyendo, o la primera pantalla que se está descargando.
function AppLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper">
      <RingsMark className="h-8 w-8 animate-pulse text-accent-ink" />
      <span className="sr-only">Cargando</span>
    </div>
  )
}

export default AppLoading
