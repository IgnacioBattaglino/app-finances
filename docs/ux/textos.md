# Inventario de textos de usuario

Todo lo que un usuario lee en app-finances, agrupado por pantalla en el orden en que se recorre la app. Fase 1: solo inventario — la columna "Texto nuevo" queda vacía para completarse después.

Convenciones:
- `{variable}` marca una parte que se arma con datos (monto, nombre, fecha, plural). La celda explica de dónde sale.
- Cuando el mismo texto literal aparece en más de un lugar, es una sola fila con todos los lugares listados.
- "(espacio acotado)" marca botones chicos, chips o pestañas donde el largo del texto importa.

---

## Login

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Login, título | `finanzas` | Nombre de la app bajo el logo | | `src/pages/Login.jsx:55` |
| Pantalla Login, subtítulo | Ingresá para continuar | Instrucción bajo el título | | `src/pages/Login.jsx:56` |
| Pantalla Login, campo | Email (placeholder) | Campo de email | | `src/pages/Login.jsx:65` |
| Pantalla Login, campo | Contraseña (placeholder) | Campo de contraseña | | `src/pages/Login.jsx:74` |
| Pantalla Login, botón | Ingresar / Ingresando… | Envía el login | | `src/pages/Login.jsx:90` |
| Pantalla Login, error | Email o contraseña incorrectos. | Credenciales inválidas (traduce el mensaje de Supabase) | | `src/pages/Login.jsx:41` |
| Pantalla Login, error | No se pudo iniciar sesión. Verificá tus datos o probá de nuevo. | Error de login genérico | | `src/pages/Login.jsx:43` |

## Registro (por invitación)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Registro, subtítulos | Verificando tu invitación… / No se pudo verificar la invitación / No se puede registrar / Ya existe una cuenta / Revisá tu email / ¡Listo! / Creá tu cuenta | Subtítulo bajo el logo, uno por estado del flujo | | `src/pages/Register.jsx:139,146,157,171,185,196,204` |
| Pantalla Registro, aviso | Para registrarte necesitás el link que te compartió quien te invitó. | Sin `?invite=` en la URL | | `src/pages/Register.jsx:16` |
| Pantalla Registro, aviso | Este link no es válido. Pedile uno nuevo a quien te invitó. | Invitación inexistente | | `src/pages/Register.jsx:17` |
| Pantalla Registro, aviso | Este link ya se usó. Si ya te registraste, iniciá sesión. | Invitación ya usada | | `src/pages/Register.jsx:18` |
| Pantalla Registro, aviso | Este link venció. Pedile uno nuevo a quien te invitó. | Invitación expirada | | `src/pages/Register.jsx:19` |
| Pantalla Registro, aviso | Este link fue anulado. Pedile uno nuevo a quien te invitó. | Invitación revocada por el admin | | `src/pages/Register.jsx:20` |
| Pantalla Registro, aviso | No se pudo conectar para revisar el link. Revisá tu conexión y volvé a abrirlo. | Falló la consulta de validación (sin internet) | | `src/pages/Register.jsx:148` |
| Pantalla Registro, link | Ir a iniciar sesión | Vuelve al login desde un estado de invitación inválida o cuenta ya existente | | `src/pages/Register.jsx:161,175` |
| Pantalla Registro, aviso | Ya hay una cuenta registrada con ese email. | signUp detecta email ya confirmado | | `src/pages/Register.jsx:173` |
| Pantalla Registro, texto | Te mandamos un link para confirmar {email}. Tocalo para poder entrar. (`{email}`: el email cargado en el formulario) | Paso "revisá tu email" (solo si la confirmación de email estuviera activada) | | `src/pages/Register.jsx:187` |
| Pantalla Registro, texto | Entrando… | Registro exitoso, a punto de entrar | | `src/pages/Register.jsx:197` |
| Pantalla Registro, campos | Email / Contraseña / Repetir contraseña (placeholders) | Campos del alta | | `src/pages/Register.jsx:211,220,230` |
| Pantalla Registro, botón | Crear cuenta / Creando cuenta… | Envía el alta | | `src/pages/Register.jsx:245` |
| Pantalla Registro, error | La contraseña tiene que tener al menos {n} caracteres. (`{n}`: mínimo de Supabase, hoy 6) | Validación de longitud antes de enviar | | `src/pages/Register.jsx:91` (igual en `src/pages/ResetPassword.jsx:32`) |
| Pantalla Registro, error | Las dos contraseñas no coinciden. | Validación de confirmación de contraseña | | `src/pages/Register.jsx:96` (igual en `src/pages/ResetPassword.jsx:36`) |
| Pantalla Registro, error | No se pudo completar el registro. Es posible que este link se haya usado justo ahora — probá pedir uno nuevo. | Error al llamar signUp (incluye el detalle del error de Postgres/Auth, ver sección de errores transversales) | | `src/pages/Register.jsx:106` |

## Recuperar contraseña

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla ResetPassword, subtítulo | Elegí tu contraseña nueva / Contraseña actualizada | Subtítulo según si ya se guardó | | `src/pages/ResetPassword.jsx:60` |
| Pantalla ResetPassword, aviso | El enlace expiró. Pedí uno nuevo para volver a intentar. | Link de recuperación vencido o ya usado | | `src/pages/ResetPassword.jsx:70` |
| Pantalla ResetPassword, botón | Ir al inicio de sesión | Sale del flujo de recuperación sin sesión | | `src/pages/ResetPassword.jsx:78` |
| Pantalla ResetPassword, texto | Ya podés usar la app con tu contraseña nueva. | Confirmación tras guardar | | `src/pages/ResetPassword.jsx:84` |
| Pantalla ResetPassword, botón | Entrar | Cierra el flujo de recuperación y entra a la app | | `src/pages/ResetPassword.jsx:91` |
| Pantalla ResetPassword, campos | Contraseña nueva / Repetir contraseña (placeholders) | Campos del formulario | | `src/pages/ResetPassword.jsx:101,111` |
| Pantalla ResetPassword, botón | Guardar / Guardando… | Envía la contraseña nueva | | `src/pages/ResetPassword.jsx:128` |
| Pantalla ResetPassword, error | No se pudo guardar la contraseña. Probá de nuevo. | Error al llamar updateUser | | `src/pages/ResetPassword.jsx:45` |

## Navegación (barra inferior / columna lateral)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pestaña / ítem de navegación (espacio acotado: nombre chico bajo el ícono en el celular) | Inicio | Va al Dashboard | | `src/components/Layout.jsx:14` |
| Pestaña / ítem de navegación (espacio acotado) | Movimientos | Va a Movimientos | | `src/components/Layout.jsx:19` |
| Pestaña / ítem de navegación (espacio acotado) | Mi plata | Va a Cuentas del disponible | | `src/components/Layout.jsx:24` |
| Pestaña / ítem de navegación (espacio acotado) | Inversiones | Va a Portafolio | | `src/components/Layout.jsx:29` |
| Pestaña / ítem de navegación (espacio acotado) | Ajustes | Va a Ajustes | | `src/components/Layout.jsx:34` |
| Columna lateral desktop, marca | finanzas | Nombre de la app junto al logo | | `src/components/Layout.jsx:73` |

## Inicio (Dashboard)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Inicio, título | Inicio | Título de la pantalla | | `src/pages/Dashboard.jsx:466` |
| Pantalla Inicio, botón (desktop) / FAB (celular, sin texto) | Nuevo gasto | Abre el alta rápida de gasto | | `src/pages/Dashboard.jsx:470,591` |
| Tarjeta resumen, etiqueta | Dinero disponible | Nombre de la tarjeta de líquido | | `src/pages/Dashboard.jsx:486` |
| Tarjeta resumen, hint | Configurar mis cuentas | Aparece solo la primera vez, antes de la primera reconciliación | | `src/pages/Dashboard.jsx:488` |
| Tarjeta resumen, explicación (botón "i") | La plata que tenés a mano para usar hoy. Sube con tus ingresos y baja con tus gastos y con lo que ponés en inversiones. | Explica "Dinero disponible" | Tu dinero liquido. Sube con tus ingresos y baja con tus gastos.| `src/pages/Dashboard.jsx:490` |
| Tarjeta resumen, etiqueta | Dinero ahorrado | Nombre de la tarjeta de cuentas de ahorro (solo si hay saldo) | | `src/pages/Dashboard.jsx:504` |
| Tarjeta resumen, explicación (botón "i") | Lo que guardaste aparte del día a día: no es plata disponible para gastar ni una inversión que busca rendimiento. | Explica "Dinero ahorrado" |Eliminar | `src/pages/Dashboard.jsx:507` |
| Tarjeta resumen, etiqueta | Dinero invertido | Nombre de la tarjeta de portafolio | | `src/pages/Dashboard.jsx:513` (también encabezado de Inversiones, ver más abajo) |
| Tarjeta resumen, explicación (botón "i") | Lo que valen hoy tus inversiones, según el último precio o la última valuación que cargaste. | Explica "Dinero invertido" | Lo que valen tus activos.| `src/pages/Dashboard.jsx:515` |
| Tarjeta resumen, etiqueta | Deudas | Nombre de la tarjeta de deudas (solo si hay deudas cargadas) | | `src/pages/Dashboard.jsx:527` |
| Tarjeta resumen, nota | Te queda por pagar | Aclara qué mide el monto de la tarjeta Deudas | | `src/pages/Dashboard.jsx:529` (repite en `src/pages/Debts.jsx:88`) |
| Tarjeta resumen, texto de carga | Calculando… | Estado de carga de una tarjeta / gráfico | | `src/pages/Dashboard.jsx:38,164,233` (y en varios componentes más, ver "Patrones compartidos") |
| Tarjeta resumen, botón | Reintentar | Reintenta cargar una tarjeta que falló | | `src/pages/Dashboard.jsx:147,215` (patrón repetido en toda la app, ver "Patrones compartidos") |
| Desglose de "sin cuenta" | Sin cuenta | Línea del desglose del disponible para movimientos sin cuenta asignada | | `src/pages/Dashboard.jsx:415` |
| Bloque Total, etiqueta | Total | Nombre del resumen convertido a dólares | | `src/pages/Dashboard.jsx:214,230` |
| Bloque Total, desglose | En pesos / En dólares | Líneas del detalle del Total por moneda | | `src/pages/Dashboard.jsx:244` (patrón repetido, ver ExpensesBlock y Movements) |
| Bloque Total, error | Depende de un número que no se pudo calcular arriba. | El Total no se pudo calcular porque falló el disponible o el portafolio | | `src/pages/Dashboard.jsx:348` |
| Bloque Total, error | No se pudo calcular el total. | Falló la conversión a dólares del Total | | `src/pages/Dashboard.jsx:377` |
| Carga de disponible, error | No se pudo calcular el disponible. | Falló `computeCurrentLiquid` | | `src/pages/Dashboard.jsx:311` (igual en `src/components/LiquidModal.jsx:131`) |
| Carga de deudas, error | No se pudieron cargar las deudas. | Falló `getDebts` | | `src/pages/Dashboard.jsx:323` (igual en `src/pages/Debts.jsx:153`) |
| Carga de categorías, error | No se pudieron cargar las categorías. | Falló `getCategories` al abrir el alta de gasto | | `src/pages/Dashboard.jsx:389` |
| Gráfico de evolución, estado vacío | Todavía no cargaste ningún aporte. Cuando registres el primero, acá vas a ver cómo evoluciona tu portafolio. | Sin contribuciones todavía | | `src/pages/Dashboard.jsx:566` |
| Alta rápida de gasto, título del modal | Nuevo gasto | Título del FormSheet mientras cargan las categorías | | `src/pages/Dashboard.jsx:602` |
| Alta rápida de gasto, texto de carga | Cargando… | Mientras cargan las categorías (patrón repetido en toda la app) | | `src/pages/Dashboard.jsx:615` |

