import { describe, expect, it } from "bun:test";

import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import type { ConversationRepository } from "../ports";
import { makeCreateConversation } from "./createConversation";

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

class InMemoryConversationRepo implements ConversationRepository {
  private readonly conversations = new Set<string>();

  async create(conversationId: ConversationId): Promise<void> {
    this.conversations.add(String(conversationId));
  }

  get createdConversations(): readonly string[] {
    return Array.from(this.conversations);
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const fixedConversationId = ConversationIdSchema.parse(
  "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10",
);

describe("createConversation (feature/conversations)", () => {
  it("creates a new conversation and adds creator as member", async () => {
    const conversationRepo = new InMemoryConversationRepo();
    const membersRepo = new InMemoryMembersRepo();

    const createConversation = makeCreateConversation({
      conversationRepo,
      membersRepo,
      generateConversationId: () => fixedConversationId,
      now: () => new Date("2025-12-27T00:00:00.000Z"),
    });

    const res = await createConversation({ userId: uid });

    expect(res.kind).toBe("created");
    if (res.kind === "created") {
      expect(res.conversationId).toBe(fixedConversationId);
      expect(conversationRepo.createdConversations).toContain(String(fixedConversationId));
      
      const isMember = await membersRepo.isMember(fixedConversationId, uid);
      expect(isMember).toBe(true);
    }
  });
});

