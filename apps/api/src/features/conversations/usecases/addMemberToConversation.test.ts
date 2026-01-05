import { describe, expect, it } from "bun:test";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import { makeAddMemberToConversation } from "./addMemberToConversation";

// --- Test doubles ---
class InMemoryMembersRepo implements ConversationMembersRepository {
  private readonly members = new Set<string>();
  private readonly conversationsByUser = new Map<UserId, ConversationId[]>();
  private readonly usersByConversation = new Map<ConversationId, UserId[]>();

  async addMember(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<void> {
    this.members.add(`${conversationId}|${userId}`);

    const userConversations = this.conversationsByUser.get(userId) || [];
    if (!userConversations.includes(conversationId)) {
      this.conversationsByUser.set(userId, [
        ...userConversations,
        conversationId,
      ]);
    }

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

  async listByUserId(userId: UserId): Promise<readonly ConversationId[]> {
    return this.conversationsByUser.get(userId) || [];
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
    const userConversations = this.conversationsByUser.get(userId) || [];
    this.conversationsByUser.set(
      userId,
      userConversations.filter((cid) => cid !== conversationId),
    );
    const conversationUsers =
      this.usersByConversation.get(conversationId) || [];
    this.usersByConversation.set(
      conversationId,
      conversationUsers.filter((uid) => uid !== userId),
    );
  }
}

// 固定値
const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const uid2 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e99");

describe("addMemberToConversation (feature/conversations)", () => {
  it("adds a member when requester is a conversation member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    await membersRepo.addMember(cid, uid);

    const addMemberToConversation = makeAddMemberToConversation({
      membersRepo,
    });

    const res = await addMemberToConversation({
      userId: uid,
      conversationId: cid,
      targetUserId: uid2,
    });

    expect(res.kind).toBe("added");

    const isMember = await membersRepo.isMember(cid, uid2);
    expect(isMember).toBe(true);
  });

  it("returns forbidden when requester is NOT a conversation member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    // uid をメンバーに追加しない

    const addMemberToConversation = makeAddMemberToConversation({
      membersRepo,
    });

    const res = await addMemberToConversation({
      userId: uid,
      conversationId: cid,
      targetUserId: uid2,
    });

    expect(res.kind).toBe("forbidden");
    if (res.kind === "forbidden") {
      expect(res.reason).toBe("NOT_A_MEMBER");
    }

    const isMember = await membersRepo.isMember(cid, uid2);
    expect(isMember).toBe(false);
  });

  it("returns conflict when target user is already a member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    await membersRepo.addMember(cid, uid);
    await membersRepo.addMember(cid, uid2); // 既にメンバー

    const addMemberToConversation = makeAddMemberToConversation({
      membersRepo,
    });

    const res = await addMemberToConversation({
      userId: uid,
      conversationId: cid,
      targetUserId: uid2,
    });

    expect(res.kind).toBe("conflict");
    if (res.kind === "conflict") {
      expect(res.reason).toBe("ALREADY_MEMBER");
    }
  });
});
