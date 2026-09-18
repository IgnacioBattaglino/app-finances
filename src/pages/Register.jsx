import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { validateInvite, registerWithInvite } from '../lib/invitations.js'
import RingsMark from '../components/RingsMark.jsx'
import FormError from '../components/form/FormError.jsx'
import AppLoading from '../components/AppLoading.jsx'

// El mínimo lo pone Supabase (6 caracteres) — se repite acá solo para avisar
// antes de mandar el pedido, mismo criterio que ResetPassword.
const MIN_LENGTH = 6

// Un texto en criollo para cada motivo por el que el link no sirve. Ninguno
// de estos casos llega a mostrar el formulario: la pantalla de registro
// nunca se abre "por las dudas" — se abre válida o no se abre.
const INVITE_NOTICE = {
  missing: 'Para registrarte necesitás el link que te compartió quien te invitó.',
  not_found: 'Este link no es válido. Pedile uno nuevo a quien te invitó.',
  used: 'Este link ya se usó. Si ya te registraste, iniciá sesión.',
  expired: 'Este link venció. Pedile uno nuevo a quien te invitó.',
  revoked: 'Este link fue anulado. Pedile uno nuevo a quien te invitó.',
}

function Header({ subtitle }) {
  return (
    <div className="mb-9 flex flex-col items-center text-center">
      <RingsMark className="mb-5 h-14 w-14 text-accent-ink" />
      <h1 className="text-[28px] font-bold tracking-[-0.02em]">finanzas</h1>
      <p className="mt-1 text-subhead text-ink-soft">{subtitle}</p>
    </div>
  )
}

function Shell({ children }) {
  return (
    <div className="flex min-h-dvh flex-col justify-center bg-paper px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
      <div className="animate-rise mx-auto w-full max-w-[22rem]">{children}</div>
    </div>
  )
}

function Register() {
  const { user, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const inviteId = searchParams.get('invite')

  // 'checking' | 'valid' | 'error' | una de las llaves de INVITE_NOTICE
  const [inviteStatus, setInviteStatus] = useState(inviteId ? 'checking' : 'missing')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  // 'form' | 'already_exists' | 'check_email' | 'done'
  const [step, setStep] = useState('form')

  useEffect(() => {
    if (!inviteId) return
    let cancelled = false
    validateInvite(inviteId)
      .then((status) => {
        if (!cancelled) setInviteStatus(status)
      })
      .catch(() => {
        if (!cancelled) setInviteStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [inviteId])

  if (loading) {
    return (
      <AppLoading />
    )
  }

  // Ya con sesión (por ejemplo, abriste el link estando logueado en otra
  // pestaña): no hay nada que registrar.
  if (user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)

    if (password.length < MIN_LENGTH) {
      setFormError({ message: `La contraseña tiene que tener al menos ${MIN_LENGTH} caracteres.` })
      return
    }
    if (password !== repeated) {
      setFormError({ message: 'Las dos contraseñas no coinciden.' })
      return
    }

    setSubmitting(true)
    const { data, error } = await registerWithInvite(email, password, inviteId)
    setSubmitting(false)

    if (error) {
      setFormError({
        message:
          'No se pudo completar el registro. Es posible que este link se haya usado justo ahora — probá pedir uno nuevo.',
        detail: error,
      })
      return
    }

    // Anti-enumeración de Supabase: si el email ya tiene una cuenta
    // confirmada, signUp "funciona" pero no crea nada — se nota porque
    // `identities` vuelve vacío. No es un error, así que no pasa por acá
    // arriba; es un resultado distinto que hay que mostrar aparte.
    if (data?.user && data.user.identities?.length === 0) {
      setStep('already_exists')
      return
    }

    // Con la confirmación de email apagada (la configuración de este
    // proyecto), signUp ya devuelve la sesión activa: useAuth la toma sola
    // por el evento de auth y el `if (user)` de arriba hace el resto. Este
    // paso solo se ve si en algún momento se prendiera la confirmación.
    if (!data?.session) {
      setStep('check_email')
      return
    }

    setStep('done')
  }

  // 'checking' y 'error' no tienen texto en INVITE_NOTICE: mientras resuelve
  // no se afirma nada, y si la consulta falló (sin internet) el aviso es el
  // de siempre, no uno de invitación inválida.
  if (inviteStatus === 'checking') {
    return (
      <Shell>
        <Header subtitle="Verificando tu invitación…" />
      </Shell>
    )
  }
  if (inviteStatus === 'error') {
    return (
      <Shell>
        <Header subtitle="No se pudo verificar la invitación" />
        <div className="notice">
          <p className="text-subhead">No se pudo conectar para revisar el link. Revisá tu conexión y volvé a abrirlo.</p>
        </div>
      </Shell>
    )
  }

  if (inviteStatus !== 'valid') {
    return (
      <Shell>
        <Header subtitle="No se puede registrar" />
        <div className="notice space-y-3">
          <p className="text-subhead">{INVITE_NOTICE[inviteStatus] ?? INVITE_NOTICE.not_found}</p>
          <a href="/login" className="text-subhead font-semibold text-accent-ink underline">
            Ir a iniciar sesión
          </a>
        </div>
      </Shell>
    )
  }

  if (step === 'already_exists') {
    return (
      <Shell>
        <Header subtitle="Ya existe una cuenta" />
        <div className="notice space-y-3">
          <p className="text-subhead">Ya hay una cuenta registrada con ese email.</p>
          <a href="/login" className="text-subhead font-semibold text-accent-ink underline">
            Ir a iniciar sesión
          </a>
        </div>
      </Shell>
    )
  }

  if (step === 'check_email') {
    return (
      <Shell>
        <Header subtitle="Revisá tu email" />
        <p className="px-1 text-center text-subhead text-ink-soft">
          Te mandamos un link para confirmar {email}. Tocalo para poder entrar.
        </p>
      </Shell>
    )
  }

  if (step === 'done') {
    return (
      <Shell>
        <Header subtitle="¡Listo!" />
        <p className="px-1 text-center text-subhead text-ink-soft">Entrando…</p>
      </Shell>
    )
  }

  return (
    <Shell>
      <Header subtitle="Creá tu cuenta" />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="list">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
            className="w-full bg-transparent px-4 py-3.5 text-body outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            required
            className="w-full bg-transparent px-4 py-3.5 text-body outline-none"
          />
          <input
            type="password"
            value={repeated}
            onChange={(e) => setRepeated(e.target.value)}
            placeholder="Repetir contraseña"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            required
            className="w-full bg-transparent px-4 py-3.5 text-body outline-none"
          />
        </div>

        <FormError message={formError?.message} detail={formError?.detail} />

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-lg btn-primary w-full"
        >
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </Shell>
  )
}

export default Register
