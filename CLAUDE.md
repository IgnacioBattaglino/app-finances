# app-finances

PWA de finanzas personales con enfoque FIRE (Financial Independence, Retire Early). Herramienta de uso real y pieza de portfolio. Multiusuario con registro semi-cerrado (las cuentas las crea el administrador; sin signup público). El frontend nunca envía user_id: lo completa la base con default auth.uid(), y RLS garantiza el aislamiento.

## Stack
- React + Vite
- Tailwind CSS
- Supabase (PostgreSQL) como backend y base de datos
- PWA instalable en móvil
- Deploy en Vercel

## Contexto de negocio
- Tres mundos separados que nunca se suman en un "patrimonio total": dinero líquido (ARS, operativo), invertido (USD, con rendimiento) y deudas (saldo restante en USD).
- Monedas: gastos, ingresos y líquido en ARS; inversiones y deudas en USD. Cada aporte congela su tipo de cambio (MEP) del día.
- Registra: movimientos individuales (ingresos/gastos), aportes a inversión, reconciliaciones del líquido, y un portafolio de activos (CEDEARs, Renta fija, Money market, Bitcoin, Efectivo USD).
- El modelo de datos completo está en @docs/ARCHITECTURE.md (leelo cuando trabajes en base de datos, esquema o queries). El diseño funcional y el estado de cada sección (implementado vs. pendiente) está en docs/FUNCTIONAL.md.

## Reglas
- NUNCA commitear secretos ni datos financieros reales. Las claves van en .env (ya está en .gitignore).
- Los datos reales viven solo en Supabase, nunca en el repo.
- Las credenciales del usuario test viven en `.env.test.local` (ignorado por git, cubierto por `*.local`). Nunca escribas credenciales (reales o de ejemplo con pinta real) en código fuente, tests commiteados, documentación, mensajes de commit ni output de consola. Si necesitás loguearte para probar, leelas siempre de ese archivo vía variables de entorno.
- Prioridad del proyecto: que yo entienda el código. Antes de cambios grandes, explicá el plan y esperá mi OK.
- Commits en formato Conventional Commits (feat:, fix:, chore:, docs:).
- Español para explicaciones; código y nombres de variables en inglés.

## Sistema visual
El lenguaje es el de una app de iOS: fondo agrupado gris frío, tarjetas SIN marco (la jerarquía la da el contraste con el fondo, más una sombra mínima), separadores internos sangrados desde el texto, y tipografía del sistema — que en iPhone y Mac resuelve a San Francisco. Ninguna webfont.

- **Todo el color vive en `src/index.css`** como variables de `@theme`. El modo oscuro NO reescribe clases: redefine esas mismas variables en `[data-theme="dark"]` y en el `@media (prefers-color-scheme: dark)`. Un componente que usa los tokens (`bg-card`, `text-ink-soft`, `border-line`, `bg-mist`) ya funciona en los dos modos sin tocarlo. Nunca hardcodear un hex en un componente.
- Tres niveles de texto: `ink` (principal), `ink-soft` (secundario) e `ink-faint` (terciario). Superficies: `paper` (fondo), `card` (tarjeta), `mist` (relleno de un control sobre una tarjeta) y `lift` (la pieza que se apoya ENCIMA de `mist`, ej. la pastilla del segmentado — no puede ser `card`, que en oscuro es más oscuro que `mist`). `scrim` es el velo del modal, oscuro en los dos modos.
- El acento son DOS tokens porque un color no hace los dos trabajos: `accent` rellena botones (siempre con blanco encima, así que es oscuro y pasa AA) y `accent-ink` es el acento como TEXTO sobre el fondo de la app — en claro son el mismo, en oscuro `accent-ink` se aclara. Ver `src/lib/theme.js`.
- **Los montos NO van en monoespaciada.** Van en la tipografía del sistema con cifras tabulares: la clase `font-money` conserva el nombre pero ahora resuelve a la sans + `font-variant-numeric: tabular-nums`. Una monoespaciada le daba a cada número un aire de planilla.
- `Money` (`src/components/Money.jsx`) es el monto PROTAGONISTA de una tarjeta (28px para arriba): símbolo chico y apagado, entero grande, decimales al 0,58em. A 17px el símbolo quedaría en 8px, así que en las filas de una lista va el monto derecho, con `formatUSD`/`formatARS`.
- Clases compartidas en `@layer components` de `index.css`, en vez de repetir la misma tira de utilidades: `surface` (tarjeta), `list` (tarjeta con separadores sangrados entre filas), `rows` (esos separadores sin la tarjeta), `notice` (aviso teñido, sin marco), `btn` + `btn-primary`/`btn-secondary`/`btn-quiet`/`btn-danger`, `title-page`, `eyebrow`, `page` y `page-narrow`.
- **La diferencia entre celular y desktop vive en un solo lugar**: `.btn` mide 52px de alto con texto de 17px, y baja a 36px con 14px a partir de `md`. Ninguna pantalla repite esas medidas.
- Escala tipográfica: 13 / 15 / 17 (cuerpo) y `title-page` para el título de pantalla. El cuerpo de la app es 17px, no 14: esto se lee con el teléfono en la mano.
- Anchos: `page` abre a una grilla ancha en desktop (Inicio, Portafolio, Movimientos, Deudas, detalle de activo); `page-narrow` se queda angosta a propósito (Ajustes, login, Objetivo). Desktop no es la columna del celular estirada: Inicio pone el resumen en tres columnas y el gráfico al lado de los gastos, Movimientos parte en dos paneles, el detalle de activo pone el historial a la derecha.
- La acción principal en el celular es el botón flotante "+"; en desktop es un botón normal en el encabezado (`action` de `PageHeader`) y el flotante se oculta. Un FAB no tiene sentido con un mouse.
- Los gráficos (recharts) pintan en SVG y no entienden clases: leen los colores del DOM con `readChartColors()` (`src/lib/chartColors.js`), memorizado contra `accent` e `isDark`. Nunca copiar hex a un archivo de gráfico.