## Inversiones (lista de Portafolio)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Inversiones, título | Inversiones | Título de la pantalla (pestaña, ver Navegación) | | `src/pages/Portfolio.jsx:138` |
| Pantalla Inversiones, link | Grupos de activos | Va a la gestión de grupos | | `src/pages/Portfolio.jsx:157` |
| Pantalla Inversiones, botón | Nuevo activo | Abre el alta de activo | | `src/pages/Portfolio.jsx:122,181,222` |
| Pantalla Inversiones, botón | Actualizar valuaciones | Abre la carga de valuación para todos los activos manuales sin valor al día | | `src/pages/Portfolio.jsx:131,229` |
| Pantalla Inversiones, estado vacío | Todavía no tenés activos | Sin ningún activo cargado | | `src/pages/Portfolio.jsx:171` |
| Pantalla Inversiones, estado vacío | Creá el primero para empezar a seguir tus inversiones. | Ayuda del estado vacío | | `src/pages/Portfolio.jsx:173` |
| Pantalla Inversiones, error | (mensaje genérico, ver Patrones compartidos) | Falló `usePortfolio` | | `src/hooks/usePortfolio.js:47` — mensaje: "No se pudo cargar el portafolio." |
| Resumen del portafolio, etiqueta | Dinero invertido | Nombre del total (mismo que la tarjeta de Inicio) | | `src/pages/Portfolio.jsx:194` |
| Resumen del portafolio, línea | Aportado {monto} (`{monto}`: formatUSD del total aportado) | Capital propio aportado, junto al total | | `src/pages/Portfolio.jsx:201` |
| Resumen del portafolio, línea | Rendimiento {monto} ({%}) | Ganancia/pérdida junto al total (ver fila "Gain" en Patrones compartidos) | | `src/pages/Portfolio.jsx:206` |
| Aviso | No se pudieron traer los precios del momento. Se muestra el último valor disponible de cada activo. | Falló la cotización en vivo | | `src/pages/Portfolio.jsx:238` |
| Aviso (singular/plural) | «{nombre}» todavía no tiene valuación, así que no suma al total. / {n} activos todavía no tienen valuación, así que no suman al total. Usá «Actualizar valuaciones». (`{nombre}`/`{n}`: activo o cantidad sin valuar) | Activos sin ninguna valuación | | `src/pages/Portfolio.jsx:245` |
| Selector de orden, etiqueta | Ordenar por | Encabezado del selector de orden de la lista | | `src/pages/Portfolio.jsx:257` |
| Selector de orden, opciones | (nombres de `PORTFOLIO_SORTS`, ver `src/lib/portfolio.js`) | Criterios de orden del portafolio | | `src/pages/Portfolio.jsx:265` |
| Sección de archivados, botón | Archivados ({n}) + / − (`{n}`: cantidad de activos archivados) | Expande/colapsa la lista de archivados | | `src/pages/Portfolio.jsx:325` |
| Fila de archivado, botón | Restaurar | Devuelve un activo archivado al portafolio | | `src/pages/Portfolio.jsx:343` |
| Aviso (dentro de archivados) | No se pudieron cargar los activos archivados. | Falló `getArchivedAssets` | | `src/pages/Portfolio.jsx:69` |
| Aviso (dentro de archivados) | No se pudo restaurar el activo. | Falló `restoreAsset` | | `src/pages/Portfolio.jsx:84` |
| Tarjeta de grupo, badge | fuera del total (espacio acotado: chip) | El grupo no suma al valor total (`include_in_total = false`) | | `src/components/AssetGroup.jsx:143` |
| Tarjeta de grupo, badge | grupo archivado (espacio acotado: chip) | Grupo archivado que igual se muestra por tener activos sin archivar | | `src/components/AssetGroup.jsx:147` |
| Tarjeta de grupo, valor | sin valuación | Ningún activo del grupo tiene valor todavía | | `src/components/AssetGroup.jsx:153` |
| Tarjeta de grupo, línea | aportado {monto} | Aportado total del grupo | | `src/components/AssetGroup.jsx:158` |
| Tarjeta de grupo, aviso | Este grupo está archivado pero todavía tiene activos sin archivar, así que se muestra: su valor sigue contando en el total. Movelos a otro grupo, o restaurá el grupo desde su detalle. | Explica por qué un grupo archivado sigue visible | | `src/components/AssetGroup.jsx:170` |
| Tarjeta de grupo, aviso | Este grupo se ve, pero no suma al valor total. | Explica el badge "fuera del total" | | `src/components/AssetGroup.jsx:176` |
| Fila de activo, línea 2 (según modo) | {cantidad} · prom. {monto} → hoy {monto} (activo de precio en vivo) | Cantidad tenida, precio promedio de compra y precio actual | | `src/components/AssetGroup.jsx:40` |
| Fila de activo, línea 2 | Valuación manual · {fecha} / sin valuar | Fecha de la última valuación manual | | `src/components/AssetGroup.jsx:45` |
| Fila de activo, línea 2 | {monto} aportado | Para un activo "vale lo aportado" | | `src/components/AssetGroup.jsx:47` |
| Fila de activo, aviso | Valuación desactualizada — hay operaciones posteriores | La valuación quedó vieja frente a operaciones nuevas | | `src/components/AssetGroup.jsx:84` |
| Fila de activo (`SourceTag`) | En vivo {hora} | Precio cotizado en el momento | | `src/components/SourceTag.jsx:15` |
| Fila de activo (`SourceTag`) | Precio actualizado {fecha} | Precio de cierre del día (mercados que no cotizan en vivo desde el navegador) | | `src/components/SourceTag.jsx:26` |
| Fila de activo (`SourceTag`) | Precio caído · último valor {fecha} | La cotización de hoy falló, se muestra la última conocida | | `src/components/SourceTag.jsx:33` |
| Fila de activo (`SourceTag`) | Valuado {fecha} | Activo de valuación manual | | `src/components/SourceTag.jsx:39` |
| Fila de activo (`SourceTag`) | Vale lo que pusiste | Activo "vale lo aportado" (en retirada, ver ADR) | Vale lo aportado| `src/components/SourceTag.jsx:43` |
| Fila de activo (`SourceTag`) | Sin valuar — no suma al total | Ningún valor disponible todavía | | `src/components/SourceTag.jsx:45` |

## Detalle de activo

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Detalle de activo, volver | Inversiones / Movimientos | Vuelve al origen (Inversiones, o Movimientos si se entró desde ahí) | | `src/pages/AssetDetail.jsx:56` |
| Detalle de activo, botón editar (icono lápiz, accesible) | Editar activo | `aria-label` del botón de lápiz junto al nombre | | `src/pages/AssetDetail.jsx:252` |
| Detalle de activo, botones (desktop) / barra inferior (celular) | Retirar / Aportar | Acciones principales del activo | | `src/pages/AssetDetail.jsx:265,275,442,452` |
| Detalle de activo, error | No se pudo cargar el activo. | Falló la carga del detalle | | `src/pages/AssetDetail.jsx:115` |
| Detalle de activo, línea bajo el valor | Equivale a {cantidad} {nombre del activo} | Cantidad tenida hoy (activos de precio en vivo) | | `src/pages/AssetDetail.jsx:302` |
| Detalle de activo, aviso | Rendimiento no disponible: cargaste operaciones después de la última valuación ({fecha}). Actualizala para volver a verlo. | Valuación desactualizada frente a operaciones nuevas | | `src/pages/AssetDetail.jsx:311` |
| Tarjeta de métrica, etiqueta | Precio prom. de compra | Precio promedio pagado (activos de precio en vivo) | | `src/pages/AssetDetail.jsx:333` |
| Tarjeta de métrica, etiqueta | Precio actual / Valuación · {fecha} / Valuación actual | Valor de hoy del activo, según el modo | | `src/pages/AssetDetail.jsx:346` |
| Tarjeta de métrica, etiqueta | Aportado | Capital propio puesto en el activo | | `src/pages/AssetDetail.jsx:357` |
| Explicación de métrica (botón "i") | Promedio ponderado de tus compras: total invertido ÷ cantidad comprada. Compararlo con el precio actual te muestra cuánto rindió tu inversión. | Explica "Precio prom. de compra" | | `src/pages/AssetDetail.jsx:35` |
| Explicación de métrica (botón "i") | Última cotización disponible, o tu última valuación manual si no hay precio en vivo. | Explica "Precio actual" (activos manuales) |Ultima valuación dispoinibl| `src/pages/AssetDetail.jsx:36` |
| Explicación de métrica (botón "i") | Lo que vale UNA unidad hoy, comparable con tu precio promedio de compra. Sale de la última cotización disponible; si no hay precio en vivo, del precio implícito de tu última valuación manual. | Explica "Precio actual" (activos de precio en vivo) | Lo que vale UNA unidad hoy, comparable con tu precio promedio de compra. Sale de la última cotización disponible| `src/pages/AssetDetail.jsx:39` |
| Explicación de métrica (botón "i") | Capital propio en este activo: tus aportes menos la parte de capital de tus retiros. La diferencia con el valor actual es tu ganancia. | Explica "Aportado" | | `src/pages/AssetDetail.jsx:42` |
| Detalle de activo, acción | Transferir | Abre la transferencia a otro activo | | `src/pages/AssetDetail.jsx:377` |
| Detalle de activo, ayuda de acción | Mover valor de este activo a otro tuyo. | Explica "Transferir" | | `src/pages/AssetDetail.jsx:379` |
| Detalle de activo, acción | Liquidar | Abre la liquidación total de la posición | | `src/pages/AssetDetail.jsx:388` |
| Detalle de activo, ayuda de acción | Vender todo y cerrar la posición. Para vender una parte, usá Retirar. | Explica "Liquidar" | | `src/pages/AssetDetail.jsx:390` |
| Detalle de activo, acción | Actualizar valuación | Abre la carga de valuación manual | | `src/pages/AssetDetail.jsx:400` |
| Detalle de activo, ayuda de acción | Cargar cuánto vale hoy este activo. | Explica "Actualizar valuación" | | `src/pages/AssetDetail.jsx:402` |
| Historial, encabezado | Historial | Título de la sección de operaciones | | `src/pages/AssetDetail.jsx:410` (repite en `src/pages/settings/AccountDetail.jsx:240`) |
| Historial, estado vacío | Todavía no hay operaciones. | Sin ningún aporte/retiro/valuación | | `src/components/assetDetail/AssetHistory.jsx:71` |
| Historial, fila de operación | {label} · {fecha} · {cantidad} a {precio}/un. · a {tasa} por dólar | Una fila de aporte/retiro (`label` sale de `classifyOperations`, ver `lib/portfolio.js`) | | `src/components/assetDetail/AssetHistory.jsx:25` |
| Historial, fila de valuación | Valuación · {fecha} · {monto} | Una valuación manual intercalada en el historial | | `src/components/assetDetail/AssetHistory.jsx:49` |
| Historial, botón | Ver más / Cargando… | Pagina el historial | | `src/components/assetDetail/AssetHistory.jsx:100` (mismo patrón en `src/components/account/AccountHistory.jsx:72` y `src/pages/settings/AccountDetail.jsx`) |
| Historial, error de paginado | No se pudo cargar más. Reintentá. | Falló "Ver más" | | `src/components/assetDetail/AssetHistory.jsx:104` (igual en `src/components/account/AccountHistory.jsx:76`) |

## Formularios de activo (alta/edición, grupo, buscador de instrumento)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal de activo, título | Nuevo activo / Editar activo | Título del formulario | | `src/components/AssetFormModal.jsx:158` |
| Modal de activo, campo | Nombre / ¿Qué activo es? ej: Bitcoin, Colchón USD (placeholder) | Nombre del activo | Nombre / ¿Qué activo es? ej: Bitcoin, S&P500| `src/components/AssetFormModal.jsx:174,178` |
| Modal de activo, campo | Grupo de activos / Sin grupo / + Nuevo grupo | Selector de grupo (asset_type) | | `src/components/AssetFormModal.jsx:186,193,199` |
| Modal de activo, ayuda | Agrupá tus activos por categoría (cripto, efectivo, acciones) para ver cómo rinde cada grupo. Sin grupo el activo aparece solo, con su propio valor. Renombrar y archivar grupos: en Inversiones. | Explica el campo Grupo | Agrupá tus activos por categoría (cripto, efectivo, acciones) para ver cómo rinde cada grupo.| `src/components/AssetFormModal.jsx:205` |
| Modal de activo, pregunta | Tipo de valuación:| Encabezado del selector de modo de valuación | | `src/components/AssetFormModal.jsx:224` |
| Modal de activo, opción | Valuación manual | Modo de valuación manual | | `src/components/AssetFormModal.jsx:11` |
| Modal de activo, ayuda de opción | Vos cargas el valor periodicamente. | Explica "Valuación manual" | | `src/components/AssetFormModal.jsx:11` |
| Modal de activo, opción | Valuación automática | Modo de valuación con precio en vivo | | `src/components/AssetFormModal.jsx:12` |
| Modal de activo, ayuda de opción | Elegís el activo de mercado y su precio se actualiza solo. | Explica "Valuación automática" | | `src/components/AssetFormModal.jsx:12` |
| Modal de activo, campo | Cuenta en el rendimiento | Switch `yields` | | `src/components/AssetFormModal.jsx:250,254` |
| Modal de activo, ayuda | Apagalo si no querés que este activo modifique el % de rendimiento de tu portafolio ni el de su grupo. | Explica el switch de rendimiento | | `src/components/AssetFormModal.jsx:257` |
| Modal de activo, error | No se pudo guardar el activo. | Falló crear/actualizar el activo | | `src/components/AssetFormModal.jsx:132` |
| Modal de activo, error | No se pudo archivar el activo. | Falló archivar | | `src/components/AssetFormModal.jsx:144` |
| Modal de activo, confirmación | ¿Archivar este activo? | Pregunta de archivado | | `src/components/AssetFormModal.jsx:271` |
| Modal de activo, confirmación | No / Sí, archivar | Botones de la confirmación (patrón compartido de "archivar", ver Patrones compartidos) | | `src/components/AssetFormModal.jsx:279,285` |
| Modal de activo, ayuda | Podés restaurarlo después desde «Archivados», al final de Inversiones. | Aclara que archivar es reversible | | `src/components/AssetFormModal.jsx:291` |
| Modal de activo, botón | Archivar activo | Abre la confirmación de archivado | | `src/components/AssetFormModal.jsx:302` |
| Alta de grupo (embebida y en Ajustes), campo | Nombre ej: Cripto, Efectivo (placeholder) | Nombre del nuevo grupo | | `src/components/CreateAssetTypeForm.jsx:39` |
| Alta de grupo, campo | Los activos nuevos buscan rendimiento | Switch `earns_yield` default del grupo | | `src/components/CreateAssetTypeForm.jsx:44,49` |
| Alta de grupo, botones | Cancelar / Crear grupo / Creando… | Acciones del alta de grupo | | `src/components/CreateAssetTypeForm.jsx:55,64` |
| Alta de grupo, error | No se pudo crear el grupo. | Falló crear el grupo | | `src/components/CreateAssetTypeForm.jsx:28` |
| Buscador de instrumento, pregunta | ¿Qué activo de mercado es? | Encabezado del buscador/ficha | | `src/components/asset/InstrumentPicker.jsx:118,148` |
| Buscador de instrumento, link | cambiar | Vuelve a buscar sobre un instrumento ya elegido | | `src/components/asset/InstrumentPicker.jsx:124` |
| Buscador de instrumento, ficha | Último precio conocido: {precio} · {fecha} | Confirma el precio del instrumento elegido | | `src/components/asset/InstrumentPicker.jsx:134` |
| Buscador de instrumento, ficha | Todavía sin precio guardado para este activo. | Instrumento sin ninguna cotización cargada | | `src/components/asset/InstrumentPicker.jsx:135` |
| Buscador de instrumento, placeholder | Buscá por nombre o símbolo / Cargando… | Campo de búsqueda | | `src/components/asset/InstrumentPicker.jsx:153` |
| Buscador de instrumento, link | volver a «{nombre}» | Cancela la búsqueda y vuelve al instrumento ya elegido | | `src/components/asset/InstrumentPicker.jsx:165` |
| Buscador de instrumento, fila de resultado | Elegir | Botón implícito de cada resultado | | `src/components/asset/InstrumentPicker.jsx:42` |
| Buscador de instrumento, sin resultados | No encontramos «{búsqueda}» entre los activos con precio automático. Elegí «Valuación manual» arriba y cargale vos el valor cada tanto | Sin coincidencias en el catálogo | | `src/components/asset/InstrumentPicker.jsx:179` |
| Buscador de instrumento, ayuda | Buscá la cripto, el CEDEAR, la acción o el bono. Con eso su precio se actualiza solo. Si no está en la lista, usá «Valuación manual». | Ayuda general del buscador | | `src/components/asset/InstrumentPicker.jsx:185` |
| Buscador de instrumento, error | No se pudo cargar la lista de activos de mercado. | Falló cargar el catálogo | | `src/components/asset/InstrumentPicker.jsx:60` |
| Tipo de instrumento (etiqueta corta) | Cripto / Acción / ETF / Bono / CEDEAR / Obligación negociable / Moneda | `kind` del instrumento, se muestra junto al símbolo | | `src/lib/instruments.js:18-25` |

