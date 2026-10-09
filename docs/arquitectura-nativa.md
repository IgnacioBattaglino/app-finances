# Arquitectura de las apps nativas — propuesta

Fecha: 2026-09-27, decisiones del 2026-09-29. Estado: **aprobada**, con las decisiones de la tabla del final. El proyecto de iOS existe desde el 2026-09-29 (`ios/`, pantalla vacía); el de Android todavía no.

Contexto: `PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/informe-reglas-de-plata.md`, `docs/mudanza-reglas.md` y `docs/informe-deudas-ahorro-offline.md`.

**La idea que ordena todo el documento:** las reglas de plata viven en Supabase. Las apps muestran lo que devuelve la base, cargan datos y hacen una sola clase de cuenta: sumarle a un número que ya mandó el servidor el gasto que se acaba de cargar, para que se vea al instante. Cada vez que una app tuviera que *decidir* algo sobre plata, eso es una señal de que la regla le falta a la base.

Cada sección tiene la **decisión**, el **porqué** y las **alternativas**. Lo que decidió Nacho está marcado con **[DECIDIDO]** y juntado al final.

---

## 0. Tu entorno

**Verificado el 2026-09-29, después de los tres comandos: todo en orden.** Xcode 27.0 (27A266a), Swift 6.4, licencia aceptada, runtime de simulador iOS 27.0 con iPhone 17, 17e, Air, 18 Pro y 18 Pro Max. El simulador solo trae iOS 27: para ver la app en iOS 18 (el mínimo) hay que bajar ese runtime aparte, desde Xcode → Settings → Components. No hace falta para empezar.

Lo que sigue es la primera verificación (2026-09-27, sin instalar nada), que queda como registro.

| Qué | Estado |
|---|---|
| Mac | macOS 27.0, Apple Silicon (arm64). Bien |
| Xcode | **Xcode 27.0** (27A266a) en `/Applications/Xcode.app`. Bien |
| Herramientas de línea de comandos | `xcode-select` apunta a Xcode (`/Applications/Xcode.app/Contents/Developer`). Bien. Tenés además las Command Line Tools sueltas (26.1), más viejas; no molestan porque no son las que se usan |
| **Licencia de Xcode** | **Sin aceptar.** Hasta que la aceptes no funciona `xcodebuild`, ni `swift`, ni los simuladores |
| **Simuladores** | **Ninguno.** No hay ningún runtime de iOS descargado (no existe `~/Library/Developer/CoreSimulator`). No se pudo listar con `simctl` por la licencia |
| Homebrew | Instalado. No hace falta nada de ahí por ahora |

**Qué tenés que hacer vos** (en la Terminal, porque piden tu contraseña):

1. `sudo xcodebuild -license accept` — acepta la licencia.
2. `sudo xcodebuild -runFirstLaunch` — instala los componentes de primera vez.
3. `xcodebuild -downloadPlatform iOS` — baja el simulador de iOS (varios GB; también se puede desde Xcode → Settings → Components).
4. Verificar: `xcrun simctl list devices available` tiene que mostrar iPhones.

Cuando lo hagas, avisame y lo vuelvo a verificar.

---

## 1. Estructura del repo

**Decisión: un solo repo (monorepo).** Lo que ya existe queda donde está, y se suman carpetas:

```
app-finances/
├── src/, public/, index.html…   la web, como hoy (no se mueve)
├── supabase/                    migraciones y funciones: la fuente de verdad
├── contract/                    el contrato entre la base y las apps (sección 3)
├── design/                      la única fuente de colores y medidas (sección 4)
├── ios/                         el proyecto de Xcode
└── android/                     más adelante
```

**Por qué:**

- **Un cambio de regla toca las tres puntas a la vez.** Cuando cambia una función de la base, en el mismo PR se ve la migración, el contrato y el código de cada app que la usa. Con repos separados eso son tres PRs que hay que acordarse de sincronizar a mano, y es exactamente como una app se desalinea.
- **Las instancias de Claude Code leen todo.** Una instancia de iOS puede abrir `supabase/migrations/` para entender qué devuelve una función, sin que le copies nada.
- **Un solo CI**, con filtros por carpeta: los tests de iOS corren solo si cambió `ios/`, `contract/` o `design/`.

**El riesgo real, y cómo se evita:** dos instancias en la **misma carpeta** se pisan (una cambia de rama y le cambia los archivos a la otra). Solución: **cada instancia trabaja en su propio `git worktree`** — una copia de trabajo aparte del mismo repo, con su propia rama. Esta propuesta ya está hecha así: vive en `../app-finances-native`, rama `docs/native-architecture`, y la otra instancia sigue en `app-finances` sin enterarse.

**No se mueve la web a `web/`.** Rompería la configuración de Vercel y los imports sin ganar nada hoy. Si algún día molesta, es un PR aparte.

**Alternativas:**

