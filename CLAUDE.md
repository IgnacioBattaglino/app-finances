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

## Convenciones de formularios
- Cada campo se nombra con la pregunta que responde, en el idioma del usuario — nunca desde la implementación. Nada de nombres que asuman conocimiento del sistema ("Va por MEP") ni que nombren flags internos ("Ya lo tenía"). Las ayudas se escriben para alguien que usa la app por primera vez.
- Segmentado (`BinaryChoice`, en `src/components/form/`) para elegir entre modos, cuando la operación cambia de naturaleza (ej. Gasto/Ingreso). Switch para un ajuste sí/no que no transforma la operación.
- Eliminar (permanente): botón rojo + confirmación que dice explícitamente "es permanente". Archivar (reversible): botón neutro + confirmación suave, sin esa palabra.
- Botón primario de los modales: siempre "Guardar", salvo un verbo explícito que describa mejor la acción (ej. "Liquidar" en la liquidación de una posición — no es un guardado genérico, es vender).
- Errores: siempre con `FormError` (`src/components/form/`) — mensaje en español + detalle técnico opcional, nunca `e.message` concatenado al mensaje.
- Todo modal de formulario usa el componente `FormSheet` (`src/components/FormSheet.jsx`), nunca su propia caja `fixed`. En mobile ocupa la pantalla completa (`h-dvh`, `flex-col`) con el header fijo arriba y el cuerpo scrolleable (`flex-1 overflow-y-auto`); en desktop es una card centrada con alto acotado y scroll interno. El botón de acción (submit) se pasa como prop `action` y usa `form="<id>"` para enviar el `<form>` del cuerpo. NO detectar el teclado on-screen para acomodar el sheet: en PWA standalone de iOS el evento `resize` de `visualViewport` es poco confiable (bug de WebKit sin arreglar) y `interactive-widget` del viewport meta no lo soporta Safari en ninguna versión. A pantalla completa con scroll interno el campo enfocado siempre se alcanza; el `scrollIntoView` al enfocar es una mejora, no un requisito. Respeta `env(safe-area-inset-bottom)`. Una barra fija inferior no-modal (ej. la de acciones del detalle de activo) sigue la misma regla de `safe-area-inset-bottom`.

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
