import { describe, expect, it } from "bun:test";

import {
  ClientMessageIdSchema,
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import { type Message, MessageTextSchema } from "../domain";
import type { MessageRepository } from "../ports";
import { makeSendMessage } from "./sendMessage";

// --- Test doubles ---
class InMemoryMembersRepo implements ConversationMembersRepository {
  private readonly members = new Set<string>();
  addMember(conversationId: string, userId: string): void {
    this.members.add(`${conversationId}|${userId}`);
  }
  async isMember(conversationId: any, userId: any): Promise<boolean> {
    return this.members.has(`${conversationId}|${userId}`);
  }
}

class InMemoryMessageRepo implements MessageRepository {
  private readonly byDedupeKey = new Map<string, Message>();
  async insertOrGetByClientMessageId(message: Message) {
    const key = [
      message.conversationId,
      message.senderId,
      message.clientMessageId,
    ].join("|");
    const existing = this.byDedupeKey.get(key);
    if (existing) return { kind: "duplicate" as const, existing };
    this.byDedupeKey.set(key, message);
    return { kind: "stored" as const, message };
  }
}

class SpyMessageRepo implements MessageRepository {
  public called = 0;
  constructor(private readonly inner: MessageRepository) {}
  async insertOrGetByClientMessageId(message: Message) {
    this.called += 1;
    return this.inner.insertOrGetByClientMessageId(message);
  }
}

// 固定値（テスト内で parse して「I/Oでparse済み」の前提を再現）
const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const uid2 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e99");
const cmid = ClientMessageIdSchema.parse(
  "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12",
);
const text = MessageTextSchema.parse("hello");

describe("sendMessage (feature/messages)", () => {
  it("stores a new message when sender is a conversation member", async () => {
    const membersRepo = new InMemoryMembersRepo();
    membersRepo.addMember(cid, uid);

    const messageRepo = new InMemoryMessageRepo();
    const fixedMessageId = MessageIdSchema.parse(
      "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e13",
    );

    const sendMessage = makeSendMessage({
      membersRepo,
      messageRepo,
      now: () => new Date("2025-12-27T00:00:00.000Z"),
      generateMessageId: () => fixedMessageId,
    });

    const res = await sendMessage({
      conversationId: cid,
      senderId: uid,
      clientMessageId: cmid,
      messageText: text,
    });

    expect(res.kind).toBe("stored");
    if (res.kind === "stored") {
      expect(res.message.messageId).toBe(fixedMessageId);
      expect(res.message.createdAt.toISOString()).toBe(
        "2025-12-27T00:00:00.000Z",
      );
    }
  });

  it("returns forbidden when sender is NOT a conversation member, and does not call messageRepo", async () => {
    const membersRepo = new InMemoryMembersRepo(); // member追加しない
    const spyRepo = new SpyMessageRepo(new InMemoryMessageRepo());

    const sendMessage = makeSendMessage({
      membersRepo,
      messageRepo: spyRepo,
      now: () => new Date("2025-12-27T00:00:00.000Z"),
      generateMessageId: () =>
        MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20"),
    });

    const res = await sendMessage({
      conversationId: cid,
      senderId: uid2,
      clientMessageId: cmid,
      messageText: text,
    });

    expect(res).toEqual({ kind: "forbidden", reason: "NOT_A_MEMBER" });
    expect(spyRepo.called).toBe(0);
  });

  it("deduplicates by (conversation_id, sender_id, client_message_id)", async () => {
    const membersRepo = new InMemoryMembersRepo();
    membersRepo.addMember(cid, uid);

    const messageRepo = new InMemoryMessageRepo();

    const sendMessage1 = makeSendMessage({
      membersRepo,
      messageRepo,
      now: () => new Date("2025-12-27T00:00:00.000Z"),
      generateMessageId: () =>
        MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20"),
    });

    const sendMessage2 = makeSendMessage({
      membersRepo,
      messageRepo,
      now: () => new Date("2025-12-27T00:00:01.000Z"),
      generateMessageId: () =>
        MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e21"),
    });

    const first = await sendMessage1({
      conversationId: cid,
      senderId: uid,
      clientMessageId: cmid,
      messageText: text,
    });

    const second = await sendMessage2({
      conversationId: cid,
      senderId: uid,
      clientMessageId: cmid, // 再送
      messageText: text,
    });

    expect(first.kind).toBe("stored");
    expect(second.kind).toBe("duplicate");

    if (first.kind === "stored" && second.kind === "duplicate") {
      expect(second.existing.messageId).toBe(first.message.messageId);
      expect(second.existing.createdAt.toISOString()).toBe(
        "2025-12-27T00:00:00.000Z",
      );
    }
  });
});
