import { describe, expect, it } from "bun:test";

import {
  type ConversationId,
  ConversationIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
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

// テスト用のモックPostgresClient
// BunのSQLテンプレートリテラルをモックするため、特殊な実装が必要
class MockPostgresClient {
  private readonly conversations = new Map<
    string,
    { id: string; title: string | null }
  >();
  private readonly members = new Map<string, Set<string>>(); // conversationId -> Set<userId>
  private readonly messages = new Map<
    string,
    Array<{
      message_id: string;
      conversation_id: string;
      sender_id: string;
      client_message_id: string;
      message_text: string;
      created_at: Date;
    }>
  >();
  private readonly reads = new Map<
    string,
    { conversationId: string; userId: string; lastReadMessageId: string | null }
  >();
  private readonly users = new Map<
    string,
    { id: string; display_name: string | null }
  >();

  // SQLテンプレートリテラルとして呼び出される
  async query(
    _strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> {
    // user_conversations CTEを処理
    const userId = values[0] as string;
    const conversationIds: string[] = [];
    for (const [convId, userIds] of this.members.entries()) {
      if (userIds.has(userId)) {
        conversationIds.push(convId);
      }
    }

    // conversation_data CTEを処理
    const results: Array<{
      conversation_id: string;
      title: string | null;
      message_id: string | null;
      sender_id: string | null;
      client_message_id: string | null;
      message_text: string | null;
      message_created_at: Date | null;
      sender_display_name: string | null;
      unread_count: number;
      latest_message_created_at: Date | null;
      row_num: number;
    }> = [];

    for (const convId of conversationIds) {
      const conv = this.conversations.get(convId);
      if (!conv) continue;

      // 未読数を計算
      const read = this.reads.get(`${convId}|${userId}`);
      const lastReadMessageId = read?.lastReadMessageId ?? null;
      const convMessages = this.messages.get(convId) || [];
      const unreadCount =
        lastReadMessageId === null
          ? convMessages.length
          : convMessages.filter((m) => m.message_id > lastReadMessageId).length;

      // 最新メッセージの作成日時
      const latestMessage =
        convMessages.length > 0 ? convMessages[convMessages.length - 1] : null;
      const latestMessageCreatedAt = latestMessage?.created_at ?? null;

      // 最新2メッセージを取得（降順でソート）
      const sortedMessages = [...convMessages].sort((a, b) =>
        a.message_id.localeCompare(b.message_id),
      );
      const latest2Messages = sortedMessages.slice(-2).reverse();

      if (latest2Messages.length === 0) {
        // メッセージがない場合
        results.push({
          conversation_id: convId,
          title: conv.title,
          message_id: null,
          sender_id: null,
          client_message_id: null,
          message_text: null,
          message_created_at: null,
          sender_display_name: null,
          unread_count: unreadCount,
          latest_message_created_at: latestMessageCreatedAt,
          row_num: 0,
        });
      } else {
        // メッセージがある場合
        for (let i = 0; i < latest2Messages.length; i++) {
          const msg = latest2Messages[i];
          const user = this.users.get(msg.sender_id);
          results.push({
            conversation_id: convId,
            title: conv.title,
            message_id: msg.message_id,
            sender_id: msg.sender_id,
            client_message_id: msg.client_message_id,
            message_text: msg.message_text,
            message_created_at: msg.created_at,
            sender_display_name: user?.display_name ?? null,
            unread_count: unreadCount,
            latest_message_created_at: latestMessageCreatedAt,
            row_num: i + 1,
          });
        }
      }
    }

    // latest_message_created_atでソート
    results.sort((a, b) => {
      if (!a.latest_message_created_at && !b.latest_message_created_at)
        return 0;
      if (!a.latest_message_created_at) return 1;
      if (!b.latest_message_created_at) return -1;
      return (
        b.latest_message_created_at.getTime() -
        a.latest_message_created_at.getTime()
      );
    });

    return results;
  }

  // テスト用のヘルパーメソッド
  addConversation(id: string, title: string | null = null): void {
    this.conversations.set(id, { id, title });
    if (!this.members.has(id)) {
      this.members.set(id, new Set());
    }
  }

  addMember(conversationId: string, userId: string): void {
    if (!this.members.has(conversationId)) {
      this.members.set(conversationId, new Set());
    }
    const memberSet = this.members.get(conversationId);
    if (memberSet) {
      memberSet.add(userId);
    }
  }

  addMessage(
    conversationId: string,
    message: {
      message_id: string;
      sender_id: string;
      client_message_id: string;
      message_text: string;
      created_at: Date;
    },
  ): void {
    if (!this.messages.has(conversationId)) {
      this.messages.set(conversationId, []);
    }
    const messageList = this.messages.get(conversationId);
    if (messageList) {
      messageList.push({
        ...message,
        conversation_id: conversationId,
      });
    }
  }

  addUser(id: string, displayName: string | null = null): void {
    this.users.set(id, { id, display_name: displayName });
  }
}

// SQLテンプレートリテラルをモックするためのヘルパー
// BunのSQLテンプレートリテラルは特殊な構文なので、Proxyを使ってモック
function createMockPostgresClient(): PostgresClient & MockPostgresClient {
  const mock = new MockPostgresClient();

  // Proxyを使ってテンプレートリテラル呼び出しをインターセプト
  return new Proxy(mock, {
    apply(_target, _thisArg, argumentsList: unknown[]) {
      // テンプレートリテラルとして呼び出された場合
      const [strings, ...values] = argumentsList;
      return mock.query(strings as TemplateStringsArray, ...values);
    },
    get(_target, prop: string | symbol) {
      if (prop === Symbol.toPrimitive) {
        return () => "";
      }
      if (
        prop === "addConversation" ||
        prop === "addMember" ||
        prop === "addMessage" ||
        prop === "addUser"
      ) {
        return (mock as unknown as Record<string, unknown>)[prop];
      }
      return undefined;
    },
  }) as PostgresClient & MockPostgresClient;
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const cid1 = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const cid2 = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");

describe("listConversations (feature/conversations)", () => {
  it("returns empty array when user has no conversations", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const db = createMockPostgresClient();

    const listConversations = makeListConversations({ db, membersRepo });

    const res = await listConversations({ userId: uid });

    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.conversations).toEqual([]);
    }
  });

  it("returns all conversations for a user", async () => {
    const membersRepo = new InMemoryMembersRepo();
    const db = createMockPostgresClient();

    await membersRepo.addMember(cid1, uid);
    await membersRepo.addMember(cid2, uid);

    db.addConversation(String(cid1), null);
    db.addConversation(String(cid2), "Test Conversation");
    db.addMember(String(cid1), String(uid));
    db.addMember(String(cid2), String(uid));

    const listConversations = makeListConversations({ db, membersRepo });

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
    }
  });
});
