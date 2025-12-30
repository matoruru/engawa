import { describe, expect, it } from "bun:test";

import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import { makeListConversations } from "./listConversations";

// --- Test doubles ---
class InMemoryMembersRepo implements ConversationMembersRepository {
  private readonly members = new Set<string>();
  private readonly conversationsByUser = new Map<UserId, ConversationId[]>();
  private readonly usersByConversation = new Map<ConversationId, UserId[]>();

  async addMember(conversationId: ConversationId, userId: UserId): Promise<void> {
    this.members.add(`${conversationId}|${userId}`);
    
    const userConversations = this.conversationsByUser.get(userId) || [];
    if (!userConversations.includes(conversationId)) {
      this.conversationsByUser.set(userId, [...userConversations, conversationId]);
    }
    
    const conversationUsers = this.usersByConversation.get(conversationId) || [];
    if (!conversationUsers.includes(userId)) {
      this.usersByConversation.set(conversationId, [...conversationUsers, userId]);
    }
  }

  async isMember(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<boolean> {
    return this.members.has(`${conversationId}|${userId}`);
  }

  async listByUserId(userId: UserId): Promise<readonly ConversationId[]> {
    return this.conversationsByUser.get(userId) || [];
  }

  async listByConversationId(conversationId: ConversationId): Promise<readonly UserId[]> {
    return this.usersByConversation.get(conversationId) || [];
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const cid1 = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const cid2 = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");

describe("listConversations (feature/conversations)", () => {
  it("returns empty array when user has no conversations", async () => {
    const membersRepo = new InMemoryMembersRepo();

    const listConversations = makeListConversations({ membersRepo });

    const res = await listConversations({ userId: uid });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.conversations).toEqual([]);
    }
  });

  it("returns all conversations for a user", async () => {
    const membersRepo = new InMemoryMembersRepo();
    await membersRepo.addMember(cid1, uid);
    await membersRepo.addMember(cid2, uid);

    const listConversations = makeListConversations({ membersRepo });

    const res = await listConversations({ userId: uid });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.conversations.length).toBe(2);
      expect(res.conversations).toContain(String(cid1));
      expect(res.conversations).toContain(String(cid2));
    }
  });
});

