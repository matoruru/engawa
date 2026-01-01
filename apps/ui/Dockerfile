############################
# 1) deps: install packages
############################
FROM oven/bun:latest AS deps
WORKDIR /repo

COPY apps/ui/package.json apps/ui/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY package.json package.json
COPY bun.lock* bun.lock*

# インストール
RUN bun install --frozen-lockfile

############################
# 2) build: build ui (vite)
############################
FROM deps AS build
WORKDIR /repo

# 残りのソースをコピー
COPY apps apps
COPY packages packages

# Vite の env はビルド時に埋め込まれるので ARG で受ける
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV NODE_ENV=production

# UI をビルド（dist を生成）
RUN bun run --cwd apps/ui build

############################
# 3) runtime: serve static
############################
FROM nginx:alpine AS runtime

# SPA (React Router) 用に、存在しないパスは index.html にフォールバック
RUN cat > /etc/nginx/conf.d/default.conf <<'NGINX'
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;

  # index/manifest/sw は更新させたい
  location = /index.html {
    try_files $uri =404;
    add_header Cache-Control "no-store" always;
  }
  location = /manifest.webmanifest {
    try_files $uri =404;
    add_header Cache-Control "no-store" always;
    types { application/manifest+json webmanifest; }
  }
  location = /sw.js {
    try_files $uri =404;
    add_header Cache-Control "no-store" always;
    add_header Service-Worker-Allowed "/" always;
  }
  location ~* ^/workbox-.*\.js$ {
    try_files $uri =404;
    add_header Cache-Control "no-store" always;
  }

  # iOSが探しに来る“ルート直下”も用意する（無いなら icons へ寄せる）
  location = /apple-touch-icon.png {
    try_files /icons/apple-touch-icon.png =404;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }
  location = /favicon.ico {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }

  # ハッシュ付き資産は長期キャッシュ
  location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }
  location /icons/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }

  # SPA fallback
  location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-store" always;
  }
}
NGINX

COPY --from=build /repo/apps/ui/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
