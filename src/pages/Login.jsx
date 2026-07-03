import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

function Login() {
  const { user, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Cargando…</p>
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
          ? 'Email o contraseña incorrectos.'
          : signInError.message,
      )
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-gray-50 px-6">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-bold text-gray-900">Finanzas</h1>
        <p className="mb-8 text-center text-sm text-gray-400">Ingresá para continuar</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              required
              className="w-full bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-gray-400"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              className="w-full bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-gray-400"
            />
          </div>

          {error && <p className="px-1 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-blue-600 py-3.5 text-base font-semibold text-white transition active:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
