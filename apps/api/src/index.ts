import { Elysia, t } from "elysia";
import { auth } from "./app/auth";
import { makeBetterAuthPlugin } from "./app/betterAuthPlugin";
import { composeApp } from "./app/compose";
import { makeHttpHandlers } from "./app/httpHandlers";
import { sessionRoutes } from "./app/sessionRoutes";
import { makeWsApp } from "./app/ws";
import { env } from "./shared/env";
import { ConversationIdSchema, UserIdSchema } from "./shared/ids";
import { isDevRuntime } from "./shared/runtime";
import cors from "@elysiajs/cors";

const services = composeApp();
const handlers = makeHttpHandlers(services);

const app = new Elysia()
  .use(makeBetterAuthPlugin(services.db))
  .use(cors({
    origin: env.ALLOWED_ORIGINS.split(","),
    credentials: true, // Allow cookies
  }))
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
  .get(
    "/friends",
    ({ userId }) => handlers.listFriends(userId),
    { auth: true },
  )
  .delete(
    "/friends/:friendId",
    ({ params, userId }) =>
      handlers.removeFriend(userId, { friendId: UserIdSchema.parse(params.friendId) }),
    {
      auth: true,
      params: t.Object({
        friendId: t.String(),
      }),
    },
  )
  .post(
    "/invites",
    ({ userId }) => handlers.createInvite(userId),
    { auth: true },
  )
  .get(
    "/invites/:token",
    ({ params }) => handlers.getInvite(params.token),
    {
      auth: false, // 認証不要（招待リンクは誰でも開ける）
      params: t.Object({
        token: t.String(),
      }),
    },
  )
  .post(
    "/invites/:token/accept",
    ({ params, userId }) => handlers.acceptInvite(userId, params.token),
    {
      auth: true,
      params: t.Object({
        token: t.String(),
      }),
    },
  )

  if (isDevRuntime()) {
    app.use(sessionRoutes);
  }

  app.listen(env.PORT, () => {
    console.log(`Listening on http://localhost:${env.PORT}`);
  });

export type App = typeof app;