| Opción | Pros | Contras |
|---|---|---|
| **Monorepo (propuesta)** | Un PR por cambio; contrato y diseño compartidos sin publicar paquetes; un CI | Hay que usar worktrees; el repo crece |
| Un repo por app | Cada uno más chico; permisos separados | El contrato y los colores se copian entre repos; tres PRs por cambio; la desalineación es el estado natural |
| Repo de la base aparte + apps aparte | Separación "de manual" | Mucha ceremonia para una sola persona |

---

## 2. Proyecto iOS

### Versión mínima de iOS

**Decisión: iOS 18.** **[DECIDIDO]** (la propuesta era iOS 26).

- Corre en el iPhone XS/XR (2018) en adelante, así que entra más gente de la que vas a invitar.
- Tiene todo lo que usamos: `@Observable`, `NavigationStack`, los sheets con alturas (`presentationDetents`), Swift Testing, las carpetas sincronizadas.
- **El diseño nuevo de Apple (Liquid Glass) llega igual a quien tenga iOS 26 o más**: los componentes estándar de SwiftUI (barras, pestañas, sheets, botones) lo toman solos al compilar con Xcode 26 o posterior. Solo lo que se pida a mano (ej. `.glassEffect`) necesita `if #available(iOS 26, *)`. **Regla: usar los componentes estándar y evitar esas ramas**; si alguna es inevitable, va en un solo lugar de `Core/Design`, nunca repartida por las pantallas.

### SwiftUI

**Decisión: SwiftUI puro, sin UIKit salvo que algo puntual no se pueda.** Es el camino que Apple mantiene, es declarativo como React (te va a resultar familiar) y lo que el diseño pide —sheets que se agarran, volver deslizando, listas— ya viene hecho: `.sheet` con `presentationDetents`, `NavigationStack` con el gesto de volver nativo, `List`. En la web esas cosas llevaron bloques enteros (11, 13); en iOS son del sistema.

### Cómo se organiza el código

**Decisión: un solo target de app, carpetas por pantalla, y la menor cantidad de piezas posible.**

```
ios/
├── EnCuenta.xcodeproj
├── EnCuenta/
│   ├── App/            arranque, pestañas, pantalla de bloqueo (Face ID)
│   ├── Features/
│   │   ├── Movements/  una carpeta por pestaña: la vista y su modelo
│   │   ├── MyMoney/
│   │   ├── ToPay/
│   │   ├── Home/
│   │   ├── Investments/
│   │   └── Settings/
│   ├── Core/
│   │   ├── Backend/    el cliente de Supabase y las funciones del contrato
│   │   ├── Offline/    la cola de gastos sin conexión y la caché
│   │   ├── Design/     colores y medidas GENERADOS desde design/ (no se editan a mano)
│   │   └── Format/     montos, fechas, monedas (esto sí es de la app: es presentación)
│   └── Resources/      Info.plist, PrivacyInfo.xcprivacy, íconos
└── EnCuentaTests/
```

- **Patrón:** cada pantalla tiene una vista SwiftUI y un modelo `@Observable` que pide los datos y los guarda. Nada de arquitecturas con nombre (TCA, VIPER, Clean): para una app que no calcula, son capas vacías.
- **Swift 6 con concurrencia estricta** desde el día uno: el compilador frena los errores de "dos cosas tocan el mismo dato a la vez", que en una cola sin conexión son justo los peligrosos.
- **Una sola dependencia externa: el SDK de Supabase.** Lo demás lo trae Apple (red, Keychain, Face ID, notificaciones, archivos).
- **Carpetas sincronizadas de Xcode**: desde Xcode 16, un archivo que se crea en la carpeta entra solo al proyecto, sin tocar el `.pbxproj` (el archivo interno de Xcode, ilegible y el que más conflictos da). Eso lo hace editable por Claude Code desde la terminal. **Alternativa:** XcodeGen (genera el proyecto desde un YAML); hoy ya no hace falta, y es una herramienta más.
- **Paquetes Swift locales** (partir `Core` en módulos): no ahora. Se justifican cuando haya una extensión (widget, Apple Watch) que necesite compartir código.

### El SDK de Supabase para Swift

**Decisión: `supabase-swift`, el SDK oficial**, por Swift Package Manager (el gestor de paquetes que viene en Xcode). Trae:

- **Auth**: login con email y contraseña, refresco automático del token, y **guarda la sesión en el Keychain por defecto**.
- **PostgREST**: leer tablas y vistas, llamar funciones (`.rpc("get_period_totals", params:)`), e insertar con "si ya existe, no hacer nada" (`upsert(..., onConflict: "id", ignoreDuplicates: true)`), que es lo que pide la carga sin conexión.
- Realtime, Storage y Functions: no los usamos al principio (Functions sí, cuando haya Edge Functions para la app).

### Los tipos de los datos (¿Supabase genera tipos para Swift?)

**Sí, existe:** la CLI de Supabase tiene `supabase gen types --lang swift`. Pero:

- Genera las **tablas**; para las **funciones** que devuelven `table (...)` —que es casi todo nuestro contrato— la salida es más pobre y menos probada que la de TypeScript.
- **No hay generador equivalente para Kotlin.**
- Necesita la CLI de Supabase (no la tenés instalada) y, contra una base local, Docker.

