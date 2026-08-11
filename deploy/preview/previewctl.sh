#!/usr/bin/env bash
set -Eeuo pipefail

# This controller is installed outside the checkout and is invoked by the
# trusted workflow. It deliberately keeps all host paths, Docker arguments,
# and Apache templates here instead of accepting them from PR source code.

BASE_ROOT="/home/ubuntu/arcade-previews"
PRODUCTION_ROOT="/home/ubuntu/bcsdlabArcade/Unity-WebGL-IssuesTracker"
PRODUCTION_ENV="$PRODUCTION_ROOT/server/.env"
REPOSITORY_URL="https://github.com/digital8150/Unity-WebGL-IssuesTracker.git"
HOST_SUFFIX="preview.codingbot.kr"
ASSET_ROOT="/usr/local/share/arcade-preview"
APACHE_AVAILABLE="/etc/apache2/sites-available"
APACHE_ENABLED="/etc/apache2/sites-enabled"
CERT_ROOT="/etc/letsencrypt/live/preview.codingbot.kr"
PORT_START=42100
PORT_END=42999

die() {
  echo "[preview] ERROR: $*" >&2
  exit 1
}

require_number() {
  [[ "$1" =~ ^[0-9]+$ ]] || die "invalid PR number"
  (( 10#$1 > 0 )) || die "PR number must be positive"
}

require_sha() {
  [[ "$1" =~ ^[0-9a-fA-F]{40}$ ]] || die "invalid commit SHA"
}

paths_for_pr() {
  local pr="$1"
  ROOT="$BASE_ROOT/pr-$pr"
  SOURCE="$ROOT/source"
  COMPOSE="$ROOT/compose.yml"
  PROJECT="arcade-preview-pr-$pr"
  IMAGE="arcade-preview-pr-$pr:latest"
  HOST="pr-$pr.$HOST_SUFFIX"
  APACHE_NAME="arcade-preview-pr-$pr.conf"
  APACHE_CONF="$APACHE_AVAILABLE/$APACHE_NAME"
  APACHE_LINK="$APACHE_ENABLED/$APACHE_NAME"
  AUTH_FILE="/etc/apache2/.htpasswd-preview-pr-$pr"
}

assert_safe_root() {
  [[ "$ROOT" == "$BASE_ROOT/pr-"* ]] || die "unsafe preview root"
  [[ "$ROOT" != "$BASE_ROOT" && "$ROOT" != "/" ]] || die "refusing broad path"
}

with_lock() {
  mkdir -p "$BASE_ROOT"
  LOCK_PATH="$BASE_ROOT/.lock"
  if ! mkdir "$LOCK_PATH" 2>/dev/null; then
    die "another preview operation is already running"
  fi
  trap 'rmdir "$LOCK_PATH" 2>/dev/null || true' EXIT
}

find_port() {
  local port
  for ((port=PORT_START; port<=PORT_END; port++)); do
    if ! ss -ltnH | awk '{print $4}' | grep -Eq ":$port$"; then
      PREVIEW_PORT="$port"
      return
    fi
  done
  die "no free preview port in ${PORT_START}-${PORT_END}"
}

production_mongo_uri() {
  [[ -r "$PRODUCTION_ENV" ]] || die "production env file is not readable"
  local uri
  uri="$(sed -n 's/^MONGO_URI=//p' "$PRODUCTION_ENV" | head -n 1)"
  uri="${uri#\"}"
  uri="${uri%\"}"
  uri="${uri#\'}"
  uri="${uri%\'}"
  [[ -n "$uri" ]] || die "MONGO_URI is missing from production env"
  printf '%s' "$uri"
}

stop_existing() {
  if [[ -f "$COMPOSE" ]]; then
    docker compose -p "$PROJECT" -f "$COMPOSE" down -v --remove-orphans || true
  fi
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  rm -f -- "$APACHE_LINK" "$APACHE_CONF" "$AUTH_FILE"
  if [[ -d "$ROOT" ]]; then
    assert_safe_root
    rm -rf -- "$ROOT"
  fi
}

clone_source() {
  mkdir -p "$ROOT"
  git clone --filter=blob:none --no-checkout "$REPOSITORY_URL" "$SOURCE"
  git -C "$SOURCE" fetch --depth=1 origin "pull/$PR/head"
  git -C "$SOURCE" checkout --detach FETCH_HEAD
  local actual
  actual="$(git -C "$SOURCE" rev-parse HEAD)"
  [[ "$actual" == "$SHA" ]] || die "PR head moved during deployment ($actual != $SHA)"
}

copy_storage() {
  mkdir -p "$ROOT/storage"
  rsync -a --delete "$PRODUCTION_ROOT/server/storage/" "$ROOT/storage/"
}

write_compose() {
  local preview_user_id="$1"
  local access_token="$2"
  local jwt_secret="$3"
  umask 077
  cat > "$COMPOSE" <<EOF
services:
  mongo:
    image: mongo:7
    restart: "no"
    volumes:
      - $ROOT/mongo:/data/db
    networks:
      - preview
    healthcheck:
      test: ["CMD-SHELL", "mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok' | grep 1"]
      interval: 2s
      timeout: 5s
      retries: 30
      start_period: 5s

  app:
    image: $IMAGE
    restart: "no"
    depends_on:
      mongo:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: "4000"
      MONGO_URI: mongodb://mongo:27017/issue_tracker
      CORS_ORIGIN: https://$HOST
      FRONTEND_URL: https://$HOST
      SERVER_URL: https://$HOST
      SITE_ORIGIN: https://$HOST
      JWT_SECRET: $jwt_secret
      SERVE_STATIC: "true"
      PREVIEW_MODE: "true"
      PREVIEW_ACCESS_TOKEN: $access_token
      PREVIEW_USER_ID: $preview_user_id
      DISCORD_WEBHOOK_URL: ""
      GITHUB_CLIENT_ID: ""
      GITHUB_CLIENT_SECRET: ""
      DISCORD_CLIENT_ID: ""
      DISCORD_CLIENT_SECRET: ""
      GEMINI_API_KEY: ""
      TURNSTILE_SECRET_KEY: ""
    volumes:
      - $ROOT/storage:/app/server/storage
    networks:
      - preview
    mem_limit: 1024m

  gateway:
    image: nginx:alpine
    restart: "no"
    depends_on:
      app:
        condition: service_started
    volumes:
      - $ROOT/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "127.0.0.1:$PREVIEW_PORT:80"
    networks:
      - edge
      - preview
    mem_limit: 128m

networks:
  preview:
    internal: true
  edge:
EOF
}

write_gateway_config() {
  cat > "$ROOT/nginx.conf" <<'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 120s;
        proxy_pass http://app:4000;
    }
}
EOF
}

