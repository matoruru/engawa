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
  index index.html;

  # 静的ファイルはそのまま
  location /assets/ {
    try_files $uri =404;
  }

  # SPA ルーティング（/profile 等）対策
  location / {
    try_files $uri $uri/ /index.html;
  }
}
NGINX

COPY --from=build /repo/apps/ui/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
