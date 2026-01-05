import { describe, expect, it } from "bun:test";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationRepository } from "../ports";
import { makeGetConversation } from "./getConversation";

// --- Test doubles ---
class InMemoryMembersRepo implements ConversationMembersRepository {
  private readonly members = new Set<string>();
  private readonly usersByConversation = new Map<ConversationId, UserId[]>();

  async addMember(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<void> {
    this.members.add(`${conversationId}|${userId}`);
    const conversationUsers =
      this.usersByConversation.get(conversationId) || [];
    if (!conversationUsers.includes(userId)) {
      this.usersByConversation.set(conversationId, [
        ...conversationUsers,
        userId,
      ]);
    }
  }

  async isMember(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<boolean> {
    return this.members.has(`${conversationId}|${userId}`);
  }

  async listByUserId(_userId: UserId): Promise<readonly ConversationId[]> {
    return [];
  }

  async listByConversationId(
    conversationId: ConversationId,
  ): Promise<readonly UserId[]> {
    return this.usersByConversation.get(conversationId) || [];
  }

  async removeMember(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<void> {
    this.members.delete(`${conversationId}|${userId}`);
    const conversationUsers =
      this.usersByConversation.get(conversationId) || [];
    this.usersByConversation.set(
      conversationId,
      conversationUsers.filter((uid) => uid !== userId),
    );
  }
}

class InMemoryConversationRepo implements ConversationRepository {
  private readonly conversations = new Set<string>();
  private readonly titles = new Map<string, string | null>();

  async create(conversationId: ConversationId): Promise<void> {
    this.conversations.add(String(conversationId));
    this.titles.set(String(conversationId), null);
  }

  async updateTitle(
    conversationId: ConversationId,
    title: string | null,
  ): Promise<void> {
    this.titles.set(String(conversationId), title);
  }

  async getTitle(conversationId: ConversationId): Promise<string | null> {
    if (!this.conversations.has(String(conversationId))) {
      return null;
    }
    return this.titles.get(String(conversationId)) ?? null;
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const uid2 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12");
const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");

describe("getConversation", () => {
  it("should return conversation when user is a member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();

    await conversationRepo.create(cid);
    await membersRepo.addMember(cid, uid);

    const getConversation = makeGetConversation({
      conversationRepo,
      membersRepo,
    });

    const result = await getConversation({
      conversationId: cid,
      userId: uid,
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.conversationId).toBe(String(cid));
      expect(result.title).toBeNull();
    }
  });

  it("should return conversation with title when user is a member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();

    await conversationRepo.create(cid);
    await conversationRepo.updateTitle(cid, "Test Conversation");
    await membersRepo.addMember(cid, uid);

    const getConversation = makeGetConversation({
      conversationRepo,
      membersRepo,
    });

    const result = await getConversation({
      conversationId: cid,
      userId: uid,
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.conversationId).toBe(String(cid));
      expect(result.title).toBe("Test Conversation");
    }
  });

  it("should return forbidden when user is not a member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();

    await conversationRepo.create(cid);
    await membersRepo.addMember(cid, uid2);

    const getConversation = makeGetConversation({
      conversationRepo,
      membersRepo,
    });

    const result = await getConversation({
      conversationId: cid,
      userId: uid,
    });

    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.reason).toBe("NOT_A_MEMBER");
    }
  });

  it("should return notFound when conversation does not exist", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();

    const nonExistentCid = ConversationIdSchema.parse(
      "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e99",
    );

    const getConversation = makeGetConversation({
      conversationRepo,
      membersRepo,
    });

    const result = await getConversation({
      conversationId: nonExistentCid,
      userId: uid,
    });

    expect(result.kind).toBe("notFound");
  });
});
