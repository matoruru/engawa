import { Elysia } from "elysia";
import { auth } from "./app/auth";
import { makeBetterAuthPlugin } from "./app/betterAuthPlugin";
import { composeApp } from "./app/compose";
import { makeHttpHandlers } from "./app/httpHandlers";
import { sessionRoutes } from "./app/sessionRoutes";
import { makeWsApp } from "./app/ws";
import { env } from "./shared/env";

const services = composeApp();
const handlers = makeHttpHandlers(services);

const app = new Elysia();

// BetterAuth endpoints
app.mount(auth.handler);

app
  .use(makeBetterAuthPlugin(services.db))
  .use(makeWsApp(services))
  .get("/healthz", () => ({ ok: true }))
  .post(
    "/messages/send",
    ({ body, userId }) => handlers.sendMessage(userId, body),
    { auth: true },
  )
  .post(
    "/messages/sync",
    ({ body, userId }) => handlers.syncMessages(userId, body),
    { auth: true },
  )
  .post(
    "/reads/update",
    ({ body, userId }) => handlers.updateReadCursor(userId, body),
    { auth: true },
  )
  .listen(env.PORT);

const isProd = env.NODE_ENV === "production" || env.NODE_ENV === undefined;
if (!isProd) app.use(sessionRoutes);

console.log(`Listening on http://localhost:${env.PORT}`);
export type App = typeof app;
