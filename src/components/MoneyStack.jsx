import Money from './Money.jsx'

// El monto protagonista de una tarjeta cuando puede haber más de una moneda.
//
// ── POR QUÉ NO HAY UNA PRINCIPAL Y UNA SECUNDARIA ──────────────────────────
// Es la misma regla que ya ordena Inicio un nivel más arriba: disponible,
// ahorrado, invertido y deudas van del mismo tamaño porque son magnitudes de
// naturaleza distinta y ninguna manda sobre las otras. Dos monedas adentro de
// una tarjeta son el mismo caso: $ 500.000 y US$ 1.200 son dos hechos, no un
// número con una nota al pie. Poner el segundo más chico sería afirmar una
// jerarquía que la app no puede sostener — quien tiene casi todo en dólares
// leería su plata al revés.
//
// ── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
// Con UNA sola moneda —el caso normal, y el único que existe hasta que alguien
// abra una cuenta en dólares— esto renderiza exactamente el mismo `Money` de
// 32px que había antes. La segunda moneda es un agregado, nunca una
// reestructuración de la tarjeta.
//
// Con dos, los dos montos bajan a 28px: es el piso del ritmo tipográfico de
// `Money` (por debajo, el símbolo queda ilegible) y evita que la tarjeta crezca
// más de lo que crece la información.
function MoneyStack({ lines, className = '' }) {
  const size = lines.length > 1 ? 'text-[28px]' : 'text-[32px]'

  // Cada monto va en su propio bloque en vez de pasarle `block` a `Money`:
  // `Money` es un inline-flex y las dos clases se pelean por el mismo
  // `display` — cuál gana depende del orden en el CSS generado, no del orden
  // en el atributo. Un wrapper no tiene esa ambigüedad.
  return (
    <span className={`block ${className}`}>
      {lines.map((line) => (
        <span key={line.currency} className="block">
          <Money
            value={line.amount}
            currency={line.currency === 'ARS' ? 'ars' : 'usd'}
            className={`${size} leading-[1.15] font-semibold`}
          />
        </span>
      ))}
    </span>
  )
}

export default MoneyStack
