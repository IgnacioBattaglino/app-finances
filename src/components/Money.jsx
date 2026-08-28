import { formatARS, formatUSD, splitMoney } from '../lib/format.js'

// El monto protagonista de una pantalla, con el ritmo tipográfico que usa
// toda la app: símbolo de moneda chico y apagado, cifra entera grande,
// decimales chicos. La idea es que el ojo agarre la magnitud —que es lo que
// se mira— sin que los centavos compitan con ella, pero sin esconderlos.
//
// El tamaño lo decide quien lo usa (className): las piezas chicas se miden en
// `em`, así que todo escala junto con la fuente del contenedor. Por eso mismo
// es SOLO para el número protagonista de una tarjeta (28px para arriba): a 17px
// el símbolo quedaría en 8px, ilegible. En las filas de una lista va el monto
// derecho, con formatUSD/formatARS.
//
// El símbolo y los decimales NO llevan color propio: bajan la opacidad del
// color heredado. Así el mismo componente sirve en negro sobre una tarjeta y
// en verde o rojo dentro de un rendimiento, sin una variante por caso.
function Money({ value, currency = 'usd', className = '' }) {
  const formatted = currency === 'ars' ? formatARS(value) : formatUSD(value)
  const { sign, symbol, integer, decimals } = splitMoney(formatted)

  return (
    <span className={`font-money inline-flex items-baseline ${className}`}>
      {sign && <span>{sign}</span>}
      <span className="mr-[0.22em] text-[0.5em] font-semibold tracking-[0.02em] opacity-55">
        {symbol}
      </span>
      <span>{integer}</span>
      {decimals && <span className="text-[0.58em] opacity-60">{decimals}</span>}
    </span>
  )
}

export default Money
