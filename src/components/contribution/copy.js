// Textos de ayuda compartidos entre los formularios que preguntan "¿de dónde
// sale / a dónde va la plata?" (Aportar y Retirar en ContributionFormModal,
// Liquidar en LiquidatePositionModal). Antes cada formulario tenía su propia
// copia byte a byte — bastaba con arreglar el texto en uno para que el otro
// quedara diciendo lo viejo (ver auditoría, hallazgo C-3).
//
// "Entrada" (Aportar → De afuera) y "salida" (Retirar/Liquidar → Afuera)
// describen direcciones opuestas de la plata, así que son dos constantes
// distintas, no una sola reusada en los dos sentidos.
export const OUTSIDE_ENTRY_HELP =
  'Plata que no estaba en la app (un sueldo, un regalo). No toca tu dinero disponible.'

export const OUTSIDE_EXIT_HELP =
  'La plata sale de la app — se la diste a alguien, la gastaste, etc. No toca tu dinero disponible.'
