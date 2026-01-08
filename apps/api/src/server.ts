import { logger } from "@bogeychan/elysia-logger";
import cors from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import { makeBetterAuthPlugin } from "./app/betterAuthPlugin";
import type { AppServices } from "./app/compose";
import type { makeHttpHandlers } from "./app/httpHandlers";
import { sessionRoutes } from "./app/sessionRoutes";
import { makeWsApp } from "./app/ws";
import { env } from "./shared/env";
import { ConversationIdSchema, UserIdSchema } from "./shared/ids";

export const createApp = (
  services: AppServices,
  handlers: ReturnType<typeof makeHttpHandlers>,
) =>
  new Elysia()
    .use(logger())
    .use(
      cors({
        origin: env.ALLOWED_ORIGINS.split(","),
        credentials: true, // Allow cookies
      }),
    )
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
    .get("/conversations", ({ userId }) => handlers.listConversations(userId), {
      auth: true,
    })
    .get(
      "/conversations/:conversationId",
      ({ params, userId }) =>
        handlers.getConversation(
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
      "/conversations",
      ({ userId }) => handlers.createConversation(userId),
      {
        auth: true,
      },
    )
    .get("/me", ({ userId }) => handlers.getCurrentUser(userId), { auth: true })
    .patch(
      "/me",
      ({ body, userId }) => handlers.updateUserProfile(userId, body),
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
    .delete(
      "/conversations/:conversationId/members",
      ({ params, userId }) =>
        handlers.leaveConversation(
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
    .patch(
      "/conversations/:conversationId/title",
      ({ params, body, userId }) =>
        handlers.updateConversationTitle(
          userId,
          ConversationIdSchema.parse(params.conversationId),
          body.title ?? null,
        ),
      {
        auth: true,
        params: t.Object({
          conversationId: t.String(),
        }),
        body: t.Object({
          title: t.Optional(t.String()),
        }),
      },
    )
    .get("/friends", ({ userId }) => handlers.listFriends(userId), {
      auth: true,
    })
    .delete(
      "/friends/:friendId",
      ({ params, userId }) =>
        handlers.removeFriend(userId, {
          friendId: UserIdSchema.parse(params.friendId),
        }),
      {
        auth: true,
        params: t.Object({
          friendId: t.String(),
        }),
      },
    )
    .post("/invites", ({ userId }) => handlers.createInvite(userId), {
      auth: true,
    })
    .get("/invites/:token", ({ params }) => handlers.getInvite(params.token), {
      auth: false, // 認証不要（招待リンクは誰でも開ける）
      params: t.Object({
        token: t.String(),
      }),
    })
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
    .use(sessionRoutes);
