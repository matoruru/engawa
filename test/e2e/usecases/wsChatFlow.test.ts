import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { Elysia } from "elysia";
import WebSocket from "ws";
import * as z from "zod";
import {
  ClientMessageIdSchema,
  ConversationIdSchema,
  type MessageId,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import { createPostgresClient } from "@/shared/infra/postgres/postgresClient";

import { sessionRoutes } from "../../../src/app/sessionRoutes";
import { makeWsApp } from "../../../src/app/ws";

import { makePostgresConversationMembersRepo } from "../../../src/features/conversations/infra/postgres/conversationMembersRepo";
import { MessageTextSchema } from "../../../src/features/messages/domain";
import { makePostgresMessageQueryRepo } from "../../../src/features/messages/infra/postgres/messageQueryRepo";
import { makePostgresMessageRepo } from "../../../src/features/messages/infra/postgres/messageRepo";
import { makeSendMessage } from "../../../src/features/messages/usecases/sendMessage";
import { makeSyncMessages } from "../../../src/features/messages/usecases/syncMessages";
import { makePostgresConversationReadsRepo } from "../../../src/features/reads/infra/postgres/conversationReadsRepo";
import { makeUpdateReadCursor } from "../../../src/features/reads/usecases/updateReadCursor";

import {
  resetDb,
  seedConversation,
  seedMember,
  seedUser,
} from "../../helpers/seed";

const must = (v: string | undefined, name: string): string => {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
};

const extractSessionCookie = (setCookie: string): string => {
  const m = /(?:^|,\s*)session=([^;]+)/.exec(setCookie);
  if (!m) throw new Error(`Set-Cookie does not include session: ${setCookie}`);
  return `session=${m[1]}`;
};

// ---- Zod schemas for WS messages (test-side) ----
const WsEnvelopeSchema = z.object({
  type: z.string(),
  payload: z.unknown().optional(),
});
type WsEnvelope = z.infer<typeof WsEnvelopeSchema>;

const MessageCreatedPayloadSchema = z.object({
  messageId: MessageIdSchema,
  conversationId: ConversationIdSchema,
  senderId: UserIdSchema,
  clientMessageId: ClientMessageIdSchema,
  messageText: MessageTextSchema,
  // wsEncode が Date をどうするかは実装次第なので、ここは string|Date を許容
  createdAt: z.union([z.string(), z.date()]),
});

const waitForWsMessage = async (
  ws: WebSocket,
  pred: (m: WsEnvelope) => boolean,
  timeoutMs = 3000,
): Promise<WsEnvelope> => {
  return await new Promise<WsEnvelope>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout waiting for ws message"));
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData) => {
      const text = typeof data === "string" ? data : data.toString();
      const parsed = WsEnvelopeSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return;
      if (pred(parsed.data)) {
        cleanup();
        resolve(parsed.data);
      }
    };

    const onError = (e: unknown) => {
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    };

    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed before expected message"));
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });
};

// listen(0) の戻り値から port を読むための最小ユーティリティ
const getListeningPort = (app: Elysia): number => {
  const server = app.server;
  if (!server) throw new Error("Elysia server is not running");

  // Bun の Server は port を持つ（型が合わないケースがあるためここだけ “in” で安全に読む）
  if ("port" in server) {
    const p = (server as { port: unknown }).port;
    if (typeof p === "number") return p;
  }

  // どうしても取れないなら固定ポート運用に切り替える
  throw new Error("Cannot determine listening port from Elysia server");
};