**Decisión: los tipos se escriben a mano en Swift (`Codable`), y un test los obliga a coincidir con lo que la base devuelve de verdad.** Son pocos: unas 15 funciones y vistas y unas 10 tablas. El test es el de la sección 3 (las "respuestas de muestra"): si una función cambia de forma, el test de Swift deja de decodificar y falla. Es el mismo mecanismo para Swift y para Kotlin, cosa que el generador no da.

**Alternativa:** usar `gen types --lang swift` como punto de partida para las tablas y corregir a mano. Se puede probar cuando armemos el proyecto; no cambia el resto.

---

## 3. El contrato único entre la base y las apps

### Qué es

**Decisión: la única puerta de las apps a la plata son las funciones `get_*`, las vistas y unas pocas tablas, listadas en `contract/README.md` con qué pantalla usa cada una.** Nada de consultas armadas en la app que sumen o filtren por su cuenta.

### Qué usa cada pantalla (hoy)

| Pantalla | Lee | Escribe | Lo que **falta** en la base |
|---|---|---|---|
| **Movimientos** | `get_period_totals`, `get_expenses_by_category`, `get_monthly_expenses_usd`, `get_top_categories`; tablas `transactions`, `contributions`, `debt_payments`, `categories`, `liquid_accounts`; vista `transaction_movement_types` | `transactions` (insert idempotente con id del teléfono, 0060), `delete_reconciliation` | **La lista armada**: juntar las dos patas de una transferencia y los repartos de un conteo en una línea hoy lo hace `movementList.js` en la web. El informe propone una Edge Function que reuse ese código. Sin eso, la app nativa tendría que copiar 25 tests de lógica con centavos |
| **Mi plata** | `get_liquid_summary`, `get_liquid_by_account`, `liquid_accounts`, `liquid_reconciliations` | `reconcile_liquid`, `create_account_transfer`, `liquid_accounts` (alta, orden, ocultar) | **La vista previa del conteo** (`planReconciliation`, hoy en JS). Sin eso, se puede contar pero no mostrar antes "esto es gasto y esto es reparto" |
| **A pagar** | `commitments`, `commitment_charges`, `payment_cards`, `debts`, `debt_balances`, `debt_payment_parts` | `confirm_commitment_charge`, `unconfirm_commitment_charge`, `save_debt`, `debt_payments`, `commitments`, `payment_cards` | **Qué vence y cuándo** (`commitmentSchedule.js`) existe **solo en JS**. Es el corazón de la pantalla. El informe ya lo tiene como paso 7 de la mudanza (cuotas en SQL, que además valida la fecha al confirmar) |
| **Inicio** | `get_liquid_summary`, `get_usd_rate`, gastos del mes, próximos vencimientos | — | El valor invertido y el Total en USD (pasos 10–11 de la mudanza) |
| **Inversiones** | — | — | Casi todo (pasos 8–12 de la mudanza). Se construye al final |
| **Ajustes** | `categories`, `liquid_accounts`, `settings` | altas/bajas | **Borrar la cuenta** (sección 5): no existe todavía |

**Importante, porque cambia el orden de la sección 10:** de las tres pantallas que pensabas que tenían el backend listo, **ninguna lo tiene entero**. Lo que sí está completo es **cargar un gasto o ingreso** (incluso sin conexión), los **totales del período** y los **saldos**. Eso alcanza para arrancar con algo útil de verdad (ver sección 10).

### Cómo se evita que una app se desalinee

El problema de fondo es distinto al de la web: **una app de la tienda no se actualiza cuando vos querés.** La web cambia cuando hacés deploy; un iPhone puede quedarse semanas con la versión vieja. Una función de la base que cambia de forma rompe a esos teléfonos.

Cuatro piezas, de la más importante a la menos:

1. **Nunca cambiar una función del contrato de forma incompatible.** Agregar una columna al final: sí (un cliente viejo la ignora). Renombrar, sacar o cambiar el tipo de una columna o de un parámetro: no — se crea `get_period_totals_v2`, las apps se pasan a la nueva, y la vieja se borra cuando ninguna versión en uso la llame. Va escrito como regla en `docs/mudanza-reglas.md`.
2. **Foto del contrato en CI.** Un script aplica las migraciones a un Postgres limpio (el CI ya lo hace para los tests SQL) y escribe la firma de cada función y vista del contrato —nombre, parámetros, columnas y tipos— en `contract/schema.json`. El CI lo regenera y falla si difiere de lo commiteado. Resultado: **ningún cambio de forma pasa sin verse en el PR.**
3. **Respuestas de muestra.** El mismo script carga un set de datos de prueba, llama cada función como un usuario autenticado y guarda la respuesta real en `contract/fixtures/<función>.json`. Los tests de Swift (y después los de Kotlin) decodifican esos archivos con sus tipos. Si la base cambia, el JSON cambia, y el test de la app falla **en el mismo PR**, no en el teléfono de alguien.
4. **Versión mínima de la app.** Una fila en la base (`app_config`: `min_ios_version`, `min_android_version`) que la app lee al abrir. Si está por debajo, muestra "Actualizá EnCuenta para seguir" en vez de romperse con un error. Es el último recurso, para cuando un cambio incompatible sea inevitable.

