import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useIsAdmin } from '../../hooks/useIsAdmin.js'
import {
  getInvitations,
  createInvite,
  revokeInvite,
  inviteLink,
  inviteStatus,
} from '../../lib/invitations.js'
import { formatDayShortYear } from '../../lib/format.js'
import PageHeader from '../../components/PageHeader.jsx'
import { SettingsGroup, SettingsButtonRow } from '../../components/settings/SettingsList.jsx'
import { ErrorNotice } from '../../components/form/FormError.jsx'
import ListSkeleton from '../../components/ListSkeleton.jsx'
import BackLink from '../../components/BackLink.jsx'

const STATUS_LABEL = {
  valid: 'Vigente',
  used: 'Usada',
  expired: 'Vencida',
  revoked: 'Anulada',
}

function day(timestamp) {
  return formatDayShortYear(timestamp?.slice(0, 10))
}

// El link recién generado se muestra expandido, con el botón de copiar a
// mano: es el único momento en que el texto completo importa, ya que después
// vive en la fila de la lista solo como estado.
function NewLinkNotice({ invite, onDismiss }) {
  const [copied, setCopied] = useState(false)
  const link = inviteLink(invite.id)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin permiso de portapapeles (poco común): el link ya está seleccionable
      // en pantalla, así que no hace falta un aviso más.
    }
  }

  return (
    <div className="notice space-y-3">
      <p className="text-subhead">Compartí este link — sirve una sola vez y vence en 7 días.</p>
      <p className="font-money truncate rounded-lg bg-mist px-3 py-2 text-footnote">{link}</p>
      <div className="flex gap-3">
        <button type="button" onClick={copy} className="btn btn-primary h-10 flex-1 text-subhead">
          {copied ? 'Copiado' : 'Copiar link'}
        </button>
        <button type="button" onClick={onDismiss} className="btn btn-secondary h-10 flex-1 text-subhead">
          Listo
        </button>
      </div>
    </div>
  )
}

function InviteRow({ invite, onRevoke }) {
  const status = inviteStatus(invite)
  const detail =
    status === 'used'
      ? `Usada por ${invite.used_by_email} el ${day(invite.used_at)}`
      : status === 'revoked'
        ? `Anulada el ${day(invite.revoked_at)}`
        : status === 'expired'
          ? `Venció el ${day(invite.expires_at)}`
          : `Vence el ${day(invite.expires_at)}`

  return (
    <div className="row">
      <div className="min-w-0">
        <p className="text-body">{STATUS_LABEL[status]}</p>
        <p className="truncate text-footnote text-ink-soft">{detail}</p>
      </div>
      {status === 'valid' && (
        <button
          type="button"
          onClick={() => onRevoke(invite.id)}
          className="shrink-0 text-subhead font-medium text-clay"
        >
          Anular
        </button>
      )}
    </div>
  )
}

function Invitations() {
  const isAdmin = useIsAdmin()
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setInvitations(await getInvitations())
    } catch (e) {
      setError({ message: 'No se pudieron cargar las invitaciones.', detail: e })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin])

  // Comodidad, no protección: mientras se resuelve queda en blanco un
  // instante, y si no es admin lo mandamos de vuelta — la RLS de la base ya
  // le hubiera negado los datos igual.
  if (isAdmin === false) return <Navigate to="/ajustes" replace />
  if (isAdmin === null) return null

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const invite = await createInvite()
      setJustCreated(invite)
      setInvitations((prev) => [invite, ...prev])
    } catch (e) {
      setError({ message: 'No se pudo generar la invitación.', detail: e })
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id) {
    try {
      const updated = await revokeInvite(id)
      setInvitations((prev) => prev.map((inv) => (inv.id === id ? updated : inv)))
    } catch (e) {
      setError({ message: 'No se pudo anular la invitación.', detail: e })
    }
  }

  return (
    <div className="page-narrow">
      <BackLink to="/ajustes">Ajustes</BackLink>
      <PageHeader
        title="Invitaciones"
        description="Generá un link para que alguien se registre. Sirve una sola vez y vence a los 7 días."
      />

      <div className="space-y-7">
        <ErrorNotice error={error} />

        {justCreated && (
          <NewLinkNotice invite={justCreated} onDismiss={() => setJustCreated(null)} />
        )}

        <SettingsGroup>
          <SettingsButtonRow label="Generar link" onClick={handleCreate} disabled={creating} />
        </SettingsGroup>

        {loading ? (
          <ListSkeleton />
        ) : invitations.length === 0 ? (
          <p className="px-4 text-subhead text-ink-soft">Todavía no generaste ninguna invitación.</p>
        ) : (
          <SettingsGroup title="Generadas">
            {invitations.map((invite) => (
              <InviteRow key={invite.id} invite={invite} onRevoke={handleRevoke} />
            ))}
          </SettingsGroup>
        )}
      </div>
    </div>
  )
}

export default Invitations
