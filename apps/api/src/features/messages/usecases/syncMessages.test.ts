import { describe, expect, it } from "bun:test";

import {
  ClientMessageIdSchema,
  type ConversationId,
  ConversationIdSchema,
  type MessageId,
  MessageIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";

import { type Message, MessageTextSchema } from "../domain";
import type {
  ListByConversationParams,
  MessageQueryRepository,
} from "../ports";
import { makeSyncMessages } from "./syncMessages";

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

class InMemoryMessageQueryRepo implements MessageQueryRepository {
  constructor(private readonly all: readonly Message[]) {}

  async listByConversation(
    params: ListByConversationParams,
  ): Promise<readonly Message[]> {
    const byConv = this.all
      .filter((m) => m.conversationId === params.conversationId)
      .sort((a, b) =>
        a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0,
      );

    const after = params.afterMessageId;
    const filtered =
      after === undefined ? byConv : byConv.filter((m) => m.messageId > after);

    return filtered.slice(0, params.limit);
  }

  async listLatestByConversation(
    conversationId: ConversationId,
    limit: number,
  ): Promise<readonly Message[]> {
    const byConv = this.all
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) =>
        a.messageId > b.messageId ? -1 : a.messageId < b.messageId ? 1 : 0,
      );

    return byConv.slice(0, limit).reverse();
  }
  async countUnread(): Promise<number> {
    return 0;
  }
}

class SpyQueryRepo implements MessageQueryRepository {
  public called = 0;
  constructor(private readonly inner: MessageQueryRepository) {}
  async listByConversation(
    params: ListByConversationParams,
  ): Promise<readonly Message[]> {
    this.called += 1;
    return this.inner.listByConversation(params);
  }
  async listLatestByConversation(
    conversationId: ConversationId,
    limit: number,
  ): Promise<readonly Message[]> {
    return this.inner.listLatestByConversation(conversationId, limit);
  }
  async countUnread(
    conversationId: ConversationId,
    afterMessageId: MessageId | null,
  ): Promise<number> {
    return this.inner.countUnread(conversationId, afterMessageId);
  }
}

// --- Fixtures ---
const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const uidMember = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const uidNotMember = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e99");

const mkMsg = (id: string, createdAtIso: string): Message => ({
  messageId: MessageIdSchema.parse(id),
  conversationId: cid,
  senderId: uidMember,
  clientMessageId: ClientMessageIdSchema.parse(
    // client_message_id はテストで一意なら何でもOK
    id.replace(/.$/, "a"),
  ),
  messageText: MessageTextSchema.parse("hello"),
  createdAt: new Date(createdAtIso),
});

const m1 = mkMsg(
  "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20",
  "2025-12-27T00:00:00.000Z",
);
const m2 = mkMsg(
  "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e21",
  "2025-12-27T00:00:01.000Z",
);
const m3 = mkMsg(
  "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e22",
  "2025-12-27T00:00:02.000Z",
);

describe("syncMessages (feature/messages)", () => {
  it("returns forbidden when user is NOT a conversation member, and does not call queryRepo", async () => {
    const membersRepo = new InMemoryMembersRepo(); // member追加しない
    const spyRepo = new SpyQueryRepo(
      new InMemoryMessageQueryRepo([m1, m2, m3]),
    );

    const syncMessages = makeSyncMessages({
      membersRepo,
      queryRepo: spyRepo,
    });

    const res = await syncMessages({
      conversationId: cid,
      userId: uidNotMember,
      afterMessageId: undefined,
      limit: 50,
    });

    expect(res).toEqual({ kind: "forbidden", reason: "NOT_A_MEMBER" });
    expect(spyRepo.called).toBe(0);
  });

  it("returns messages in ascending order with limit", async () => {
    const membersRepo = new InMemoryMembersRepo();
    membersRepo.addMember(cid, uidMember);

    const syncMessages = makeSyncMessages({
      membersRepo,
      queryRepo: new InMemoryMessageQueryRepo([m3, m1, m2]), // わざと順不同
    });

    const res = await syncMessages({
      conversationId: cid,
      userId: uidMember,
      afterMessageId: undefined,
      limit: 2,
    });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.messages.map((m) => m.messageId)).toEqual([
        m1.messageId,
        m2.messageId,
      ]);
    }
  });

  it("supports afterMessageId for catch-up", async () => {
    const membersRepo = new InMemoryMembersRepo();
    membersRepo.addMember(cid, uidMember);

    const syncMessages = makeSyncMessages({
      membersRepo,
      queryRepo: new InMemoryMessageQueryRepo([m1, m2, m3]),
    });

    const res = await syncMessages({
      conversationId: cid,
      userId: uidMember,
      afterMessageId: m1.messageId,
      limit: 50,
    });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.messages.map((m) => m.messageId)).toEqual([
        m2.messageId,
        m3.messageId,
      ]);
    }
  });
});
