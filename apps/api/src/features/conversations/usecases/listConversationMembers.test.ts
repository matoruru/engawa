import { describe, expect, it } from "bun:test";

import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import type { User, UserRepository } from "@/shared/ports/users";
import { makeListConversationMembers } from "./listConversationMembers";

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

class InMemoryUserRepo implements UserRepository {
  private readonly users = new Map<string, User>();

  addUser(id: string, username: string, displayName: string) {
    this.users.set(id, { id, username, displayName });
  }

  async findByIds(userIds: readonly UserId[]): Promise<readonly User[]> {
    return Array.from(userIds)
      .map((id) => this.users.get(String(id)))
      .filter((user): user is User => user !== undefined);
  }
}

// 固定値
const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const uid2 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e99");

describe("listConversationMembers (feature/conversations)", () => {
  it("returns members when requester is a conversation member", async () => {
    const userRepo = new InMemoryUserRepo();
    userRepo.addUser(String(uid), "user1", "User One");
    userRepo.addUser(String(uid2), "user2", "User Two");

    const membersRepo = new InMemoryMembersRepo();
    await membersRepo.addMember(cid, uid);
    await membersRepo.addMember(cid, uid2);

    const listConversationMembers = makeListConversationMembers({ userRepo, membersRepo });

    const res = await listConversationMembers({
      userId: uid,
      conversationId: cid,
    });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.members.length).toBe(2);
      expect(res.members.map((m) => m.id)).toContain(String(uid));
      expect(res.members.map((m) => m.id)).toContain(String(uid2));
    }
  });

  it("returns forbidden when requester is NOT a conversation member", async () => {
    const userRepo = new InMemoryUserRepo();
    const membersRepo = new InMemoryMembersRepo();
    // uid をメンバーに追加しない

    const listConversationMembers = makeListConversationMembers({ userRepo, membersRepo });

    const res = await listConversationMembers({
      userId: uid,
      conversationId: cid,
    });

    expect(res.kind).toBe("forbidden");
    if (res.kind === "forbidden") {
      expect(res.reason).toBe("NOT_A_MEMBER");
    }
  });
});

