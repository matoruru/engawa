# API Dockerfile
# Bunランタイムを使用したマルチステージビルド

# ビルドステージ
FROM oven/bun:1 AS builder

WORKDIR /app

# ワークスペースのルートからすべてのファイルをコピー
COPY . .

# 依存関係をインストール
RUN bun install --frozen-lockfile

# ソースコードをコピー
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts

# 本番用ステージ
FROM oven/bun:1-slim

WORKDIR /app

# ビルドステージから必要なファイルをコピー
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages/contracts ./packages/contracts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock* ./

# ポートを公開
EXPOSE 3000

# 環境変数のデフォルト値
ENV PORT=3000
ENV NODE_ENV=production

# アプリケーションを起動
CMD ["bun", "run", "apps/api/src/index.ts"]

