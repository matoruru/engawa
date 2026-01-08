import { checkDBConnection as checkDBConnectionForAuth } from "./app/auth";
import { composeApp } from "./app/compose";
import { makeHttpHandlers } from "./app/httpHandlers";
import { createApp } from "./server";
import { env } from "./shared/env";
import { checkDBConnection as checkDBConnectionForApplication } from "./shared/infra/postgres/postgresClient";

console.log("Starting API Server...");

const services = composeApp();

// Check DB connection at startup
await checkDBConnectionForAuth();
await checkDBConnectionForApplication(services.db);

const handlers = makeHttpHandlers(services);

const app = createApp(services, handlers).listen(
  {
    port: env.PORT,
    hostname: "0.0.0.0",
  },
  ({ port, hostname }) => {
    console.log(`Listening on http://${hostname}:${port}`);
  },
);

export type App = typeof app;
