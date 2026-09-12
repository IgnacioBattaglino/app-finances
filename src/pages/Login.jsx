import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import RingsMark from '../components/RingsMark.jsx'
import FormError from '../components/form/FormError.jsx'

function Login() {
  const { user, loading, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <RingsMark className="h-8 w-8 animate-pulse text-accent-ink" />
      </div>
    )
  }

  // Vuelve a donde el usuario quiso ir antes de que lo mandáramos a loguearse
  // (lo guarda ProtectedRoute). Inicio es solo el caso de quien entró directo
  // a /login. Se reconstruye la ruta completa para no perder query ni hash.
  if (user) {
    const from = location.state?.from
    const to = from ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}` : '/'
    return <Navigate to={to} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)
    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? { message: 'Email o contraseña incorrectos.' }
          : {
              message: 'No se pudo iniciar sesión. Verificá tus datos o probá de nuevo.',
              detail: signInError,
            },
      )
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-paper px-6 py-10">
      <div className="animate-rise mx-auto w-full max-w-[22rem]">
        <div className="mb-9 flex flex-col items-center text-center">
          <RingsMark className="mb-5 h-14 w-14 text-accent-ink" />
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">finanzas</h1>
          <p className="mt-1 text-[15px] text-ink-soft">Ingresá para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="list">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              required
              className="w-full bg-transparent px-4 py-3.5 text-[17px] outline-none placeholder:text-ink-faint"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              className="w-full bg-transparent px-4 py-3.5 text-[17px] outline-none placeholder:text-ink-faint"
            />
          </div>

          <FormError message={error?.message} detail={error?.detail} />

          {/* El botón de entrar se queda grande también en desktop: es la
              única acción de la pantalla y no compite con nada. */}
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary h-13 w-full rounded-[16px] text-[17px]"
          >
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