## Aportar / Retirar (ContributionFormModal + campos compartidos)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal, título | Aportar a {activo} / Editar aporte | Título al aportar | | `src/components/ContributionFormModal.jsx:29,381` |
| Modal, título | Retirar de {activo} / Editar retiro | Título al retirar | | `src/components/ContributionFormModal.jsx:41,381` |
| Modal, campo | Cantidad | Unidades del activo (precio en vivo) | | `src/components/ContributionFormModal.jsx:30,43` |
| Modal, campo | Monto | Monto en dólares | | `src/components/ContributionFormModal.jsx:412` |
| Modal, pregunta | ¿De dónde sale? | Origen del aporte | | `src/components/ContributionFormModal.jsx:36` |
| Modal, pregunta | ¿A dónde va? | Destino del retiro | | `src/components/ContributionFormModal.jsx:48` |
| Modal, opción | De mi disponible | Origen: sale del disponible | | `src/components/ContributionFormModal.jsx:36` |
| Modal, ayuda de opción | Sale de tu dinero disponible y lo baja. | Explica "De mi disponible" (aportar) | | `src/components/ContributionFormModal.jsx:36` |
| Modal, opción | A mi disponible | Destino: entra al disponible | | `src/components/ContributionFormModal.jsx:49` |
| Modal, ayuda de opción | Entra a tu dinero disponible y lo sube. | Explica "A mi disponible" (retirar) | | `src/components/ContributionFormModal.jsx:49` (repite en `src/components/contribution/LiquidatePositionModal.jsx:17`) |
| Modal, opción | De afuera | Origen: plata que no pasó por la app | | `src/components/ContributionFormModal.jsx:37` |
| Modal, ayuda de opción | Plata que no estaba en la app (un sueldo, un regalo). No toca tu dinero disponible. | Explica "De afuera" al aportar | | `src/components/contribution/copy.js:11` |
| Modal, opción | Afuera | Destino: plata que sale de la app | | `src/components/ContributionFormModal.jsx:50` (repite en `src/components/contribution/LiquidatePositionModal.jsx:18`) |
| Modal, ayuda de opción | La plata sale de la app — se la diste a alguien, la gastaste, etc. No toca tu dinero disponible. | Explica "Afuera" al retirar/liquidar | | `src/components/contribution/copy.js:14` |
| Modal, campo | ¿De qué cuenta? / ¿A qué cuenta? | Selector de cuenta (solo si la operación toca el disponible) | | `src/components/ContributionFormModal.jsx:489` |
| Modal, aviso | Esta operación es anterior a la última vez que contaste {cuenta} (el {fecha}). Modificarla puede correr el saldo actual de esa cuenta — te conviene volver a contarla después de guardar. | Aviso de reconciliación retroactiva | | `src/components/ContributionFormModal.jsx:142` (mismo texto en `TransactionFormModal.jsx:145`, `DebtPaymentModal.jsx:91`) |
| Modal, error | No se pudo guardar el {aporte/retiro}. (`{entidad}`: "aporte" o "retiro") | Falló guardar | | `src/components/ContributionFormModal.jsx:359` |
| Modal, error | No se pudo eliminar el {aporte/retiro}. | Falló eliminar | | `src/components/ContributionFormModal.jsx:371` |
| Modal, confirmación | ¿Eliminar este {aporte/retiro}? Es permanente. | Confirmación de borrado | | `src/components/ContributionFormModal.jsx:511` |
| Modal, botón | Eliminar {aporte/retiro} | Abre la confirmación de borrado | | `src/components/ContributionFormModal.jsx:539` |
| Modal (pata de transferencia), título | Transferencia enviada / Transferencia recibida | Título de solo lectura para una pata de transferencia entre activos | | `src/components/ContributionFormModal.jsx:168` |
| Modal (pata de transferencia), campos | Monto / Cantidad / Tipo de cambio / Fecha | Datos de solo lectura de la pata | | `src/components/ContributionFormModal.jsx:174-191` |
| Modal (pata de transferencia), ayuda | Parte de una transferencia con «{activo}». / Parte de una transferencia. No se puede editar: para corregirla, borrala y volvé a cargarla. | Explica por qué es de solo lectura | | `src/components/ContributionFormModal.jsx:196` |
| Modal (pata de transferencia), confirmación | ¿Eliminar esta transferencia? Se borran las dos partes: esta operación y la de «{activo}». Es permanente. | Confirma el borrado de las dos patas | | `src/components/ContributionFormModal.jsx:207` (mismo patrón en `TransactionFormModal.jsx:219`) |
| Modal (pata de transferencia), botón | Eliminar transferencia | Abre la confirmación | | `src/components/ContributionFormModal.jsx:237` (repite en `TransactionFormModal.jsx:250`) |
| Modal, aviso | Estás retirando {cantidad} un., pero solo tenés {cantidad} un. de {activo}. | Guarda de tenencia (bloqueante) | | `src/components/ContributionFormModal.jsx:296` |
| Modal, aviso | Este retiro supera el valor actual del activo ({monto}). Podés continuar: el precio pudo cambiar o el valor puede estar desactualizado. | Aviso no bloqueante al retirar por encima del valor | | `src/components/ContributionFormModal.jsx:299` |

## Transferir (entre activos)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal Transferir, título | Transferir desde {activo} | Título del formulario | | `src/components/contribution/TransferFormModal.jsx:229` |
| Modal Transferir, campo | Destino / Elegir… | Selector de activo destino | | `src/components/contribution/TransferFormModal.jsx:245,252` |
| Modal Transferir, campo | Cantidad que sale | Cantidad que sale del activo origen (precio en vivo) | | `src/components/contribution/TransferFormModal.jsx:265` |
| Modal Transferir, campo | Monto | Monto en dólares de la transferencia | | `src/components/contribution/TransferFormModal.jsx:278` |
| Modal Transferir, campo | Cantidad que entra | Cantidad que entra al activo destino (precio en vivo) | | `src/components/contribution/TransferFormModal.jsx:294` |
| Modal Transferir, aviso | Esta transferencia supera el valor actual del activo ({monto}). Podés continuar: el precio pudo cambiar o el valor puede estar desactualizado. | Aviso no bloqueante | | `src/components/contribution/TransferFormModal.jsx:197` |
| Modal Transferir, error | No se pudo guardar la transferencia. | Falló crear la transferencia | | `src/components/contribution/TransferFormModal.jsx:222` (mismo mensaje en `AccountTransferModal.jsx:91` para cuentas) |

## Liquidar (cerrar posición)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal Liquidar, título | Liquidar {activo} | Título del formulario | | `src/components/contribution/LiquidatePositionModal.jsx:134` |
| Modal Liquidar, botón | Liquidar / Liquidando… | Envía la liquidación (verbo explícito, no "Guardar") | | `src/components/contribution/LiquidatePositionModal.jsx:143` |
| Modal Liquidar, ayuda de monto | Sin valuación conocida — indicá el monto. | El activo nunca tuvo valuación | | `src/components/contribution/LiquidatePositionModal.jsx:166` |
| Modal Liquidar, ayuda de monto | La última valuación quedó vieja (hay operaciones posteriores), así que no la precargamos: poné por cuánto vendiste. | Valuación desactualizada | | `src/components/contribution/LiquidatePositionModal.jsx:168` |
| Modal Liquidar, ayuda de monto | Último valor conocido — ajustalo si vendiste por otro monto. | Precio de cierre (no en vivo) | | `src/components/contribution/LiquidatePositionModal.jsx:170` |
| Modal Liquidar, ayuda de monto | Se registra un retiro por este monto (valor actual: {monto}). | Caso normal, con valor vigente | | `src/components/contribution/LiquidatePositionModal.jsx:171` |
| Modal Liquidar, campo | Ganancia realizada | Ganancia/pérdida que cristaliza la venta | | `src/components/contribution/LiquidatePositionModal.jsx:180` |
| Modal Liquidar, aviso | Estás liquidando por encima / por debajo del último valor conocido ({monto}). Podés continuar: el precio pudo cambiar desde la última valuación. | Aviso no bloqueante | | `src/components/contribution/LiquidatePositionModal.jsx:93` |
| Modal Liquidar, pregunta | ¿A dónde va? | Destino de la venta | | `src/components/contribution/LiquidatePositionModal.jsx:218` |
| Modal Liquidar, campo | Archivar el activo | Checkbox para archivar tras liquidar | | `src/components/contribution/LiquidatePositionModal.jsx:244` |
| Modal Liquidar, error | No se pudo liquidar la posición. | Falló la liquidación | | `src/components/contribution/LiquidatePositionModal.jsx:127` |

## Actualizar valuación

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal Valuación, título | Actualizar valuación | Título del formulario (subtítulo: nombre del activo si es uno solo) | | `src/components/ValuationModal.jsx:77` |
| Modal Valuación, ayuda | ¿Cuánto vale hoy en total, en dólares? No es el precio de una unidad. Los que dejes vacíos no se tocan. | Ayuda general del formulario | | `src/components/ValuationModal.jsx:92` |
| Modal Valuación, fila | Último: {monto} ({fecha}) | Última valuación conocida de un activo | | `src/components/ValuationModal.jsx:115` |
| Modal Valuación, fila | Nunca lo valuaste | El activo nunca tuvo una valuación | | `src/components/ValuationModal.jsx:117` |
| Modal Valuación, aviso | Ya tenés una valuación en esta fecha — la vas a reemplazar. | La fecha elegida ya tiene una valuación cargada | | `src/components/ValuationModal.jsx:120` |
| Modal Valuación, error | No se pudieron guardar las valuaciones. | Falló guardar | | `src/components/ValuationModal.jsx:65` |

