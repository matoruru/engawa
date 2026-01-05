import { describe, expect, it } from "bun:test";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import type { User } from "@/shared/features/users/domain";
import { UserSchema } from "@/shared/features/users/domain";
import type { UserRepository } from "@/shared/features/users/ports";
import {
  type ConversationId,
  ConversationIdSchema,
  type MessageId,
  MessageIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { Message } from "../../messages/domain";
import { MessageSchema, MessageTextSchema } from "../../messages/domain";
import type { MessageQueryRepository } from "../../messages/ports";
import { type ReadCursor, ReadCursorSchema } from "../../reads/domain";
import type { ConversationReadsRepository } from "../../reads/ports";
import type { ConversationRepository } from "../ports";
import { makeListConversations } from "./listConversations";

// --- Test doubles ---
class InMemoryMembersRepo implements ConversationMembersRepository {
  private readonly members = new Set<string>();
  private readonly conversationsByUser = new Map<UserId, ConversationId[]>();

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
    _conversationId: ConversationId,
  ): Promise<readonly UserId[]> {
    return [];
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
  }
}

class InMemoryConversationRepo implements ConversationRepository {
  private readonly titles = new Map<string, string | null>();

  async create(conversationId: ConversationId): Promise<void> {
    this.titles.set(String(conversationId), null);
  }

  async updateTitle(
    conversationId: ConversationId,
    title: string | null,
  ): Promise<void> {
    this.titles.set(String(conversationId), title);
  }

  async getTitle(conversationId: ConversationId): Promise<string | null> {
    return this.titles.get(String(conversationId)) ?? null;
  }
}

class InMemoryMessageQueryRepo implements MessageQueryRepository {
  private readonly messages = new Map<string, Message[]>();

  addMessage(message: Message): void {
    const key = String(message.conversationId);
    const existing = this.messages.get(key) || [];
    this.messages.set(key, [...existing, message]);
  }

  async listByConversation(): Promise<readonly Message[]> {
    return [];
  }

  async listLatestByConversation(
    conversationId: ConversationId,
    limit: number,
  ): Promise<readonly Message[]> {
    const messages = this.messages.get(String(conversationId)) || [];
    // 最新のlimit件を降順で取得し、時系列順に並び替え
    return messages
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .reverse();
  }

  async countUnread(
    conversationId: ConversationId,
    afterMessageId: MessageId | null,
  ): Promise<number> {
    const messages = this.messages.get(String(conversationId)) || [];
    if (afterMessageId === null) {
      return messages.length;
    }
    return messages.filter((m) => m.messageId > afterMessageId).length;
  }
}

class InMemoryConversationReadsRepo implements ConversationReadsRepository {
  private readonly cursors = new Map<string, ReadCursor>();

  async get(
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<ReadCursor | null> {
    const key = `${String(conversationId)}|${String(userId)}`;
    return this.cursors.get(key) ?? null;
  }

  async upsert(cursor: ReadCursor): Promise<void> {
    const key = `${String(cursor.conversationId)}|${String(cursor.userId)}`;
    this.cursors.set(key, cursor);
  }

  setReadCursor(
    conversationId: ConversationId,
    userId: UserId,
    lastReadMessageId: MessageId | null,
  ): void {
    const cursor = ReadCursorSchema.parse({
      conversationId,
      userId,
      lastReadMessageId,
      updatedAt: new Date(),
    });
    this.upsert(cursor);
  }
}

class InMemoryUserRepo implements UserRepository {
  private readonly users = new Map<string, User>();

  addUser(user: User): void {
    this.users.set(String(user.id), user);
  }

  async findByIds(userIds: readonly UserId[]): Promise<readonly User[]> {
    return userIds
      .map((id) => this.users.get(String(id)))
      .filter((u): u is User => u !== undefined);
  }

  async findById(userId: UserId): Promise<User | null> {
    return this.users.get(String(userId)) ?? null;
  }

  async findByUsername(_username: string): Promise<User | null> {
    return null;
  }

  async updateDisplayName(
    _userId: UserId,
    _displayName: string,
  ): Promise<void> {
    // no-op
  }

  async updateUsername(_userId: UserId, _username: string): Promise<void> {
    // no-op
  }

  async updateAvatarUrl(
    _userId: UserId,
    _avatarUrl: string | null,
  ): Promise<void> {
    // no-op
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const cid1 = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const cid2 = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");

describe("listConversations (feature/conversations)", () => {
  it("returns empty array when user has no conversations", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();
    const messageQueryRepo = new InMemoryMessageQueryRepo();
    const readsRepo = new InMemoryConversationReadsRepo();
    const userRepo = new InMemoryUserRepo();

    const listConversations = makeListConversations({
      membersRepo,
      conversationRepo,
      messageQueryRepo,
      readsRepo,
      userRepo,
    });

    const res = await listConversations({ userId: uid });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.conversations).toEqual([]);
    }
  });

