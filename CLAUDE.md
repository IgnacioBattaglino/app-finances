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
- Prioridad del proyecto: que yo entienda el código. Antes de cambios grandes, explicá el plan y esperá mi OK.
- Commits en formato Conventional Commits (feat:, fix:, chore:, docs:).
- Español para explicaciones; código y nombres de variables en inglés.

## Comandos
- `npm run dev` — servidor de desarrollo (Vite)
- `npm run build` — build de producción
- `npm run preview` — sirve el build localmente
- `npm run lint` — linter (oxlint)
