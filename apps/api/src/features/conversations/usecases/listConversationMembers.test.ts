import { describe, expect, it } from "bun:test";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import type { User } from "@/shared/features/users/domain";
import type { UserRepository } from "@/shared/features/users/ports";
import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import { makeListConversationMembers } from "./listConversationMembers";

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

class InMemoryUserRepo implements UserRepository {
  private readonly users = new Map<UserId, User>();

  addUser(
    id: UserId,
    username: string,
    displayName: string,
    avatarUrl: string | null = null,
  ) {
    this.users.set(id, { id, username, displayName, avatarUrl });
  }

  async findByIds(userIds: readonly UserId[]): Promise<readonly User[]> {
    return Array.from(userIds)
      .map((id) => this.users.get(id))
      .filter((user): user is User => user !== undefined);
  }
  async findById(userId: UserId): Promise<User | null> {
    return this.users.get(userId) || null;
  }
  async findByUsername(username: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }
  async updateDisplayName(userId: UserId, displayName: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, displayName });
    }
  }
  async updateUsername(userId: UserId, username: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, username });
    }
  }
  async updateAvatarUrl(
    userId: UserId,
    avatarUrl: string | null,
  ): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, avatarUrl });
    }
  }
}

// 固定値
const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const uid2 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e99");

describe("listConversationMembers (feature/conversations)", () => {
  it("returns members when requester is a conversation member", async () => {
    const userRepo = new InMemoryUserRepo();
    userRepo.addUser(uid, "user1", "User One");
    userRepo.addUser(uid2, "user2", "User Two");

    const membersRepo = new InMemoryMembersRepo();
    await membersRepo.addMember(cid, uid);
    await membersRepo.addMember(cid, uid2);

    const listConversationMembers = makeListConversationMembers({
      userRepo,
      membersRepo,
    });

    const res = await listConversationMembers({
      userId: uid,
      conversationId: cid,
    });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.members.length).toBe(2);
      expect(res.members.map((m) => m.id)).toContain(uid);
      expect(res.members.map((m) => m.id)).toContain(uid2);
    }
  });

  it("returns forbidden when requester is NOT a conversation member", async () => {
    const userRepo = new InMemoryUserRepo();
    const membersRepo = new InMemoryMembersRepo();
    // uid をメンバーに追加しない

    const listConversationMembers = makeListConversationMembers({
      userRepo,
      membersRepo,
    });

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
