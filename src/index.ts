import { Elysia } from "elysia";
import { composeApp } from "./app/compose";
import { makeHttpHandlers } from "./app/httpHandlers";
import { sessionRoutes } from "./app/sessionRoutes";
import { makeWsApp } from "./app/ws";
import { env } from "./shared/env";

const services = composeApp();
const handlers = makeHttpHandlers(services);

const app = new Elysia()
  .use(sessionRoutes)
  .use(makeWsApp(services))
  .get("/healthz", () => ({ ok: true }))
  .post("/messages/send", async ({ body }) => handlers.sendMessage(body))
  .post("/messages/sync", async ({ body }) => handlers.syncMessages(body))
  .post("/reads/update", async ({ body }) => handlers.updateReadCursor(body))
  .listen(env.PORT);

console.log(`Listening on http://localhost:${env.PORT}`);
export type App = typeof app;
