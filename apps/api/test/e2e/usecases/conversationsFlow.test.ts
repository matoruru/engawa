import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import {
  ConversationIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import { createPostgresClient } from "@/shared/infra/postgres/postgresClient";
import { makePostgresConversationRepo } from "../../../src/features/conversations/infra/postgres/conversationRepo";
import { makePostgresConversationMembersRepo } from "../../../src/features/conversations/infra/postgres/conversationMembersRepo";
import { makePostgresUserRepo } from "../../../src/shared/infra/postgres/userRepo";
import { makeCreateConversation } from "../../../src/features/conversations/usecases/createConversation";
import { makeListConversations } from "../../../src/features/conversations/usecases/listConversations";
import { makeAddMemberToConversation } from "../../../src/features/conversations/usecases/addMemberToConversation";
import { makeListConversationMembers } from "../../../src/features/conversations/usecases/listConversationMembers";
import { makePostgresMessageQueryRepo } from "../../../src/features/messages/infra/postgres/messageQueryRepo";
import { makePostgresConversationReadsRepo } from "../../../src/features/reads/infra/postgres/conversationReadsRepo";
import {
  resetDb,
  seedUser,
} from "../../helpers/seed";
import { uuidv7 } from "../../../src/shared/uuid";

describe("e2e/usecases: conversations flow", () => {
  const db = createPostgresClient({
    POSTGRES_HOST: process.env.POSTGRES_HOST ?? "",
    POSTGRES_PORT: Number(process.env.POSTGRES_PORT ?? 5432),
    POSTGRES_USER: process.env.POSTGRES_USER ?? "",
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? "",
    POSTGRES_DATABASE: process.env.POSTGRES_DATABASE ?? "",
  });

  const uid1 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
  const uid2 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12");
  const uid3 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e13");

  beforeAll(async () => {
    await db`SELECT 1 as ok`;
  });

  beforeEach(async () => {
    await resetDb(db);
    await seedUser(db, { id: uid1, username: "alice", displayName: "Alice" });
    await seedUser(db, { id: uid2, username: "bob", displayName: "Bob" });
    await seedUser(db, { id: uid3, username: "charlie", displayName: "Charlie" });
  });

  afterAll(async () => {
    await db.end({ timeout: 1 });
  });

  it("createConversation -> listConversations", async () => {
    const conversationRepo = makePostgresConversationRepo(db);
    const membersRepo = makePostgresConversationMembersRepo(db);

    const createConversation = makeCreateConversation({
      conversationRepo,
      membersRepo,
      generateConversationId: () => ConversationIdSchema.parse(uuidv7()),
      now: () => new Date("2025-12-27T00:00:00.000Z"),
    });

    const messageQueryRepo = makePostgresMessageQueryRepo(db);
    const readsRepo = makePostgresConversationReadsRepo(db);
    const userRepo = makePostgresUserRepo(db);
    const listConversations = makeListConversations({
      membersRepo,
      messageQueryRepo,
      conversationRepo,
      readsRepo,
      userRepo,
    });

    // 会話を作成
    const r1 = await createConversation({ userId: uid1 });
    expect(r1.kind).toBe("created");
    if (r1.kind !== "created") throw new Error("Unexpected result");
    const cid1 = r1.conversationId;

    const r2 = await createConversation({ userId: uid1 });
    expect(r2.kind).toBe("created");
    if (r2.kind !== "created") throw new Error("Unexpected result");
    const cid2 = r2.conversationId;

    // 会話一覧を取得
    const l1 = await listConversations({ userId: uid1 });
    expect(l1.kind).toBe("ok");
    if (l1.kind === "ok") {
      expect(l1.conversations.length).toBe(2);
      const conversationIds = l1.conversations.map(c => c.conversationId);
      expect(conversationIds).toContain(cid1);
      expect(conversationIds).toContain(cid2);
    }

    // uid2の会話一覧は空
    const l2 = await listConversations({ userId: uid2 });
    expect(l2.kind).toBe("ok");
    if (l2.kind === "ok") {
      expect(l2.conversations.length).toBe(0);
    }
  });

  it("createConversation -> addMemberToConversation -> listConversationMembers", async () => {
    const conversationRepo = makePostgresConversationRepo(db);
    const membersRepo = makePostgresConversationMembersRepo(db);
    const userRepo = makePostgresUserRepo(db);

    const createConversation = makeCreateConversation({
      conversationRepo,
      membersRepo,
      generateConversationId: () => ConversationIdSchema.parse(uuidv7()),
      now: () => new Date("2025-12-27T00:00:00.000Z"),
    });

    const addMemberToConversation = makeAddMemberToConversation({
      membersRepo,
    });

    const listConversationMembers = makeListConversationMembers({
      userRepo,
      membersRepo,
    });

    // 会話を作成
    const r1 = await createConversation({ userId: uid1 });
    expect(r1.kind).toBe("created");
    if (r1.kind !== "created") throw new Error("Unexpected result");
    const cid = r1.conversationId;

    // メンバーを追加
    const a1 = await addMemberToConversation({
      userId: uid1,
      conversationId: cid,
      targetUserId: uid2,
    });
    expect(a1.kind).toBe("added");

    const a2 = await addMemberToConversation({
      userId: uid1,
      conversationId: cid,
      targetUserId: uid3,
    });
    expect(a2.kind).toBe("added");

    // メンバー一覧を取得
    const l1 = await listConversationMembers({
      userId: uid1,
      conversationId: cid,
    });
    expect(l1.kind).toBe("ok");
    if (l1.kind === "ok") {
      expect(l1.members.length).toBe(3);
      const memberIds = l1.members.map((m) => m.id);
      expect(memberIds).toContain(String(uid1));
      expect(memberIds).toContain(String(uid2));
      expect(memberIds).toContain(String(uid3));
    }

    // uid2からもメンバー一覧を取得できる
    const l2 = await listConversationMembers({
      userId: uid2,
      conversationId: cid,
    });
    expect(l2.kind).toBe("ok");
    if (l2.kind === "ok") {
      expect(l2.members.length).toBe(3);
    }
  });

  it("addMemberToConversation returns forbidden when requester is not a member", async () => {
    const conversationRepo = makePostgresConversationRepo(db);
    const membersRepo = makePostgresConversationMembersRepo(db);

    const createConversation = makeCreateConversation({
      conversationRepo,
      membersRepo,
      generateConversationId: () => ConversationIdSchema.parse(uuidv7()),
      now: () => new Date("2025-12-27T00:00:00.000Z"),
    });

    const addMemberToConversation = makeAddMemberToConversation({
      membersRepo,
    });

    // 会話を作成（uid1が作成者）
    const r1 = await createConversation({ userId: uid1 });
    expect(r1.kind).toBe("created");
    if (r1.kind !== "created") throw new Error("Unexpected result");
    const cid = r1.conversationId;

    // uid2（メンバーではない）がメンバーを追加しようとする
    const a1 = await addMemberToConversation({
      userId: uid2,
      conversationId: cid,
      targetUserId: uid3,
    });
    expect(a1.kind).toBe("forbidden");
    if (a1.kind === "forbidden") {
      expect(a1.reason).toBe("NOT_A_MEMBER");
    }
  });

  it("addMemberToConversation returns conflict when target is already a member", async () => {
    const conversationRepo = makePostgresConversationRepo(db);
    const membersRepo = makePostgresConversationMembersRepo(db);

    const createConversation = makeCreateConversation({
      conversationRepo,
      membersRepo,
      generateConversationId: () => ConversationIdSchema.parse(uuidv7()),
      now: () => new Date("2025-12-27T00:00:00.000Z"),
    });

    const addMemberToConversation = makeAddMemberToConversation({
      membersRepo,
    });

    // 会話を作成
    const r1 = await createConversation({ userId: uid1 });
    expect(r1.kind).toBe("created");
    if (r1.kind !== "created") throw new Error("Unexpected result");
    const cid = r1.conversationId;

    // メンバーを追加
    const a1 = await addMemberToConversation({
      userId: uid1,
      conversationId: cid,
      targetUserId: uid2,
    });
    expect(a1.kind).toBe("added");

    // 既にメンバーのユーザーを再度追加しようとする
    const a2 = await addMemberToConversation({
      userId: uid1,
      conversationId: cid,
      targetUserId: uid2,
    });
    expect(a2.kind).toBe("conflict");
    if (a2.kind === "conflict") {
      expect(a2.reason).toBe("ALREADY_MEMBER");
    }
  });

  it("listConversationMembers returns forbidden when requester is not a member", async () => {
    const conversationRepo = makePostgresConversationRepo(db);
    const membersRepo = makePostgresConversationMembersRepo(db);
    const userRepo = makePostgresUserRepo(db);

    const createConversation = makeCreateConversation({
      conversationRepo,
      membersRepo,
      generateConversationId: () => ConversationIdSchema.parse(uuidv7()),
      now: () => new Date("2025-12-27T00:00:00.000Z"),
    });

    const listConversationMembers = makeListConversationMembers({
      userRepo,
      membersRepo,
    });

    // 会話を作成（uid1が作成者）
    const r1 = await createConversation({ userId: uid1 });
    expect(r1.kind).toBe("created");
    if (r1.kind !== "created") throw new Error("Unexpected result");
    const cid = r1.conversationId;

    // uid2（メンバーではない）がメンバー一覧を取得しようとする
    const l1 = await listConversationMembers({
      userId: uid2,
      conversationId: cid,
    });
    expect(l1.kind).toBe("forbidden");
    if (l1.kind === "forbidden") {
      expect(l1.reason).toBe("NOT_A_MEMBER");
    }
  });
});