## Grupos de activos (Ajustes → Inversiones)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Lista de grupos, título | Grupos de activos | Título de la pantalla | | `src/pages/settings/AssetTypes.jsx:71` |
| Lista de grupos, descripción | Cómo se agrupan tus inversiones: un activo puede estar en un grupo, o quedar suelto. | Descripción bajo el título | | `src/pages/settings/AssetTypes.jsx:72` |
| Lista de grupos, footer | El orden es el mismo que ves en Inversiones. | Nota bajo la lista | | `src/pages/settings/AssetTypes.jsx:93` |
| Lista de grupos, botón | Nuevo grupo | Abre el alta de grupo | | `src/pages/settings/AssetTypes.jsx:21` |
| Lista de grupos, badge | fuera del total | Igual que en la tarjeta de grupo de Inversiones | | `src/pages/settings/AssetTypes.jsx:99` |
| Lista de grupos, sección | Archivados ({n}) | Grupos archivados | | `src/pages/settings/AssetTypes.jsx:107` |
| Lista de grupos, footer | Entrá a uno para restaurarlo. | Nota de la sección de archivados | | `src/pages/settings/AssetTypes.jsx:109` |
| Lista de grupos, error | No se pudieron cargar los grupos. | Falló cargar los grupos | | `src/pages/settings/AssetTypes.jsx:53` |
| Detalle de grupo, título | Grupo (mientras carga) / {nombre del grupo} | Título de la pantalla | | `src/pages/settings/AssetTypeDetail.jsx:254,278` |
| Detalle de grupo, error | No se pudo cargar el grupo. | Falló cargar el detalle | | `src/pages/settings/AssetTypeDetail.jsx:170` |
| Detalle de grupo, campo | Activos ({n} activo(s) · {n} archivado(s)) / Ninguno todavía | Cuántos activos tiene el grupo | | `src/pages/settings/AssetTypeDetail.jsx:112` |
| Detalle de grupo, sección | Activos | Lista de activos del grupo, con link al detalle | | `src/pages/settings/AssetTypeDetail.jsx:309` |
| Detalle de grupo, footer | Tocá uno para ver su detalle y operar. | Nota de la sección Activos | | `src/pages/settings/AssetTypeDetail.jsx:309` |
| Detalle de grupo, botón | Guardar | Renombrar el grupo | | `src/pages/settings/AssetTypeDetail.jsx:298` |
| Detalle de grupo, error | No se pudo renombrar el grupo. | Falló renombrar | | `src/pages/settings/AssetTypeDetail.jsx:200` |
| Detalle de grupo, sección/campo | Orden en Inversiones · {posición} de {total} | Posición del grupo en la lista | | `src/pages/settings/AssetTypeDetail.jsx:334` |
| Detalle de grupo, footer | Es el orden con el que los grupos aparecen en Inversiones. | Nota de la sección de orden | | `src/pages/settings/AssetTypeDetail.jsx:332` |
| Detalle de grupo, accesible | Subir un lugar / Bajar un lugar | `aria-label` de las flechas de orden | | `src/pages/settings/AssetTypeDetail.jsx:345,354` |
| Detalle de grupo, error | No se pudo cambiar el orden. | Falló mover el grupo | | `src/pages/settings/AssetTypeDetail.jsx:216` |
| Detalle de grupo, sección | Color | Selector de color del grupo | | `src/pages/settings/AssetTypeDetail.jsx:365` |
| Detalle de grupo, footer | Tiñe el encabezado del grupo y sus activos en Inversiones, para distinguirlo de un vistazo. No cambia ningún número ni los verdes y rojos de ganancia y pérdida. | Explica el color de grupo | | `src/pages/settings/AssetTypeDetail.jsx:366` |
| Detalle de grupo, opción de color | Sin color | Opción sin tinte (default) | | `src/pages/settings/AssetTypeDetail.jsx:74` |
| Detalle de grupo, error | No se pudo cambiar el color del grupo. | Falló guardar el color | | `src/pages/settings/AssetTypeDetail.jsx:224` |
| Detalle de grupo, switch | Cuenta en el total del portafolio | `include_in_total` | | `src/pages/settings/AssetTypeDetail.jsx:373` |
| Detalle de grupo, footer | Si lo apagás, el grupo se sigue viendo en Inversiones pero no suma al valor total ni al rendimiento general. | Explica el switch de arriba | | `src/pages/settings/AssetTypeDetail.jsx:371` |
| Detalle de grupo, error | No se pudo actualizar el grupo. | Falló cambiar `include_in_total` o `earns_yield` | | `src/pages/settings/AssetTypeDetail.jsx:207,231` |
| Detalle de grupo, switch | Los activos nuevos buscan rendimiento | Default de `yields` para altas nuevas en este grupo | | `src/pages/settings/AssetTypeDetail.jsx:384` |
| Detalle de grupo, footer | Es solo el valor sugerido al crear un activo nuevo acá; cada activo decide lo suyo y se puede cambiar en cualquier momento. Cambiarlo no toca los activos que ya existen. | Explica el switch de rendimiento default | | `src/pages/settings/AssetTypeDetail.jsx:382` |
| Detalle de grupo, botón | Restaurar grupo | Devuelve un grupo archivado | | `src/pages/settings/AssetTypeDetail.jsx:394` |
| Detalle de grupo, footer | Vuelve a aparecer en Inversiones y al elegir el grupo de un activo. | Explica "Restaurar grupo" | | `src/pages/settings/AssetTypeDetail.jsx:392` |
| Detalle de grupo, error | No se pudo restaurar el grupo. | Falló restaurar | | `src/pages/settings/AssetTypeDetail.jsx:394` |
| Detalle de grupo, botón (bloqueado) | Archivar grupo | Deshabilitado si el grupo tiene activos sin archivar | | `src/pages/settings/AssetTypeDetail.jsx:403` |
| Detalle de grupo, footer (bloqueado) | Para archivar o eliminar este grupo, primero mové sus {n} activo(s) a otro grupo o archivalo(s). | Explica por qué está bloqueado | | `src/pages/settings/AssetTypeDetail.jsx:401` |
| Detalle de grupo, footer (archivable) | Archivar lo saca de Inversiones y de la lista al elegir grupo. Sus activos archivados quedan como están, y podés restaurarlo cuando quieras. | Explica archivar | | `src/pages/settings/AssetTypeDetail.jsx:406` |
| Detalle de grupo, confirmación | ¿Archivar «{grupo}»? | Confirma el archivado del grupo | | `src/pages/settings/AssetTypeDetail.jsx:409` |
| Detalle de grupo, error | No se pudo archivar el grupo. | Falló archivar | | `src/pages/settings/AssetTypeDetail.jsx:421` |
| Detalle de grupo, footer (eliminable) | El grupo no tiene ningún activo, así que se puede eliminar del todo. | Explica que se puede borrar | | `src/pages/settings/AssetTypeDetail.jsx:439` |
| Detalle de grupo, confirmación | ¿Eliminar «{grupo}»? Es permanente. | Confirma el borrado del grupo | | `src/pages/settings/AssetTypeDetail.jsx:443` |
| Detalle de grupo, botón | Eliminar grupo | Abre la confirmación de borrado | | `src/pages/settings/AssetTypeDetail.jsx:465` |
| Detalle de grupo, error | No se pudo eliminar el grupo. | Falló eliminar | | `src/pages/settings/AssetTypeDetail.jsx:456` |

## Movimientos

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Movimientos, título | Movimientos | Título de la pantalla (pestaña, ver Navegación) | | `src/pages/Movements.jsx:451` |
| Pantalla Movimientos, botón (desktop) / FAB (celular) | Nuevo movimiento | Abre el alta de gasto/ingreso | | `src/pages/Movements.jsx:457,684` |
| Navegador de período, accesible | Período anterior / Período siguiente | `aria-label` de las flechas | | `src/pages/Movements.jsx:499,519` |
| Navegador de período, error | No se pudieron cargar los movimientos. | Falló cargar el mes | | `src/pages/Movements.jsx:348` |
| Totales del mes, etiquetas | Gastos / Ingresos / Invertido / Ahorrado / Balance | Los cinco renglones del período | | `src/pages/Movements.jsx:550-554` |
| Desglose por categoría, encabezado | Gastos por categoría: | Título del desglose | | `src/pages/Movements.jsx:564` |
| Desglose por moneda | En pesos / En dólares | Encabezado de cada grupo cuando hay más de una moneda | | `src/pages/Movements.jsx:569` (mismo patrón en `ExpensesBlock.jsx:186` y `TotalSummary` de Dashboard) |
| Filtro de tipo (chips, espacio acotado) | Todos / Gastos / Ingresos / Inversiones / Ahorros / Transferencias | Los seis filtros de movimientos | | `src/lib/movementList.js:268-274` |
| Filtro de tipo, accesible | Filtrar por tipo de movimiento | `aria-label` del grupo de chips | | `src/pages/Movements.jsx:606` |
| Filtro de categoría, accesible | Filtrar por categoría | `aria-label` del selector | | `src/pages/Movements.jsx:612` |
| Filtro de categoría, opción | Todas las categorías | Opción por default del selector | | `src/pages/Movements.jsx:615` |
| Lista, estado vacío | Sin movimientos con estos filtros. / Sin movimientos en este período. | Sin resultados, según si hay filtros activos | | `src/pages/Movements.jsx:632,633` |
| Lista, botón | Ver más ({n}) (`{n}`: movimientos restantes) | Pagina la lista visible (los totales ya cuentan todo) | | `src/pages/Movements.jsx:675` |
| Fila de gasto/ingreso | {categoría} · {descripción} · {fecha} · {cuenta} | Fila de un movimiento común | | `src/pages/Movements.jsx:101-110` |
| Fila de gasto/ingreso | Sin categoría | Cuando el movimiento no tiene categoría asociada | | `src/pages/Movements.jsx:103` (repite en `src/components/account/AccountHistory.jsx:27`) |
| Fila de inversión | {label} · {activo} (`label`: "Aporte"/"Retiro"/etc. de `classifyOperations`) | Fila de un aporte o retiro de un activo | | `src/pages/Movements.jsx:166-168` |
| Fila de inversión archivada | {label} · {activo} · {fecha} · Activo archivado | Inversión de un activo ya archivado, no clickeable | | `src/pages/Movements.jsx:150-155` |
| Fila de transferencia/reparto | {cuenta} {monto} → {monto} {cuenta} | Línea colapsada de las dos patas de una transferencia o un reparto | | `src/pages/Movements.jsx:246-261` |
| Fila de transferencia/reparto, segunda línea | · Reparto de un conteo / · Transferencia | Aclara el origen de la línea con flecha | | `src/pages/Movements.jsx:264` |
| Rango de fechas, título del sheet | Qué período mirar | Título del selector de período | | `src/components/movements/RangeSheet.jsx:90` |
| Rango de fechas, atajo | Este mes | Vuelve al mes en curso | | `src/components/movements/RangeSheet.jsx:101` |
| Rango de fechas, atajo | Todo {año} | Selecciona el año completo que se está navegando en la grilla | | `src/components/movements/RangeSheet.jsx:104` |
| Rango de fechas, atajo | Últimos 12 meses | Atajo de rango | | `src/components/movements/RangeSheet.jsx:106` |
| Rango de fechas, atajo | Todo | Todo el historial | | `src/components/movements/RangeSheet.jsx:108` |
| Rango de fechas, accesible | Año anterior / Año siguiente | `aria-label` de las flechas de la grilla de meses | | `src/components/movements/RangeSheet.jsx:117,126` |
| Rango de fechas, meses (espacio acotado: 3-4 letras) | ene / feb / mar / abr / may / jun / jul / ago / sep / oct / nov / dic | Grilla de meses | | `src/components/movements/RangeSheet.jsx:33` |
| Rango de fechas, sección | O entre dos fechas | Encabezado del rango a medida | | `src/components/movements/RangeSheet.jsx:160` |
| Rango de fechas, accesible | Desde / Hasta | `aria-label` (visualmente oculto) de los inputs de fecha | | `src/components/movements/RangeSheet.jsx:163,171` |
| Rango de fechas, botón | Ver ese período | Aplica el rango a medida | | `src/components/movements/RangeSheet.jsx:187` |

## Nuevo / editar movimiento (TransactionFormModal)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal, título | Nuevo movimiento / Editar movimiento | Título del formulario | | `src/components/TransactionFormModal.jsx:437` |
| Modal, segmentado | Gasto / Ingreso | Tipo de movimiento | | `src/components/TransactionFormModal.jsx:454,455` |
| Modal, campo | Monto | Monto del movimiento | | `src/components/TransactionFormModal.jsx:463` |
| Modal, campo | Categoría / Elegir… / + Nueva categoría | Selector de categoría | | `src/components/TransactionFormModal.jsx:479,499,506` |
| Modal, campo (alta rápida) | ej: Comida, Transporte / ej: Sueldo, Freelance (placeholder) | Nombre de categoría nueva, según el tipo | | `src/components/TransactionFormModal.jsx:527` |
| Modal, botones (alta rápida) | Cancelar / Crear | Confirma o cancela la categoría nueva | | `src/components/TransactionFormModal.jsx:544,552` |
| Modal, error | No se pudo crear la categoría. | Falló crear la categoría desde el formulario | | `src/components/TransactionFormModal.jsx:391` |
| Modal, campo | ¿A qué cuenta? / ¿De qué cuenta? | Selector de cuenta, según ingreso o gasto | | `src/components/TransactionFormModal.jsx:565` |
| Modal, campo | Descripción / Opcional — ej: super, alquiler (placeholder) | Descripción libre del movimiento | | `src/components/TransactionFormModal.jsx:571,575` |
| Modal, ayuda | Se ve en la lista, al lado de la categoría. | Explica el campo Descripción | | `src/components/TransactionFormModal.jsx:580` |
| Modal, error | No se pudo guardar el movimiento. | Falló guardar | | `src/components/TransactionFormModal.jsx:409` |
| Modal, confirmación | ¿Eliminar este movimiento? Es permanente. | Confirma el borrado | | `src/components/TransactionFormModal.jsx:599` |
| Modal, botón | Eliminar movimiento | Abre la confirmación | | `src/components/TransactionFormModal.jsx:627` |
| Modal, error | No se pudo eliminar el movimiento. / No se pudo eliminar el conteo. | Falló eliminar (según si es un movimiento suelto o el ajuste de un conteo) | | `src/components/TransactionFormModal.jsx:428` |
| Modal (pata de transferencia entre cuentas), título | Transferencia enviada / Transferencia recibida | Título de solo lectura | | `src/components/TransactionFormModal.jsx:188` |
| Modal (parte de un conteo), título | {categoría} / Gasto / Ingreso | Título de solo lectura para el ajuste o reparto de un conteo | | `src/components/TransactionFormModal.jsx:275` |
| Modal (parte de un conteo), texto | Confirmando si es parte de un conteo… | Mientras se resuelve si el movimiento viene de un conteo | | `src/components/TransactionFormModal.jsx:296` |
| Modal (parte de un conteo), aviso | Esto lo escribió «Contar mi plata» el {fecha}. / , junto con {n} movimiento(s) más. Se sostienen entre sí, así que se borran juntos. | Explica el origen del movimiento de solo lectura | | `src/components/TransactionFormModal.jsx:158` |
| Modal (parte de un conteo), confirmación | ¿Eliminar este conteo? Se borra el movimiento que escribió / borran los {n} movimientos que escribió y el registro de lo que declaraste. Es permanente. Tus saldos vuelven a lo que la app calculaba antes de contar: volvé a contar tu plata para acomodarlos. | Confirma el borrado del conteo entero | | `src/components/TransactionFormModal.jsx:308` |
| Modal (parte de un conteo), botón | Eliminar el conteo | Abre la confirmación | | `src/components/TransactionFormModal.jsx:341` |
| Modal, error | No se pudo confirmar si esto es parte de un conteo. | Falló `getReconciliationOf` | | `src/components/TransactionFormModal.jsx:110` |
| Modal, error | No se pudo eliminar la transferencia. | Falló borrar una transferencia entre cuentas | | `src/components/TransactionFormModal.jsx:174` |

