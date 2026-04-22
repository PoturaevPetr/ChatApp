#!/bin/bash
# Сборка iOS (Kindred / Capacitor + Next.js static export).
# По умолчанию: Debug под iOS Simulator (без подписи устройства).
#
# Что нужно на машине:
#   • macOS (Xcode под iOS только на Mac).
#   • Xcode из App Store или xcode-select --install (CLT недостаточно для Simulator SDK).
#   • CocoaPods: sudo gem install cocoapods  или  brew install cocoapods
#   • Node/npm как для Android-сборки.
#
# Для установки на физический iPhone / TestFlight / App Store:
#   • Аккаунт Apple Developer (платная подписка $99/год для распространения).
#   • В Xcode: ios/App/App.xcworkspace → Signing & Capabilities → Team + уникальный Bundle ID
#     (сейчас в capacitor.config.ts: appId com.kindred.messapp).
#   • Push (APNs): capability Push Notifications, ключ/сертификаты в Apple Developer Portal.
#   • FCM на iOS: положите GoogleService-Info.plist в корень ChatApp/ — скрипт скопирует в App.
#
# Переменные окружения:
#   IOS_SIMULATOR — имя симулятора для -destination (по умолчанию: generic/platform=iOS Simulator).
#   IOS_BUILD_MODE=simulator|open-only
#     simulator — xcodebuild (по умолчанию).
#     open-only — только cap sync + pod install + open Xcode (собрать/подписать вручную).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PROJECT_DIR="$SCRIPT_DIR"
APP_NAME="Kindred"
IOS_BUILD_MODE="${IOS_BUILD_MODE:-simulator}"
IOS_SIMULATOR="${IOS_SIMULATOR:-generic/platform=iOS Simulator}"

echo "🍎 Сборка iOS: $APP_NAME"
echo "   Проект: $PROJECT_DIR"
echo "   Режим:  $IOS_BUILD_MODE"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "❌ Сборка iOS возможна только на macOS."
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "❌ xcodebuild не найден. Установите Xcode и выполните:"
  echo "   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 1
fi

DEV_DIR="$(xcode-select -p 2>/dev/null || true)"
if [[ "$DEV_DIR" != *"Xcode.app"* ]]; then
  echo "❌ Активна только Command Line Tools (сейчас: ${DEV_DIR:-не задано})."
  echo "   Для iOS-сборки нужен полный Xcode из App Store, затем:"
  echo "   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  echo "   sudo xcodebuild -license accept   # при необходимости"
  exit 1
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "❌ CocoaPods (pod) не найден. Установите, например:"
  echo "   brew install cocoapods"
  exit 1
fi

echo "🧹 Очистка Next.js out..."
rm -rf out .next

echo "📦 Сборка Next.js..."
npm run build
if [ ! -d "out" ]; then
  echo "❌ Папка out не создана после npm run build"
  exit 1
fi

if [ ! -d "ios" ]; then
  echo "🍎 Добавление iOS платформы..."
  npx cap add ios
fi

echo "🔄 Синхронизация Capacitor (ios)..."
npx cap sync ios

# FCM / Firebase iOS (опционально)
IOS_APP_DIR="$PROJECT_DIR/ios/App"
if [ -f "$PROJECT_DIR/GoogleService-Info.plist" ]; then
  mkdir -p "$IOS_APP_DIR/App"
  cp "$PROJECT_DIR/GoogleService-Info.plist" "$IOS_APP_DIR/App/GoogleService-Info.plist"
  echo "📱 Обновлён ios/App/App/GoogleService-Info.plist из корня проекта."
elif [ ! -f "$IOS_APP_DIR/App/GoogleService-Info.plist" ]; then
  echo "⚠️  Нет GoogleService-Info.plist — FCM на iOS не настроен. Положите файл в корень ChatApp/ при необходимости."
fi

echo "📚 CocoaPods..."
cd "$IOS_APP_DIR"
pod install --silent
cd "$PROJECT_DIR"

if [ "$IOS_BUILD_MODE" = "open-only" ]; then
  echo "📂 Открываю Xcode (сборка вручную)..."
  npx cap open ios
  echo "✅ Готово. В Xcode: Product → Destination → симулятор или устройство → Run."
  exit 0
fi

DERIVED="$PROJECT_DIR/.ios-derived"
rm -rf "$DERIVED"
mkdir -p "$DERIVED"

WORKSPACE="$IOS_APP_DIR/App.xcworkspace"
SCHEME="App"

if [ ! -d "$WORKSPACE" ]; then
  echo "❌ Не найден workspace: $WORKSPACE (после pod install должен появиться App.xcworkspace)"
  exit 1
fi

echo "🏗 xcodebuild (Simulator, Debug)…"
echo "   destination: $IOS_SIMULATOR"

set +e
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "$IOS_SIMULATOR" \
  -derivedDataPath "$DERIVED" \
  build
XC_STATUS=$?
set -e

if [ "$XC_STATUS" -ne 0 ]; then
  echo ""
  echo "⚠️  xcodebuild завершился с ошибкой (часто — подпись / Team / версия iOS симулятора)."
  echo "   Соберите в Xcode: IOS_BUILD_MODE=open-only ./build-ios.sh"
  echo "   Или укажите симулятор, например:"
  echo "   IOS_SIMULATOR='platform=iOS Simulator,name=iPhone 16' ./build-ios.sh"
  exit "$XC_STATUS"
fi

APP_BUNDLE=$(find "$DERIVED" -name "App.app" -type d 2>/dev/null | head -1)
if [ -z "$APP_BUNDLE" ] || [ ! -d "$APP_BUNDLE" ]; then
  echo "❌ App.app не найден в $DERIVED"
  exit 1
fi

OUT_APP="$PROJECT_DIR/Kindred-Simulator.app"
rm -rf "$OUT_APP"
cp -R "$APP_BUNDLE" "$OUT_APP"
echo "✅ Собрано: $OUT_APP"
echo "   Установка в запущенный симулятор (если booted):"
echo "   xcrun simctl install booted \"$OUT_APP\""
echo "🎉 Готово (Simulator). Для устройства используйте Xcode + подпись или CI с сертификатами."
