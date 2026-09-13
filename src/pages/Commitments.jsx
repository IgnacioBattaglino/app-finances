import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader.jsx'
import { SettingsGroup, SettingsLinkRow } from '../components/settings/SettingsList.jsx'
import FormError from '../components/form/FormError.jsx'
import { getDebts, summarizeDebts } from '../lib/debts.js'
import { formatUSD } from '../lib/format.js'

// COMPROMISOS: la plata que ya está comprometida antes de que empiece el mes.
//
// Junta tres cosas que responden la misma pregunta —"¿qué tengo que pagar?"—
// y que hasta acá vivían en tres lugares distintos o en ninguno:
//
//   · Tarjetas: las compras en cuotas, agrupadas por la tarjeta que las paga
//     (las tres compras de una misma tarjeta vencen el mismo día, porque en la
//     vida real se paga un solo resumen).
//   · Suscripciones: lo que se debita solo todos los meses y no termina nunca.
//   · Deudas: lo que ya existía, mudado tal cual desde Mi plata.
//
// La diferencia que la pantalla tiene que dejar ver es que una cuota SE
// TERMINA y una suscripción NO: un "comprometido este mes" que sube y baja
// solo, sin decir qué parte se apaga y cuándo, no explica nada.
function Commitments() {
  const [debts, setDebts] = useState([])
  const [debtsError, setDebtsError] = useState(null)

  useEffect(() => {
    getDebts()
      .then(setDebts)
      .catch((e) => setDebtsError({ message: 'No se pudieron cargar las deudas.', detail: e }))
  }, [])

  return (
    <div className="page-narrow">
      <PageHeader title="Compromisos" />

      <div className="space-y-7">
        {debtsError && <FormError {...debtsError} />}

        {/* Deudas se mudó acá desde Mi plata: "lo que tengo" y "lo que debo"
            son dos preguntas distintas, y esta pestaña es la de la segunda.
            Siempre visible, aunque el saldo sea 0 — es el único punto de
            entrada a Deudas. */}
        <SettingsGroup footer="Cuánto te queda por pagar en total.">
          <SettingsLinkRow
            to="/compromisos/deudas"
            label="Deudas"
            value={formatUSD(summarizeDebts(debts).totalBalance)}
          />
        </SettingsGroup>
      </div>
    </div>
  )
}

export default Commitments
