import { Elysia, t } from "elysia";
import { auth } from "./app/auth";
import { makeBetterAuthPlugin } from "./app/betterAuthPlugin";
import { composeApp } from "./app/compose";
import { makeHttpHandlers } from "./app/httpHandlers";
import { sessionRoutes } from "./app/sessionRoutes";
import { makeWsApp } from "./app/ws";
import { env } from "./shared/env";
import { ConversationIdSchema, UserIdSchema } from "./shared/ids";
import cors from "@elysiajs/cors";

const services = composeApp();
const handlers = makeHttpHandlers(services);

const app = new Elysia()
  .use(cors({
    origin: env.ALLOWED_ORIGINS.split(","),
    credentials: true, // Allow cookies
  }))
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
  .get(
    "/conversations",
    ({ userId }) => handlers.listConversations(userId),
    { auth: true },
  )
  .post(
    "/conversations",
    ({ userId }) => handlers.createConversation(userId),
    { auth: true },
  )
  .get(
    "/me",
    ({ userId }) => handlers.getCurrentUser(userId),
    { auth: true },
  )
  .get(
    "/users/search",
    ({ query, userId }) => handlers.searchUsers(userId, query.q || ""),
    {
      auth: true,
      query: t.Object({
        q: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/conversations/:conversationId/members",
    ({ params, userId }) =>
      handlers.listConversationMembers(
        userId,
        ConversationIdSchema.parse(params.conversationId),
      ),
    {
      auth: true,
      params: t.Object({
        conversationId: t.String(),
      }),
    },
  )
  .post(
    "/conversations/:conversationId/members",
    ({ params, body, userId }) =>
      handlers.addMemberToConversation(
        userId,
        ConversationIdSchema.parse(params.conversationId),
        UserIdSchema.parse(body.userId),
      ),
    {
      auth: true,
      params: t.Object({
        conversationId: t.String(),
      }),
      body: t.Object({
        userId: t.String(),
      }),
    },
  )

  const isProd = env.NODE_ENV === "production" || env.NODE_ENV === undefined;
  if (!isProd) {
    app.use(sessionRoutes);
  }

  app.listen(env.PORT, () => {
    console.log(`Listening on http://localhost:${env.PORT}`);
  });

export type App = typeof app;
