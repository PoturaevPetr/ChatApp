#!/bin/bash
# Сборка APK для Pepa (ChatApp)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PROJECT_DIR="$SCRIPT_DIR"
APP_NAME="Pepa"
APK_OUT_NAME="Pepa.apk"

echo "🔧 Сборка APK: $APP_NAME"
echo "   Проект: $PROJECT_DIR"

# Java для сборки Android
if [ -z "${JAVA_HOME:-}" ]; then
    for j in /usr/local/opt/openjdk@21 /opt/homebrew/opt/openjdk@21 /usr/local/opt/openjdk@17 /opt/homebrew/opt/openjdk@17; do
        if [ -d "$j" ]; then
            export JAVA_HOME="$j"
            break
        fi
    done
fi
export PATH="${JAVA_HOME:-}/bin:$PATH"

if ! command -v java >/dev/null 2>&1; then
    echo "❌ Java не найдена. Установите OpenJDK 17 или 21."
    exit 1
fi

# Gradle cache внутри проекта
export GRADLE_USER_HOME="$PROJECT_DIR/.gradle-home"
mkdir -p "$GRADLE_USER_HOME"

# Очистка
echo "🧹 Очистка предыдущих сборок..."
rm -rf out .next
# Не удаляем android целиком — он может уже быть добавлен

# Next.js
echo "📦 Сборка Next.js..."
npm run build
if [ ! -d "out" ]; then
    echo "❌ Папка out не создана после npm run build"
    exit 1
fi

# Android платформа
if [ ! -d "android" ]; then
    echo "🤖 Добавление Android платформы..."
    npx cap add android
fi

echo "🔄 Синхронизация Capacitor..."
npx cap sync android

# Network security (для chat.pirogov.ai и локального API)
echo "🔧 Настройка сети Android..."
mkdir -p android/app/src/main/res/xml
cat > android/app/src/main/res/xml/network_security_config.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">chat.pirogov.ai</domain>
    </domain-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
EOF

# Патчим AndroidManifest для доступа к API (cleartext + network config)
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ] && ! grep -q "networkSecurityConfig" "$MANIFEST"; then
    echo "🔧 Добавляю network security в AndroidManifest..."
    sed -i.bak 's|android:theme="@style/AppTheme">|android:theme="@style/AppTheme" android:usesCleartextTraffic="true" android:networkSecurityConfig="@xml/network_security_config">|' "$MANIFEST"
    rm -f "${MANIFEST}.bak"
fi

# Gradle wrapper: предпочитать bin
if [ -f "android/gradle/wrapper/gradle-wrapper.properties" ]; then
    sed -i.bak 's/-all\.zip/-bin.zip/g' android/gradle/wrapper/gradle-wrapper.properties 2>/dev/null || true
fi

# Сборка APK
echo "🏗 Сборка debug APK..."
cd android
chmod +x ./gradlew
./gradlew clean
./gradlew assembleDebug --no-daemon

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
    echo "✅ APK собран: $APK_PATH"
    cp "$APK_PATH" "$PROJECT_DIR/$APK_OUT_NAME"
    echo "   Скопирован: $PROJECT_DIR/$APK_OUT_NAME"
    if [ -d "$HOME/Desktop" ]; then
        cp "$APK_PATH" "$HOME/Desktop/$APK_OUT_NAME"
        echo "   На рабочий стол: $HOME/Desktop/$APK_OUT_NAME"
    fi
    echo "🎉 Готово. Установите $APK_OUT_NAME на устройство."
else
    echo "❌ APK не найден: $APK_PATH"
    exit 1
fi
