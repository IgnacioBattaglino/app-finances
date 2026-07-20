// Redondeo a `decimals` decimales, sin arrastrar ruido de punto flotante.
// Default 2 (centavos), el redondeo de dinero más común en la app; se usa 8
// para cantidades de activos (ej. cripto). Único helper de redondeo — antes
// estaba duplicado como round/round2 en varios módulos.
export function round(value, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
