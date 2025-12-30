import * as z from "zod";

import {
  ClientMessageIdSchema,
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import { type Message, MessageSchema } from "../../domain";

// DBが返す created_at は Date のときも string のときもあるので吸収
const CreatedAtSchema = z.preprocess((v) => {
  if (v instanceof Date) return v;
  return new Date(String(v));
}, z.date());

// Postgres row（snake_case）専用：infra で必要な最小限の形状検証
export const MessageRowSchema = z.object({
  message_id: MessageIdSchema,
  conversation_id: ConversationIdSchema,
  sender_id: UserIdSchema,
  client_message_id: ClientMessageIdSchema,
  message_text: z.string(),
  created_at: CreatedAtSchema,
});
export type MessageRow = z.infer<typeof MessageRowSchema>;

// row -> domain input（camelCase）
export const messageRowToDomainInput = (r: MessageRow) => ({
  messageId: r.message_id,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  clientMessageId: r.client_message_id,
  messageText: r.message_text,
  createdAt: r.created_at,
});

export const parseMessageFromRow = (row: unknown): Message => {
  const r = MessageRowSchema.parse(row);
  return MessageSchema.parse(messageRowToDomainInput(r));
};