## Deudas

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Deudas, título | Deudas | Título de la pantalla | | `src/pages/Debts.jsx:179` |
| Pantalla Deudas, botón | Nueva deuda | Abre el alta de deuda | | `src/pages/Debts.jsx:185,218,243` |
| Pantalla Deudas, error | No se pudieron cargar las deudas. | Falló cargar | | `src/pages/Debts.jsx:153` |
| Pantalla Deudas, estado vacío | Todavía no registraste ninguna deuda | Sin ninguna deuda cargada | | `src/pages/Debts.jsx:208` |
| Pantalla Deudas, ayuda | Anotá lo que debés en dólares y registrá cada pago. El saldo baja solo, y los pagos no cuentan como gasto. | Ayuda del estado vacío | | `src/pages/Debts.jsx:209` |
| Resumen de deudas, etiqueta | Te queda por pagar | Encabezado del total de deudas activas | | `src/pages/Debts.jsx:227` |
| Resumen de deudas, línea | Pagaste {monto} de {monto} | Progreso de pago total | | `src/pages/Debts.jsx:233` (mismo patrón por deuda en `src/pages/Debts.jsx:94`) |
| Resumen de deudas, texto | No te queda nada por pagar. | Todas las deudas activas están saldadas | | `src/pages/Debts.jsx:265` |
| Sección de saldadas, botón | Saldadas ({n}) + / − | Expande/colapsa las deudas saldadas | | `src/pages/Debts.jsx:278` |
| Tarjeta de deuda, texto | Te queda por pagar / Saldada | Estado de la deuda bajo el saldo | | `src/pages/Debts.jsx:88` |
| Tarjeta de deuda, línea | Pagaste {monto} de {monto} · {%} | Progreso de la deuda | | `src/pages/Debts.jsx:94` |
| Tarjeta de deuda, botón | Registrar pago | Abre el alta de pago | | `src/pages/Debts.jsx:106` |
| Tarjeta de deuda, botón | Sin pagos / Ocultar pagos / Ver {n} pago(s) | Expande/colapsa los pagos de la deuda | | `src/pages/Debts.jsx:114-118` |
| Fila de pago | {fecha} · de afuera / sin tipo de cambio | Un pago, con su origen o su falta de tipo de cambio | | `src/pages/Debts.jsx:47,53` |

## Nueva / editar deuda (DebtFormModal)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal, título | Nueva deuda / Editar deuda | Título del formulario | | `src/components/DebtFormModal.jsx:73` |
| Modal, campo | ¿A quién le debés? / ej: Papá, Banco (placeholder) | Acreedor | | `src/components/DebtFormModal.jsx:89,93` |
| Modal, campo | ¿Cuánto pediste? | Monto original de la deuda | | `src/components/DebtFormModal.jsx:101` |
| Modal, ayuda | El monto original, en dólares. Los pagos se registran después, uno por uno. | Explica el monto original | | `src/components/DebtFormModal.jsx:114` |
| Modal, campo | ¿Cuándo empezó? | Fecha de inicio de la deuda | | `src/components/DebtFormModal.jsx:119` |
| Modal, error | No se pudo guardar la deuda. | Falló guardar | | `src/components/DebtFormModal.jsx:51` |
| Modal, confirmación | ¿Eliminar esta deuda? Es permanente. | Confirma el borrado | | `src/components/DebtFormModal.jsx:128` |
| Modal, botón | Eliminar deuda | Abre la confirmación | | `src/components/DebtFormModal.jsx:153` |
| Modal, error | No se pudo eliminar la deuda. | Falló eliminar (incluye el detalle "tiene N pagos", ver Patrones compartidos → UserError) | | `src/components/DebtFormModal.jsx:65` |

## Registrar / editar pago de deuda (DebtPaymentModal)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal, título | Pagar a {acreedor} / Editar pago | Título del formulario | | `src/components/DebtPaymentModal.jsx:146` |
| Modal, campo | Monto | Monto del pago (al editar) | | `src/components/DebtPaymentModal.jsx:163` |
| Modal, campo (`ExchangeRateField`) | ¿Cuánto pagaste? | Encabezado del monto al crear un pago nuevo | | `src/components/DebtPaymentModal.jsx:189` |
| Modal, campo | ¿Cuántos pesos pagaste? | Pregunta de pesos del tipo de cambio | | `src/components/DebtPaymentModal.jsx:192` |
| Modal, pregunta | ¿De dónde sale? | Origen del pago | | `src/components/DebtPaymentModal.jsx:200` |
| Modal, opción | De mi disponible | Origen: plata del día a día | | `src/components/DebtPaymentModal.jsx:19` |
| Modal, ayuda de opción | Pagaste con tu plata del día a día. Baja tu dinero disponible. | Explica "De mi disponible" | | `src/components/DebtPaymentModal.jsx:21` |
| Modal, ayuda de opción | Dólares que ya tenías. Baja la deuda, no toca tu dinero disponible. | Explica "De afuera" | | `src/components/DebtPaymentModal.jsx:25` |
| Modal, campo | ¿De qué cuenta? | Selector de cuenta (solo si el pago sale del disponible) | | `src/components/DebtPaymentModal.jsx:214` |
| Modal, aviso | Es más de lo que queda ({monto}). La deuda queda saldada, sin saldo a favor. | Pago mayor al saldo restante | | `src/components/DebtPaymentModal.jsx:224` |
| Modal, error | No se pudo guardar el pago. | Falló guardar | | `src/components/DebtPaymentModal.jsx:127` |
| Modal, confirmación | ¿Eliminar este pago? Es permanente. | Confirma el borrado | | `src/components/DebtPaymentModal.jsx:240` |
| Modal, botón | Eliminar pago | Abre la confirmación | | `src/components/DebtPaymentModal.jsx:267` |
| Modal, error | No se pudo eliminar el pago. | Falló eliminar | | `src/components/DebtPaymentModal.jsx:139` |

## Mi plata (cuentas del disponible)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Mi plata, título | Mi plata | Título de la pantalla (pestaña, ver Navegación) | | `src/pages/settings/Accounts.jsx:139` |
| Pantalla Mi plata, descripción | Dónde está la plata que contás como disponible: efectivo, billeteras, cuentas del banco. | Descripción bajo el título | | `src/pages/settings/Accounts.jsx:140` |
| Pantalla Mi plata, error | No se pudieron cargar las cuentas. | Falló cargar | | `src/pages/settings/Accounts.jsx:97` |
| Pantalla Mi plata, acción | Contar mi plata | Abre la reconciliación del disponible | | `src/pages/settings/Accounts.jsx:162` |
| Pantalla Mi plata, footer | Compará lo que la app calculó con lo que tenés de verdad, cuenta por cuenta. | Explica "Contar mi plata" | | `src/pages/settings/Accounts.jsx:161` |
| Pantalla Mi plata, acción | Transferir entre cuentas | Abre la transferencia entre cuentas | | `src/pages/settings/Accounts.jsx:166` |
| Pantalla Mi plata, footer | Mové plata de una cuenta a otra, sin cargar un gasto y un ingreso por separado. | Explica "Transferir entre cuentas" | | `src/pages/settings/Accounts.jsx:165` |
| Pantalla Mi plata, footer | La primera de la lista es la que viene elegida al cargar un movimiento — arrastrá con la manija para cambiar el orden. Tu dinero disponible total no depende de cómo las repartas. | Explica el orden de las cuentas de uso diario | | `src/pages/settings/Accounts.jsx:169` |
| Pantalla Mi plata, sección | Ahorro | Título del grupo de cuentas de ahorro | | `src/pages/settings/Accounts.jsx:178` |
| Pantalla Mi plata, botón | Nueva cuenta | Abre el alta de cuenta | | `src/pages/settings/Accounts.jsx:28` |
| Pantalla Mi plata, accesible | Reordenar {cuenta} | `aria-label` de la manija de arrastre | | `src/pages/settings/Accounts.jsx:58` |
| Pantalla Mi plata, footer | Cuánto te queda por pagar en total. | Explica la fila "Deudas" al pie | | `src/pages/settings/Accounts.jsx:195` |
| Pantalla Mi plata, error | No se pudo guardar el orden. | Falló reordenar cuentas | | `src/pages/settings/Accounts.jsx:118` (mismo mensaje para categorías en `Categories.jsx:219`) |
| Detalle de cuenta, sección | Saldo / Actual | Saldo actual de la cuenta | | `src/pages/settings/AccountDetail.jsx:232,234` |
| Detalle de cuenta, error | No se pudo cargar la cuenta. | Falló cargar el detalle | | `src/pages/settings/AccountDetail.jsx:113` |
| Detalle de cuenta, footer | Aportar y retirar mueven la plata entre esta cuenta y una de tu disponible, o de/hacia afuera de la app. | Explica las acciones (solo cuentas de ahorro) | | `src/pages/settings/AccountDetail.jsx:257` |
| Detalle de cuenta, botones | Aportar / Retirar | Mueven plata desde/hacia una cuenta de ahorro | | `src/pages/settings/AccountDetail.jsx:258,259` |
| Detalle de cuenta, sección | Nombre | Renombrar la cuenta | | `src/pages/settings/AccountDetail.jsx:265` |
| Detalle de cuenta, footer | Renombrarla no cambia ningún saldo: los movimientos siguen apuntando a esta misma cuenta. | Explica renombrar | | `src/pages/settings/AccountDetail.jsx:266` |
| Detalle de cuenta, error | No se pudo renombrar la cuenta. | Falló renombrar | | `src/pages/settings/AccountDetail.jsx:147` |
| Detalle de cuenta, sección | Moneda | Moneda de la cuenta | | `src/pages/settings/AccountDetail.jsx:290,297` |
| Detalle de cuenta, footer (con movimientos) | Ya tiene movimientos, así que la moneda queda fija: cambiarla dejaría la cuenta con dos monedas mezcladas y un saldo sin significado. | Explica por qué la moneda quedó fija | | `src/pages/settings/AccountDetail.jsx:291` |
| Detalle de cuenta, footer (sin movimientos) | Se elige libre hasta el primer movimiento; después queda fija. | Explica que la moneda todavía se puede elegir | | `src/pages/settings/AccountDetail.jsx:298` |
| Detalle de cuenta, valor | Pesos (ARS) / Dólares (USD) | Nombre completo de la moneda | | `src/pages/settings/AccountDetail.jsx:32` |
| Detalle de cuenta, error | No se pudo cambiar la moneda. | Falló cambiar la moneda | | `src/pages/settings/AccountDetail.jsx:160` |
| Detalle de cuenta, switch | Cuenta de ahorro | `is_savings` | | `src/pages/settings/AccountDetail.jsx:307` (repite en `AccountCreateForm.jsx:88`) |
| Detalle de cuenta, footer | El ahorro no cuenta como plata disponible para el día a día, pero sí suma al total. | Explica el switch de ahorro | | `src/pages/settings/AccountDetail.jsx:306` |
| Detalle de cuenta, error | No se pudo cambiar el tipo de cuenta. | Falló cambiar `is_savings` | | `src/pages/settings/AccountDetail.jsx:172` |
| Detalle de cuenta, confirmación | ¿Eliminar «{cuenta}»? | Confirma el borrado de la cuenta | | `src/pages/settings/AccountDetail.jsx:319` |
| Detalle de cuenta, botón de confirmación | Sí, vaciar y eliminar / Sí, eliminar | Según si la cuenta tiene saldo | | `src/pages/settings/AccountDetail.jsx:335` |
| Detalle de cuenta, ayuda (con saldo) | Tiene {monto}. Antes de eliminarla, ese saldo se registra como un ajuste de saldo (no como un gasto) para dejarla en cero, y recién ahí se elimina. | Explica el vaciado previo al borrado | | `src/pages/settings/AccountDetail.jsx:343` |
| Detalle de cuenta, ayuda (sin saldo) | Si tiene movimientos, dejará de ofrecerse en vez de eliminarse. | Explica el caso de "no se puede borrar, se oculta" | | `src/pages/settings/AccountDetail.jsx:349` |
| Detalle de cuenta, botón | Eliminar cuenta | Abre la confirmación | | `src/pages/settings/AccountDetail.jsx:357` |
| Detalle de cuenta, error | No se pudo eliminar la cuenta. | Falló eliminar | | `src/pages/settings/AccountDetail.jsx:197` |
| Detalle de cuenta, historial, estado vacío | Todavía no hay movimientos. | Sin ningún movimiento en la cuenta | | `src/components/account/AccountHistory.jsx:52` |
| Alta de cuenta, campo | ej: Mercado Pago, Cuenta DNI (placeholder) | Nombre de la cuenta nueva | | `src/components/form/AccountCreateForm.jsx:28` |
| Alta de cuenta, campo | Moneda / Pesos / Dólares | Moneda de la cuenta nueva (solo en Mi plata) | | `src/components/form/AccountCreateForm.jsx:79` |
| Alta de cuenta, botones | Cancelar / Crear | Confirma o cancela el alta | | `src/components/form/AccountCreateForm.jsx:96,101` |
| Alta de cuenta, error | No se pudo crear la cuenta. | Falló crear | | `src/components/form/AccountCreateForm.jsx:47` |
| Selector de cuenta, opción | Sin cuentas / Sin cuenta | Sin ninguna cuenta creada, o dejar la operación sin asignar | | `src/components/form/AccountField.jsx:50` |
| Selector de cuenta, opción | + Nueva cuenta | Abre el alta al vuelo | | `src/components/form/AccountField.jsx:56` |

