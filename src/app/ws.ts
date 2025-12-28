import { Elysia, t } from "elysia";
import { extractBearer, verifySessionJwt } from "@/shared/auth/sessionJwt";
import { env } from "@/shared/env";
import type { UserId } from "@/shared/ids";
import type { AppServices } from "./compose";
import { WsClientEventSchema, wsEncode } from "./wsTypes";

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

    header: t.Object({
      authorization: t.Optional(t.String()),
    }),
    cookie: t.Cookie({
      session: t.Optional(t.String()),
    }),

    async open(ws) {
      sockets.set(ws.id, ws);

      const authorization = ws.data.headers.authorization;
      const bearer = extractBearer(authorization);

      const cookieToken = ws.data.cookie.session.value;

      const token = bearer ?? cookieToken;
      if (!token) {
        ws.send(
          wsEncode({
            type: "server.error",
            payload: { reason: "UNAUTHORIZED" },
          }),
        );
        ws.close();
        return;
      }

      try {
        const userId = await verifySessionJwt(token);
        userIdBySocket.set(ws.id, userId);
        ws.send(
          wsEncode({ type: "server.hello", payload: { socketId: ws.id } }),
        );
      } catch {
        ws.send(
          wsEncode({
            type: "server.error",
            payload: { reason: "UNAUTHORIZED" },
          }),
        );
        ws.close();
      }
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
          case "forbidden":
            ws.send(wsEncode({ type: "message.rejected", payload: res }));
            return;
          case "stored":
            join(evt.payload.conversationId, ws.id);
            broadcast(evt.payload.conversationId, {
              type: "message.created",
              payload: res.message,
            });
            return;
          case "duplicate":
            join(evt.payload.conversationId, ws.id);
            broadcast(evt.payload.conversationId, {
              type: "message.created",
              payload: res.existing,
            });
            return;
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
    },

    close(ws) {
      leaveAll(ws.id);
      sockets.delete(ws.id);
    },
  });
};
