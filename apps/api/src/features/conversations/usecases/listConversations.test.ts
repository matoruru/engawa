import { describe, expect, it } from "bun:test";

import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import type { MessageQueryRepository } from "../../messages/ports";
import type { Message } from "../../messages/domain";
import { makeListConversations } from "./listConversations";
import { ConversationRepository } from "../ports";
import type { ConversationReadsRepository } from "../../reads/ports";
import type { ReadCursor } from "../../reads/domain";
import type { UserRepository } from "@/shared/ports/users";
import type { User } from "@/shared/ports/users";

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

// --- Test doubles ---
class InMemoryMessageQueryRepo implements MessageQueryRepository {
  async listByConversation(): Promise<readonly Message[]> {
    return [];
  }
  async listLatestByConversation(): Promise<readonly Message[]> {
    return [];
  }
  async countUnread(): Promise<number> {
    return 0;
  }
}

class InMemoryConversationRepo implements ConversationRepository {
  create(conversationId: ConversationId): Promise<void> {
    throw new Error("Method not implemented.");
  }
  updateTitle(conversationId: ConversationId, title: string | null): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async getTitle(conversationId: ConversationId): Promise<string | null> {
    return null;
  }
}

class InMemoryReadsRepo implements ConversationReadsRepository {
  async get(): Promise<ReadCursor | null> {
    return null;
  }
  async upsert(): Promise<void> {
    // noop
  }
}

class InMemoryUserRepo implements UserRepository {
  private readonly users = new Map<UserId, User>();

  async findByIds(userIds: readonly UserId[]): Promise<readonly User[]> {
    return userIds
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

  async updateAvatarUrl(userId: UserId, avatarUrl: string | null): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, avatarUrl });
    }
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const cid1 = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const cid2 = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");

describe("listConversations (feature/conversations)", () => {
  it("returns empty array when user has no conversations", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const messageQueryRepo = new InMemoryMessageQueryRepo();
    const conversationRepo = new InMemoryConversationRepo();
    const readsRepo = new InMemoryReadsRepo();
    const userRepo = new InMemoryUserRepo();

    const listConversations = makeListConversations({ membersRepo, messageQueryRepo, conversationRepo, readsRepo, userRepo });

    const res = await listConversations({ userId: uid });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.conversations).toEqual([]);
    }
  });

  it("returns all conversations for a user", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const messageQueryRepo = new InMemoryMessageQueryRepo();
    const conversationRepo = new InMemoryConversationRepo();
    const readsRepo = new InMemoryReadsRepo();
    const userRepo = new InMemoryUserRepo();
    await membersRepo.addMember(cid1, uid);
    await membersRepo.addMember(cid2, uid);

    const listConversations = makeListConversations({ membersRepo, messageQueryRepo, conversationRepo, readsRepo, userRepo });

    const res = await listConversations({ userId: uid });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.conversations.length).toBe(2);
      expect(res.conversations.map((c) => c.conversationId)).toContain(String(cid1));
      expect(res.conversations.map((c) => c.conversationId)).toContain(String(cid2));
      // メッセージがない場合は空配列
      expect(res.conversations[0]?.latestMessages).toEqual([]);
      expect(res.conversations[1]?.latestMessages).toEqual([]);
    }
  });
});