## Contar mi plata (LiquidModal — reconciliación)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal, título | Contar mi plata | Título del formulario | | `src/components/LiquidModal.jsx:216` |
| Modal, texto de carga | Calculando cuánto tenés según la app… | Mientras se calcula el disponible | | `src/components/LiquidModal.jsx:232` |
| Modal, texto | Según lo que fuiste cargando, la app calcula que tenés {monto(s)} en total. Contá cada cuenta y escribí cuánto hay de verdad: la diferencia se corrige sola. | Explica qué hace la pantalla | | `src/components/LiquidModal.jsx:241` |
| Modal, fila de cuenta | Según la app: {monto} | Monto calculado por la app para esa cuenta | | `src/components/LiquidModal.jsx:35` |
| Modal, fila de cuenta | {diferencia} respecto de lo que calculó la app. | Diferencia entre lo calculado y lo declarado | | `src/components/LiquidModal.jsx:51` |
| Modal, fila de cuenta | Coincide: no hay nada que corregir. | Lo declarado es igual a lo calculado | | `src/components/LiquidModal.jsx:58` |
| Modal, fila de cuenta | Reconciliada el {fecha}. | Última vez que se contó esta cuenta | | `src/components/LiquidModal.jsx:62` |
| Modal, aviso | Además hay {monto} en movimientos sin cuenta asignada. Suman a tu total, pero no se reconcilian acá: asignales una cuenta desde el movimiento. | Explica el balde "sin cuenta" | | `src/components/LiquidModal.jsx:263` |
| Modal, sección | Ahorro | Cuentas de ahorro a reconciliar, aparte del disponible | | `src/components/LiquidModal.jsx:276` |
| Modal, resumen | Todo coincide con lo que calculó la app: no se registra ningún movimiento. | Ningún cambio a registrar | | `src/components/LiquidModal.jsx:85` |
| Modal, resumen | El total {en pesos/en dólares} no cambia: la plata solo se reparte entre tus cuentas y no se registra ningún gasto. | El neto de esa moneda es cero, solo hay reparto | | `src/components/LiquidModal.jsx:95` |
| Modal, resumen | Faltan / Sobran {monto} en total: se registra un gasto / un ingreso por esa diferencia. | El neto de esa moneda no es cero | | `src/components/LiquidModal.jsx:100` |
| Modal, resumen | El resto es plata que estaba en otra cuenta: se anota como transferencia y no cuenta como gasto ni como ingreso. | Explica el reparto además del neto | | `src/components/LiquidModal.jsx:107` |
| Modal, texto | Las cuentas que dejes vacías quedan como están: no se reconcilian ni generan ajuste. | Aclaración final del formulario | | `src/components/LiquidModal.jsx:292` |
| Modal, error | No se pudo guardar la reconciliación. | Falló guardar | | `src/components/LiquidModal.jsx:209` |

## Transferir entre cuentas (AccountTransferModal)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal, título | Transferir entre cuentas | Título del formulario | | `src/components/account/AccountTransferModal.jsx:100` |
| Modal, campo | Desde / Elegir… | Cuenta de origen | | `src/components/account/AccountTransferModal.jsx:116,123` |
| Modal, campo | Hasta / Elegir… | Cuenta de destino | | `src/components/account/AccountTransferModal.jsx:135,142` |
| Modal, campo | Monto | Monto de la transferencia (mismas monedas) | | `src/components/account/AccountTransferModal.jsx:155` |
| Modal, aviso | Estas dos cuentas están en monedas que la app no sabe convertir automáticamente. Por ahora, transferí entre cuentas en pesos y dólares, o entre dos de la misma moneda. | Par de monedas no soportado | | `src/components/account/AccountTransferModal.jsx:181` |
| Modal, error | No se pudo guardar la transferencia. | Falló crear la transferencia | | `src/components/account/AccountTransferModal.jsx:91` |

## Aportar / retirar de una cuenta de ahorro (SavingsMovementModal)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Modal, título | Aportar a {cuenta} / Retirar de {cuenta} | Título del formulario | | `src/components/account/SavingsMovementModal.jsx:25,35` |
| Modal, pregunta | ¿De dónde sale? / ¿A dónde va? | Origen o destino del movimiento | | `src/components/account/SavingsMovementModal.jsx:27,37` |
| Modal, opción | De mi disponible | Origen: sale de una cuenta del día a día | | `src/components/account/SavingsMovementModal.jsx:29` |
| Modal, ayuda de opción | Sale de una cuenta de tu disponible y la baja. | Explica "De mi disponible" al aportar | | `src/components/account/SavingsMovementModal.jsx:29` |
| Modal, opción | A mi disponible | Destino: entra a una cuenta del día a día | | `src/components/account/SavingsMovementModal.jsx:39` |
| Modal, ayuda de opción | Entra a una cuenta de tu disponible y la sube. | Explica "A mi disponible" al retirar | | `src/components/account/SavingsMovementModal.jsx:39` |
| Modal, campo | ¿De qué cuenta? / ¿A qué cuenta? | Selector de cuenta de uso diario | | `src/components/account/SavingsMovementModal.jsx:33,43` |
| Modal, aviso | Esta cuenta y «{cuenta}» están en monedas que la app no sabe convertir automáticamente. Por ahora, elegí una cuenta en pesos o en dólares. | Par de monedas no soportado | | `src/components/account/SavingsMovementModal.jsx:241` |
| Modal, error | No se pudo guardar el {aporte/retiro}. | Falló guardar | | `src/components/account/SavingsMovementModal.jsx:154` |

## Ajustes (pantalla raíz)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Ajustes, título | Ajustes | Título de la pantalla (pestaña, ver Navegación) | | `src/pages/settings/SettingsHome.jsx:23` |
| Pantalla Ajustes, sección | La app | Agrupa "Apariencia" | | `src/pages/settings/SettingsHome.jsx:26` |
| Pantalla Ajustes, fila | Apariencia | Va a Apariencia; valor mostrado: "{tema} · {color}" | | `src/pages/settings/SettingsHome.jsx:29` |
| Pantalla Ajustes, sección | Tus datos | Agrupa "Categorías" y "Exportar mis datos" | | `src/pages/settings/SettingsHome.jsx:34` |
| Pantalla Ajustes, fila | Categorías | Va a Categorías | | `src/pages/settings/SettingsHome.jsx:35` |
| Pantalla Ajustes, fila | Exportar mis datos | Va a Exportar | | `src/pages/settings/SettingsHome.jsx:36` |
| Pantalla Ajustes, sección | Administración | Solo visible para el admin | | `src/pages/settings/SettingsHome.jsx:40` |
| Pantalla Ajustes, footer | Solo vos ves esta sección. | Aclara que la sección de Administración es privada | | `src/pages/settings/SettingsHome.jsx:40` |
| Pantalla Ajustes, fila | Invitaciones | Va a la administración de invitaciones (solo admin) | | `src/pages/settings/SettingsHome.jsx:41` |
| Pantalla Ajustes, footer | Las cuentas se crean con un link de invitación: no hay registro público ni cambio de email desde acá. | Explica por qué no hay cambio de email | | `src/pages/settings/SettingsHome.jsx:45` |
| Pantalla Ajustes, fila | Email | Muestra el email de la cuenta | | `src/pages/settings/SettingsHome.jsx:46` |
| Pantalla Ajustes, botón | Cerrar sesión | Cierra la sesión | | `src/pages/settings/SettingsHome.jsx:47` |
| Pantalla Ajustes, pie | versión {n} (`{n}`: `APP_VERSION`) | Marca de versión de la app | | `src/pages/settings/SettingsHome.jsx:51` |

## Categorías

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Categorías, título | Categorías | Título de la pantalla | | `src/pages/settings/Categories.jsx:263` |
| Pantalla Categorías, descripción | Con qué etiquetás tus gastos e ingresos al cargarlos. | Descripción bajo el título | | `src/pages/settings/Categories.jsx:264` |
| Pantalla Categorías, sección | Gastos / Ingresos | Los dos grupos de categorías | | `src/pages/settings/Categories.jsx:285,286` |
| Pantalla Categorías, footer | Arrastrá con la manija para cambiar el orden en que aparecen al cargar un movimiento. Al eliminar una que ya tenga movimientos, esos movimientos la siguen mostrando. | Explica el orden y el borrado | | `src/pages/settings/Categories.jsx:241` |
| Pantalla Categorías, botón | Nueva categoría | Abre el alta de categoría | | `src/pages/settings/Categories.jsx:52` |
| Pantalla Categorías, campo | ej: Comida, Transporte / ej: Sueldo, Freelance (placeholder) | Nombre de la categoría nueva, según el grupo | | `src/pages/settings/Categories.jsx:63` |
| Pantalla Categorías, error | No se pudo crear la categoría. | Falló crear | | `src/pages/settings/Categories.jsx:39` |
| Pantalla Categorías, badge | del sistema | Marca una categoría del sistema, no editable | | `src/pages/settings/Categories.jsx:140` |
| Pantalla Categorías, accesible | Reordenar {categoría} / Eliminar {categoría} | `aria-label` de la manija y del botón eliminar | | `src/pages/settings/Categories.jsx:153,167` |
| Pantalla Categorías, botón | Eliminar | Borra o esconde la categoría | | `src/pages/settings/Categories.jsx:170` |
| Pantalla Categorías, confirmación | ¿Eliminar «{categoría}»? | Confirma el borrado/ocultado | | `src/pages/settings/Categories.jsx:108` |
| Pantalla Categorías, ayuda | Si ningún movimiento la usa, se elimina para siempre. | Explica el borrado real vs. oculto | | `src/pages/settings/Categories.jsx:128` |
| Pantalla Categorías, aviso | La categoría tenía movimientos: dejó de ofrecerse, y esos movimientos la siguen mostrando. | Cuando el borrado cae a "ocultar" en vez de eliminar | | `src/pages/settings/Categories.jsx:209` |
| Pantalla Categorías, error | No se pudo eliminar la categoría. | Falló eliminar/ocultar | | `src/pages/settings/Categories.jsx:98` |
| Pantalla Categorías, error | No se pudieron cargar las categorías. | Falló cargar la lista | | `src/pages/settings/Categories.jsx:188` (mismo mensaje usado también al abrir el alta de gasto en Inicio, ver `src/pages/Dashboard.jsx:389`) |
| Detalle de categoría, título | Categoría (mientras carga) / {nombre} | Título de la pantalla | | `src/pages/settings/CategoryDetail.jsx:56,74` |
| Detalle de categoría, error | No se pudo cargar la categoría. | Falló cargar el detalle | | `src/pages/settings/CategoryDetail.jsx:29` |
| Detalle de categoría, footer (sistema) | Es una categoría del sistema: la usa la reconciliación del dinero disponible para registrar los ajustes. No se puede renombrar ni eliminar. | Explica por qué una categoría de sistema es de solo lectura | | `src/pages/settings/CategoryDetail.jsx:79` |
| Detalle de categoría, campo | Nombre | Nombre de la categoría | | `src/pages/settings/CategoryDetail.jsx:87` |
| Detalle de categoría, campo | Tipo | Gasto o Ingreso, de solo lectura | | `src/pages/settings/CategoryDetail.jsx:82,100` |
| Detalle de categoría, valor | Gasto / Ingreso | Valor del campo Tipo | | `src/pages/settings/CategoryDetail.jsx:70` |
| Detalle de categoría, botón | Guardar | Renombrar la categoría | | `src/pages/settings/CategoryDetail.jsx:107` |
| Detalle de categoría, error | No se pudo renombrar la categoría. | Falló renombrar | | `src/pages/settings/CategoryDetail.jsx:48` |

## Exportar mis datos

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Exportar, título | Exportar mis datos | Título de la pantalla | | `src/pages/settings/ExportData.jsx:78` |
| Pantalla Exportar, descripción | Un archivo por cada cosa, para abrir en una planilla. | Descripción bajo el título | | `src/pages/settings/ExportData.jsx:79` |
| Pantalla Exportar, error | No se pudieron cargar tus datos. | Falló contar las filas a exportar | | `src/pages/settings/ExportData.jsx:68` |
| Pantalla Exportar, sección | Archivos | Título de la lista de descargas | | `src/pages/settings/ExportData.jsx:95` |
| Pantalla Exportar, footer | Se descargan en formato CSV, con las fechas en dd/mm/aaaa y los montos sin separador de miles para que la planilla los pueda sumar. Desde el celular se abre la hoja de compartir, para guardarlos en Archivos o mandarlos por mail. | Explica el formato de los archivos | | `src/pages/settings/ExportData.jsx:96` |
| Pantalla Exportar, fila | Movimientos / gastos e ingresos | Descarga de gastos e ingresos | | `src/pages/settings/ExportData.jsx:99,100` |
| Pantalla Exportar, fila | Inversiones / aportes y retiros | Descarga de operaciones del portafolio | | `src/pages/settings/ExportData.jsx:107,108` |
| Pantalla Exportar, texto | Contando… / {n} {descripción} | Cantidad de filas de cada archivo | | `src/pages/settings/ExportData.jsx:34` |
| Pantalla Exportar, botón | Descargar / Generando… | Genera y descarga el CSV | | `src/pages/settings/ExportData.jsx:43` |
| Pantalla Exportar, error | No se pudo generar el archivo. | Falló armar o descargar el CSV | | `src/pages/settings/ExportData.jsx:47` |