describe("e2e/usecases: ws chat flow (cookie auth)", () => {
  const url =
    process.env.POSTGRES_TEST_URL ??
    process.env.POSTGRES_URL ??
    must(process.env.POSTGRES_URL, "POSTGRES_URL");

  const db = createPostgresClient(url);

  const cid = ConversationIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10",
  );
  const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
  const cmid = ClientMessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12",
  );

  const mid1: MessageId = MessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20",
  );
  const mid2: MessageId = MessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e21",
  );

  let app: Elysia;
  let baseUrl: string;
  let wsUrl: string;
  let queryRepo: ReturnType<typeof makePostgresMessageQueryRepo>;

  beforeAll(async () => {
    await db`SELECT 1 as ok`;

    // テスト用 services（composeApp の TODO を避ける）
    const membersRepo = makePostgresConversationMembersRepo(db);
    const messageRepo = makePostgresMessageRepo(db);
    const readsRepo = makePostgresConversationReadsRepo(db);
    queryRepo = makePostgresMessageQueryRepo(db);

    const ids: readonly MessageId[] = [mid1, mid2];
    let i = 0;
    const generateMessageId = (): MessageId => {
      const v = ids[i];
      if (!v) throw new Error("messageId queue exhausted");
      i += 1;
      return v;
    };

    const sendMessage = makeSendMessage({
      membersRepo,
      messageRepo,
      now: () => new Date("2025-12-27T00:00:00.000Z"),
      generateMessageId,
    });

    const syncMessages = makeSyncMessages({ membersRepo, queryRepo });

    const updateReadCursor = makeUpdateReadCursor({
      membersRepo,
      readsRepo,
      now: () => new Date("2025-12-27T00:00:02.000Z"),
    });

    const svc = { db, sendMessage, syncMessages, updateReadCursor };

    // @ts-expect-error Elysiaの型が複雑なので無視する
    app = new Elysia()
      .use(sessionRoutes)
      .use(makeWsApp(svc))
      .listen({ port: 0 });

    const port = getListeningPort(app);
    baseUrl = `http://localhost:${port}`;
    wsUrl = `ws://localhost:${port}/ws`;
  });

  beforeEach(async () => {
    await resetDb(db);
    await seedUser(db, { id: uid, username: "alice", displayName: "Alice" });
    await seedConversation(db, { id: cid });
    await seedMember(db, { conversationId: cid, userId: uid });
  });

  afterAll(async () => {
    app.stop();
    await db.end({ timeout: 1 });
  });

  it("POST /session -> WS connect with Cookie -> message.send -> receives message.created", async () => {
    // 1) Cookie 発行
    const res = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: uid }),
    });

    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error("missing set-cookie");

    const cookieHeader = extractSessionCookie(setCookie);

    // 2) WS接続
    const ws = new WebSocket(wsUrl, { headers: { Cookie: cookieHeader } });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (e) => reject(e));
    });

    // 3) server.hello を待つ
    await waitForWsMessage(ws, (m) => m.type === "server.hello");

    // 4) message.send を送る（payload は JSON）
    ws.send(
      JSON.stringify({
        type: "message.send",
        payload: {
          conversationId: cid,
          clientMessageId: cmid,
          messageText: "hello",
        },
      }),
    );

    // 5) message.created を受信して Zod で検証
    const created = await waitForWsMessage(
      ws,
      (m) => m.type === "message.created",
    );
    const payload = MessageCreatedPayloadSchema.parse(created.payload);

    expect(payload.conversationId).toBe(cid);
    expect(payload.senderId).toBe(uid);
    expect(payload.clientMessageId).toBe(cmid);
    expect(payload.messageText).toBe(MessageTextSchema.parse("hello"));
    expect(payload.messageId).toBe(mid1);

    ws.close();
  });

  it("deduplicates by clientMessageId: resending does not create a second row", async () => {
    // 1) Cookie 発行
    const res = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: uid }),
    });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error("missing set-cookie");
    const cookieHeader = extractSessionCookie(setCookie);

    // 2) WS接続
    const ws = new WebSocket(wsUrl, { headers: { Cookie: cookieHeader } });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (e) => reject(e));
    });

    await waitForWsMessage(ws, (m) => m.type === "server.hello");

    // 3) 1回目: message.created を待つ
    const p1 = waitForWsMessage(ws, (m) => m.type === "message.created");
    ws.send(
      JSON.stringify({
        type: "message.send",
        payload: {
          conversationId: cid,
          clientMessageId: cmid,
          messageText: "hello",
        },
      }),
    );
    const created1 = await p1;
    const payload1 = MessageCreatedPayloadSchema.parse(created1.payload);
    const firstId = payload1.messageId;

    // 4) 2回目: 再送（ここでは message.created が来る/来ないの両方を許容）
    ws.send(
      JSON.stringify({
        type: "message.send",
        payload: {
          conversationId: cid,
          clientMessageId: cmid,
          messageText: "hello",
        },
      }),
    );

    // 5) “二重登録されてない” を QueryRepo で検証（生SQLなし）
    // ※このテストファイルで beforeAll で作っている queryRepo を使う形が一番ラク
    const listed = await queryRepo.listByConversation({
      conversationId: cid,
      afterMessageId: undefined,
      limit: 50,
    });

    expect(listed.length).toBe(1);
    expect(listed[0]?.messageId).toBe(firstId);
    expect(listed[0]?.clientMessageId).toBe(cmid);

    ws.close();
  });
});