restore_database() {
  local mongo_uri="$1"
  local archive="$ROOT/production.archive.gz"
  mongodump --uri="$mongo_uri" --db=issue_tracker --archive="$archive" --gzip
  docker compose -p "$PROJECT" -f "$COMPOSE" cp "$archive" mongo:/tmp/production.archive.gz
  docker compose -p "$PROJECT" -f "$COMPOSE" exec -T mongo \
    mongorestore --quiet --drop --gzip --archive=/tmp/production.archive.gz
  rm -f -- "$archive"
}

sanitize_database() {
  local result preview_user_id
  result="$(docker compose -p "$PROJECT" -f "$COMPOSE" exec -T mongo \
    mongosh --quiet issue_tracker < "$ASSET_ROOT/sanitize-preview.js")"
  preview_user_id="$(printf '%s\n' "$result" | sed -n 's/.*PREVIEW_USER_ID=\([0-9a-fA-F]\{24\}\).*/\1/p' | tail -n 1)"
  [[ "$preview_user_id" =~ ^[0-9a-fA-F]{24}$ ]] || die "no preview user found in snapshot"
  printf '%s' "$preview_user_id"
}

build_image() {
  docker build --pull -t "$IMAGE" -f "$ASSET_ROOT/Dockerfile" "$SOURCE"
}

write_apache() {
  local auth_password="$1"
  htpasswd -Bbn preview "$auth_password" > "$AUTH_FILE"
  chown root:www-data "$AUTH_FILE"
  chmod 640 "$AUTH_FILE"

  cat > "$APACHE_CONF" <<EOF
<VirtualHost *:80>
    ServerName $HOST
    RewriteEngine On
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L,NE]
</VirtualHost>

