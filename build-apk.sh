#!/bin/bash
# Сборка APK для Kindred
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PROJECT_DIR="$SCRIPT_DIR"
APP_NAME="Kindred"
APK_OUT_NAME="Kindred.apk"

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
# Папку android не удаляем: при «обнулении» вручную достаточно снова запустить скрипт — выполнится
# `cap add android` (если папки нет) и `cap sync`, который перезаписывает сгенерированные файлы в android/.
# Любые постоянные правки нативного слоя (манифест, разрешения) держим здесь, после cap sync.

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

# После cap sync тема запуска может снова ссылаться на @drawable/splash — возвращаем белый splash + иконка по центру.
STYLES="$PROJECT_DIR/android/app/src/main/res/values/styles.xml"
if [ -f "$PROJECT_DIR/android/app/src/main/res/drawable/splash_white.xml" ] && [ -f "$STYLES" ] && grep -q '@drawable/splash</item>' "$STYLES" && ! grep -q 'splash_white' "$STYLES"; then
  echo "🔧 Восстанавливаю @drawable/splash_white для экрана запуска…"
  sed -i.bak 's|@drawable/splash</item>|@drawable/splash_white</item>|' "$STYLES" && rm -f "${STYLES}.bak"
fi

# FCM: google-services.json должен лежать в android/app (Gradle подключает плагин только оттуда).
if [ -f "$PROJECT_DIR/google-services.json" ]; then
  cp "$PROJECT_DIR/google-services.json" "$PROJECT_DIR/android/app/google-services.json"
  echo "📱 Обновлён android/app/google-services.json из корня проекта (FCM)."
elif [ ! -f "$PROJECT_DIR/android/app/google-services.json" ]; then
  echo "⚠️  Нет google-services.json — FCM-пуши не заработают. Положите файл в корень ChatApp или в android/app/."
fi

# Патчим манифест после cap sync: добавляем нужные permissions, если их ещё нет.
# READ_MEDIA_* / READ_EXTERNAL_STORAGE — для @capacitor-community/media (androidGalleryMode: true в capacitor.config.ts),
# иначе после «свежего» android/ превью галереи в модалке вложений не заработают.
# ACCESS_*_LOCATION — для navigator.geolocation в WebView (модалка «Геопозиция» в чате).
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  for perm in \
    "RECORD_AUDIO" \
    "MODIFY_AUDIO_SETTINGS" \
    "POST_NOTIFICATIONS" \
    "ACCESS_COARSE_LOCATION" \
    "ACCESS_FINE_LOCATION" \
    "READ_MEDIA_IMAGES" \
    "READ_MEDIA_VIDEO" \
    "READ_EXTERNAL_STORAGE" \
    "WRITE_EXTERNAL_STORAGE"; do
    if ! grep -q "android.permission.$perm" "$MANIFEST"; then
      echo "🔧 Добавляю $perm в AndroidManifest..."
      # BSD sed (macOS) не принимает перевод строки в подстановке — вставляем через awk.
      awk -v p="$perm" '
        /<uses-permission android:name="android.permission.INTERNET"/ {
          print
          print "    <uses-permission android:name=\"android.permission." p "\" />"
          next
        }
        { print }
      ' "$MANIFEST" > "${MANIFEST}.new" && mv "${MANIFEST}.new" "$MANIFEST"
    fi
  done
fi

# Удаляем adaptive icons от Capacitor, чтобы использовались наши сгенерированные.
echo "🗑️  Удаляю adaptive icons от Capacitor..."
rm -rf android/app/src/main/res/mipmap-anydpi-v26 || true
rm -f android/app/src/main/res/mipmap-*/ic_launcher_foreground.png || true

# Генерируем иконки приложения из ./icon.png
echo "🎨 Генерирую иконки приложения..."
if [ -f "icon.png" ] && [ -f "generate_icons.py" ]; then
  python3 generate_icons.py "icon.png" "android/app/src/main/res"
else
  echo "  ⚠️ icon.png или generate_icons.py не найден, пропускаю генерацию иконок"
fi

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

# Принудительно обновляем отображаемое имя приложения
STRINGS_FILE="android/app/src/main/res/values/strings.xml"
if [ -f "$STRINGS_FILE" ]; then
  echo "🔧 Обновляю строковые ресурсы приложения ($APP_NAME)..."
  sed -i.bak "s|<string name=\"app_name\">[^<]*</string>|<string name=\"app_name\">${APP_NAME}</string>|" "$STRINGS_FILE" || true
  sed -i.bak "s|<string name=\"title_activity_main\">[^<]*</string>|<string name=\"title_activity_main\">${APP_NAME}</string>|" "$STRINGS_FILE" || true
  rm -f "${STRINGS_FILE}.bak" || true
fi

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
