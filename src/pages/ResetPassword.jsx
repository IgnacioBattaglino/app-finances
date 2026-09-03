import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import RingsMark from '../components/RingsMark.jsx'
import FormError from '../components/form/FormError.jsx'

// El mínimo lo pone Supabase (6 caracteres). Acá se repite solo para avisar
// antes de mandar el pedido, no para imponer una regla propia.
const MIN_LENGTH = 6

function ResetPassword() {
  const { user, loading, recoveryLinkError, updatePassword, endPasswordRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <RingsMark className="h-8 w-8 animate-pulse text-accent-ink" />
        <span className="sr-only">Cargando</span>
      </div>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    if (password.length < MIN_LENGTH) {
      setError({ message: `La contraseña tiene que tener al menos ${MIN_LENGTH} caracteres.` })
      return
    }
    if (password !== repeated) {
      setError({ message: 'Las dos contraseñas no coinciden.' })
      return
    }

    setSubmitting(true)
    const { error: updateError } = await updatePassword(password)
    setSubmitting(false)
    if (updateError) {
      setError({
        message: 'No se pudo guardar la contraseña. Probá de nuevo.',
        detail: updateError.message,
      })
      return
    }
    setDone(true)
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-paper px-6 py-10">
      <div className="animate-rise mx-auto w-full max-w-[22rem]">
        <div className="mb-9 flex flex-col items-center text-center">
          <RingsMark className="mb-5 h-14 w-14 text-accent-ink" />
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">finanzas</h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            {done ? 'Contraseña actualizada' : 'Elegí tu contraseña nueva'}
          </p>
        </div>

        {/* Sin sesión no hay nada que cambiar: el link venció o ya se usó.
            Es el mismo estado tanto si el hash volvió con error como si el
            usuario recargó la pantalla después de que el token se consumió. */}
        {!user ? (
          <div className="space-y-4">
            <div className="notice space-y-1">
              <p className="text-[15px]">El enlace expiró. Pedí uno nuevo para volver a intentar.</p>
              {recoveryLinkError && <p className="text-[13px] opacity-70">{recoveryLinkError}</p>}
            </div>
            <button
              type="button"
              onClick={endPasswordRecovery}
              className="btn btn-secondary h-13 w-full rounded-[16px] text-[17px]"
            >
              Ir al inicio de sesión
            </button>
          </div>
        ) : done ? (
          <div className="space-y-4">
            <p className="px-1 text-[15px] text-ink-soft">
              Ya podés usar la app con tu contraseña nueva.
            </p>
            <button
              type="button"
              onClick={endPasswordRecovery}
              className="btn btn-primary h-13 w-full rounded-[16px] text-[17px]"
            >
              Entrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="list">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña nueva"
                autoComplete="new-password"
                minLength={MIN_LENGTH}
                required
                className="w-full bg-transparent px-4 py-3.5 text-[17px] outline-none placeholder:text-ink-faint"
              />
              <input
                type="password"
                value={repeated}
                onChange={(e) => setRepeated(e.target.value)}
                placeholder="Repetir contraseña"
                autoComplete="new-password"
                minLength={MIN_LENGTH}
                required
                className="w-full bg-transparent px-4 py-3.5 text-[17px] outline-none placeholder:text-ink-faint"
              />
            </div>

            <FormError message={error?.message} detail={error?.detail} />

            {/* Mismo criterio que el botón de Ingresar: es la única acción de
                la pantalla, así que se queda grande también en desktop. */}
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary h-13 w-full rounded-[16px] text-[17px]"
            >
              {submitting ? 'Guardando…' : 'Guardar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default ResetPassword
