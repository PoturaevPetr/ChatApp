#!/bin/sh
set -e

OLLAMA_UPSTREAM="${OLLAMA_UPSTREAM:-https://llm.oclinica.ru}"
OLLAMA_UPSTREAM="${OLLAMA_UPSTREAM%/}"

# Host для proxy_set_header (https://llm.example.ru → llm.example.ru)
case "$OLLAMA_UPSTREAM" in
  http://*) OLLAMA_PROXY_HOST="${OLLAMA_UPSTREAM#http://}" ;;
  https://*) OLLAMA_PROXY_HOST="${OLLAMA_UPSTREAM#https://}" ;;
  *) OLLAMA_PROXY_HOST="$OLLAMA_UPSTREAM" ;;
esac
OLLAMA_PROXY_HOST="${OLLAMA_PROXY_HOST%%/*}"

export OLLAMA_UPSTREAM OLLAMA_PROXY_HOST

envsubst '${OLLAMA_UPSTREAM} ${OLLAMA_PROXY_HOST}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
