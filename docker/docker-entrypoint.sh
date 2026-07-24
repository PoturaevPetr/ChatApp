#!/bin/sh
set -e

cp /etc/nginx/nginx.conf.template /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
