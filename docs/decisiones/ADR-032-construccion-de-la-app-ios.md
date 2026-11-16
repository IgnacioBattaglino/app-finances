# ADR-032: construcción de la primera versión de la app de iOS
Estado: Propuesta (decisiones tomadas por Claude Code el 2026-11-16, sin Nacho; quedan a su revisión)
Fecha: 2026-11-16

## Contexto
El frente iOS estaba en pausa, con el proyecto de Xcode vacío, a la espera de cerrar el diseño y la especificación (ADR-023). El 2026-11-16 Nacho pidió avanzar la app nativa todo lo posible en una sesión, tomando decisiones sin consultarlo. La especificación de producto llega al grupo 5 de la capa 1 (ADR-025 a 031); el diseño de Claude Design (`design/decisiones.md`) sigue sin validar. Las migraciones las aplica Nacho a mano: en la sesión no se pudo aplicar ninguna.

## Decisión
1. **Se construye sobre lo que la base ya tiene.** Lo que necesitaba algo nuevo se escribió como migración con su test (0062 a 0064) y la app lo lee; hasta que se apliquen, esas partes avisan que no están disponibles y el resto funciona.
2. **Colores: los de la web (acento Pino), no la paleta Lavanda.** Lavanda es de un borrador sin validar. Están en `design/tokens.json`; cambiar de paleta es editar ese archivo y regenerar.
3. **Componentes estándar de iOS** (listas agrupadas, hojas, barra de pestañas) en lugar de reproducir el prototipo de Claude Design. Tipografía del sistema con Dynamic Type.
4. **Cargar un gasto** usa teclado numérico propio y es lo único que funciona sin conexión, como pide ADR-023. Las demás hojas (transferir, deudas, planes, conteo) usan el teclado decimal del sistema por ahora: el teclado propio en todo campo de monto queda pendiente.
5. **Se recuerda la última cuenta usada, no la última categoría.** Una categoría precargada se guarda mal sin que nadie lo note; la cuenta casi siempre es la misma. `capacidades.md` pide las dos: es una desviación a revisar.
6. **Al editar un movimiento solo se ofrecen cuentas de su misma moneda.** La pregunta «¿Los 10 eran en dólares?» (capacidades, grupo 1) no tiene hoja todavía.
7. **Un ingreso en una lista va en el color del texto, con «+»; un gasto, en rojo; lo que cambió de lugar, en gris.** Sigue `PRODUCT.md` §4 (el rojo es dinero que se fue). La web pinta los ingresos de verde.
8. **«Sobró» / «Faltó» muestran el `balance` que devuelve la base, tal cual.** Hoy incluye Deudas (ADR-021); el cambio de ADR-030 es de la base y la app lo va a reflejar sola. El renglón Deudas se muestra en palabras («Te prestaron», «Pagaste de deudas»), como pedía `docs/mudanza-reglas.md`.
9. **Urgente en A pagar = vencido más los próximos 7 días**, como la web (`SOON_DAYS`). `design/decisiones.md` dice 3; queda para el grupo 6.
10. **«Ya lo pagué» abre una hoja corta precargada** (monto, cuenta) y carga el gasto con fecha de hoy. La web confirma en un toque con la fecha del vencimiento.
11. **Deudas: las dos entradas de ADR-030 ya están en la app** («Préstamo que recibí» pide la cuenta; «Deuda que ya tenía», solo el saldo) y el pago siempre sale de una cuenta, con lo que la base tiene hoy. La moneda propia de la deuda y los préstamos en cuotas esperan su migración.
12. **Inversiones es de solo lectura**: valor, lo aportado, la curva y la ganancia del período, con `get_portfolio_series`. El valor por activo, aportar y retirar siguen en la web hasta que la foto del portafolio viva en la base (pasos 8 a 12 de la mudanza).
13. **Borrar la cuenta es una función SQL (`delete_my_account`), no una Edge Function** como proponía `docs/pendientes-base.md`: hace lo mismo sin una pieza más para desplegar y sin usar la clave `service_role`.
14. **La vista previa del conteo llama a `reconcile_liquid` y lo deshace** (0064), en lugar de portar `planReconciliation` a SQL: no hay una segunda copia de la regla que pueda desalinearse.
15. **`delete_reconciliation` solo borra el último conteo de cada moneda** (0064). Lo pedía ADR-026 y estaba anotado como roto. También cambia la web: borrar un conteo con otro posterior ahora devuelve un aviso en castellano.

## Consecuencias
- La app sirve para el uso diario (cargar, ver el mes, saldos, transferir, deudas) con la base de hoy. A pagar, Contar disponible y Borrar mi cuenta se completan al aplicar 0062, 0064 y 0063.
- Quedan cinco cuentas hechas en el teléfono que deberían venir de la base; están listadas en `contract/README.md`.
- Nada de esto se probó en un iPhone real ni con la cuenta de Nacho: solo en el simulador, con el usuario de prueba.
- Lo construido contra las migraciones sin aplicar (los vencimientos de A pagar, el paso 2 del conteo, borrar la cuenta) compila y tiene tests de decodificación, pero no se vio funcionando contra la base.

## Alternativas
- Esperar al diseño validado y a la capa 2: descartada por el pedido de avanzar; lo construido usa componentes estándar, así que cambiar la piel no obliga a rehacer la lógica.
- Portar a Swift las reglas que faltan en la base (vencimientos, neteo del conteo): descartada, es exactamente lo que ADR-020 y ADR-023 prohíben.
- Hablar con PostgREST con `URLSession` en lugar del SDK: descartada, ADR-023 ya eligió el SDK (sesión en Keychain y refresco del token resueltos).

## Documentos afectados
`docs/ESTADO.md`, `docs/arquitectura-nativa.md` (§10, el orden de construcción ya recorrido), `docs/pendientes-base.md`, `contract/README.md`, `ios/README.md`, `CLAUDE.md` (Mapa), `docs/producto/capacidades.md` (puntos 5 a 7 y 9 a 10 de esta decisión), ADR-023 (deja de estar en pausa), ADR-026 (la regla del último conteo ya tiene migración).