**Alternativas descartadas:** generar clientes desde el OpenAPI que expone PostgREST (describe tablas bien y funciones mal, y agrega un generador por lenguaje); GraphQL de Supabase (otra capa entera, para ganar poco).

---

## 4. Diseño compartido

**Decisión: un archivo `design/tokens.json` con los colores (claro y oscuro), la escala tipográfica, los espaciados y los radios, y un script chico que genera tres archivos:**

- `ios/EnCuenta/Core/Design/Tokens.swift` — cada color como un `Color` que cambia solo entre claro y oscuro.
- `android/.../Tokens.kt` — los mismos, para Compose.
- `src/tokens.css` — las mismas variables que hoy tiene `src/index.css` en `@theme`. **La web no se toca ahora** (es territorio de la otra instancia); se engancha en un PR aparte, cuando la paleta esté decidida.

Los nombres son los que ya usa la web: `paper`, `card`, `ink`, `ink-soft`, `ink-faint`, `line`, `mist`, `lift`, `scrim`, `accent`, `accent-ink`, `gain`, `clay`. **Cambiar la paleta = editar un JSON y correr el script.** Los archivos generados llevan un encabezado "generado, no editar", y el CI verifica que estén al día (regenera y compara).

**Por qué un script propio y no Style Dictionary** (la herramienta estándar para esto): son ~15 colores × 2 modos, 4 tamaños de letra, 5 espaciados y 3 radios. Un script de Node de unas 60 líneas hace el trabajo sin sumar una dependencia ni aprender su configuración. Si el sistema crece (temas por marca, muchos componentes), se cambia.

**Tipografía:** la del sistema en las tres plataformas (San Francisco en iPhone, Roboto en Android), como ya decide `CLAUDE.md` — cero fuentes para cargar. **En iOS los tamaños tienen que ir atados a los estilos de Apple** (`.body` = 17, `.subheadline` = 15, `.footnote` = 13): así respetan el tamaño de letra que la persona eligió en Ajustes del iPhone (Dynamic Type). Es accesibilidad básica y Apple lo mira. **[DECIDIDO]: la letra sigue el tamaño que cada persona eligió en su iPhone.** Ningún texto lleva un tamaño fijo: se usan los estilos (`.font(.body)`) y, para medidas propias (el monto grande de una tarjeta), `@ScaledMetric`, que escala con el mismo ajuste. Cada pantalla se mira con la letra más grande antes de darla por terminada.

**Alternativas:** colores en el catálogo de Xcode (`Assets.xcassets`) — nativo, pero es otro formato que generar y más difícil de leer en un diff; Figma/Claude Design como fuente — no hay una exportación estable que alimente las tres plataformas, así que el JSON sigue siendo la verdad y el diseño se pasa a mano a ese JSON.

---

## 5. Sesión y seguridad

### Dónde vive la sesión

**En el Keychain** (el llavero cifrado del iPhone), que es donde `supabase-swift` la guarda por defecto. Se configura con acceso **"después del primer desbloqueo, solo este dispositivo"**: así la subida en segundo plano puede leer el token con el teléfono bloqueado, y la sesión no viaja a otro teléfono en un backup. Nada de la sesión va a `UserDefaults` ni a archivos.

### Face ID al abrir

- Al abrir la app y al volver después de un rato en segundo plano (**[DECIDIDO]: 5 minutos**), una pantalla de bloqueo pide Face ID con `LocalAuthentication`. Si Face ID falla, cae al código del iPhone (nunca te deja afuera de tu propia plata).
- Mientras la app está en el selector de apps, se tapa con la pantalla de bloqueo: sin eso, el iPhone muestra una captura con tus saldos.
- Es un **candado de pantalla, no cifrado**: el token ya está protegido por el Keychain. Atar el token a Face ID (que el Keychain lo pida para leerlo) impediría subir gastos en segundo plano; no vale la pena.
- Se puede apagar en Ajustes (**[DECIDIDO]**). Viene prendido.
- Requiere el texto `NSFaceIDUsageDescription` en el Info.plist ("Para que nadie más vea tu plata").

### Ningún secreto dentro de la app

- La app lleva **la URL del proyecto y la clave pública** (publishable/anon). Esa clave **no es un secreto**: cualquiera la saca de la web hoy mismo. Lo que protege los datos es RLS, que ya está en todas las tablas.
- **La clave `service_role` nunca entra a la app ni al repo.** Lo que la necesita (borrar una cuenta, pedir precios) corre en una Edge Function.
- **La app no habla con Binance, CoinGecko ni dolarapi.** Todo pasa por la base (ya es el plan de la mudanza, pasos 8).
- Las dos claves van en un `ios/Config/Secrets.xcconfig` ignorado por git (`*.local` ya está en `.gitignore`; sumamos este), con un `Secrets.example.xcconfig` commiteado — el mismo patrón que `.env`.

### Lo que Apple exige para publicar