## Apariencia

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Apariencia, título | Apariencia | Título de la pantalla | | `src/pages/settings/Appearance.jsx:30` |
| Pantalla Apariencia, descripción | Cómo se ve la app en este dispositivo. | Descripción bajo el título | | `src/pages/settings/Appearance.jsx:30` |
| Pantalla Apariencia, sección | Tema | Selector de tema claro/oscuro/automático | | `src/pages/settings/Appearance.jsx:32` |
| Pantalla Apariencia, footer | Con «Automático» la app sigue al teléfono: se pone oscura cuando el sistema se pone oscuro. | Explica el modo automático | | `src/pages/settings/Appearance.jsx:33` |
| Pantalla Apariencia, opciones de tema | (nombres de `themes`, ver `src/lib/theme.js`) | Opciones del segmentado de tema | | `src/pages/settings/Appearance.jsx:37` |
| Pantalla Apariencia, sección | Color de la app | Selector de color de acento | | `src/pages/settings/Appearance.jsx:45` |
| Pantalla Apariencia, footer | Se guarda en este dispositivo. Los verdes y rojos de ganancias, ingresos y gastos no cambian: ahí el color es el significado. | Explica el alcance del color elegido | | `src/pages/settings/Appearance.jsx:46` |
| Pantalla Apariencia, opciones de color | (nombres de `accents`, ver `src/lib/theme.js`) | Opciones del selector de color | | `src/pages/settings/Appearance.jsx:49` |

## Invitaciones (solo admin)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Invitaciones, título | Invitaciones | Título de la pantalla | | `src/pages/settings/Invitations.jsx:147` |
| Pantalla Invitaciones, descripción | Generá un link para que alguien se registre. Sirve una sola vez y vence a los 7 días. | Descripción bajo el título | | `src/pages/settings/Invitations.jsx:148` |
| Pantalla Invitaciones, aviso (link nuevo) | Compartí este link — sirve una sola vez y vence en 7 días. | Aviso al generar un link nuevo | | `src/pages/settings/Invitations.jsx:47` |
| Pantalla Invitaciones, botones | Copiar link / Copiado | Copia el link generado al portapapeles | | `src/pages/settings/Invitations.jsx:51` |
| Pantalla Invitaciones, botón | Listo | Cierra el aviso del link recién generado | | `src/pages/settings/Invitations.jsx:53` |
| Pantalla Invitaciones, botón | Generar link | Crea una invitación nueva | | `src/pages/settings/Invitations.jsx:163` |
| Pantalla Invitaciones, error | No se pudo generar la invitación. | Falló crear el link | | `src/pages/settings/Invitations.jsx:129` |
| Pantalla Invitaciones, error | No se pudieron cargar las invitaciones. | Falló cargar la lista | | `src/pages/settings/Invitations.jsx:105` |
| Pantalla Invitaciones, estado vacío | Todavía no generaste ninguna invitación. | Sin ninguna invitación creada | | `src/pages/settings/Invitations.jsx:169` |
| Pantalla Invitaciones, sección | Generadas | Lista de invitaciones ya creadas | | `src/pages/settings/Invitations.jsx:171` |
| Pantalla Invitaciones, estado (espacio acotado: chip/label) | Vigente / Usada / Vencida / Anulada | Estado de una invitación | | `src/pages/settings/Invitations.jsx:17-20` |
| Pantalla Invitaciones, detalle | Usada por {email} el {fecha} | Detalle de una invitación usada | | `src/pages/settings/Invitations.jsx:65` |
| Pantalla Invitaciones, detalle | Anulada el {fecha} | Detalle de una invitación anulada | | `src/pages/settings/Invitations.jsx:67` |
| Pantalla Invitaciones, detalle | Venció el {fecha} | Detalle de una invitación vencida | | `src/pages/settings/Invitations.jsx:69` |
| Pantalla Invitaciones, detalle | Vence el {fecha} | Detalle de una invitación vigente | | `src/pages/settings/Invitations.jsx:70` |
| Pantalla Invitaciones, botón | Anular | Revoca una invitación vigente | | `src/pages/settings/Invitations.jsx:84` |
| Pantalla Invitaciones, error | No se pudo anular la invitación. | Falló revocar | | `src/pages/settings/Invitations.jsx:140` |

## Objetivo (en construcción, sin acceso desde la navegación)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Pantalla Objetivo, título | Objetivo | Título de la pantalla (ruta `/objetivo`, no enlazada desde ningún lado de la navegación) | | `src/pages/Goal.jsx:12` |
| Pantalla Objetivo, descripción | Cuánto te falta para la independencia financiera. | Descripción bajo el título | | `src/pages/Goal.jsx:13` |
| Pantalla Objetivo, estado | Todavía en construcción | Título del aviso de función pendiente | | `src/pages/Goal.jsx:17` |
| Pantalla Objetivo, texto | Acá va a estar tu número: cuánto capital necesitás para vivir de tus inversiones, cuánto llevás, y en cuántos años llegás al ritmo al que venís aportando. | Explica qué va a mostrar esta pantalla cuando exista | | `src/pages/Goal.jsx:19` |

## Patrones compartidos entre formularios (FormSheet y piezas comunes)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Encabezado de todo modal de formulario (espacio acotado: botón de 68px) | Cancelar | Cierra el modal sin guardar | | `src/components/FormSheet.jsx:127` |
| Botón de acción por default de casi todos los modales | Guardar / Guardando… | Envía el formulario (excepciones con verbo propio: "Liquidar", "Crear", "Crear cuenta", "Crear grupo") | | Repetido en: `AssetFormModal.jsx:167`, `ValuationModal.jsx:87`, `ContributionFormModal.jsx:390`, `TransferFormModal.jsx:238`, `DebtFormModal.jsx:82`, `DebtPaymentModal.jsx:155`, `AccountTransferModal.jsx:109`, `SavingsMovementModal.jsx:172`, `LiquidModal.jsx:225`, `TransactionFormModal.jsx:447`, y los botones de renombrar en `CategoryDetail.jsx:105`, `AccountDetail.jsx:280`, `AssetTypeDetail.jsx:298` |
| Confirmación de borrado permanente | No / Sí, eliminar | Botones de confirmación (borrado real) | | Repetido en: `ContributionFormModal.jsx:515,519`, `TransactionFormModal.jsx:601,609`, `DebtFormModal.jsx:130,138`, `DebtPaymentModal.jsx:243,250`, `Categories.jsx:112,120`, `AssetTypeDetail.jsx:412,419` (variante "Sí, archivar"), `AccountDetail.jsx:322,329` (variante "Sí, vaciar y eliminar") |
| Confirmación de archivado (reversible) | No / Sí, archivar | Botones de confirmación (archivar) | | `AssetFormModal.jsx:275,281`, `AssetTypeDetail.jsx:412,419` |
| Texto de carga genérico | Cargando… | Estado de carga de una lista o pantalla | | Repetido en: `Portfolio.jsx:161`, `AssetTypes.jsx:90`, `AssetTypeDetail.jsx:255,310`, `Categories.jsx:282`, `Accounts.jsx:158`, `AccountDetail.jsx:206`, `Invitations.jsx:167`, `Movements.jsx:628`, `Debts.jsx:194`, `AssetHistory.jsx:100`, `AccountHistory.jsx:72`, `Login.jsx`/`Register.jsx`/`ResetPassword.jsx` (`sr-only`, "Cargando") |
| Botón de reintento tras un error | Reintentar | Reintenta la última carga fallida | | Repetido en decenas de pantallas (Dashboard, Portfolio, Movements, Debts, Accounts, AssetTypes, Categories, ExportData, InstrumentPicker, ExpensesBlock, PortfolioEvolutionChart) |
| Texto de ayuda de "qué falta" | Falta: {campo(s)} (`{campo(s)}`: lista de MissingHint, ej. "monto y categoría") | Dice qué falta para poder guardar | | `src/components/form/MissingHint.jsx:9`, usado por todos los formularios de alta/edición |
| Campo de fecha colapsado | Fecha / Hoy · cambiar / {fecha} · cambiar / Elegir fecha | Fila de fecha compacta hasta que se toca "cambiar" | | `src/components/form/CollapsedDateField.jsx:34,40` — usado en casi todos los formularios de operación |
| Campo de fecha con etiqueta propia | ¿Cuándo empezó? | Variante de CollapsedDateField para el alta de deuda | | `src/components/DebtFormModal.jsx:119` |
| Tipo de cambio, fila colapsada | Tipo de cambio | Encabezado del campo de cotización | | `src/components/contribution/ExchangeRateField.jsx:113,127` |
| Tipo de cambio, botones | Cambiar / Cargar tipo de cambio | Expande el campo para editar la tasa | | `src/components/contribution/ExchangeRateField.jsx:117` |
| Tipo de cambio, botón | Volver a lo guardado / Volver al MEP de hoy / Dejarlo sin tipo de cambio | Descarta el valor manual y vuelve al default | | `src/components/contribution/ExchangeRateField.jsx:145,243,362,517` |
| Tipo de cambio, ayuda | Buscando cotización… | Mientras se pide el MEP del día | | `src/components/contribution/ExchangeRateField.jsx:106` |
| Tipo de cambio (edición), ayuda | El que quedó guardado con esta operación. Son {monto}. / Esta operación se guardó sin tipo de cambio. Podés cargarlo ahora; si no lo tocás, se queda sin ninguno. | Explica la tasa al editar una operación existente | | `src/components/contribution/ExchangeRateField.jsx:232` |
| Tipo de cambio (edición), ayuda expandida | A cuántos pesos por dólar se registró esta operación. {Son {monto}.} | Ayuda al expandir el campo en modo edición | | `src/components/contribution/ExchangeRateField.jsx:238` |
| Tipo de cambio (monto fijo por otro campo), ayuda | No se pudo traer la cotización de hoy. Cargala a mano (o escribí los pesos) para poder guardar. / No hace falta para esta operación. | Falló pedir el MEP del día | | `src/components/contribution/ExchangeRateField.jsx:355` |
| Tipo de cambio (monto fijo), ayuda | El que pusiste vos para esta operación. / El MEP de hoy. Si compraste a otro precio, cambialo (o escribí los pesos). | Explica de dónde sale la tasa mostrada | | `src/components/contribution/ExchangeRateField.jsx:356-358` |
| Tipo de cambio (monto fijo), ayuda expandida | A cuántos pesos por dólar hiciste esta operación. | Ayuda al expandir el campo | | `src/components/contribution/ExchangeRateField.jsx:360` |
| Tipo de cambio (monto y tasa juntos), ayuda | Cargá el que sepas: el otro se calcula con el tipo de cambio de abajo. / Sin tipo de cambio no se puede pasar de uno al otro: cargá los dólares, o poné la cotización abajo. | Explica el par pesos/dólares vinculado | | `src/components/contribution/ExchangeRateField.jsx:499` |
| Tipo de cambio, pregunta de ambigüedad | Cambiaste el tipo de cambio, así que uno de los dos montos ya no cuadra. ¿Cuál está bien? | Pregunta al cambiar la tasa con los dos montos ya cargados | | `src/components/contribution/ExchangeRateField.jsx:184` |
| Tipo de cambio, opciones de la pregunta | Los pesos / Los dólares | Elige cuál de los dos montos se conserva | | `src/components/contribution/ExchangeRateField.jsx:164,172` |
| Tipo de cambio, ayuda de la elección | Dejamos los pesos como los cargaste y recalculamos los dólares. / Dejamos los dólares como los cargaste y recalculamos los pesos. | Explica qué pasa según la elección | | `src/components/contribution/ExchangeRateField.jsx:189` |
| Rendimiento (`Gain`), formato | +{monto} ({%}) / −{monto} ({%}) | Ganancia o pérdida con signo y porcentaje | | `src/components/Gain.jsx:25` — usado en Portfolio, AssetGroup, AssetDetail, PortfolioEvolutionChart |
| Explicación de rendimiento acumulado (botón "i") | Cuánto ganaste o perdiste sobre todo lo que aportaste, contando absolutamente todo lo que tenés invertido (incluidos activos archivados o que no buscan rendimiento) — por eso puede no coincidir con el "Rendimiento" de Inversiones, que mide un grupo más acotado. No tiene en cuenta en qué momento pusiste cada aporte. | Explica el % del gráfico de evolución | | `src/components/PortfolioEvolutionChart.jsx:254` |
| Gráfico de evolución, selector de rango (espacio acotado: 3 opciones) | 3 meses / 1 año / Todo | Rango del gráfico de evolución del portafolio | | `src/components/PortfolioEvolutionChart.jsx:25-27` |
| Gráfico de evolución, estado vacío | Todavía no hay suficientes puntos para graficar este rango. | Menos de 2 puntos en el rango elegido | | `src/components/PortfolioEvolutionChart.jsx:81` |
| Gráfico de evolución, aviso | «{activo}» tiene una valuación vieja, así que no podemos calcular cuánto ganaste. / {n} activos tienen una valuación vieja, así que no podemos calcular cuánto ganaste. | Oculta el % cuando hay valuaciones desactualizadas | | `src/components/PortfolioEvolutionChart.jsx:218` |
| Gráfico de evolución, botón | Actualizar valuación | Lleva a Inversiones a actualizar la valuación | | `src/components/PortfolioEvolutionChart.jsx:226` |
| Gráfico de evolución, etiquetas | Aportado acumulado / Aportado a hoy / Valor del portafolio / Rendimiento acumulado | Encabezados de las dos tarjetas del gráfico | | `src/components/PortfolioEvolutionChart.jsx:187,197,207,233` |
| Bloque de gastos (Inicio), etiquetas | Gastos del mes / Últimos 12 meses (USD) | Encabezados del bloque de gastos de Inicio | | `src/components/ExpensesBlock.jsx:163,227` |
| Bloque de gastos, comparación | {%} más / menos que en {mes} a esta altura, en pesos | Compara el gasto del mes con el mes anterior a la misma altura | | `src/components/ExpensesBlock.jsx:166` |
| Bloque de gastos, estado vacío | Sin gastos este mes. | Sin ningún gasto en el mes actual | | `src/components/ExpensesBlock.jsx:179` |
| Bloque de gastos, error | No se pudieron cargar los gastos. | Falló cargar gastos de Inicio | | `src/components/ExpensesBlock.jsx:80` |
| Bloque de gastos, estado vacío | Todavía no cargaste ningún gasto. Cuando registres el primero, acá vas a ver en qué se te va la plata. | Sin ningún gasto en los últimos 12 meses | | `src/components/ExpensesBlock.jsx:140` |
| Bloque de gastos, aviso | No se pudo convertir tus gastos a dólares. | Falló la serie en USD (gráfico secundario) | | `src/components/ExpensesBlock.jsx:213` |

