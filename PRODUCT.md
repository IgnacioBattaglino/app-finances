# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Principal: Nacho**, el autor. Inversor amateur que arranca, en Argentina. Usa la app todos los días desde el iPhone, instalada como PWA: carga un gasto en segundos, mira cuánta plata tiene y dónde, y sigue su portafolio en dólares.
- **Gente cercana invitada**: familia y amigos, argentinos, que no necesariamente saben de inversiones. Entran solo con un link de un solo uso que genera el administrador; no hay registro público. Cada uno opera aislado, con sus propios datos.

Para ellos no se da por sabido ningún término del sistema. Las ayudas se escriben para alguien que usa la app por primera vez.

## Product Purpose

Finanzas personales con enfoque FIRE (Financial Independence, Retire Early): hacer crecer el capital ("bola de nieve"), protegerlo de la inflación y avanzar hacia la independencia financiera.

El éxito es que cargar un gasto sea más rápido que no cargarlo, y que la foto de la plata (disponible, invertido, deuda, compromisos) sea verdadera sin tener que hacer cuentas a mano.

El uso real manda. La app también es pieza de portfolio, pero de rebote: ninguna decisión se toma para mostrarla.

## Positioning

La app está pensada para la realidad argentina. Muestra **tres mundos que nunca se suman**:

- el dinero líquido, en pesos, para el día a día;
- lo invertido, en dólares y con rendimiento;
- la deuda, como saldo restante en dólares.

Pesos inflacionarios y dólares no son comparables, así que no existe un "patrimonio total". Cada aporte congela su tipo de cambio MEP del día, y las métricas históricas no dependen de la cotización de hoy.

La app guarda eventos, nunca totales. Todo saldo se calcula, y la reconciliación ("Contar mi plata") separa el gasto real del simple reparto entre cuentas.

## Operating Context

- **Uso principal:** iPhone, PWA instalada a pantalla completa y en vertical, con una mano, varias veces por día. Sin service worker ni modo offline a propósito.
- **Uso secundario:** desktop, para mirar con más calma: portafolio, historial y ajustes.
- **Rituales:** capturar gastos al momento, contar la plata de cada cuenta de vez en cuando, confirmar los vencimientos de tarjetas y suscripciones, aportar o retirar de inversiones.
- **Datos externos:** precios de Binance/CoinGecko (cripto), data912/BYMA (CEDEARs, acciones y bonos) y dolarapi/argentinadatos (MEP).

## Capabilities and Constraints

- Cinco pestañas, todas de plata: Inicio, Movimientos, Mi plata, Inversiones y Compromisos. Ajustes no es una pestaña.
- Multimoneda por fila (ISO 4217). Gastos y disponible en la moneda de su cuenta; inversiones y deudas en USD. Nada convierte en silencio, salvo la serie histórica y el Total de Inicio, que unifican a dólares (ADR-015).
- Interfaz en español rioplatense. Código en inglés.
- Estado funcional de cada sección: `docs/FUNCTIONAL.md`. Modelo de datos y decisiones: `docs/ARCHITECTURE.md` y `docs/adr/`.
- **Pendiente:**
  - la pestaña/sección Objetivo FIRE (proyección);
  - el rendimiento en la tarjeta de Inicio;
  - las vistas históricas por año en Movimientos.

## Brand Commitments

- Nombre visible: "finanzas".
- Voz: castellano rioplatense, directo y concreto. Cada campo se nombra con la pregunta que responde, nunca desde la implementación.
- Los errores de la base nunca llegan crudos a la pantalla.

## Evidence on Hand

- Datos reales: viven solo en Supabase y nunca en el repo, las capturas ni la documentación.
- Cuenta test: contiene datos basura (activos "ZZ" archivados, cantidades falsas) y no sirve como muestra representativa.
- No hay testimonios, métricas de uso ni usuarios públicos, y no se deben inventar.

## Product Principles

1. **La verdad antes que la comodidad.** Si un número no se puede afirmar, no se muestra, o se muestra con su aviso. Un pendiente no se inventa como confirmado.
2. **Capturar primero.** La acción más frecuente, cargar un gasto, cuesta un toque y unos segundos, desde cualquier lugar.
3. **Mundos separados, monedas separadas.** Nunca sumar lo que no se puede sumar. Dos monedas son dos hechos pares.
4. **Entendible para quien no sabe de finanzas.** Sin jerga ni flags internos a la vista. La gente cercana tiene que poder usarla sin explicación.
5. **Nada se pierde.** Lo que tiene historia se archiva u oculta, no se borra, y guardar sin tocar nada deja la fila idéntica.