<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName $HOST

    SSLEngine on
    SSLCertificateFile $CERT_ROOT/fullchain.pem
    SSLCertificateKeyFile $CERT_ROOT/privkey.pem

    <Location />
        AuthType Basic
        AuthName "PR Preview"
        AuthBasicProvider file
        AuthUserFile $AUTH_FILE
        Require valid-user
    </Location>

    ProxyPreserveHost On
    ProxyTimeout 120
    ProxyPass / http://127.0.0.1:$PREVIEW_PORT/ retry=0 timeout=120
    ProxyPassReverse / http://127.0.0.1:$PREVIEW_PORT/
</VirtualHost>
</IfModule>
EOF

  ln -sfn "$APACHE_CONF" "$APACHE_LINK"
  apache2ctl configtest
  systemctl reload apache2
}

up() {
  PR="$1"
  SHA="$2"
  require_number "$PR"
  require_sha "$SHA"
  paths_for_pr "$PR"
  assert_safe_root
  with_lock

  stop_existing
  find_port
  clone_source
  copy_storage
  write_gateway_config

  # Start only the disposable database while the snapshot is restored.
  local bootstrap_token jwt_secret preview_user_id mongo_uri
  bootstrap_token="$(openssl rand -hex 32)"
  jwt_secret="$(openssl rand -hex 32)"
  write_compose "000000000000000000000000" "$bootstrap_token" "$jwt_secret"
  docker compose -p "$PROJECT" -f "$COMPOSE" up -d mongo
  local mongo_attempt
  for mongo_attempt in {1..60}; do
    if docker compose -p "$PROJECT" -f "$COMPOSE" exec -T mongo \
      mongosh --quiet --eval 'db.adminCommand({ ping: 1 })' >/dev/null 2>&1; then
      break
    fi
    sleep 2
    (( mongo_attempt < 60 )) || die "preview MongoDB did not become healthy"
  done

  mongo_uri="$(production_mongo_uri)"
  restore_database "$mongo_uri"
  preview_user_id="$(sanitize_database)"
  write_compose "$preview_user_id" "$bootstrap_token" "$jwt_secret"
  build_image
  docker compose -p "$PROJECT" -f "$COMPOSE" up -d app gateway

  local attempt
  for attempt in {1..60}; do
    if curl --fail --silent --show-error "http://127.0.0.1:$PREVIEW_PORT/health" >/dev/null; then
      break
    fi
    sleep 2
    (( attempt < 60 )) || die "preview app did not become healthy"
  done

  local auth_password
  auth_password="$(openssl rand -hex 18)"
  write_apache "$auth_password"

  echo "PREVIEW_URL=https://$HOST"
  echo "PREVIEW_USERNAME=preview"
  echo "PREVIEW_PASSWORD=$auth_password"
  echo "DASHBOARD_LOGIN=https://$HOST/api/auth/preview?token=$bootstrap_token"
}

down() {
  PR="$1"
  require_number "$PR"
  paths_for_pr "$PR"
  assert_safe_root
  with_lock

  if [[ -f "$COMPOSE" ]]; then
    docker compose -p "$PROJECT" -f "$COMPOSE" down -v --remove-orphans || true
  fi
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  rm -f -- "$APACHE_LINK" "$APACHE_CONF" "$AUTH_FILE"
  if [[ -d "$ROOT" ]]; then
    rm -rf -- "$ROOT"
  fi
  apache2ctl configtest
  systemctl reload apache2
  echo "PREVIEW_REMOVED=pr-$PR.$HOST_SUFFIX"
}

case "${1:-}" in
  up)
    [[ $# -eq 3 ]] || die "usage: $0 up <pr-number> <40-char-sha>"
    up "$2" "$3"
    ;;
  down)
    [[ $# -eq 2 ]] || die "usage: $0 down <pr-number>"
    down "$2"
    ;;
  *)
    die "usage: $0 {up <pr-number> <40-char-sha>|down <pr-number>}"
    ;;
esac
