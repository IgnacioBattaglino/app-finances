import { getCardColor } from '../../lib/paymentCards.js'

// La tarjeta como TARJETA: un rectángulo con su color, el número enmascarado y
// su nombre, para reconocerla de un vistazo entre varias sin leer nada — como
// en la billetera. `colorId` en null (tarjetas de antes de la migración 0046,
// o que el usuario dejó "Sin color") cae a un rectángulo neutro, nunca a un
// color que nadie eligió.
//
// EL NÚMERO. `last4` (migración 0047) es SOLO los últimos cuatro, nunca el
// número completo — no hay ninguna razón para que esta app guarde eso. Los
// otros doce dígitos NO EXISTEN en ningún lado: los puntos son decoración,
// del lado del CSS, no dígitos de relleno que alguien pueda confundir con un
// número real (por eso van `aria-hidden`: un lector de pantalla lee "4417", no
// doce puntos). Si `last4` no son cuatro dígitos exactos (vacío, o a medias
// mientras se escribe en el formulario), no se muestra ninguna línea.
//
// Los puntos van más chicos y apagados que los dígitos, y los dígitos sin
// tracking extra: con todo del mismo tamaño y muy espaciado, la línea se leía
// como "· · · ·  4 4 1 7" —una grilla de caracteres sueltos— en vez de como el
// número de una tarjeta.
//
// `size='md'` es la tarjeta de una fila de lista (A pagar) y `size='lg'` la
// entera (detalle de tarjeta, previsualización del formulario). Cambia la
// escala y cuántos grupos de puntos entran: los tres del número completo miden
// ~120px y en la fila hay 96px útiles, así que ahí va uno solo. Se recorta la
// decoración, nunca el dato — igual que el nombre, que se trunca.
const SIZE = {
  md: {
    box: 'h-18 w-30 gap-0.5 rounded-xl p-3',
    mask: '••••',
    dots: 'text-[10px]',
    digits: 'text-[12px]',
    name: 'text-footnote',
  },
  lg: {
    box: 'h-28 w-48 gap-1 rounded-2xl p-4',
    mask: '•••• •••• ••••',
    dots: 'text-[12px]',
    digits: 'text-subhead',
    name: 'text-body',
  },
}

function PaymentCardVisual({ name, colorId, last4, size = 'lg', className = '' }) {
  const color = getCardColor(colorId)
  const scale = SIZE[size]
  const digits = last4 && /^\d{4}$/.test(last4) ? last4 : null
  const style = color
    ? {
        backgroundColor: color.bg,
        color: color.text,
        boxShadow: color.border ? `inset 0 0 0 1px ${color.border}` : undefined,
      }
    : undefined

  return (
    <div
      className={`flex shrink-0 flex-col justify-end overflow-hidden shadow-surface ${scale.box} ${
        color ? '' : 'bg-mist text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line)]'
      } ${className}`}
      style={style}
    >
      {digits && (
        <span className="flex items-baseline gap-1.5">
          <span
            aria-hidden="true"
            className={`${scale.dots} tracking-[0.02em] whitespace-nowrap opacity-60`}
          >
            {scale.mask}
          </span>
          <span className={`font-money shrink-0 ${scale.digits} font-semibold`}>{digits}</span>
        </span>
      )}
      <span className={`truncate font-semibold ${scale.name}`}>{name}</span>
    </div>
  )
}

export default PaymentCardVisual
