// src/app/ws.ts
import { Elysia, t } from "elysia";
import { extractBearer, verifySessionJwt } from "@/shared/auth/sessionJwt";
import { env } from "@/shared/env";
import type { UserId } from "@/shared/ids";
import { UserIdSchema } from "@/shared/ids";
import { isDevRuntime } from "@/shared/runtime";
import { auth } from "./auth";
import type { AppServices } from "./compose";
import { WsClientEventSchema, wsEncode } from "./wsTypes";

/**
 * Elysia WS の ws.data.headers は環境/型によって揺れるので、Headers に正規化する。
 */
const toHeaders = (h: unknown): Headers => {
  if (h instanceof Headers) return h;

  const headers = new Headers();

  if (h && typeof h === "object") {
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v))
        headers.set(k, v.filter((x) => typeof x === "string").join(","));
    }
  }

  return headers;
};

const extractCookie = (
  cookieHeader: string | null,
  name: string,
): string | undefined => {
  if (!cookieHeader) return undefined;
  const m = new RegExp(String.raw`(?:^|;\s*)${name}=([^;]+)`).exec(
    cookieHeader,
  );
  return m?.[1];
};

const resolveAppUserIdFromBetterAuthUserId = async (
  svc: AppServices,
  betterAuthUserId: string,
): Promise<UserId | null> => {
  const rows = await svc.db`
    SELECT user_id
    FROM user_identities
    WHERE provider = ${"better-auth"}
      AND provider_subject = ${betterAuthUserId}
    LIMIT 1
  `;

  if (rows.length !== 1) return null;

  // DBの user_id は uuid(v7) の文字列
  return UserIdSchema.parse(rows[0]?.user_id);
};

/**
 * WS接続の認証：
 * - production: BetterAuth のセッションから user を得て、user_identities で apps.users.id を解決
 * - development/test: 既存E2Eのために「session JWT」も許可（後で削除可能）
 */
const resolveUserIdForWs = async (
  svc: AppServices,
  rawHeaders: unknown,
): Promise<UserId | null> => {
  const headers = toHeaders(rawHeaders);

  // --- Dev/Test fallback（既存の wsChatFlow.test.ts を壊さないため） ---
  if (isDevRuntime()) {
    const authz = headers.get("authorization") ?? undefined;
    const bearer = extractBearer(authz);

    // 既存テストは Cookie: session=... を使う
    const cookieHeader = headers.get("cookie");
    const cookieToken = extractCookie(
      cookieHeader,
      env.SESSION_COOKIE_NAME ?? "session",
    );

    const token = bearer ?? cookieToken;
    if (token) {
      try {
        return await verifySessionJwt(token);
      } catch {
        // ignore and fallthrough to BetterAuth
      }
    }
  }

  // --- BetterAuth ---
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const appUserId = await resolveAppUserIdFromBetterAuthUserId(
    svc,
    session.user.id,
  );
  return appUserId;
};

