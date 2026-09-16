import { useState } from 'react'
import { createAssetType } from '../lib/assetTypes.js'
import InlineCreate from './form/InlineCreate.jsx'
import Switch from './form/Switch.jsx'

// Alta de grupo: nombre + rendimiento default. Compartido entre el mini-form
// de AssetFormModal ("+ Nuevo grupo") y el alta en la lista de grupos — mismos
// campos, mismo comportamiento, solo cambia qué pasa después de crear
// (onCreated). onCancel es opcional: solo hace falta donde este form puede
// colapsar de vuelta a otra cosa (el select de grupo).
function CreateAssetTypeForm({ onCreated, onCancel }) {
  const [earnsYield, setEarnsYield] = useState(true)

  return (
    <InlineCreate
      placeholder="Nombre, ej: Cripto, Efectivo"
      createLabel="Crear grupo"
      errorMessage="No se pudo crear el grupo."
      onCreate={async (name) => onCreated(await createAssetType({ name, earnsYield }))}
      onCancel={onCancel}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-subhead text-ink-soft">Los activos nuevos buscan rendimiento</span>
        <Switch checked={earnsYield} onChange={setEarnsYield} label="Los activos nuevos buscan rendimiento" />
      </div>
    </InlineCreate>
  )
}

export default CreateAssetTypeForm
