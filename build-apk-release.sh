#!/bin/bash
# Релизная подписанная сборка APK Kindred (assembleRelease).
# Пайплайн совпадает с build-apk.sh; keystore.properties лежит в корне ChatApp (не в android/).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
cd "$PROJECT_DIR"

KEYSTORE_PROPS="$PROJECT_DIR/keystore.properties"

echo "🔧 Сборка release APK: Kindred"
echo "   Проект: $PROJECT_DIR"

if [ ! -f "$KEYSTORE_PROPS" ]; then
  echo "❌ Нет файла подписи: $KEYSTORE_PROPS"
  echo "   Создайте в корне ChatApp:"
  echo "   cp keystore.properties.example keystore.properties"
  echo "   Заполните storePassword, keyPassword, keyAlias и storeFile (путь к .keystore от корня проекта)."
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  KS_CHECK=$(PROJECT_DIR="$PROJECT_DIR" python3 <<'PY'
from pathlib import Path
import os

root = Path(os.environ["PROJECT_DIR"])
p = root / "keystore.properties"
if not p.is_file():
    print("MISSING_PROPS")
    raise SystemExit(0)
store = None
for line in p.read_text(encoding="utf-8").splitlines():
    s = line.strip()
    if s.startswith("storeFile=") and not s.startswith("#"):
        store = s.split("=", 1)[1].strip()
        break
if not store:
    print("OK")
    raise SystemExit(0)
path = Path(store)
if not path.is_absolute():
    path = (root / store).resolve()
if path.is_file():
    print("OK")
else:
    print(f"NOFILE:{path}")
PY
)
  case "$KS_CHECK" in
    MISSING_PROPS)
      echo "❌ keystore.properties пропал между проверками."
      exit 1
      ;;
    NOFILE:*)
      echo "❌ В keystore.properties указан storeFile, но файл не найден:"
      echo "   ${KS_CHECK#NOFILE:}"
      exit 1
      ;;
  esac
fi

echo "✅ Подпись: $KEYSTORE_PROPS"
export BUILD_RELEASE=1
exec "$SCRIPT_DIR/build-apk.sh"
