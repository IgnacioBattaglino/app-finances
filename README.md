# EnCuenta (app-finances)

EnCuenta es una app de finanzas personales para ver con claridad cuánta plata tenés, dónde está y hacia dónde va, con la independencia financiera (FIRE) como meta de fondo. Está pensada para gente argentina que no necesariamente sabe de finanzas. El nombre se escribe siempre «EnCuenta», con C mayúscula.

Es una herramienta de uso real (la usan a diario su autor y un grupo chico de gente cercana) y, de rebote, una pieza de portfolio.

## Cómo se entra
Solo por invitación: no hay registro público. Las cuentas se crean con un link de un solo uso que genera el administrador desde Ajustes.

## Frentes
| Frente | Estado |
|---|---|
| **Web / PWA** | En uso. React + Vite + Tailwind + Supabase, deploy en Vercel |
| **iOS nativo** | En pausa. Existe un proyecto de Xcode con la pantalla vacía (`ios/`); se retoma cuando cierren el diseño y la base |
| **Android nativo** | No existe todavía |

La idea que ordena todo: las reglas de plata viven en Supabase (PostgreSQL), y las apps muestran lo que devuelve la base. La mudanza de esas reglas desde la web a la base está en curso.

## Dónde mirar
- **Dónde estamos hoy**: [`docs/ESTADO.md`](docs/ESTADO.md)
- Modelo de datos y decisiones técnicas: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Diseño funcional: [`docs/FUNCTIONAL.md`](docs/FUNCTIONAL.md)
- Producto y tono: [`PRODUCT.md`](PRODUCT.md)
- Decisiones: [`docs/decisiones/README.md`](docs/decisiones/README.md)
- Para trabajar en el repo: [`CLAUDE.md`](CLAUDE.md)

---

Desarrollado con asistencia de IA (Claude Code) como parte de un flujo de trabajo humano-IA: la arquitectura y las decisiones de diseño fueron definidas por el autor; la IA asistió en la implementación.
