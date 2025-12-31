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
import type * as z from "zod";

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
import {
  WsMessagePayloadSchema,
  type WsServerEvent,
  WsServerEventSchema,
  WsSyncMessagesResultSchema,
} from "../../../src/app/wsTypes";

import { makePostgresConversationMembersRepo } from "../../../src/features/conversations/infra/postgres/conversationMembersRepo";
import { makePostgresConversationRepo } from "../../../src/features/conversations/infra/postgres/conversationRepo";
import { makeCreateConversation } from "../../../src/features/conversations/usecases/createConversation";
import { makeListConversations } from "../../../src/features/conversations/usecases/listConversations";
import { makeAddMemberToConversation } from "../../../src/features/conversations/usecases/addMemberToConversation";
import { makeListConversationMembers } from "../../../src/features/conversations/usecases/listConversationMembers";
import { makeLeaveConversation } from "../../../src/features/conversations/usecases/leaveConversation";
import { makeUpdateConversationTitle } from "../../../src/features/conversations/usecases/updateConversationTitle";
import { MessageTextSchema } from "../../../src/features/messages/domain";
import { makePostgresMessageQueryRepo } from "../../../src/features/messages/infra/postgres/messageQueryRepo";
import { makePostgresMessageRepo } from "../../../src/features/messages/infra/postgres/messageRepo";
import { makeSendMessage } from "../../../src/features/messages/usecases/sendMessage";
import { makeSyncMessages } from "../../../src/features/messages/usecases/syncMessages";
import { makePostgresConversationReadsRepo } from "../../../src/features/reads/infra/postgres/conversationReadsRepo";
import { makeUpdateReadCursor } from "../../../src/features/reads/usecases/updateReadCursor";
import { makePostgresUserRepo } from "../../../src/shared/infra/postgres/userRepo";
import { uuidv7 } from "../../../src/shared/uuid";
import { makePostgresFriendshipsRepo } from "../../../src/features/friendships/infra/postgres/friendshipsRepo";
import { makePostgresInvitesRepo } from "../../../src/features/invites/infra/postgres/invitesRepo";
import { makeListFriends } from "../../../src/features/friendships/usecases/listFriends";
import { makeRemoveFriend } from "../../../src/features/friendships/usecases/removeFriend";
import { makeCreateInvite } from "../../../src/features/invites/usecases/createInvite";
import { makeGetInvite } from "../../../src/features/invites/usecases/getInvite";
import { makeAcceptInvite } from "../../../src/features/invites/usecases/acceptInvite";
import { InviteTokenSchema } from "../../../src/features/invites/domain";
import crypto from "crypto";

import {
  resetDb,
  seedConversation,
  seedMember,
  seedUser,
} from "../../helpers/seed";
import { makeUpdateUserProfile } from "src/features/users/usecases/updateUserProfile";

const must = (v: string | undefined, name: string): string => {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
};

const extractSessionCookie = (setCookie: string): string => {
  const m = /(?:^|,\s*)session=([^;]+)/.exec(setCookie);
  if (!m) throw new Error(`Set-Cookie does not include session: ${setCookie}`);
  return `session=${m[1]}`;
};

const waitForWsMessage = async (
  ws: WebSocket,
  pred: (m: WsServerEvent) => boolean,
  timeoutMs = 3000,
): Promise<WsServerEvent> => {
  return await new Promise<WsServerEvent>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout waiting for ws message"));
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData) => {
      const text = typeof data === "string" ? data : data.toString();

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return;
      }

      const parsed = WsServerEventSchema.safeParse(json);
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

const waitForSyncedOk = async (
  ws: WebSocket,
  timeoutMs = 3000,
): Promise<
  Extract<z.infer<typeof WsSyncMessagesResultSchema>, { kind: "ok" }>
> => {
  const env = await waitForWsMessage(
    ws,
    (m) => m.type === "messages.synced",
    timeoutMs,
  );
  const payload = WsSyncMessagesResultSchema.parse(env.payload);

  if (payload.kind !== "ok") {
    throw new Error(`messages.synced was not ok: ${JSON.stringify(payload)}`);
  }
  return payload;
};

