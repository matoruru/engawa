import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import {
  ClientMessageIdSchema,
  ConversationIdSchema,
  type MessageId,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import { createPostgresClient } from "@/shared/infra/postgres/postgresClient";
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

describe("e2e/usecases: chat flow", () => {
  const db = createPostgresClient({
    POSTGRES_HOST: process.env.POSTGRES_HOST ?? "",
    POSTGRES_PORT: Number(process.env.POSTGRES_PORT ?? 5432),
    POSTGRES_USER: process.env.POSTGRES_USER ?? "",
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? "",
    POSTGRES_DATABASE: process.env.POSTGRES_DATABASE ?? "",
  });

  const cid = ConversationIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10",
  );
  const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");

  const cmid1 = ClientMessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12",
  );
  const cmid2 = ClientMessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e13",
  );

  const mid1: MessageId = MessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20",
  );
  const mid2: MessageId = MessageIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e21",
  );

  beforeAll(async () => {
    await db`SELECT 1 as ok`;
  });

  beforeEach(async () => {
    await resetDb(db);
    await seedUser(db, { id: uid, username: "alice", displayName: "Alice" });
    await seedConversation(db, { id: cid });
    await seedMember(db, { conversationId: cid, userId: uid });
  });

  afterAll(async () => {
    await db.end({ timeout: 1 });
  });

  it("sendMessage -> syncMessages -> updateReadCursor", async () => {
    const membersRepo = makePostgresConversationMembersRepo(db);
    const messageRepo = makePostgresMessageRepo(db);
    const queryRepo = makePostgresMessageQueryRepo(db);
    const readsRepo = makePostgresConversationReadsRepo(db);

    const idQueue: readonly MessageId[] = [mid1, mid2];
    let i = 0;
    const generateMessageId = (): MessageId => {
      const v = idQueue[i];
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

    const r1 = await sendMessage({
      conversationId: cid,
      senderId: uid,
      clientMessageId: cmid1,
      messageText: MessageTextSchema.parse("hello"),
    });
    expect(r1.kind).toBe("stored");

    const r2 = await sendMessage({
      conversationId: cid,
      senderId: uid,
      clientMessageId: cmid2,
      messageText: MessageTextSchema.parse("world"),
    });
    expect(r2.kind).toBe("stored");

    const s1 = await syncMessages({
      conversationId: cid,
      userId: uid,
      afterMessageId: undefined,
      limit: 50,
    });
    expect(s1.kind).toBe("ok");
    if (s1.kind === "ok") {
      expect(s1.messages.map((m) => m.messageId)).toEqual([mid1, mid2]);
    }

    const u1 = await updateReadCursor({
      conversationId: cid,
      userId: uid,
      lastReadMessageId: mid2,
    });
    expect(u1.kind).toBe("updated");
  });
});