## Convenciones de formularios
- Cada campo se nombra con la pregunta que responde, en el idioma del usuario — nunca desde la implementación. Nada de nombres que asuman conocimiento del sistema ("Va por MEP") ni que nombren flags internos ("Ya lo tenía"). Las ayudas se escriben para alguien que usa la app por primera vez.
- Segmentado (`BinaryChoice`, en `src/components/form/`) para elegir entre modos, cuando la operación cambia de naturaleza (ej. Gasto/Ingreso). Switch (`Switch`, mismo directorio) para un ajuste sí/no que no transforma la operación.
- Eliminar (permanente): botón rojo + confirmación que dice explícitamente "es permanente". Archivar (reversible): botón neutro + confirmación suave, sin esa palabra.
- Botón primario de los modales: siempre "Guardar", salvo un verbo explícito que describa mejor la acción (ej. "Liquidar" en la liquidación de una posición — no es un guardado genérico, es vender).
- Errores: siempre con `FormError` (`src/components/form/`) — mensaje en español + detalle técnico opcional, nunca `e.message` concatenado al mensaje.
- Todo modal de formulario usa el componente `FormSheet` (`src/components/FormSheet.jsx`), nunca su propia caja `fixed`. En mobile abre como bottom sheet compacto (alto natural hasta `85dvh`, anclado abajo, esquinas superiores redondeadas) SIN teclado, y al enfocar un campo se expande a pantalla completa (`h-dvh`, header fijo + cuerpo scrolleable) subiendo el campo por encima del teclado. Los formularios que autoenfocan (Movimientos) pasan `startExpanded` para abrir ya expandidos con teclado, sin parpadeo. En desktop es una card centrada con alto acotado y scroll interno (compacto/expandido no aplica). El botón de acción (submit) se pasa como prop `action` y usa `form="<id>"` para enviar el `<form>` del cuerpo. NO detectar el teclado on-screen para acomodar el sheet: en PWA standalone de iOS el evento `resize` de `visualViewport` es poco confiable (bug de WebKit sin arreglar) y `interactive-widget` del viewport meta no lo soporta Safari en ninguna versión — por eso la expansión a full-screen es el mecanismo, no medir el teclado. Respeta `env(safe-area-inset-bottom)`. Una barra fija inferior no-modal (ej. la de acciones del detalle de activo) sigue la misma regla de `safe-area-inset-bottom`.
- Al enfocar un campo, FormSheet lo scrollea al tope del cuerpo (`block: 'start'`) para dejarlo por encima del teclado. Esto es OBLIGATORIO, no una mejora: en PWA standalone de iOS WebKit no auto-scrollea un contenedor anidado (`overflow-y-auto`) para revelar el campo enfocado, solo el documento raíz — sin este scroll el teclado tapa cualquier campo de la mitad de abajo. Criterio de aceptación de cualquier form: el campo enfocado siempre visible por encima del teclado, nunca tapado.
- Autofocus SOLO en los formularios de Movimientos (captura rápida de gasto/ingreso). Todos los demás formularios (Aportar, Retirar, Transferir, Liquidar, Valuación, alta/edición de activo, reconciliación de líquido) abren SIN teclado: el usuario toca el campo cuando quiere. Excepción: un input que se revela por una acción explícita del usuario (ej. el date picker de `CollapsedDateField` tras tocar "cambiar", o los inputs inline de Ajustes) puede autoenfocarse — no es "abrir el form con teclado".

## Comandos
- `npm run dev` — servidor de desarrollo (Vite)
- `npm run build` — build de producción
- `npm run preview` — sirve el build localmente
- `npm run lint` — linter (oxlint)
- `npm run verify:rls` — verifica el aislamiento RLS con el usuario test (requiere `.env.test.local`, ver `.env.test.example`)

## Cómo probar
- Copiá `.env.test.example` a `.env.test.local` y completá `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` con el usuario test (ese archivo lo creás vos a mano, nunca por acá).
- `npm run verify:rls` corre solo lectura contra Supabase y confirma que RLS aísla los datos por usuario.
- El login manual en `npm run dev` se hace con ese mismo usuario test.
- La verificación de datos con `npm run verify:rls` se corre siempre antes de proponer commit.
- La verificación visual con navegador queda reservada para cambios grandes de UI o cuando el usuario lo pida explícitamente; por defecto la hace el usuario manualmente. Cuando se use navegador, exclusivamente Playwright MCP — nunca Claude in Chrome ni el navegador personal del usuario. Nunca incluir credenciales en output, código ni screenshots.