  it("returns all conversations for a user", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();
    const messageQueryRepo = new InMemoryMessageQueryRepo();
    const readsRepo = new InMemoryConversationReadsRepo();
    const userRepo = new InMemoryUserRepo();

    await membersRepo.addMember(cid1, uid);
    await membersRepo.addMember(cid2, uid);

    await conversationRepo.create(cid1);
    await conversationRepo.create(cid2);
    await conversationRepo.updateTitle(cid2, "Test Conversation");

    const listConversations = makeListConversations({
      membersRepo,
      conversationRepo,
      messageQueryRepo,
      readsRepo,
      userRepo,
    });

    const res = await listConversations({ userId: uid });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.conversations.length).toBe(2);
      expect(res.conversations.map((c) => c.conversationId)).toContain(
        String(cid1),
      );
      expect(res.conversations.map((c) => c.conversationId)).toContain(
        String(cid2),
      );
      // メッセージがない場合は空配列
      expect(res.conversations[0]?.latestMessages).toEqual([]);
      expect(res.conversations[1]?.latestMessages).toEqual([]);
      // タイトルの確認
      const conv1 = res.conversations.find(
        (c) => c.conversationId === String(cid1),
      );
      const conv2 = res.conversations.find(
        (c) => c.conversationId === String(cid2),
      );
      expect(conv1?.title).toBeNull();
      expect(conv2?.title).toBe("Test Conversation");
    }
  });

  it("returns conversations with latest messages", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();
    const messageQueryRepo = new InMemoryMessageQueryRepo();
    const readsRepo = new InMemoryConversationReadsRepo();
    const userRepo = new InMemoryUserRepo();

    await membersRepo.addMember(cid1, uid);
    await conversationRepo.create(cid1);

    // ユーザーを追加
    const user1 = UserSchema.parse({
      id: uid,
      username: "user1",
      displayName: "User 1",
      avatarUrl: null,
    });
    userRepo.addUser(user1);

    // メッセージを追加
    const msg1 = MessageSchema.parse({
      messageId: MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e30"),
      conversationId: cid1,
      senderId: uid,
      clientMessageId: MessageIdSchema.parse(
        "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e31",
      ),
      messageText: MessageTextSchema.parse("Hello"),
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const msg2 = MessageSchema.parse({
      messageId: MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e32"),
      conversationId: cid1,
      senderId: uid,
      clientMessageId: MessageIdSchema.parse(
        "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e33",
      ),
      messageText: MessageTextSchema.parse("World"),
      createdAt: new Date("2025-01-01T00:00:01.000Z"),
    });
    messageQueryRepo.addMessage(msg1);
    messageQueryRepo.addMessage(msg2);

    const listConversations = makeListConversations({
      membersRepo,
      conversationRepo,
      messageQueryRepo,
      readsRepo,
      userRepo,
    });

    const res = await listConversations({ userId: uid });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.conversations.length).toBe(1);
      const conv = res.conversations[0];
      expect(conv?.conversationId).toBe(String(cid1));
      expect(conv?.latestMessages.length).toBe(2);
      expect(String(conv?.latestMessages[0]?.messageText)).toBe("Hello");
      expect(String(conv?.latestMessages[1]?.messageText)).toBe("World");
      expect(conv?.latestMessages[0]?.senderDisplayName).toBe("User 1");
      expect(conv?.unreadCount).toBe(2);
    }
  });

  it("calculates unread count correctly", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const conversationRepo = new InMemoryConversationRepo();
    const messageQueryRepo = new InMemoryMessageQueryRepo();
    const readsRepo = new InMemoryConversationReadsRepo();
    const userRepo = new InMemoryUserRepo();

    await membersRepo.addMember(cid1, uid);
    await conversationRepo.create(cid1);

    const user1 = UserSchema.parse({
      id: uid,
      username: "user1",
      displayName: "User 1",
      avatarUrl: null,
    });
    userRepo.addUser(user1);

    // 3つのメッセージを追加
    const msg1 = MessageSchema.parse({
      messageId: MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e30"),
      conversationId: cid1,
      senderId: uid,
      clientMessageId: MessageIdSchema.parse(
        "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e31",
      ),
      messageText: MessageTextSchema.parse("Message 1"),
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    });
    const msg2 = MessageSchema.parse({
      messageId: MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e32"),
      conversationId: cid1,
      senderId: uid,
      clientMessageId: MessageIdSchema.parse(
        "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e33",
      ),
      messageText: MessageTextSchema.parse("Message 2"),
      createdAt: new Date("2025-01-01T00:00:01.000Z"),
    });
    const msg3 = MessageSchema.parse({
      messageId: MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e34"),
      conversationId: cid1,
      senderId: uid,
      clientMessageId: MessageIdSchema.parse(
        "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e35",
      ),
      messageText: MessageTextSchema.parse("Message 3"),
      createdAt: new Date("2025-01-01T00:00:02.000Z"),
    });
    messageQueryRepo.addMessage(msg1);
    messageQueryRepo.addMessage(msg2);
    messageQueryRepo.addMessage(msg3);

    // msg2まで読んだ状態にする
    readsRepo.setReadCursor(cid1, uid, msg2.messageId);

    const listConversations = makeListConversations({
      membersRepo,
      conversationRepo,
      messageQueryRepo,
      readsRepo,
      userRepo,
    });

    const res = await listConversations({ userId: uid });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.conversations.length).toBe(1);
      const conv = res.conversations[0];
      expect(conv?.unreadCount).toBe(1); // msg3のみ未読
    }
  });
});
