import { describe, expect, it } from "bun:test";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationRepository } from "../ports";
import { makeUpdateConversationTitle } from "./updateConversationTitle";

// --- Test doubles ---
class InMemoryMembersRepo implements ConversationMembersRepository {
  private readonly members = new Set<string>();

  async addMember(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<void> {
    this.members.add(`${conversationId}|${userId}`);
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
    _conversationId: ConversationId,
  ): Promise<readonly UserId[]> {
    return [];
  }

  async removeMember(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<void> {
    this.members.delete(`${conversationId}|${userId}`);
  }
}

class InMemoryConversationRepo implements ConversationRepository {
  private readonly conversations = new Set<ConversationId>();
  private readonly titles = new Map<string, string | null>();

  async create(conversationId: ConversationId): Promise<void> {
    this.conversations.add(conversationId);
    this.titles.set(conversationId, null);
  }

  async updateTitle(
    conversationId: ConversationId,
    title: string | null,
  ): Promise<void> {
    this.titles.set(conversationId, title);
  }

  async getTitle(conversationId: ConversationId): Promise<string | null> {
    return this.titles.get(conversationId) ?? null;
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const uid2 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12");
const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");

describe("updateConversationTitle", () => {
  it("should update title when user is a member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();

    await conversationRepo.create(cid);
    await membersRepo.addMember(cid, uid);

    const updateConversationTitle = makeUpdateConversationTitle({
      conversationRepo,
      membersRepo,
    });

    const result = await updateConversationTitle({
      conversationId: cid,
      userId: uid,
      title: "New Title",
    });

    expect(result.kind).toBe("updated");
    expect(await conversationRepo.getTitle(cid)).toBe("New Title");
  });

  it("should update title to null when user is a member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();

    await conversationRepo.create(cid);
    await conversationRepo.updateTitle(cid, "Old Title");
    await membersRepo.addMember(cid, uid);

    const updateConversationTitle = makeUpdateConversationTitle({
      conversationRepo,
      membersRepo,
    });

    const result = await updateConversationTitle({
      conversationId: cid,
      userId: uid,
      title: null,
    });

    expect(result.kind).toBe("updated");
    expect(await conversationRepo.getTitle(cid)).toBeNull();
  });

  it("should return forbidden when user is not a member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();

    await conversationRepo.create(cid);
    await membersRepo.addMember(cid, uid2);

    const updateConversationTitle = makeUpdateConversationTitle({
      conversationRepo,
      membersRepo,
    });

    const result = await updateConversationTitle({
      conversationId: cid,
      userId: uid,
      title: "New Title",
    });

    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.reason).toBe("NOT_A_MEMBER");
    }
    expect(await conversationRepo.getTitle(cid)).toBeNull();
  });
});