| Requisito | Qué implica para nosotros | Estado |
|---|---|---|
| **Borrar la cuenta desde la app** (guía 5.1.1(v)). **[DECIDIDO]: dentro de la app desde la primera versión**, aunque el registro y la recuperación sigan en la web | Botón en Ajustes → confirmación "es permanente" → Edge Function `delete_account` que, con la service_role, borra todos los datos del usuario en orden y después su usuario de Auth. Hay que escribirla en SQL con cuidado: varias FK no tienen `on delete cascade` a propósito ("nada se borra si tiene historia") | **Falta** (backend) |
| **Privacy manifest** (`PrivacyInfo.xcprivacy`) | Declara: que no hay rastreo; qué datos se juntan (email, datos financieros), que están atados a tu identidad y que son solo para que la app funcione; y el motivo de cada API "sensible" que se usa (`UserDefaults` y fechas de archivos, con sus códigos). El SDK de Supabase trae el suyo | Se escribe con el proyecto |
| **Etiquetas de privacidad** en App Store Connect | Las mismas respuestas, en el formulario de la tienda | Al publicar |
| **Política de privacidad** con URL pública | Una página en la web (ej. `/privacidad`) | **Falta** |
| **Cuenta de prueba para revisión** (guía 2.1) | Como no hay registro público, Apple necesita un usuario y contraseña para entrar. Usamos uno de demo con datos inventados, nunca el tuyo | Al publicar |
| **App solo por invitación** | Apple la acepta si en la descripción y en las notas para el revisor se explica. Hay un riesgo real de que la miren como "app privada" (guía 4.2/3.2). Plan B limpio: **distribuir por TestFlight** a la gente cercana (hasta 10.000 personas, con una revisión más liviana) y dejar la tienda para cuando se abra el registro | **[DECIDIDO]**: hasta pagar la cuenta de Apple, solo tu iPhone; después, TestFlight. La tienda, cuando la app pase a producción real |
| **Iniciar sesión con Apple** (guía 4.8) | Solo es obligatorio si se ofrece login con Google/Facebook. Con email y contraseña **no** hace falta | No aplica |
| **Cifrado** (exportación) | Solo HTTPS estándar → `ITSAppUsesNonExemptEncryption = NO` en el Info.plist; evita un formulario en cada subida | Con el proyecto |
| **Registro y "olvidé mi contraseña"** | Los links del mail tienen que abrir algo. Abrir la app necesita *Universal Links*, que exigen la cuenta paga. En la primera versión, registro y recuperación siguen en la **web** (ya funcionan); la app solo inicia sesión | **[DECIDIDO]** |
| **Mails de Supabase** | El servidor de mail que trae Supabase manda muy pocos por hora y es para pruebas. Antes de sumar gente: un SMTP propio (Resend, Postmark o similar) | **Falta** (config) |

**Otras cosas que marcó Supabase** (avisos de seguridad del proyecto, solo lectura): están en `docs/pendientes-base.md`, para la otra instancia. No bloquean la app.

---

## 6. Sin conexión

Lo que la base ya resolvió (0060): el teléfono genera el `id`, manda `captured_at`, la subida es "insertar y si ese id ya existe, no hacer nada", y los rechazos llegan en castellano.

**Alcance: solo crear gastos e ingresos.** Editar, borrar, contar la plata o confirmar vencimientos sin conexión no: son operaciones sobre un estado que el teléfono no puede garantizar que siga siendo el de la base.

**Cómo se guarda en el teléfono:**

- **Una cola ("outbox")**: una lista de gastos pendientes de subir, cada uno con su `id` (UUID generado al tocar Guardar), `captured_at` (la hora del teléfono en ese momento), los campos del gasto, y su estado: `pendiente`, `subiendo` o `rechazado` (con el mensaje de la base).
- Se guarda como **un archivo JSON escrito de forma atómica** (o queda el archivo viejo entero o el nuevo entero, nunca uno a medias), dentro de la app y protegido por el cifrado de iOS. Un solo `actor` de Swift lo toca, así dos subidas no se pisan.
- **Se escribe en el archivo antes de intentar subir.** Así un gasto no se pierde nunca: ni si se corta la red, ni si iOS cierra la app, ni si se queda sin batería.

**Cómo se sube:**

- Al guardar (si hay red), al volver a tener red (el sistema avisa), al abrir la app, y de vez en cuando en segundo plano (iOS decide cuándo; es "mejor esfuerzo").
- En orden de carga, de a uno o en lote.
- Según lo que responde la base:
  - **Entró, o ya existía** (un reintento de algo que sí había llegado): se saca de la cola. Para "insertar si no existe" las dos cosas son éxito.
  - **Error de red o del servidor (5xx)**: queda `pendiente` y se reintenta, esperando cada vez un poco más.
  - **Sesión vencida (401)**: se refresca el token y se reintenta. Si el refresco falla, se pide iniciar sesión **sin tocar la cola**.
  - **Rechazo de una regla** (ej. la cuenta se ocultó mientras estabas sin señal): queda `rechazado` con el mensaje de la base. La persona lo ve en Movimientos ("No se pudo guardar: …"), lo corrige (elige otra cuenta) y se reintenta **con el mismo id**.
