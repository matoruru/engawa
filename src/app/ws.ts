import { Elysia, t } from "elysia";

import type { AppServices } from "./compose";
import { WsClientEventSchema, wsEncode } from "./wsTypes";

/**
 * conversationId -> ws.id の集合
 * ws.id -> ws（sendのため）
 * ws.id -> 参加している conversationId の集合（close時の掃除を速く）
 */
export const makeWsApp = (svc: AppServices) => {
  const rooms = new Map<string, Set<string>>();
  const sockets = new Map<string, { send: (data: string) => void }>();
  const joinedBySocket = new Map<string, Set<string>>();

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
    if (!joined) return;

    for (const conversationId of joined) {
      const room = rooms.get(conversationId);
      if (!room) continue;

      room.delete(socketId);
      if (room.size === 0) rooms.delete(conversationId);
    }

    joinedBySocket.delete(socketId);
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
    // ElysiaがJSON文字列をObjectにしてくれる（body schema を与える）:contentReference[oaicite:1]{index=1}
    body: t.Any(),

    open(ws) {
      // ws.id はElysia側で付与される uid :contentReference[oaicite:2]{index=2}
      sockets.set(ws.id, ws);

      ws.send(
        wsEncode({
          type: "server.hello",
          payload: { socketId: ws.id },
        }),
      );
    },

    async message(ws, message) {
      // message は unknown として Zod で確定する
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
        // sync した会話に join（成功してから join したいなら res.kind を見てからでもOK）
        join(evt.payload.conversationId, ws.id);

        const res = await svc.syncMessages(evt.payload);
        ws.send(wsEncode({ type: "messages.synced", payload: res }));
        return;
      }

      if (evt.type === "message.send") {
        // UX: 未joinでも送れるように join しておく
        join(evt.payload.conversationId, ws.id);

        const res = await svc.sendMessage(evt.payload);

        if (res.kind === "forbidden") {
          ws.send(wsEncode({ type: "message.rejected", payload: res }));
          return;
        }

        const message = res.kind === "stored" ? res.message : res.existing;

        broadcast(evt.payload.conversationId, {
          type: "message.created",
          payload: message,
        });
        return;
      }

      if (evt.type === "read.update") {
        const res = await svc.updateReadCursor(evt.payload);
        ws.send(wsEncode({ type: "read.updated", payload: res }));
        return;
      }
    },

    close(ws) {
      // close時に全部抜ける
      leaveAll(ws.id);
      sockets.delete(ws.id);
    },
  });
};
