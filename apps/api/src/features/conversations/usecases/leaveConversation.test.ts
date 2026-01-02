import { describe, expect, it } from "bun:test";

import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import { makeLeaveConversation } from "./leaveConversation";

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

  async removeMember(conversationId: ConversationId, userId: UserId): Promise<void> {
    this.members.delete(`${conversationId}|${userId}`);
    const userConversations = this.conversationsByUser.get(userId) || [];
    this.conversationsByUser.set(userId, userConversations.filter(cid => cid !== conversationId));
    const conversationUsers = this.usersByConversation.get(conversationId) || [];
    this.usersByConversation.set(conversationId, conversationUsers.filter(uid => uid !== userId));
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");

describe("leaveConversation", () => {
  it("should leave conversation when user is a member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    await membersRepo.addMember(cid, uid);

    const leaveConversation = makeLeaveConversation({
      membersRepo,
    });

    const result = await leaveConversation({
      conversationId: cid,
      userId: uid,
    });

    expect(result.kind).toBe("left");
    expect(await membersRepo.isMember(cid, uid)).toBe(false);
  });

  it("should return forbidden when user is not a member", async () => {
    const membersRepo = new InMemoryMembersRepo();

    const leaveConversation = makeLeaveConversation({
      membersRepo,
    });

    const result = await leaveConversation({
      conversationId: cid,
      userId: uid,
    });

    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.reason).toBe("NOT_A_MEMBER");
    }
  });
});