- **Cerrar sesión con gastos sin subir**: se avisa ("Tenés 3 gastos sin subir") antes de borrar nada.

**Cómo se ve:** el gasto aparece en la lista al instante, con una marca discreta de "sin subir" (un punto apagado, como pide `PRODUCT.md` para lo que pide atención sin ser grave), y los números de la pantalla le suman su monto (sección 4 del informe de reglas: Gastos o Ingresos, "Te sobró", el saldo de la cuenta y su categoría, solo si cae en el período que estás mirando). Cuando el servidor confirma, se reemplazan por los del servidor sin que salte nada.

**La caché de lectura** (para que la app abra al instante con los últimos números, sin esqueletos): la última respuesta de cada consulta, en archivos JSON del mismo lugar. Se borra al cerrar sesión.

**Alternativas:**

| Opción | Pros | Contras |
|---|---|---|
| **Archivos JSON atómicos (propuesta)** | Cero dependencias, se entiende leyendo el código, alcanza para decenas de pendientes | No sirve para consultar (filtrar, ordenar) muchos datos sin conexión |
| SwiftData (la base local de Apple) | Nativa, consultable | Más magia y más casos raros; útil si algún día se muestra el historial entero sin conexión |
| SQLite con GRDB | Muy robusta y consultable | Una dependencia más |
| PowerSync / sincronización completa | Toda la base sin conexión | Servicio pago y otra pieza de infraestructura, para algo que no pedimos |

Si más adelante hace falta ver el historial entero sin señal, se cambia a SwiftData o GRDB detrás del mismo `actor`, sin tocar las pantallas.

---

## 7. Escala: miles de usuarios

**Buena noticia primero:** lo más caro ya está bien pensado. Los totales los suma la base (nada choca con el corte de 1000 filas), los precios son un catálogo compartido que el cron llena una vez por día para todos, y RLS aísla a cada usuario.

**Lo que hay que cuidar** (todo es trabajo de base, para la otra instancia o para después de la mudanza):

1. **Las reglas de acceso se evalúan fila por fila.** Supabase marca hoy 15 policies que escriben `auth.uid()` directo. Escrito como `(select auth.uid())`, Postgres lo calcula una vez por consulta en vez de una vez por fila. Es un cambio mecánico (una migración) y el que más rinde a escala.
2. **Índices para las consultas por período.** Las funciones de totales filtran por usuario y fecha; hoy `transactions` tiene índice por `user_id` pero no por `(user_id, date)`. Con miles de usuarios y años de datos, ese índice compuesto es el que evita recorrer todo el historial de alguien para sumar un mes. Lo mismo para `contributions (asset_id, date)`. Supabase además marca 6 claves foráneas sin índice (la importante: `transactions.category_id`). Se confirma con `EXPLAIN` sobre un set de datos grande antes de agregar cada uno.
3. **Precios una vez para todos.** Los cierres diarios ya son así. Los **precios en vivo** de cripto hoy los pide cada navegador; con la Edge Function del informe (guarda el precio y responde lo guardado si tiene menos de un minuto) son **una llamada por minuto sin importar cuántos usuarios haya**, y todos ven el mismo número.
4. **Nada de tiempo real ni de pedir cada X segundos.** La app pide al abrir y al volver al frente, y muestra lo guardado mientras tanto. Realtime (sockets abiertos) no hace falta para datos que cambia una sola persona.
5. **Límites de Auth:** Supabase limita intentos de login y mails por hora; los de login están bien como vienen. Los mails necesitan el SMTP propio (sección 5).

**Costos de Supabase** (valores de su página de precios según lo último que conozco; **confirmalos ahí** antes de decidir):

| Plan | Qué da | Problema |
|---|---|---|
| Free | ~500 MB de base, 50.000 usuarios activos por mes | **Pausa el proyecto tras una semana sin uso** y no tiene backups diarios: no sirve para una app publicada |
| Pro (~25 USD/mes) | ~8 GB de base, 100.000 usuarios activos, backups diarios, sin pausa | — |

**Cuenta rápida:** un movimiento ocupa del orden de medio KB con sus índices. 1.000 usuarios cargando 3 por día son ~1 millón de filas por año, alrededor de 0,5–1 GB. Entra holgado en Pro por años.

**[DECIDIDO]: se sigue en Free y se pasa a Pro cuando la app vaya a producción real (usuarios que no conocés).** Mientras tanto, dos cosas a tener presentes: la pausa por inactividad no aplica mientras la uses todos los días, y **Free no tiene backups diarios**, así que la exportación de datos de la web es el respaldo. Pasar a Pro es un requisito de la etapa de publicación (paso 12).

---

## 8. Notificaciones de vencimientos

