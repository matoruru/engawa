import * as z from "zod";
import type { UserId } from "@/shared/ids";
import { ConversationIdSchema, MessageIdSchema } from "@/shared/ids";
import { MessageTextSchema } from "../features/messages/domain";

import { SendMessageInputSchema } from "../features/messages/usecases/sendMessage";
import { SyncMessagesInputSchema } from "../features/messages/usecases/syncMessages";
import { UpdateReadCursorInputSchema } from "../features/reads/usecases/updateReadCursor";
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
});
