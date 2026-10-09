# ADR-026: contar disponible
Estado: Aceptada
Fecha: 2026-10-09

## Contexto
Hay que definir cómo es la hoja para contar el dinero en el diseño nuevo. `design/decisiones.md` mostraba el saldo de la app («Actual: $ X») y `docs/traspaso-2026-10.md` §5.1 dejaba abierto si las cuentas de ahorro entran al conteo.

## Decisión
- La hoja se llama «Contar disponible». Son dos pasos, sin nombres («Contá» y «Revisá» quedan descartados).
- Se cuenta una moneda por vez: la elegida en el control de Mi dinero. Dentro de la hoja no se cambia de moneda. Al guardar pesos se ofrece «Contar dólares».
- Las cuentas de ahorro no entran al conteo. Si el ahorro cambia de valor, es un activo; un olvido se carga como gasto en esa cuenta. Resuelve la duda abierta de `docs/traspaso-2026-10.md` §5.1.
- **Paso 1:** nombre de la cuenta y un campo. No se muestra el saldo de la app (se descarta el «Actual: $ X» de `design/decisiones.md`; vale la regla del traspaso §4). Vacío no es cero. Teclado propio con tecla «Siguiente», que salta a la cuenta siguiente («Listo» en la última). Lo escrito se guarda como borrador local hasta guardar o cancelar a propósito. Botón «Siguiente».
- Si todas las cuentas contadas cierran: se guarda directo con el aviso «Todo cierra», sin paso 2 ni celebración. El conteo se guarda igual (las cuentas quedan «Contadas hoy»).
- **Paso 2:** una fila por cuenta («esperaba $ X · contaste $ Y»); el cartel «Para que el historial coincida con el saldo actual, se crearán los siguientes movimientos:»; la lista de movimientos con su nombre («Ajuste de saldo», etc.); botones «Volver» y «Guardar». Los números salen de la misma vista previa en SQL que escribe el conteo (Bloque 5). Si el saldo cambió entre la vista previa y el guardado, se vuelve a mostrar el paso 2.
- Después de guardar: aviso con «Deshacer» por unos segundos (borra ese conteo).
- Solo se puede borrar el último conteo de cada moneda, y la regla vive en la base, no solo en el botón. Un conteo no se edita: se borra y se rehace. La confirmación nombra la moneda («Se borra el conteo de pesos del 22/9 completo»).

## Consecuencias
- Hace falta la vista previa en SQL (Bloque 5) y una regla en la base para «solo el último conteo de cada moneda»; hoy `delete_reconciliation` no la tiene (ver `docs/producto/verificaciones-2026-10.md`, punto 3).
- Cambia la sección de contar de `design/decisiones.md`.

## Alternativas
- Mostrar «Actual: $ X» en el paso 1: descartada por la regla del traspaso §4.
- Nombres «Contá» y «Revisá» para los pasos: descartados.

## Documentos afectados
`design/decisiones.md` (sección de contar; no se edita, es copia de Claude Design), `docs/producto/capacidades.md`, `docs/traspaso-2026-10.md` §5.1, `docs/ARCHITECTURE.md` cuando se implemente.
