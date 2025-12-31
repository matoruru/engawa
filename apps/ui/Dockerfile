# UI Dockerfile
# Vite + Reactアプリケーションをビルドし、Viteのpreviewサーバーで配信

# ビルドステージ
FROM oven/bun:1 AS builder

WORKDIR /app

# ワークスペースのルートからすべてのファイルをコピー
COPY . .

# 依存関係をインストール
RUN bun install --frozen-lockfile

# ソースコードをコピー
COPY apps/ui ./apps/ui
COPY packages/contracts ./packages/contracts

# # UIをビルド
# WORKDIR /app/apps/ui
# RUN bun run build

# 本番用ステージ（Vite previewサーバー）
FROM oven/bun:1-slim

WORKDIR /app

# ビルドステージから必要なファイルをコピー
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/ui ./apps/ui
COPY --from=builder /app/packages/contracts ./packages/contracts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock* ./

# ポートを公開（Vite previewのデフォルトポート）
EXPOSE 4173

# 環境変数のデフォルト値
ENV NODE_ENV=production

# Vite previewサーバーを起動
WORKDIR /app/apps/ui
CMD ["bun", "run", "preview", "--host", "0.0.0.0"]

