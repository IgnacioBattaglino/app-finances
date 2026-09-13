import { getCardColor } from '../../lib/paymentCards.js'

// La tarjeta como TARJETA: un rectángulo con su color, sus últimos cuatro
// dígitos (si se cargaron) y su nombre, para reconocerla de un vistazo entre
// varias sin leer el texto — como en la billetera. `colorId` en null
// (tarjetas de antes de la migración 0046, o que el usuario dejó "Sin color")
// cae a un rectángulo neutro, nunca a un color que nadie eligió.
//
// `last4` (migración 0047) es SOLO los últimos cuatro, nunca el número
// completo — no hay ninguna razón para que esta app guarde eso. Se
// enmascaran con puntos ("•••• 4417"), nunca se inventan: si `last4` no son
// cuatro dígitos exactos (vacío, a medias mientras se escribe en el
// formulario), no se muestra nada, ni un placeholder que parezca un número
// real.
//
// `size='sm'` es la muestra de una fila de lista: sin texto encima, porque la
// fila ya lo muestra al lado y el rectángulo a ese tamaño no alcanza para que
// se lea. `size='lg'` es la tarjeta entera (detalle de tarjeta,
// previsualización del formulario), con los dígitos y el nombre superpuestos
// como en una tarjeta real.
const SIZE = {
  sm: 'h-9 w-14 rounded-md',
  lg: 'h-28 w-48 max-w-full rounded-2xl p-4',
}

function PaymentCardVisual({ name, colorId, last4, size = 'lg', className = '' }) {
  const color = getCardColor(colorId)
  const style = color
    ? {
        backgroundColor: color.bg,
        color: color.text,
        boxShadow: color.border ? `inset 0 0 0 1px ${color.border}` : undefined,
      }
    : undefined
  const digits = last4 && /^\d{4}$/.test(last4) ? last4 : null

  return (
    <div
      className={`flex shrink-0 flex-col justify-end gap-1 overflow-hidden shadow-surface ${SIZE[size]} ${
        color ? '' : 'bg-mist text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line)]'
      } ${className}`}
      style={style}
    >
      {size === 'lg' && digits && (
        <span className="font-money text-[15px] tracking-[0.2em]">•••• {digits}</span>
      )}
      {size === 'lg' && <span className="truncate text-[17px] font-semibold">{name}</span>}
    </div>
  )
}

export default PaymentCardVisual
