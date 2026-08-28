import PageHeader from '../components/PageHeader.jsx'

// Todavía no hay nada calculado acá: la proyección FIRE necesita el aporte
// mensual promedio, el capital actual y el rendimiento esperado, y esa
// pantalla está por hacerse (ver FUNCTIONAL.md). Mientras tanto se dice qué va
// a vivir acá, en vez de dejar un título solo colgado: una pantalla en blanco
// se lee como un error de la app, no como una función que falta.
function Goal() {
  return (
    <div className="page-narrow">
      <PageHeader
        title="Objetivo"
        description="Cuánto te falta para la independencia financiera."
      />

      <div className="surface px-6 py-10 text-center">
        <p className="text-[17px] font-semibold">Todavía en construcción</p>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-soft">
          Acá va a estar tu número: cuánto capital necesitás para vivir de tus inversiones, cuánto
          llevás, y en cuántos años llegás al ritmo al que venís aportando.
        </p>
      </div>
    </div>
  )
}

export default Goal
