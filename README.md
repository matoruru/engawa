# Engawa

## Local development

### 1. Create a PostgreSQL server

```
bun run dev:api:docker
```

### 2. Prepare environment variables

Copy the `.env.example` as `.env` at the project root and `apps/api`.

> [!TIP]
> It's better to set local IP directly for preview on mobile or other laptop inside the LAN.
> Setting `localhost` caused many issues for CORS and secure cookie...

### 3. Migrate DB schemas

```
cd apps/api
bun db:migrate:status
bun db:migrate:up
cd -
```

**For test**
```
cd apps/api
bun db:migrate:status
bun db:migrate:test:up
cd -
```

### 4. Run dev servers

**API server:**
```
bun run dev:api
```

**UI server:**
```
VITE_API_URL=http://192.168.11.5:3000 VITE_WS_URL=ws://192.168.11.5:3000/ws bun dev:ui --host
```

### 5. Access from web browser

Open http://192.168.11.5:5173.

Example user:
email: `user1@email.com`
password: `password`

### 6. Running tests

```
bun test
```

### 7. How to deploy

TODO: CI/CD workflow

```
v=<VERSION> sh -c "docker buildx build --platform=linux/arm64 -t matoruru/engawa-api:0.0.0-$v -f apps/api/Dockerfile . --no-cache && docker push matoruru/engawa-a
pi:0.0.0-$v && cd ~/GitHub/matoruru/home-kubernetes/manifests/apps/manifests/engawa && kustomize edit set image matoruru_engawa-api='matoruru/engawa-api:0.0.
0-$v' && git add kustomization.yaml && git commit -m 'wip(engawa-api): 0.0.0-$v' && git push"
```

```
v=<VERSION> sh -c "docker buildx build --platform=linux/arm64 -t matoruru/engawa-ui:0.0.0-$v --build-arg VITE_API_URL='https://engawa-api.matoruru.com' --build-ar
g VITE_WS_URL='wss://engawa-api.matoruru.com/ws'  -f apps/ui/Dockerfile . --no-cache && docker push matoruru/engawa-ui:0.0.0-$v && cd ~/GitHub/matoruru/home-
kubernetes/manifests/apps/manifests/engawa && kustomize edit set image matoruru_engawa-ui='matoruru/engawa-ui:0.0.0-$v' && git add kustomization.yaml && git 
commit -m 'debug(engawa-ui): 0.0.0-$v' && git push"
```
