# ChatApp

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


