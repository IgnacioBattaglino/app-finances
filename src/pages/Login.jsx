import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import RingsMark from '../components/RingsMark.jsx'
import FormError from '../components/form/FormError.jsx'

function Login() {
  const { user, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <RingsMark className="h-8 w-8 animate-pulse text-pine" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
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
              detail: signInError.message,
            },
      )
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-paper px-6">
      <div className="animate-rise mx-auto w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center">
          <RingsMark className="mb-4 h-14 w-14 text-pine" />
          <h1 className="font-money text-2xl tracking-tight">finanzas</h1>
          <p className="mt-1.5 text-sm text-ink-soft">Ingresá para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              required
              className="w-full bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-ink-soft/60"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              className="w-full bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-ink-soft/60"
            />
          </div>

          <FormError message={error?.message} detail={error?.detail} />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-pine py-3.5 text-base font-semibold text-white transition active:bg-pine-deep disabled:opacity-50"
          >
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
