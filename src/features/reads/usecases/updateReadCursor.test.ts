import { describe, expect, it } from "bun:test";

import {
  type ConversationId,
  ConversationIdSchema,
  MessageIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import type { ReadCursor } from "../domain";
import type { ConversationReadsRepository } from "../ports";
import { makeUpdateReadCursor } from "./updateReadCursor";

// --- Test doubles ---
class InMemoryMembersRepo implements ConversationMembersRepository {
  private readonly members = new Set<string>();
  addMember(conversationId: ConversationId, userId: UserId): void {
    this.members.add(`${conversationId}|${userId}`);
  }
  async isMember(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<boolean> {
    return this.members.has(`${conversationId}|${userId}`);
  }
}

class InMemoryReadsRepo implements ConversationReadsRepository {
  private readonly byKey = new Map<string, ReadCursor>();
  private key(conversationId: ConversationId, userId: UserId): string {
    return `${conversationId}|${userId}`;
  }
  async get(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<ReadCursor | null> {
    return this.byKey.get(this.key(conversationId, userId)) ?? null;
  }
  async upsert(cursor: ReadCursor): Promise<void> {
    this.byKey.set(this.key(cursor.conversationId, cursor.userId), cursor);
  }
}

// 実行されたかどうかをテストするためのラッパー
class SpyReadsRepo implements ConversationReadsRepository {
  public getCalled = 0;
  public upsertCalled = 0;
  constructor(private readonly inner: ConversationReadsRepository) {}
  async get(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<ReadCursor | null> {
    this.getCalled += 1;
    return this.inner.get(conversationId, userId);
  }
  async upsert(cursor: ReadCursor): Promise<void> {
    this.upsertCalled += 1;
    return this.inner.upsert(cursor);
  }
}

const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");

const mid1 = MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");
const mid2 = MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e21");
const mid3 = MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e22");

describe("updateReadCursor (feature/reads)", () => {
  it("returns forbidden when user is NOT a conversation member, and does not touch readsRepo", async () => {
    const membersRepo = new InMemoryMembersRepo(); // member追加しない
    const spyReadsRepo = new SpyReadsRepo(new InMemoryReadsRepo());

    const updateReadCursor = makeUpdateReadCursor({
      membersRepo,
      readsRepo: spyReadsRepo,
      now: () => new Date("2025-12-27T00:00:00.000Z"),
    });

    const res = await updateReadCursor({
      conversationId: cid,
      userId: uid,
      lastReadMessageId: mid1,
    });

    expect(res).toEqual({ kind: "forbidden", reason: "NOT_A_MEMBER" });
    expect(spyReadsRepo.getCalled).toBe(0);
    expect(spyReadsRepo.upsertCalled).toBe(0);
  });

  it("updates cursor on first update", async () => {
    const membersRepo = new InMemoryMembersRepo();
    membersRepo.addMember(cid, uid);

    const readsRepo = new InMemoryReadsRepo();

    const updateReadCursor = makeUpdateReadCursor({
      membersRepo,
      readsRepo,
      now: () => new Date("2025-12-27T00:00:00.000Z"),
    });

    const res = await updateReadCursor({
      conversationId: cid,
      userId: uid,
      lastReadMessageId: mid1,
    });

    expect(res.kind).toBe("updated");
    if (res.kind === "updated") {
      expect(res.cursor.lastReadMessageId).toBe(mid1);
      expect(res.cursor.updatedAt.toISOString()).toBe(
        "2025-12-27T00:00:00.000Z",
      );
    }
  });

  it("ignores update when lastReadMessageId is older (no rollback)", async () => {
    const membersRepo = new InMemoryMembersRepo();
    membersRepo.addMember(cid, uid);

    const readsRepo = new InMemoryReadsRepo();

    const updateReadCursor = makeUpdateReadCursor({
      membersRepo,
      readsRepo,
      now: () => new Date("2025-12-27T00:00:00.000Z"),
    });

    await updateReadCursor({
      conversationId: cid,
      userId: uid,
      lastReadMessageId: mid3,
    });

    const res = await updateReadCursor({
      conversationId: cid,
      userId: uid,
      lastReadMessageId: mid2, // 古い
    });

    expect(res.kind).toBe("ignored");
    if (res.kind === "ignored") {
      expect(res.cursor?.lastReadMessageId).toBe(mid3);
    }
  });

  it("updates cursor when lastReadMessageId is newer", async () => {
    const membersRepo = new InMemoryMembersRepo();
    membersRepo.addMember(cid, uid);

    const readsRepo = new InMemoryReadsRepo();

    let now = new Date("2025-12-27T00:00:00.000Z");
    const updateReadCursor = makeUpdateReadCursor({
      membersRepo,
      readsRepo,
      now: () => now,
    });

    await updateReadCursor({
      conversationId: cid,
      userId: uid,
      lastReadMessageId: mid1,
    });

    now = new Date("2025-12-27T00:00:10.000Z");

    const res = await updateReadCursor({
      conversationId: cid,
      userId: uid,
      lastReadMessageId: mid2,
    });

    expect(res.kind).toBe("updated");
    if (res.kind === "updated") {
      expect(res.cursor.lastReadMessageId).toBe(mid2);
      expect(res.cursor.updatedAt.toISOString()).toBe(
        "2025-12-27T00:00:10.000Z",
      );
    }
  });
});
