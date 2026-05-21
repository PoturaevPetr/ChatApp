# Kindred

Приложение для обмена сообщениями между пользователями на базе **Next.js** и **Capacitor**
## Возможности

- **Авторизация**: форма входа и форма регистрации пользователя через API [ChatService] (`/api/v1/auth/login`, `/api/v1/auth/register`)
- Список чатов с превью и счётчиком непрочитанных
- Экран переписки с группировкой по дате
- Отправка текстовых сообщений (данные чата пока в `localStorage`; API сообщений можно подключить отдельно)
- Сборка в статический экспорт для Capacitor (Android / iOS)

## Стек

- **Next.js 15** (App Router, static export)
- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **Zustand** (состояние)
- **Capacitor 7** (мобильные оболочки)
- **date-fns**, **lucide-react**

## Настройка API

Создайте файл `.env.local` (см. `.env.local.example`):

```bash
NEXT_PUBLIC_CHAT_API_URL=https://chat.pirogov.ai
```

По умолчанию используется. Идентификатор клиента при регистрации/входе: `chatapp` (service_id).

## Запуск

```bash
# Установка зависимостей
npm install

# Режим разработки
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). На экране авторизации доступны вкладки **Вход** и **Регистрация**. После входа доступны чаты (список и переписка пока работают с локальными данными; для полной интеграции с ChatService нужно подключить REST/WebSocket для сообщений).

## Сборка и Capacitor

```bash
# Статическая сборка (результат в папке out/)
npm run build

# Инициализация Capacitor (один раз)
npx cap init

# Добавление платформ
npm run cap:add:android
npm run cap:add:ios

# Синхронизация веб-сборки в нативные проекты
npm run cap:sync

# Открытие в Android Studio / Xcode
npm run cap:open:android
npm run cap:open:ios
```

Перед `cap sync` всегда выполняется `npm run build`; Capacitor подхватывает содержимое папки `out/` как веб-приложение.

## Docker (веб) и мобильное приложение из одного репозитория

Оба варианта собирают статический каталог `out/`, но **разные env-файлы** и команда сборки:

- **APK / iOS:** `npm run build` (с `prebuild` → `scripts/copy-launch-assets.mjs`)
- **Docker:** `npm run build:docker` (только `next build`, без `prebuild`)

| Цель | Env-файл | Ollama в браузере/вебе |
|------|----------|-------------------------|
| **APK / iOS** | `.env.local` | Прямой URL `NEXT_PUBLIC_OLLAMA_BASE_URL` (CapacitorHttp) |
| **Docker (nginx)** | `.env.docker` | Прокси `/api/ollama-proxy` (`NEXT_PUBLIC_OLLAMA_USE_SAME_ORIGIN_PROXY=true`) |

### Веб в Docker

```bash
cp .env.docker.example .env.docker
# Отредактируйте NEXT_PUBLIC_CHAT_API_URL, NEXT_PUBLIC_OLLAMA_API_KEY и т.д.

npm run docker:build
npm run docker:up
```

Откройте `http://localhost:3080` (порт задаётся `CHATAPP_HTTP_PORT` в `.env.docker`).

ChatService должен быть доступен по URL из `NEXT_PUBLIC_CHAT_API_URL` (с хоста браузера или из той же сети).

Пересборка образа нужна при смене любого `NEXT_PUBLIC_*`. Смена только `OLLAMA_UPSTREAM` в compose — без пересборки (runtime nginx).

### Мобильное приложение (как раньше)

```bash
# .env.local — без NEXT_PUBLIC_OLLAMA_USE_SAME_ORIGIN_PROXY=true
./build-apk.sh
```

Или вручную: `npm run build` → `npx cap sync android`.


