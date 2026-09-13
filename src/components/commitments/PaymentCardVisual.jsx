import { getCardColor } from '../../lib/paymentCards.js'

// La tarjeta como TARJETA: un rectángulo con su color y su nombre, para
// reconocerla de un vistazo entre varias sin leer el texto — como en la
// billetera. `colorId` en null (tarjetas de antes de la migración 0046, o que
// el usuario dejó "Sin color") cae a un rectángulo neutro, nunca a un color
// que nadie eligió.
//
// `size='sm'` es la muestra de una fila de lista: sin nombre encima, porque la
// fila ya lo muestra al lado en texto y el rectángulo a ese tamaño no alcanza
// para un nombre legible. `size='lg'` es la tarjeta entera (detalle de
// tarjeta, previsualización del formulario), con el nombre superpuesto como en
// una tarjeta real.
const SIZE = {
  sm: 'h-9 w-14 rounded-md',
  lg: 'h-28 w-48 max-w-full rounded-2xl p-4 text-[17px] font-semibold',
}

function PaymentCardVisual({ name, colorId, size = 'lg', className = '' }) {
  const color = getCardColor(colorId)
  const style = color
    ? {
        backgroundColor: color.bg,
        color: color.text,
        boxShadow: color.border ? `inset 0 0 0 1px ${color.border}` : undefined,
      }
    : undefined

  return (
    <div
      className={`flex shrink-0 flex-col justify-end overflow-hidden shadow-surface ${SIZE[size]} ${
        color ? '' : 'bg-mist text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line)]'
      } ${className}`}
      style={style}
    >
      {size === 'lg' && <span className="truncate">{name}</span>}
    </div>
  )
}

export default PaymentCardVisual