export const makeWsApp = (svc: AppServices) => {
  const rooms = new Map<string, Set<string>>();
  const sockets = new Map<string, { send: (data: string) => void }>();
  const joinedBySocket = new Map<string, Set<string>>();
  const userIdBySocket = new Map<string, UserId>();

  const join = (conversationId: string, socketId: string) => {
    const room = rooms.get(conversationId) ?? new Set<string>();
    room.add(socketId);
    rooms.set(conversationId, room);

    const joined = joinedBySocket.get(socketId) ?? new Set<string>();
    joined.add(conversationId);
    joinedBySocket.set(socketId, joined);
  };

  const leaveAll = (socketId: string) => {
    const joined = joinedBySocket.get(socketId);
    if (joined) {
      for (const conversationId of joined) {
        const room = rooms.get(conversationId);
        if (!room) continue;
        room.delete(socketId);
        if (room.size === 0) rooms.delete(conversationId);
      }
      joinedBySocket.delete(socketId);
    }
    userIdBySocket.delete(socketId);
  };

  const broadcast = (conversationId: string, msg: unknown) => {
    const room = rooms.get(conversationId);
    if (!room) return;

    const data = wsEncode(msg);
    for (const socketId of room) {
      const ws = sockets.get(socketId);
      if (ws) ws.send(data);
    }
  };

  return new Elysia().ws("/ws", {
    body: t.Any(),

    // BetterAuth は Cookie/Authorization を headers から読むので、ここは広めに受ける
    header: t.Object({
      authorization: t.Optional(t.String()),
      cookie: t.Optional(t.String()),
    }),

    async open(ws) {
      sockets.set(ws.id, ws);
      console.log("ws opened", ws.id);

      const userId = await resolveUserIdForWs(svc, ws.data.headers);
      if (!userId) {
        ws.send(
          wsEncode({
            type: "server.error",
            payload: { reason: "UNAUTHORIZED" },
          }),
        );
        ws.close();
        return;
      }

      userIdBySocket.set(ws.id, userId);
      ws.send(wsEncode({ type: "server.hello", payload: { socketId: ws.id } }));
    },

    async message(ws, message) {
      const userId = userIdBySocket.get(ws.id);
      if (!userId) {
        ws.send(
          wsEncode({
            type: "server.error",
            payload: { reason: "UNAUTHORIZED" },
          }),
        );
        ws.close();
        return;
      }

      const parsed = WsClientEventSchema.safeParse(message);
      if (!parsed.success) {
        ws.send(
          wsEncode({
            type: "server.error",
            payload: { reason: "BAD_PAYLOAD" },
          }),
        );
        return;
      }

      const evt = parsed.data;

      if (evt.type === "messages.sync") {
        const res = await svc.syncMessages({
          conversationId: evt.payload.conversationId,
          userId,
          afterMessageId: evt.payload.afterMessageId,
          limit: evt.payload.limit,
        });

        if (res.kind === "ok") join(evt.payload.conversationId, ws.id);

        ws.send(wsEncode({ type: "messages.synced", payload: res }));
        return;
      }

      if (evt.type === "message.send") {
        const res = await svc.sendMessage({
          conversationId: evt.payload.conversationId,
          senderId: userId,
          clientMessageId: evt.payload.clientMessageId,
          messageText: evt.payload.messageText,
        });

        switch (res.kind) {
          case "forbidden": {
            ws.send(wsEncode({ type: "message.rejected", payload: res }));
            return;
          }

          case "stored": {
            join(evt.payload.conversationId, ws.id);

            // 送信者はこのメッセージまで既読にする
            await svc.updateReadCursor({
              conversationId: evt.payload.conversationId,
              userId,
              lastReadMessageId: res.message.messageId,
            });

            broadcast(evt.payload.conversationId, {
              type: "message.created",
              payload: res.message,
            });
            return;
          }

          case "duplicate": {
            join(evt.payload.conversationId, ws.id);

            // duplicateでも既読を進めておく（安全）
            await svc.updateReadCursor({
              conversationId: evt.payload.conversationId,
              userId,
              lastReadMessageId: res.existing.messageId,
            });

            broadcast(evt.payload.conversationId, {
              type: "message.created",
              payload: res.existing,
            });
            return;
          }
        }
      }

      if (evt.type === "read.update") {
        const res = await svc.updateReadCursor({
          conversationId: evt.payload.conversationId,
          userId,
          lastReadMessageId: evt.payload.lastReadMessageId,
        });

        ws.send(wsEncode({ type: "read.updated", payload: res }));
        return;
      }

      if (evt.type === "typing.start") {
        join(evt.payload.conversationId, ws.id);
        // 自分以外にタイピング開始を通知
        broadcast(evt.payload.conversationId, {
          type: "typing.started",
          payload: {
            conversationId: evt.payload.conversationId,
            userId,
          },
        });
        return;
      }

      if (evt.type === "typing.stop") {
        // 自分以外にタイピング停止を通知
        broadcast(evt.payload.conversationId, {
          type: "typing.stopped",
          payload: {
            conversationId: evt.payload.conversationId,
            userId,
          },
        });
        return;
      }
    },

    close(ws) {
      leaveAll(ws.id);
      sockets.delete(ws.id);
    },
  });
};
