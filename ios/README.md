# EnCuenta para iOS

SwiftUI, iOS 18 o más, una sola dependencia (el SDK de Supabase). Arquitectura y decisiones: `docs/arquitectura-nativa.md`, ADR-023 y ADR-032. Qué le pide a la base: `contract/README.md`.

## Correrla

1. Copiá `Config/Secrets.example.xcconfig` a `Config/Secrets.xcconfig` y completá la URL y la clave pública (las mismas de `.env`).
2. Abrí `EnCuenta.xcodeproj` y dale a Run, o desde la terminal:

```bash
scripts/ios-run.sh "iPhone 17"
```

Ese script compila, instala en el simulador y abre la app ya con el usuario de prueba de `.env.test.local`, sin pedir el código del dispositivo. Las credenciales viajan como variables de entorno del proceso; no quedan en el código.

## Tests

```bash
xcodebuild test -project ios/EnCuenta.xcodeproj -scheme EnCuenta -destination 'platform=iOS Simulator,name=iPhone 17'
```

## Dónde está cada cosa

- `App/`: arranque, sesión, candado (Face ID), pestañas, versión mínima.
- `Core/Backend/`: el cliente, los tipos del contrato (`Models.swift`) y todas las llamadas a la base (`API.swift`).
- `Core/Offline/Outbox.swift`: la cola de gastos sin subir.
- `Core/Design/`: `Tokens.swift` se genera desde `design/tokens.json` (`node scripts/generate-tokens.mjs`); no se edita a mano.
- `Core/Format/`: montos y fechas.
- `Features/<pestaña>/`: una carpeta por pestaña, más `Capture/` (la hoja de cargar un gasto).

Las carpetas están sincronizadas con el proyecto: un archivo nuevo entra solo al target.
