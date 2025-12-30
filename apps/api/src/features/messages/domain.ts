import * as z from "zod";
import {
  ClientMessageIdSchema,
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";

// テキストは機能依存（messages featureのドメイン）に置く
export const MessageTextSchema = z
  .string()
  .min(1, "message_text must be non-empty")
  .max(10_000, "message_text is too long")
  .brand("MessageText");
export type MessageText = z.infer<typeof MessageTextSchema>;

export const MessageSchema = z.object({
  messageId: MessageIdSchema,
  conversationId: ConversationIdSchema,
  senderId: UserIdSchema,
  clientMessageId: ClientMessageIdSchema,
  messageText: MessageTextSchema,
  createdAt: z.date(),
});
export type Message = z.infer<typeof MessageSchema>;