| | Locales (las programa el teléfono) | Desde el servidor (push) |
|---|---|---|
| Qué son | La app calcula los próximos vencimientos y le dice a iOS "avisame el 10 a las 9" | La base decide a quién avisar y le manda un push vía Apple (APNs) |
| Cuenta de Apple | Funcionan con la **gratuita** | **Exigen la paga** |
| Sin conexión | Funcionan | Llegan cuando hay red |
| Qué hace falta en la base | Nada nuevo: leer los vencimientos | Tabla de tokens por dispositivo, un cron diario, una Edge Function que hable con APNs (y FCM para Android), y **el cálculo de vencimientos en SQL** (hoy solo existe en JS) |
| Límite | iOS guarda hasta 64 avisos programados por app; alcanza para los próximos 2–3 meses | Ninguno práctico |
| Punto débil | Si cargás un plan desde la web, el iPhone no se entera hasta que abrís la app (se reprograma todo en cada apertura y en segundo plano, a mejor esfuerzo) | Más piezas, más cosas que mantener; costo casi nulo en Supabase |

**Decisión: locales primero.** **[DECIDIDO]** Cubren "mañana vence la tarjeta" sin servidor, sin cuenta paga y sin conexión, y se programan desde los mismos datos que la pantalla A pagar ya lee. **Push desde el servidor** se suma cuando el cálculo de vencimientos viva en SQL (paso 7 de la mudanza) y haya cuenta paga; ahí el servidor puede avisar aunque el teléfono lleve días sin abrir la app. En Android el equivalente local es igual de simple.

Se pide el permiso de notificaciones **cuando la persona carga su primer vencimiento**, no al abrir la app por primera vez: sin contexto, la mayoría dice que no.

---

## 9. Pruebas y publicación

### Tests en Swift

- **Swift Testing** (el framework nuevo de Apple: `@Test`, `#expect`), que viene con Xcode.
- **Qué se prueba** (lo que la app hace de verdad, porque las reglas se prueban en la base):
  - que los tipos decodifican las respuestas de muestra de `contract/fixtures/` (sección 3);
  - la cola sin conexión: reintentos, rechazos, "ya existía" como éxito, que un gasto no se pierda si falla la escritura;
  - la suma instantánea: sumarle un gasto a los totales del servidor da lo mismo que el servidor devuelve después (se prueba contra las respuestas de muestra);
  - el formato de montos y fechas (es-AR, dos monedas).
- **Tests de pantalla (UI tests):** no al principio. Son lentos y frágiles; los ponemos para el flujo de cargar un gasto cuando esté estable.

### Cómo corren en el CI

Hoy `.github/workflows/test.yml` corre en Ubuntu con Postgres. Se suman dos trabajos:

1. **`contract`** (Ubuntu, el mismo Postgres): aplica las migraciones, regenera `contract/schema.json` y `contract/fixtures/`, regenera los tokens de diseño, y **falla si algo difiere de lo commiteado**.
2. **`ios`** (macOS, solo si cambió `ios/`, `contract/` o `design/`): `xcodebuild test` en un simulador.

**Costo:** el repo es **público**, así que los runners de macOS de GitHub Actions son **gratis**. (Si algún día lo hacés privado, los minutos de macOS cuentan 10 veces más y el plan gratis se acaba rápido: ahí se corre `ios` solo en los PR.)

### Probar en tu iPhone con la cuenta gratuita

Se puede, con límites:

1. Xcode → Settings → Accounts → agregar tu Apple ID. Eso crea un "Personal Team".
2. En el iPhone: Ajustes → Privacidad y seguridad → **Modo desarrollador** → activar (reinicia el teléfono).
3. Conectás el iPhone por cable (después también anda por Wi-Fi), elegís tu iPhone arriba en Xcode y Run.
4. La primera vez: en el iPhone, Ajustes → General → VPN y gestión de dispositivos → confiar en tu certificado.

**Límites de la cuenta gratuita:**

- **La app deja de abrir a los 7 días**; hay que volver a instalarla desde Xcode (un Run). Tus datos no se pierden: están en Supabase y la cola local sobrevive a la reinstalación.
- Hasta 3 apps a la vez en el teléfono.
- **Sin notificaciones push, sin Universal Links, sin TestFlight y sin tienda.**
- **Sí funcionan:** Keychain, Face ID, notificaciones locales, segundo plano, todo lo de esta propuesta salvo el push.

**Cuándo pagar los 99 USD/año:** cuando quieras que otra persona la use (TestFlight) o no quieras reinstalar cada semana. **[DECIDIDO]: hasta entonces, solo tu iPhone.** Todo el desarrollo de las primeras pantallas se hace sin pagar.

---

## 10. Orden de construcción

Corrección importante respecto del pedido: **Movimientos, Mi plata y A pagar no tienen el backend completo** (sección 3). Lo que sí está completo es **cargar**, **los totales** y **los saldos**. El orden aprovecha eso y deja cada pantalla para cuando su pieza de base exista.