## PWA (manifest e `index.html`)

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Nombre de la app al instalar / pantalla de inicio | Finanzas | `name` y `short_name` del manifest, y `apple-mobile-web-app-title` | | `public/manifest.webmanifest:2,3`, `index.html:39` |
| Descripción de la app (buscadores, ficha de instalación) | Finanzas personales con enfoque FIRE: el dinero disponible, el portafolio en dólares y las deudas, siempre por separado. | `description` del manifest y meta description del HTML | | `public/manifest.webmanifest:4`, `index.html:10` |
| Pestaña del navegador | Finanzas | `<title>` de `index.html` | | `index.html:7` |

## Categorías, grupos y cuenta sembrados al crear una cuenta

Estos nombres no son textos de interfaz, sino datos que la base siembra para todo usuario nuevo (trigger `handle_new_user`) y que el usuario ve y puede renombrar o (en las no-sistema) eliminar desde el primer uso.

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Categorías de gasto sembradas | Comida / Salidas / Auto / Transporte / Ropa / Suscripciones / Regalos / Otros | Categorías de gasto iniciales, editables y borrables | | `supabase/migrations/0041_reconcile_netting.sql:114-121` |
| Categorías de ingreso sembradas | Sueldo / Otros ingresos | Categorías de ingreso iniciales | | `supabase/migrations/0041_reconcile_netting.sql:122-123` |
| Categoría del sistema (gasto e ingreso) | Ajuste de saldo | El neto real de un conteo del disponible (ver `lib/systemCategories.js`) | | `supabase/migrations/0041_reconcile_netting.sql:125,126` |
| Categoría del sistema (gasto e ingreso) | Movimiento de ahorro | Aportes/retiros "de afuera" de una cuenta de ahorro | | `supabase/migrations/0041_reconcile_netting.sql:127,128` |
| Categoría del sistema (gasto e ingreso) | Transferencia de cuenta | Transferencias entre cuentas y el reparto de un conteo | | `supabase/migrations/0041_reconcile_netting.sql:129,130` |
| Grupos de activos sembrados | Cripto / CEDEARs / Renta fija / Fondos / Efectivo USD | Los cinco grupos iniciales de Inversiones | | `supabase/migrations/0041_reconcile_netting.sql:132-136` |
| Cuenta del disponible sembrada | Efectivo | La primera cuenta de "Mi plata" de todo usuario nuevo | | `supabase/migrations/0041_reconcile_netting.sql:139` |
| Descripción de transacción (generada por la base) | Transferencia a {cuenta} / Transferencia de {cuenta} | Descripción de cada pata de una transferencia entre cuentas | | `supabase/migrations/0041_reconcile_netting.sql:267,268` |
| Descripción de transacción (generada por la base) | Saldo inicial | Ajuste de la primera vez que se reconcilia una cuenta | | `supabase/migrations/0041_reconcile_netting.sql:471` |
| Descripción de transacción (generada por la base) | Reconciliación de disponible | Ajuste de una reconciliación posterior a la primera | | `supabase/migrations/0041_reconcile_netting.sql:472` |
| Descripción de transacción (generada por la base) | Reparto entre cuentas | El reparto (no-gasto) de un conteo, cuando corresponde | | `supabase/migrations/0041_reconcile_netting.sql:490` |

## Mensajes de error transversales (`describeError`)

Estos mensajes reemplazan al texto crudo de Postgres/Supabase cuando `FormError` recibe un error sin traducir. Aparecen como la segunda línea (gris, chica) debajo del mensaje propio de cada pantalla.

| Dónde se ve | Texto actual | Para qué está | Texto nuevo | Referencia |
|---|---|---|---|---|
| Detalle de cualquier error, offline | No se pudo conectar con el servidor. Revisá tu conexión a internet. | `fetch` falló por falta de conexión | | `src/lib/errors.js:82` |
| Detalle de error de base (FK) | Hay otra información guardada que depende de esto, así que no se puede eliminar. | Código Postgres 23503 (borrado rechazado por una referencia) | | `src/lib/errors.js:43` |
| Detalle de error de base (duplicado) | Ya existe algo cargado con esos mismos datos. | Código Postgres 23505 | | `src/lib/errors.js:44` |
| Detalle de error de base (CHECK) | Alguno de los datos quedó fuera de lo que la app permite (por ejemplo, un monto en cero o negativo). | Código Postgres 23514 | | `src/lib/errors.js:45` |
| Detalle de error de base (NOT NULL) | Falta completar un dato obligatorio. | Código Postgres 23502 | | `src/lib/errors.js:46` |
| Detalle de error de base (overflow) | El monto es demasiado grande para guardarlo. | Código Postgres 22003 | | `src/lib/errors.js:47` |
| Detalle de error de base (fecha) | La fecha no tiene un formato que la app pueda leer. | Código Postgres 22007 | | `src/lib/errors.js:48` |
| Detalle de error de base (formato) | Alguno de los datos tiene un formato que la app no pudo leer. | Código Postgres 22P02 | | `src/lib/errors.js:49` |
| Detalle de error de base (permisos) | No tenés permiso para hacer esto. | Código Postgres 42501 | | `src/lib/errors.js:50` |
| Detalle de error de base (no encontrado) | No se encontró lo que se buscaba. Puede que ya no exista: probá recargar la pantalla. | Código PostgREST PGRST116 | | `src/lib/errors.js:53` |
| Detalle de error de Auth | Email o contraseña incorrectos. | `invalid_credentials` | | `src/lib/errors.js:58` |
| Detalle de error de Auth | La contraseña nueva tiene que ser distinta de la anterior. | `same_password` | | `src/lib/errors.js:59` |
| Detalle de error de Auth | La contraseña es muy corta: usá al menos 6 caracteres. | `weak_password` | | `src/lib/errors.js:60` |
| Detalle de error de Auth | Probaste muchas veces seguidas. Esperá un momento y volvé a intentar. | `over_request_rate_limit` / HTTP 429 | | `src/lib/errors.js:61` |
| Detalle de error de Auth | Todavía no confirmaste este email. | `email_not_confirmed` | | `src/lib/errors.js:62` |
| Detalle de error de Auth | Ya existe una cuenta con ese email. Iniciá sesión en vez de registrarte. | `user_already_exists` | | `src/lib/errors.js:63` |
| Detalle de error de Auth | El registro no está habilitado en este momento. | `signup_disabled` | | `src/lib/errors.js:64` |
| Detalle de error, código sin traducir | Error inesperado (código {código}). | Cualquier otro código de error con código conocido pero sin traducción | | `src/lib/errors.js:97` |
| Detalle de error (`UserError`, categoría) | Falta la categoría del sistema "{llave}" ({tipo}). | La categoría del sistema no existe (no debería pasar en uso normal) | | `src/lib/categories.js:46` |
| Detalle de error (`UserError`, categoría) | Ya existe la categoría "{nombre}". | Alta de categoría duplicada (mismo nombre y tipo) | | `src/lib/categories.js:81` |
| Detalle de error (`UserError`, categoría) | Es una categoría del sistema: no se puede eliminar. | Intento de borrar una categoría de sistema | | `src/lib/categories.js:125` |
| Detalle de error (`UserError`, cuenta) | Ya existe la cuenta "{nombre}". | Alta de cuenta duplicada | | `src/lib/liquidAccounts.js:72` |
| Detalle de error (`UserError`, deuda) | Esta deuda tiene {n} pago(s) registrado(s). Borrá los pagos primero. | Intento de borrar una deuda con pagos | | `src/lib/debts.js:103` |
| Detalle de error (`UserError`, grupo) | El grupo no está entre los activos. | Error interno al mover el orden de un grupo (no debería pasar en uso normal) | | `src/lib/assetTypes.js:69` |
| Detalle de error (`UserError`, cotización) | No hay cotizaciones cargadas para convertir a dólares. | Sin ninguna cotización MEP guardada para convertir un monto | | `src/lib/localCurrency.js:53` |
| Detalle de error, Supabase mal configurado | Supabase no está configurado (revisá el .env). | Login/cambio de contraseña sin `VITE_SUPABASE_URL`/`KEY` (solo entorno mal configurado, no un caso real de usuario) | | `src/hooks/useAuth.jsx:42,57` |
| Mensajes de la base que llegan tal cual (`raise exception` en castellano, código P0001) | "El origen y el destino tienen que ser cuentas distintas" / "Cuenta de origen inexistente o de otro usuario" / "Cuenta de destino inexistente o de otro usuario" / "El monto de la transferencia tiene que ser mayor a cero" | Validaciones de `create_account_transfer`, llegan como detalle de "No se pudo guardar la transferencia." | | `supabase/migrations/0041_reconcile_netting.sql:244-258` |
| Mensajes de la base (reconciliación) | "Se esperaba una lista de cuentas declaradas" / "No hay ninguna cuenta declarada para reconciliar" / "Falta el monto declarado de una de las cuentas" / "Cuenta inexistente o de otro usuario" | Validaciones de `reconcile_liquid`, llegan como detalle de "No se pudo guardar la reconciliación." | | `supabase/migrations/0042_delete_reconciliation.sql:334-369` |
| Mensajes de la base (borrar conteo) | Este movimiento no es parte de un conteo | Error interno de `delete_reconciliation` (no debería alcanzar la UI en uso normal, ya que `TransactionFormModal` solo ofrece esa acción cuando confirmó que sí lo es) | | `supabase/migrations/0042_delete_reconciliation.sql:368` |
| Mensajes de la base (transferencia entre activos) | "Activo de origen inexistente o de otro usuario" / "Activo de destino inexistente o de otro usuario" | Validaciones de `create_transfer`, llegan como detalle de "No se pudo guardar la transferencia." | | `supabase/migrations/0017_create_transfer_function.sql:54,57` |
| Mensajes de la base (registro/invitación) | Esta invitación no es válida. / Esta cuenta necesita una invitación válida. / Esta invitación fue anulada. / Esta invitación ya fue usada. / Esta invitación venció. | Validaciones de `handle_new_user` al registrarse, llegan como detalle de "No se pudo completar el registro…" en `Register.jsx` | | `supabase/migrations/0043_signup_invitations.sql:176-195` |

## Mails

No se encontró ninguna plantilla de mail propia en el repositorio (ni en `supabase/functions/` ni en `supabase/` en general). Los únicos mails que manda la app son los de Supabase Auth (confirmación de registro si se activara, recuperación de contraseña): sus textos viven en la configuración de Supabase Auth, no en el código del repo, así que no están en este inventario.

---

## Patrones notados

Varios textos repiten la misma estructura de "explicación funcional" que empieza nombrando qué es el dato y sigue con una cláusula "sin embargo"/"a diferencia de" que aclara un caso borde (ver casi todos los `footer` de `SettingsGroup` y las ayudas de `ExchangeRateField` y `LiquidModal`): es preciso, pero tiende a alargarse en una sola oración con varias comas y guiones largos, y varias empiezan literalmente con "Es..." o terminan aclarando qué NO hace el campo. Los mensajes de error y confirmación son consistentes entre sí (mismo "No se pudo {verbo} el/la {cosa}." en casi cien lugares, mismo "¿Eliminar...? Es permanente." para todo borrado destructivo) pero esa uniformidad hace que sean fácilmente reconocibles como plantilla. Las preguntas de formulario ("¿De dónde sale?", "¿A dónde va?", "¿Qué activo de mercado es?", "¿Cuánto pediste?") están bien resueltas en el sentido pedido por CLAUDE.md (preguntan en vez de nombrar el campo), pero varias comparten la misma construcción con signos de interrogación dobles que, repetida en una sola pantalla con dos o tres preguntas seguidas, puede sentirse formulaica. Por último, unas pocas frases usan un registro más "explicativo de manual" que el resto (por ejemplo "Podés continuar: el precio pudo cambiar..." repetida casi textual en tres modales, o "no es un gasto, es un ajuste") — son honestas y correctas, pero con ese aire de nota al pie que characteriza a un texto revisado por una IA.
