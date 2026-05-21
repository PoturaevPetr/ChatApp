# syntax=docker/dockerfile:1
# Статический экспорт Next.js (out/) + nginx. Те же NEXT_PUBLIC_* что для APK — через build-args / .env.docker.

FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# --- Публичные переменные (вшиваются в JS при сборке) ---
ARG NEXT_PUBLIC_CHAT_API_URL=https://chat.pirogov.ai
ARG NEXT_PUBLIC_OLLAMA_BASE_URL=https://llm.oclinica.ru
ARG NEXT_PUBLIC_OLLAMA_MODEL=gemma3:4b
ARG NEXT_PUBLIC_OLLAMA_API_KEY=
ARG NEXT_PUBLIC_OLLAMA_API_KEY_HEADER=
# true = браузер в Docker ходит на /api/ollama-proxy (nginx ниже). Для APK оставляйте false.
ARG NEXT_PUBLIC_OLLAMA_USE_SAME_ORIGIN_PROXY=true
ARG NEXT_PUBLIC_MEET_SERVICE_URL=
ARG NEXT_PUBLIC_TRANSCRIBE_URL=
ARG NEXT_PUBLIC_OAUTH_NATIVE_BRIDGE_URL=

ENV NODE_ENV=production \
    NEXT_PUBLIC_CHAT_API_URL=$NEXT_PUBLIC_CHAT_API_URL \
    NEXT_PUBLIC_OLLAMA_BASE_URL=$NEXT_PUBLIC_OLLAMA_BASE_URL \
    NEXT_PUBLIC_OLLAMA_MODEL=$NEXT_PUBLIC_OLLAMA_MODEL \
    NEXT_PUBLIC_OLLAMA_API_KEY=$NEXT_PUBLIC_OLLAMA_API_KEY \
    NEXT_PUBLIC_OLLAMA_API_KEY_HEADER=$NEXT_PUBLIC_OLLAMA_API_KEY_HEADER \
    NEXT_PUBLIC_OLLAMA_USE_SAME_ORIGIN_PROXY=$NEXT_PUBLIC_OLLAMA_USE_SAME_ORIGIN_PROXY \
    NEXT_PUBLIC_MEET_SERVICE_URL=$NEXT_PUBLIC_MEET_SERVICE_URL \
    NEXT_PUBLIC_TRANSCRIBE_URL=$NEXT_PUBLIC_TRANSCRIBE_URL \
    NEXT_PUBLIC_OAUTH_NATIVE_BRIDGE_URL=$NEXT_PUBLIC_OAUTH_NATIVE_BRIDGE_URL

RUN npm run build

RUN test -d out && test -f out/index.html

FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache gettext \
  && rm -f /etc/nginx/conf.d/default.conf

COPY docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

COPY --from=builder /app/out /usr/share/nginx/html

ENV OLLAMA_UPSTREAM=https://llm.oclinica.ru

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