| # | Qué | Usa | Depende de la otra instancia |
|---|---|---|---|
| 0 | **Esqueleto**: proyecto (hecho: pantalla vacía), SDK, login, sesión en Keychain, Face ID, las cinco pestañas vacías, tokens de diseño, CI de iOS, contrato con sus respuestas de muestra | Auth | No |
| 0b | **Ajustes mínimo: cerrar sesión y borrar mi cuenta** — desde la primera versión, por decisión | `delete_account` (Edge Function) | **Sí** (`docs/pendientes-base.md`). Mientras no exista, el botón no se muestra |
| 1 | **Cargar un gasto o ingreso**, con las seis categorías más usadas y **sin conexión desde el día uno** | `get_top_categories`, `categories`, `liquid_accounts`, insert idempotente | No — es lo más valioso ("cargar un gasto es más rápido que no cargarlo") y lo que está listo |
| 2 | **Movimientos: los renglones del período** (Gastos, Ingresos, Invertido, Ahorrado, Deudas en palabras, Te sobró) y gastos por categoría, con la suma instantánea | `get_period_totals`, `get_expenses_by_category` | No |
| 3 | **Mi plata: saldos por cuenta**, disponible y ahorro por moneda | `get_liquid_summary`, `get_liquid_by_account` | No |
| 4 | **Mi plata: transferir entre cuentas** | `create_account_transfer` | No |
| 5 | **Movimientos: la lista** | la lista armada en el servidor | **Sí**: Edge Function del apareo (paso 6 de la mudanza) |
| 6 | **Mi plata: contar mi plata**, con vista previa | `reconcile_liquid` + vista previa en SQL | **Sí** (paso 5 de la mudanza, junto con el conteo retroactivo) |
| 7 | **A pagar: deudas** (saldo, pagos con intereses) | `debt_balances`, `debt_payment_parts`, `save_debt` | No — está listo; se puede adelantar al lugar 5 si la lista tarda |
| 8 | **A pagar: tarjetas, cuotas y suscripciones**, y las notificaciones locales | cálculo de vencimientos en SQL, `confirm_…` | **Sí** (paso 7 de la mudanza) |
| 9 | **Ajustes**: categorías, cuentas, apariencia | tablas | No |
| 10 | **Inicio** | lo anterior + Total en USD | **Sí** (pasos 10–11 de la mudanza) |
| 11 | **Inversiones** | la foto del portafolio en SQL | **Sí** (pasos 8–12). Al final, como pediste |
| 12 | **Publicación**: privacy manifest final, política de privacidad, cuenta demo, TestFlight; Supabase Pro antes de abrir a desconocidos | — | Cuenta paga |

Con 0–4 ya tenés una app que usás todos los días: cargar gastos en el subte, ver cuánto gastaste en el mes y cuánto hay en cada cuenta. **Android** arranca cuando iOS llegue al paso 4 y el contrato esté probado con un cliente real: la segunda app es mucho más barata con el contrato ya estable.

**Lo que le toca a la otra instancia** está en `docs/pendientes-base.md`, en orden. Ninguno lo toco yo.

---

## Resumen en 10 líneas

1. Un solo repo con carpetas `ios/`, `android/`, `contract/` y `design/`; cada instancia de Claude en su propio worktree para no pisarse.
2. iOS 18 como mínimo, SwiftUI puro, una sola dependencia: el SDK oficial de Supabase.
3. Los tipos de Swift se escriben a mano y un test los compara con respuestas reales de la base.
4. El contrato son las funciones `get_*` y unas pocas tablas; nunca se cambian de forma incompatible, y el CI frena cualquier cambio que no se vea.
5. Colores y medidas en un JSON del que salen Swift, Kotlin y CSS; cambiar la paleta es editar un archivo.
6. Sesión en el Keychain, Face ID como candado al abrir, y ningún secreto dentro de la app.
7. Sin conexión: una cola en el teléfono que guarda antes de subir, reintenta con el mismo id y muestra los rechazos.
8. Para miles de usuarios faltan ajustes chicos en la base (reglas de acceso e índices), y Supabase Pro cuando haya usuarios desconocidos.
9. Avisos de vencimientos locales primero; push cuando el cálculo viva en la base y pagues la cuenta de Apple.
10. Se arranca por cargar gastos, los totales y los saldos, que ya están listos; la lista, el conteo, A pagar e Inversiones esperan su pieza en la base.

---

## Decisiones tomadas (2026-09-29)

| # | Tema | Decisión |
|---|---|---|
| 1 | Repo | Un solo repo; cada instancia en su propio worktree |
| 2 | iOS mínimo | **iOS 18** (no 26). Liquid Glass llega solo con los componentes estándar |
| 3 | Tipos | A mano, con el test contra respuestas reales de la base |
| 4 | Letra | Sigue el tamaño elegido en el iPhone (Dynamic Type) |
| 5 | Face ID | Al abrir y a los 5 minutos en segundo plano; apagable en Ajustes |
| 6 | Registro y recuperación | En la web en la primera versión. **Borrar la cuenta, dentro de la app desde el inicio** |
| 7 | Distribución | Solo tu iPhone hasta pagar la cuenta de Apple; después, TestFlight |
| 8 | Supabase | Free por ahora; Pro cuando la app pase a producción real (usuarios desconocidos) |
| 9 | Notificaciones | Locales primero |
| 10 | Orden | Aprobado (con el paso 0b de borrar la cuenta) |
| 11 | Pendientes de base | En `docs/pendientes-base.md`, para la otra instancia |