// WSの終了を待ってテストを確実に終了させるためのユーティリティ
const closeWs = async (ws: WebSocket): Promise<void> => {
  await new Promise<void>((resolve) => {
    ws.once("close", () => resolve());
    ws.close();
  });
};

// listen(0) の戻り値から port を読むための最小ユーティリティ
const getListeningPort = (app: Elysia): number => {
  const server = app.server;
  if (!server) throw new Error("Elysia server is not running");

  if ("port" in server) {
    const p = (server as { port: unknown }).port;
    if (typeof p === "number") return p;
  }

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

  const uidAlice = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
  const uidBob = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12");

  const cmidAlice = ClientMessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e13",
  );
  const cmidBob = ClientMessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e14",
  );

  const mid1: MessageId = MessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20",
  );
  const mid2: MessageId = MessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e21",
  );
  const mid3: MessageId = MessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e22",
  );
  const mid4: MessageId = MessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e23",
  );

  // ---- 安定化：messageId generator をテストごとにリセットする ----
  const idQueue: readonly MessageId[] = [mid1, mid2, mid3, mid4];
  let idIndex = 0;

  const generateMessageId = (): MessageId => {
    const v = idQueue[idIndex];
    if (!v) throw new Error("messageId queue exhausted");
    idIndex += 1;
    return v;
  };

  let app: Elysia;
  let baseUrl: string;
  let wsUrl: string;
  let queryRepo: ReturnType<typeof makePostgresMessageQueryRepo>;

  const createSessionCookie = async (userId: string): Promise<string> => {
    const res = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error("missing set-cookie");

    return extractSessionCookie(setCookie);
  };

  const connectWs = async (cookieHeader: string): Promise<WebSocket> => {
    const ws = new WebSocket(wsUrl, { headers: { Cookie: cookieHeader } });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (e) => reject(e));
    });

    await waitForWsMessage(ws, (m) => m.type === "server.hello");
    return ws;
  };

  beforeAll(async () => {
    await db`SELECT 1 as ok`;

    const membersRepo = makePostgresConversationMembersRepo(db);
    const messageRepo = makePostgresMessageRepo(db);
    const readsRepo = makePostgresConversationReadsRepo(db);
    queryRepo = makePostgresMessageQueryRepo(db);

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

    // NOTE: テストではBetterAuth を使わないので noop
    const resolveAppUserIdFromBetterAuthUserId = async (
      _authUserId: string,
    ) => {
      /** noop */ return null;
    };

    // テストでは使用しないが、AppServices型に必要なプロパティを追加
    const conversationRepo = makePostgresConversationRepo(db);
    const userRepo = makePostgresUserRepo(db);

    const createConversation = makeCreateConversation({
      conversationRepo,
      membersRepo,
      generateConversationId: () => ConversationIdSchema.parse(uuidv7()),
      now: () => new Date(),
    });

    const listConversations = makeListConversations({
      membersRepo,
      messageQueryRepo: queryRepo,
      conversationRepo,
      readsRepo,
    });

    const addMemberToConversation = makeAddMemberToConversation({
      membersRepo,
    });

    const listConversationMembers = makeListConversationMembers({
      userRepo,
      membersRepo,
    });

    const leaveConversation = makeLeaveConversation({
      membersRepo,
    });

    const updateConversationTitle = makeUpdateConversationTitle({
      conversationRepo,
      membersRepo,
    });

    // friendships and invites
    const friendshipsRepo = makePostgresFriendshipsRepo(db);
    const invitesRepo = makePostgresInvitesRepo(db);

    const listFriends = makeListFriends({
      friendshipsRepo,
      userRepo,
    });

    const removeFriend = makeRemoveFriend({
      friendshipsRepo,
    });

    const createInvite = makeCreateInvite({
      invitesRepo,
      generateToken: () => {
        return InviteTokenSchema.parse(crypto.randomBytes(32).toString("hex"));
      },
      now: () => new Date(),
    });

    const getInvite = makeGetInvite({
      invitesRepo,
      userRepo,
      now: () => new Date(),
    });

    const acceptInvite = makeAcceptInvite({
      invitesRepo,
      friendshipsRepo,
      now: () => new Date(),
    });

    const updateUserProfile = makeUpdateUserProfile({
      userRepo,
    });

    const svc = {
      db,
      membersRepo,
      resolveAppUserIdFromBetterAuthUserId,
      sendMessage,
      syncMessages,
      updateReadCursor,
      createConversation,
      listConversations,
      addMemberToConversation,
      listConversationMembers,
      leaveConversation,
      updateConversationTitle,
      listFriends,
      removeFriend,
      createInvite,
      getInvite,
      acceptInvite,
      updateUserProfile,
      userRepo,
    };

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
    idIndex = 0; // テストごとに messageId 生成をリセット

    await resetDb(db);

    await seedUser(db, {
      id: uidAlice,
      username: "alice",
      displayName: "Alice",
    });
    await seedUser(db, {
      id: uidBob,
      username: "bob",
      displayName: "Bob",
    });

    await seedConversation(db, { id: cid });

    await seedMember(db, { conversationId: cid, userId: uidAlice });
    await seedMember(db, { conversationId: cid, userId: uidBob });
  });

  afterAll(async () => {
    app.stop();
    await db.end({ timeout: 1 });
  });

  it("POST /session -> WS connect with Cookie -> message.send -> receives message.created", async () => {
    // 1) Cookie 発行（Alice）
    const cookieHeader = await createSessionCookie(uidAlice);

    // 2) WS接続
    const ws = await connectWs(cookieHeader);

    try {
      // 3) message.send を送る（先に待つとレースが消える）
      const pCreated = waitForWsMessage(
        ws,
        (m) => m.type === "message.created",
      );

      ws.send(
        JSON.stringify({
          type: "message.send",
          payload: {
            conversationId: cid,
            clientMessageId: cmidAlice,
            messageText: "hello",
          },
        }),
      );

      const created = await pCreated;
      const payload = WsMessagePayloadSchema.parse(created.payload);

      expect(payload.conversationId).toBe(cid);
      expect(payload.senderId).toBe(uidAlice);
      expect(payload.clientMessageId).toBe(cmidAlice);
      expect(payload.messageText).toBe(MessageTextSchema.parse("hello"));
      expect(payload.messageId).toBe(mid1);
    } finally {
      ws.close();
    }
  });

  it("deduplicates by clientMessageId: resending does not create a second row", async () => {
    const cookieHeader = await createSessionCookie(uidAlice);
    const ws = await connectWs(cookieHeader);

    try {
      // 1回目
      const p1 = waitForWsMessage(ws, (m) => m.type === "message.created");
      ws.send(
        JSON.stringify({
          type: "message.send",
          payload: {
            conversationId: cid,
            clientMessageId: cmidAlice,
            messageText: "hello",
          },
        }),
      );
      const created1 = await p1;
      const payload1 = WsMessagePayloadSchema.parse(created1.payload);
      const firstId = payload1.messageId;

      // 2回目（再送）
      const pDupCreated = waitForWsMessage(
        ws,
        (m) => m.type === "message.created",
      );
      ws.send(
        JSON.stringify({
          type: "message.send",
          payload: {
            conversationId: cid,
            clientMessageId: cmidAlice,
            messageText: "hello",
          },
        }),
      );

      // duplicate の broadcast を受け取ってサーバ処理完了を確定させる
      const created2 = await pDupCreated;
      const payload2 = WsMessagePayloadSchema.parse(created2.payload);
      expect(payload2.messageId).toBe(firstId);

      // DB確認
      const listed = await queryRepo.listByConversation({
        conversationId: cid,
        afterMessageId: undefined,
        limit: 50,
      });

      expect(listed.length).toBe(1);
      expect(listed[0]?.messageId).toBe(firstId);
      expect(listed[0]?.clientMessageId).toBe(cmidAlice);
    } finally {
      await closeWs(ws); // WSの終了を待ってテストを確実に終了させる
    }
  });

  it("two users: subscribe via messages.sync, exchange messages, and both receive message.created", async () => {
    // 1) セッション cookie 発行
    const [cookieAlice, cookieBob] = await Promise.all([
      createSessionCookie(uidAlice),
      createSessionCookie(uidBob),
    ]);

    // 2) WS接続
    const [wsAlice, wsBob] = await Promise.all([
      connectWs(cookieAlice),
      connectWs(cookieBob),
    ]);

    try {
      // 3) 両者 messages.sync（join を確実にする）
      wsAlice.send(
        JSON.stringify({
          type: "messages.sync",
          payload: {
            conversationId: cid,
            afterMessageId: undefined,
            limit: 50,
          },
        }),
      );
      const syncedAlice = await waitForSyncedOk(wsAlice);
      expect(syncedAlice.messages).toEqual([]);

      wsBob.send(
        JSON.stringify({
          type: "messages.sync",
          payload: {
            conversationId: cid,
            afterMessageId: undefined,
            limit: 50,
          },
        }),
      );
      const syncedBob = await waitForSyncedOk(wsBob);
      expect(syncedBob.messages).toEqual([]);

      // 4) Alice -> Bob（レース回避：先に待つ）
      const pCreatedOnBob = waitForWsMessage(
        wsBob,
        (m) => m.type === "message.created",
      );

      wsAlice.send(
        JSON.stringify({
          type: "message.send",
          payload: {
            conversationId: cid,
            clientMessageId: cmidAlice,
            messageText: "hi bob",
          },
        }),
      );

      const createdOnBob = await pCreatedOnBob;
      const bobReceived = WsMessagePayloadSchema.parse(createdOnBob.payload);

      expect(bobReceived.conversationId).toBe(cid);
      expect(bobReceived.senderId).toBe(uidAlice);
      expect(bobReceived.clientMessageId).toBe(cmidAlice);
      expect(bobReceived.messageText).toBe(MessageTextSchema.parse("hi bob"));
      expect(bobReceived.messageId).toBe(mid1);

      // 5) Bob -> Alice（レース回避：先に待つ）
      const pCreatedOnAlice = waitForWsMessage(
        wsAlice,
        (m) => m.type === "message.created",
      );

      wsBob.send(
        JSON.stringify({
          type: "message.send",
          payload: {
            conversationId: cid,
            clientMessageId: cmidBob,
            messageText: "hi alice",
          },
        }),
      );

      const createdOnAlice = await pCreatedOnAlice;
      const aliceReceived = WsMessagePayloadSchema.parse(
        createdOnAlice.payload,
      );

      expect(aliceReceived.conversationId).toBe(cid);
      expect(aliceReceived.senderId).toBe(uidBob);
      expect(aliceReceived.clientMessageId).toBe(cmidBob);
      expect(aliceReceived.messageText).toBe(
        MessageTextSchema.parse("hi alice"),
      );
      expect(aliceReceived.messageId).toBe(mid2);

      // 6) DB 永続化も確認（順序も含めて固定化）、2件のメッセージがあることを確認
      const listed = await queryRepo.listByConversation({
        conversationId: cid,
        afterMessageId: undefined,
        limit: 50,
      });

      expect(listed.map((m) => m.messageId)).toEqual([mid1, mid2]);
      expect(listed.map((m) => m.senderId)).toEqual([uidAlice, uidBob]);
      expect(listed.map((m) => m.messageText)).toEqual([
        MessageTextSchema.parse("hi bob"),
        MessageTextSchema.parse("hi alice"),
      ]);
    } finally {
      await Promise.all([closeWs(wsAlice), closeWs(wsBob)]);
    }
  });

  it("POST /session returns 404 when NODE_ENV=production since it's for development only", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await fetch(`${baseUrl}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: uidAlice }),
      });

      expect(res.status).toBe(404);
    } finally {
      // 他テストへ影響させないように環境変数を復元する
      if (prev === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = prev;
      }
    }
  });

  it("POST /session returns 400 for invalid userId", async () => {
    const res = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "invalid format" }),
    });
    expect(res.status).toBe(400);
  });
});
