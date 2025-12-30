import * as z from "zod";
import type { ConversationId, UserId } from "@/shared/ids";
import { ConversationIdSchema, MessageIdSchema, UserIdSchema } from "@/shared/ids";
import { MessageTextSchema } from "../features/messages/domain";

import { SendMessageInputSchema } from "../features/messages/usecases/sendMessage";
import { SyncMessagesInputSchema } from "../features/messages/usecases/syncMessages";
import { UpdateReadCursorInputSchema } from "../features/reads/usecases/updateReadCursor";
import { CreateConversationInputSchema } from "../features/conversations/usecases/createConversation";
import { ListConversationsInputSchema } from "../features/conversations/usecases/listConversations";
import { AddMemberToConversationInputSchema } from "../features/conversations/usecases/addMemberToConversation";
import { ListConversationMembersInputSchema } from "../features/conversations/usecases/listConversationMembers";
import type { AppServices } from "./compose";

// HTTPは senderId/userId を受け取らない。認証から userId を取得して使う。
const SendMessageHttpBodySchema = z.object({
  conversationId: ConversationIdSchema,
  clientMessageId: z.uuidv7(),
  messageText: MessageTextSchema,
});

const SyncMessagesHttpBodySchema = z.object({
  conversationId: ConversationIdSchema,
  afterMessageId: MessageIdSchema.optional(),
  limit: z.number().int().min(1).max(200),
});

const UpdateReadCursorHttpBodySchema = z.object({
  conversationId: ConversationIdSchema,
  lastReadMessageId: MessageIdSchema,
});

export const makeHttpHandlers = (svc: AppServices) => ({
  sendMessage: async (userId: UserId, body: unknown) => {
    const b = SendMessageHttpBodySchema.parse(body);
    const input = SendMessageInputSchema.parse({ ...b, senderId: userId });
    return svc.sendMessage(input);
  },

  syncMessages: async (userId: UserId, body: unknown) => {
    const b = SyncMessagesHttpBodySchema.parse(body);
    const input = SyncMessagesInputSchema.parse({ ...b, userId });
    return svc.syncMessages(input);
  },

  updateReadCursor: async (userId: UserId, body: unknown) => {
    const b = UpdateReadCursorHttpBodySchema.parse(body);
    const input = UpdateReadCursorInputSchema.parse({ ...b, userId });
    return svc.updateReadCursor(input);
  },

  listConversations: async (userId: UserId) => {
    const input = ListConversationsInputSchema.parse({ userId });
    const result = await svc.listConversations(input);
    if (result.kind === "ok") {
      return { conversations: result.conversations };
    }
    throw new Error("Unexpected result from listConversations");
  },

  createConversation: async (userId: UserId) => {
    const input = CreateConversationInputSchema.parse({ userId });
    const result = await svc.createConversation(input);
    if (result.kind === "created") {
      return { conversationId: result.conversationId };
    }
    throw new Error("Unexpected result from createConversation");
  },

  getCurrentUser: async (userId: UserId) => {
    return { userId };
  },

  searchUsers: async (userId: UserId, query: string) => {
    if (!query || query.trim().length === 0) {
      return { users: [] };
    }

    const searchTerm = `%${query.trim()}%`;
    const rows = await svc.db`
      SELECT id, username, display_name
      FROM users
      WHERE (username ILIKE ${searchTerm} OR display_name ILIKE ${searchTerm})
        AND id != ${userId}
      ORDER BY display_name ASC, username ASC
      LIMIT 20
    `;

    const UserRowSchema = z.object({
      id: z.string(),
      username: z.string(),
      display_name: z.string().nullable(),
    });

    const parsed = z.array(UserRowSchema).parse(rows);

    return {
      users: parsed.map((row) => ({
        id: String(row.id),
        username: String(row.username),
        displayName: String(row.display_name || row.username),
      })),
    };
  },

  addMemberToConversation: async (
    userId: UserId,
    conversationId: ConversationId,
    targetUserId: UserId,
  ) => {
    const input = AddMemberToConversationInputSchema.parse({
      userId,
      conversationId,
      targetUserId,
    });
    const result = await svc.addMemberToConversation(input);
    
    if (result.kind === "added") {
      return { success: true };
    } else if (result.kind === "forbidden") {
      return { success: false, error: result.reason };
    } else if (result.kind === "conflict") {
      return { success: false, error: result.reason };
    }
    throw new Error("Unexpected result from addMemberToConversation");
  },

  listConversationMembers: async (
    userId: UserId,
    conversationId: ConversationId,
  ) => {
    const input = ListConversationMembersInputSchema.parse({
      userId,
      conversationId,
    });
    const result = await svc.listConversationMembers(input);
    
    if (result.kind === "ok") {
      return { success: true, members: result.members };
    } else if (result.kind === "forbidden") {
      return { success: false, error: result.reason };
    }
    throw new Error("Unexpected result from listConversationMembers");
  },
});
