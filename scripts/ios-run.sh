#!/bin/sh
# Compila la app y la abre en el simulador con el usuario de prueba, sin que
# las credenciales pasen por la pantalla: se leen de .env.test.local (el de
# este worktree o el del checkout principal) y viajan como variables de
# entorno del proceso. Uso: scripts/ios-run.sh ["iPhone 17"]
set -e
DEVICE="${1:-iPhone 17}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVFILE="$ROOT/.env.test.local"
[ -f "$ENVFILE" ] || ENVFILE="$ROOT/../app-finances/.env.test.local"
cd "$ROOT/ios"
xcodebuild -project EnCuenta.xcodeproj -scheme EnCuenta \
  -destination "platform=iOS Simulator,name=$DEVICE" -derivedDataPath build build 2>&1 \
  | grep -E "error|BUILD" | sort -u
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl install "$DEVICE" build/Build/Products/Debug-iphonesimulator/EnCuenta.app
xcrun simctl terminate "$DEVICE" com.ignaciobattaglino.encuenta 2>/dev/null || true
EMAIL="$(grep '^TEST_USER_EMAIL=' "$ENVFILE" | cut -d= -f2-)"
PASS="$(grep '^TEST_USER_PASSWORD=' "$ENVFILE" | cut -d= -f2-)"
SIMCTL_CHILD_TEST_USER_EMAIL="$EMAIL" SIMCTL_CHILD_TEST_USER_PASSWORD="$PASS" SIMCTL_CHILD_SKIP_LOCK=1 \
  xcrun simctl launch "$DEVICE" com.ignaciobattaglino.encuenta >/dev/null
echo "lanzada en $DEVICE"
